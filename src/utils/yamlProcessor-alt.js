/**
 * YAML Map Processing Utility
 * Handles execution of YAML maps using the Nexus agent
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import YamlMap from '../models/YamlMap.js';
import { generateReport } from './reportGenerator.js';
import OpenAI from 'openai';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

/**
 * Generate an AI summary of YAML task execution
 * Uses the same OpenAI client as other execution modes
 * 
 * @param {string} userId - User ID for fetching API client
 * @param {Array} yamlLog - Execution log entries
 * @param {Object} yamlMap - The YAML map that was executed
 * @param {Array} steps - Array of executed steps
 * @param {Object} results - Task execution results
 * @returns {Promise<Object>} - AI-generated summary object
 */
async function generateAiSummary(userId, yamlLog, yamlMap, steps, results) {
  try {
    // Get OpenAI client based on user's configured API key
    let openaiClient;
    try {
      const userDoc = await (await import('../models/User.js')).default.findById(userId).lean();
      
      // Check if user has their own API key configured
      if (userDoc?.apiKeys?.openai) {
        console.log(`[YamlSummary] Using user-provided OpenAI API key for summarization`);
        openaiClient = new OpenAI({ apiKey: userDoc.apiKeys.openai });
      } else if (process.env.OPENAI_API_KEY) {
        // Fall back to system default API key
        console.log(`[YamlSummary] Using system default OpenAI API key for summarization`);
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      } else {
        console.log(`[YamlSummary] No OpenAI API key available, skipping summarization`);
        return null;
      }
    } catch (error) {
      console.error(`Error creating OpenAI client for YAML summary:`, error);
      // Try one more time with system API key
      if (process.env.OPENAI_API_KEY) {
        openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      } else {
        return null;
      }
    }
    
    // Prepare a concise log for the AI
    const condensedLog = yamlLog
      .slice(-20) // Get last 20 entries to avoid token limits
      .map(entry => `${new Date(entry.timestamp).toISOString().split('T')[1].slice(0, 8)}: ${entry.message}`)
      .join('\n');
    
    // Extract key information from steps
    const keySteps = steps.map(step => {
      const taskName = step.task || step.method || 'unknown';
      let result = 'No result';
      
      if (step.result) {
        if (typeof step.result === 'string') {
          result = step.result.substring(0, 200);
        } else if (typeof step.result === 'object') {
          result = JSON.stringify(step.result).substring(0, 200);
        }
      }
      
      return {
        task: taskName,
        result: result
      };
    });
    
    // Prepare the prompt for AI
    const prompt = `
      You are analyzing the results of a YAML map execution named "${yamlMap.name}".
      
      YAML Structure Summary:
      ${JSON.stringify(yamlMap.structure || {}, null, 2).substring(0, 500)}...
      
      Execution Log (last entries):
      ${condensedLog}
      
      Key Steps Executed:
      ${JSON.stringify(keySteps, null, 2)}
      
      Please provide:
      1. A concise summary (2-3 sentences) of what this YAML task accomplished
      2. Key findings or insights discovered during execution
      3. Any notable issues or obstacles encountered
      4. Recommendation for potential next steps
      
      Format your response as JSON with these keys: summary, findings, issues, nextSteps
    `;
    
    // Call OpenAI API
    console.log(`[YamlSummary] Requesting AI summary for YAML map ${yamlMap._id}`);
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o', // Use most capable model for summary
      messages: [
        { role: 'system', content: 'You analyze task execution logs and provide concise summaries in JSON format.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });
    
    // Parse JSON response
    try {
      console.log(`[YamlSummary] Successfully generated AI summary`);
      const aiSummary = JSON.parse(response.choices[0].message.content);
      return aiSummary;
    } catch (parseError) {
      console.error(`[YamlSummary] Error parsing AI response:`, parseError);
      return {
        summary: 'YAML map execution completed.',
        findings: [],
        issues: ['Unable to generate detailed AI summary'],
        nextSteps: []
      };
    }
  } catch (error) {
    console.error('[YamlSummary] Error generating AI summary:', error);
    return {
      summary: 'YAML map execution completed.',
      findings: [],
      issues: ['Unable to generate AI summary due to an error'],
      nextSteps: []
    };
  }
}

/**
 * Extract YAML map ID from a user prompt
 * @param {string} prompt - User prompt text
 * @returns {string|null} - YAML map ID or null if not found
 */
export function extractYamlMapIdFromPrompt(prompt) {
  if (!prompt) return null;
  
  // Match pattern /yaml <mapId> or /yaml:<mapId>
  const yamlMapRegex = /\/yaml\s+([a-zA-Z0-9]+)|\/yaml:([a-zA-Z0-9]+)/;
  const match = prompt.match(yamlMapRegex);
  
  return match ? (match[1] || match[2]) : null;
}

/**
 * Process a YAML map task
 * @param {Object} options - Task options
 * @param {string} options.userId - User ID
 * @param {string} options.userEmail - User email
 * @param {string} options.taskId - Task ID
 * @param {string} options.runId - Run ID
 * @param {string} options.runDir - Run directory
 * @param {string} options.yamlMapId - YAML map ID
 * @param {string} options.url - URL to navigate to (optional)
 * @param {Object} options.tasksStore - Tasks store for logging
 * @param {Function} options.sendWebSocketUpdate - Function to send WebSocket updates
 * @param {Function} options.setupNexusEnvironment - Function to set up Nexus environment
 * @param {Function} options.updateTaskInDatabase - Function to update task in database
 * @returns {Promise<Object>} - Task result
 */
export async function processYamlMapTask(options) {
  const {
    userId,
    userEmail,
    taskId,
    runId,
    runDir,
    yamlMapId,
    url,
    engine,
    tasksStore,
    sendWebSocketUpdate,
    setupNexusEnvironment,
    updateTaskInDatabase
  } = options;
  
  // Create a log collection array for consistent logging - matching handleBrowserAction pattern
  const yamlLog = [];
  const stepIndex = 0; // YAML map is treated as a single step in the task flow
  let currentProgress = 0; // Track progress percentage
  
  // Standard base URL for all URLs in this system - define once at the top
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  
  // Initialize all variables at the function scope level to prevent reference errors
  let rawExtractedText = '';
  let yamlMapUrl = url || 'N/A'; // Use the passed URL or default to N/A
  let reportDir = `${runDir}/report`; // Define reportDir at the top level
  let reportPath = null;
  // Initialize URL-related variables to prevent reference errors
  let nexusReportUrl = null;
  let screenshotUrl = null;
  let finalScreenshotPath = null;
  let safeScreenshotUrl = '';
  let baseReportUrl = '';
  let reportUrl = ''; // Explicitly define reportUrl at the global scope
  const reportUrls = {
    reportUrl: '',
    nexusReportUrl: '',
    landingReportUrl: '',
    runReport: ''
  };
  let isTaskCompleted = false; // Flag to prevent multiple completion events
  // Initialize formattedResult with all required fields to prevent reference errors
  // Don't try to access yamlMap yet - it will be loaded from the database later
  let mapRunSummaryDetails = []; // To store step-by-step summary details
  let formattedResult = {
    // Basic metadata fields
    yamlMapId: yamlMapId || '',
    yamlMapName: 'YAML Map', // Don't reference yamlMap here as it's not loaded yet
    executionTime: 0,
    screenshot: null,
    reportUrl: null,
    nexusReportUrl: null,
    landingReportUrl: null,
    // Standard structure for UI
    aiPrepared: {
      summary: 'Initializing YAML map execution',
      results: [],
      executionTime: 0,
      screenshot: null,
      reportUrl: null
    }
  };
  
  // Initialize steps array with a single step to match browserAction structure
  const steps = [{
    id: 'yaml-step-0',
    index: 0,
    type: 'yaml',
    name: yamlMapId ? `Execute YAML Map ${yamlMapId}` : 'Execute YAML Map',
    status: 'running'
  }];
  
  // Helper function to log messages consistently, and send individual updates like in TaskPlan/handleBrowserAction
  const logYaml = (message, data = null) => {
    // Create standardized log entry
    const logEntry = {
      timestamp: new Date().toISOString(),
      step: stepIndex,
      message,
      data
    };

    // Add to log collection
    yamlLog.push(logEntry);
    
    // Output to server console for debugging
    console.log(`[YAML] Task ${taskId} log:`, {
      level: 'info',
      message,
      data
    });
    
    // Emit standardized log events (planLog and stepLog)
    if (sendWebSocketUpdate) {
      // Plan-level log (showing in main task display/console)
      sendWebSocketUpdate(userId, {
        event: 'planLog',
        taskId,
        message,
        metadata: data || {},
        // Add item property for TaskBar
        item: {
          type: 'log',
          title: 'YAML Process Log',
          content: message?.substring(0, 100) || 'Log entry',
          timestamp: new Date().toISOString()
        }
      });
      
      // Step-level log (showing in step details)
      sendWebSocketUpdate(userId, {
        event: 'stepLog',
        taskId,
        stepIndex,
        log: logEntry,
        // Add item property for TaskBar
        item: {
          type: 'log',
          title: `YAML Step ${stepIndex}`,
          content: message?.substring(0, 100) || 'Log entry',
          timestamp: new Date().toISOString()
        }
      });
      
      // Send intermediateResult event to populate the sidebar
      // This is what shows up in the right sidebar and TaskBar
      if (message.includes('completed') || 
          message.includes('captured') || 
          message.includes('generated') || 
          data?.screenshotUrl || 
          data?.reportUrl) {
        sendWebSocketUpdate(userId, {
          event: 'intermediateResult',
          taskId, 
          stepIndex,
          // Use 'item' format for TaskBar instead of 'data'
          item: {
            type: message.includes('screenshot') ? 'screenshot' : 
                 message.includes('report') ? 'report' : 'info',
            title: message.substring(0, 80),
            content: data ? JSON.stringify(data).substring(0, 150) : message,
            url: data?.screenshotUrl || data?.reportUrl || null,
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  };
  
  // Helper function to send progress updates with log - matching handleBrowserAction exactly
  const sendProgressUpdate = (progressPercent, progressMessage) => {
    // Skip sending progress updates if the task is already completed
    // This prevents duplicate events from being sent after task completion
    if (isTaskCompleted && progressPercent >= 100) {
      console.log(`[YAML] Skipping progress update for completed task ${taskId}`);
      return;
    }
    
    // Update internal progress tracking
    currentProgress = progressPercent;
    
    // Update the step status based on progress
    if (steps && steps.length > 0) {
      steps[0].progress = progressPercent;
      steps[0].status = progressPercent >= 100 ? 'completed' : 
                     progressPercent <= 0 ? 'error' : 'running';
    }
    
    // If this is a 100% progress update, mark task as completed
    if (progressPercent >= 100) {
      isTaskCompleted = true;
    }
    
    // Only send the update if WebSocket is available and task isn't already completed
    if (sendWebSocketUpdate) {
      sendWebSocketUpdate(userId, { 
        event: 'stepProgress', // Use the same event name as handleBrowserAction
        taskId, 
        stepIndex: stepIndex, 
        progress: progressPercent, 
        message: progressMessage,
        log: yamlLog, // Send the full logs array
        // Add item property needed by TaskBar
        item: {
          type: 'progress',
          title: `YAML Map: ${progressPercent}%`,
          content: progressMessage || 'Processing YAML map',
          progress: progressPercent,
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Update task in database with progress
    updateTaskInDatabase(taskId, { progress: progressPercent });
  };
  
  // Initialize startTime for tracking execution duration
  const startTime = Date.now();

  try {
    // Ensure run directory exists at the beginning
    if (!fs.existsSync(runDir)) {
      logYaml(`Creating run directory: ${runDir}`);
      fs.mkdirSync(runDir, { recursive: true });
    }
    
    logYaml(`Starting YAML map execution for map ID ${yamlMapId}`);
    logYaml(`Using run directory: ${runDir}`);
    
    // Send initial progress update with the log - using our helper function
    sendProgressUpdate(10, `Loading YAML Map ${yamlMapId}`);
    
    // Find the YAML map
    const yamlMap = await YamlMap.findById(yamlMapId);
    
    if (!yamlMap) {
      logYaml(`YAML map not found with ID: ${yamlMapId}`, { error: true });
      throw new Error(`YAML map not found with ID: ${yamlMapId}`);
    }
    
    logYaml(`YAML map found: ${yamlMap.name}`, { 
      yamlMapName: yamlMap.name,
      description: yamlMap.description || 'No description',
      tags: yamlMap.tags || []
    });
    
    // Send progress update using our helper function
    sendProgressUpdate(20, `Preparing to execute YAML map: ${yamlMap.name}`);
    
    // Extract URL from YAML map if available
    let yamlMapUrl = null;
    if (yamlMap && yamlMap.url) {
      yamlMapUrl = yamlMap.url;
      console.log(`[ProcessYamlTask] Found URL in YAML map: ${yamlMapUrl}`);
    }
    
    if (!yamlMap) {
      const errorMessage = `YAML map not found: ${yamlMapId}`;
      console.error(`[ProcessYamlTask] ${errorMessage}`);
      
      await updateTaskInDatabase(taskId, {
        status: 'error',
        statusMessage: errorMessage,
        error: errorMessage,
        progress: 0
      });
      
      sendWebSocketUpdate(userId, {
        event: 'yamlMapError',
        taskId,
        yamlMapId,
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
      
      throw new Error(errorMessage);
    }
    
    // Update task status
    await updateTaskInDatabase(taskId, {
      status: 'executing',
      statusMessage: `Executing YAML map: ${yamlMap.name}`,
      yamlMapId,
      yamlMapName: yamlMap.name,
      progress: 10
    });
    
    // Send notification of task start
    sendWebSocketUpdate(userId, {
      event: 'yamlMapStarted',
      taskId,
      yamlMapId,
      yamlMapName: yamlMap.name,
      timestamp: new Date().toISOString()
    });
    
    // Log the YAML execution start
    const logEntry = {
      type: 'yamlMapExecutionStart',
      yamlMapId,
      yamlMapName: yamlMap.name,
      description: yamlMap.description || 'No description',
      taskId,
      timestamp: new Date().toISOString()
    };
    
    if (tasksStore) {
      tasksStore.addStepLog(taskId, logEntry);
    }
    
    // Send WebSocket update for the execution start
    sendWebSocketUpdate(userId, {
      event: 'planLog',
      message: `Executing YAML map: ${yamlMap.name}`,
      taskId,
      stepNumber: 1
    });
    
    // Setup Nexus environment with appropriate API keys
    let engineInfo;
    if (setupNexusEnvironment) {
      engineInfo = await setupNexusEnvironment(userId, engine);
    }
    
    console.log(`[ProcessYamlTask] Environment setup complete for task ${taskId}`);
    await updateTaskInDatabase(taskId, { progress: 20 });
    
    // Update usage statistics
    yamlMap.usageCount = (yamlMap.usageCount || 0) + 1;
    yamlMap.lastUsed = new Date();
    await yamlMap.save();
    
    // First launch puppeteer browser directly (not through the agent)
    console.log(`[ProcessYamlTask] Launching puppeteer browser for task ${taskId}`);
    let browser, page, agent;
    try {
      // Launch puppeteer browser
      browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1280, height: 800 }
      });
      
      await updateTaskInDatabase(taskId, { progress: 25 });
      
      // Create a new page in the browser
      console.log(`[ProcessYamlTask] Creating new page for task ${taskId}`);
      page = await browser.newPage();
      
      // Set viewport for the page
      await page.setViewport({
        width: 1280,
        height: 800,
        deviceScaleFactor: 1
      });
      
      // Use the yamlMapUrl we extracted earlier, or fall back to the url parameter
      const finalUrl = yamlMapUrl || url;
      
      // Navigate to the URL if provided
      if (finalUrl) {
        try {
          // Check if the URL has a valid protocol
          const urlObj = new URL(finalUrl);
          if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
            console.log(`[ProcessYamlTask] Navigating to URL: ${finalUrl}`);
            await page.goto(finalUrl);
          } else {
            console.warn(`[ProcessYamlTask] Invalid URL protocol: ${finalUrl} - skipping navigation`);
          }
        } catch (urlError) {
          console.warn(`[ProcessYamlTask] Invalid URL format provided: ${finalUrl} - skipping navigation`);
        }
      } else {
        console.log(`[ProcessYamlTask] No URL provided in YAML map or parameters - skipping navigation`);
      }
      
      // Now create the PuppeteerAgent with the page instance
      console.log(`[ProcessYamlTask] Creating Nexus agent with page for task ${taskId}`);
      agent = new PuppeteerAgent(page);
      
      console.log(`[ProcessYamlTask] Browser initialized for task ${taskId}`);
      await updateTaskInDatabase(taskId, { progress: 40 });
      
      // Execute the YAML using Nexus's runYaml method
      console.log(`[ProcessYamlTask] Executing YAML for task ${taskId}`);
      await updateTaskInDatabase(taskId, { progress: 50 });
    } catch (initError) {
      console.error(`[ProcessYamlTask] Error initializing PuppeteerAgent:`, initError);
      throw initError;
    }
    
    const startTime = Date.now();
    
    // Track step progress
    let lastProgressUpdate = 40;
    let stepCount = 0;
    
    // Count the number of steps in the YAML for progress tracking
    const yamlContent = yamlMap.yaml;
    const taskMatches = yamlContent.match(/name:/g);
    const totalTasks = taskMatches ? taskMatches.length : 0;
    
    // Setup progress reporting
    const progressCallback = (stepInfo) => {
      stepCount++;
      
      // Calculate progress (50% for initialization, 50% for execution)
      const executionProgress = Math.min(50, Math.floor((stepCount / (totalTasks * 2)) * 50));
      const totalProgress = 50 + executionProgress;
      
      if (totalProgress > lastProgressUpdate) {
        lastProgressUpdate = totalProgress;
        updateTaskInDatabase(taskId, { progress: totalProgress });
        
        // Send websocket update about the current step
        sendWebSocketUpdate(userId, {
          event: 'yamlStepExecuted',
          taskId,
          yamlMapId,
          yamlMapName: yamlMap.name,
          stepInfo,
          progress: totalProgress,
          timestamp: new Date().toISOString()
        });
      }

      // Collect step details for a comprehensive summary
      if (stepInfo) {
        const stepDetail = `Step: ${stepInfo.action || 'N/A'} (${stepInfo.status || 'Pending'}) - ${stepInfo.details || stepInfo.resultText || 'No further details'}`;
        mapRunSummaryDetails.push(stepDetail);
        logYaml(`[ProgressCallback] Added to summary: ${stepDetail.substring(0,150)}...`);
      }
    };
    
    // Execute the YAML
    const result = await agent.runYaml(yamlMap.yaml, { 
      progressCallback, 
      enableLogging: true 
    });
    
    const endTime = Date.now();
    console.log(`[ProcessYamlTask] YAML execution completed for task ${taskId}`);
    
    // Update formattedResult with actual YAML execution results - avoid self-reference
    const execTime = endTime - startTime;
    
    // Store the current aiPrepared structure to prevent losing it
    const currentAiPrepared = formattedResult.aiPrepared || {};
    
    // Safely merge result data without risking self-reference
    Object.assign(formattedResult, result || {});
    
    // Update basic metadata fields
    formattedResult.executionTime = execTime;
    formattedResult.yamlMapId = yamlMapId;
    formattedResult.yamlMapName = yamlMap?.name || 'YAML Map';
    
    // Reconstruct aiPrepared without self-reference
    formattedResult.aiPrepared = {
      summary: `Successfully executed YAML map: ${yamlMap?.name || 'YAML Map'}`,
      results: result?.data || result || { message: 'Task completed successfully' },
      executionTime: execTime,
      screenshot: currentAiPrepared.screenshot || null,
      reportUrl: currentAiPrepared.reportUrl || null
    };
    
    // Log successful data population
    logYaml('Updated formattedResult with YAML execution data', {
      hasResultData: !!result,
      executionTime: execTime
    });
    
    // Log completion
    const completionLogEntry = {
      type: 'yamlMapExecutionComplete',
      yamlMapId,
      yamlMapName: yamlMap.name,
      taskId,
      executionTime: endTime - startTime,
      timestamp: new Date().toISOString(),
      result: JSON.stringify(result)
    };
    
    if (tasksStore) {
      tasksStore.addStepLog(taskId, completionLogEntry);
    }
    
    // Send WebSocket update for task completion - matching handleBrowserAction format
    if (sendWebSocketUpdate) {
      sendWebSocketUpdate(userId, {
        event: 'actionComplete', // Match event name used in handleBrowserAction
        taskId,
        stepIndex,
        actionType: 'yamlMap', // Add context that this was a YAML map execution
        yamlMapId, // Preserve YAML-specific info
        yamlMapName: yamlMap.name,
        executionTime: endTime - startTime,
        result: JSON.stringify(result),
        timestamp: new Date().toISOString()
      });
    }
    
    // Take a screenshot for the final state
    let finalScreenshotPath = null;
    try {
      // Update progress and notify UI using our helper function
      sendProgressUpdate(85, `Capturing final screenshot`);
      
      const screenshotFilename = `final-screenshot-${taskId}.png`;
      const screenshotPath = `${runDir}/${screenshotFilename}`;
      finalScreenshotPath = screenshotPath; // Store for report generation
      
      logYaml(`Attempting to take screenshot to ${screenshotPath}`);
      
      // Only use reliable methods - don't try agent.takeScreenshot as it doesn't exist
      // First try to use the page object directly - most reliable approach
      if (page && typeof page.screenshot === 'function') {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        logYaml(`Final screenshot saved via page.screenshot to ${screenshotPath}`);
      } 
      // If page isn't available, try to get a page from the browser
      else if (browser && typeof browser.pages === 'function') {
        try {
          const pages = await browser.pages();
          if (pages && pages.length > 0) {
            const activePage = pages[pages.length - 1]; // Usually the last page is active
            await activePage.screenshot({ path: screenshotPath, fullPage: true });
            logYaml(`Final screenshot saved via browser.pages to ${screenshotPath}`);
          } else {
            logYaml(`No pages available from browser.pages()`, { error: true });
            finalScreenshotPath = null;
          }
        } catch (browserError) {
          logYaml(`Error getting pages from browser for screenshot`, { error: browserError.toString() });
          finalScreenshotPath = null;
        }
      } else {
        logYaml(`No screenshot capabilities available - page and browser objects not usable`, { error: true });
        finalScreenshotPath = null;
      }
      
      // Notify UI about screenshot if successful - matching handleBrowserAction format
      if (finalScreenshotPath) {
        const screenshotUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/nexus_run/${screenshotFilename}`;
        // Log the screenshot
        logYaml(`Screenshot captured successfully`, { screenshotUrl });
        
        // Update formattedResult with screenshot URL
        formattedResult.screenshot = screenshotUrl;
        if (formattedResult.aiPrepared) {
          formattedResult.aiPrepared.screenshot = screenshotUrl;
        }
        logYaml(`Updated formattedResult with screenshot URL: ${screenshotUrl}`);
        
        // Send standardized screenshot event
        if (sendWebSocketUpdate) {
          sendWebSocketUpdate(userId, {
            event: 'actionScreenshot', // Match event name used in handleBrowserAction
            taskId,
            stepIndex,
            screenshotUrl,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      // If screenshot was taken successfully, include the URL in the task update
      if (finalScreenshotPath) {
        // Convert to URL path for client access
        // Using baseUrl defined at the top of the function
        const screenshotUrl = `${baseUrl}/nexus_run/${screenshotFilename}`;
        
        // Update the task with the screenshot URL
        await updateTaskInDatabase(taskId, {
          screenshotPath: screenshotUrl
        });
        
        // Send WebSocket notification about the screenshot
        sendWebSocketUpdate(userId, {
          event: 'screenshotTaken',
          taskId,
          screenshotUrl,
          timestamp: new Date().toISOString()
        });
        
        // Also send intermediateResult event for TaskBar display
        sendWebSocketUpdate(userId, {
          event: 'intermediateResult',
          taskId,
          stepIndex,
          item: {
            type: 'screenshot',
            url: screenshotUrl,
            title: 'YAML Execution Screenshot',
            timestamp: new Date().toISOString()
          }
        });
      }
    } catch (screenshotError) {
      console.error(`[ProcessYamlTask] Error taking final screenshot:`, screenshotError);
      finalScreenshotPath = null;
    }
    
    // Generate comprehensive report similar to browser automation tasks
    try {
      // Update progress and notify UI using our helper function
      sendProgressUpdate(90, `Generating execution report`);
      
      // Ensure reportDir is correctly initialized and in scope
      reportDir = `${runDir}/report`;
      logYaml(`Using report directory: ${reportDir}`);
      
      
      // Ensure report directory exists before trying to generate the report
      if (!fs.existsSync(reportDir)) {
        logYaml(`Creating report directory: ${reportDir}`);
        try {
          fs.mkdirSync(reportDir, { recursive: true });
          logYaml(`Successfully created report directory`);
        } catch (dirError) {
          logYaml(`Warning: Failed to create report directory`, { error: dirError.toString() });
          // Continue execution - the report generator will try to create it too
        }
      }
      
      logYaml(`Preparing to generate execution report...`);
      
      // Import the report generator dynamically to avoid circular dependencies
      // Use require for synchronous import to prevent race conditions
      let reportGenerator = null;
      try {
        // First try dynamic import
        reportGenerator = await import('./reportGenerator.js');
        logYaml(`Successfully imported reportGenerator module`);
      } catch (importError) {
        logYaml(`Error importing reportGenerator`, { error: importError.toString() });
        
        // Try alternate approach if dynamic import fails
        try {
          const reportGeneratorPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './reportGenerator.js');
          reportGenerator = await import(reportGeneratorPath);
          logYaml(`Successfully imported reportGenerator via absolute path`);
        } catch (fallbackError) {
          logYaml(`Fallback import also failed`, { error: fallbackError.toString() });
          // We'll handle this below in the null check
        }
      }
      
      // Safety check before trying to use reportGenerator
      if (reportGenerator && typeof reportGenerator.generateReport === 'function') {
        logYaml(`Report generator loaded, creating report...`);
        
        // Prepare data for the report
        const promptText = `YAML Map Execution: ${yamlMap?.name || 'Unknown YAML Map'}`;
        
        // Format result for the report with fallbacks for undefined values
        const formattedResults = [
          {
            // Main result as the first step
            summary: `YAML Map execution completed successfully`,
            result: result || 'No specific result data',
            metadata: {
              yamlMapId: yamlMapId || 'unknown',
              yamlMapName: yamlMap?.name || 'Unknown YAML Map',
              executionTime: (Date.now() - startTime)
            }
          }
        ];
        
        logYaml(`Generating report with ${formattedResults.length} result entries`);
        
        // Generate the report using the imported utility - never try to use agent.generateReport
        // Ensure we're passing the properly created directory path
        // Double check reportDir is properly defined right before using it
        const safeReportDir = reportDir || `${runDir}/report`;
        
        reportPath = await reportGenerator.generateReport(
          promptText,
          formattedResults,
          finalScreenshotPath,
          taskId,
          safeReportDir // Use a safely defined report directory
        );
        
        // Emit detailed intermediate result - matching the format expected by TaskBar
        if (sendWebSocketUpdate) {
          // Format expected by TaskBar UI
          sendWebSocketUpdate(userId, {
            event: 'intermediateResult', 
            taskId,
            stepIndex,
            // Use the 'item' property expected by TaskBar instead of 'data'
            item: {
              type: 'report',
              url: reportPath ? `${baseUrl}/nexus_run/report/${path.basename(reportPath)}` : null,
              title: 'YAML Execution Report',
              timestamp: new Date().toISOString()
            }
          });
        }
        
        logYaml(`Report successfully generated at ${reportPath}`);
        
        // SINGLE SOURCE OF TRUTH FOR ALL REPORT URLS
        // Create all report URL variants from the reportPath
        let baseReportUrl = reportPath ? `${baseUrl}/nexus_run/report/${path.basename(reportPath)}` : null;
        
        // Global report URL object - this is our single source of truth
        const reportUrls = {
          reportUrl: baseReportUrl,
          nexusReportUrl: baseReportUrl,
          landingReportUrl: baseReportUrl,
          runReport: baseReportUrl
        };
        
        // Log all URLs we're using
        logYaml(`Setting report URLs`, reportUrls);
        
        // Store the reportUrls object directly on the task's global context
        // This ensures the same values are used throughout the entire task lifetime
        if (baseReportUrl) {
          // Update formattedResult with ALL report URLs
          if (formattedResult) {
            // Set at top level
            Object.assign(formattedResult, reportUrls);
            
            // Also in aiPrepared if it exists
            if (formattedResult.aiPrepared) {
              Object.assign(formattedResult.aiPrepared, reportUrls);
            }
            
            logYaml(`Updated formattedResult with report URLs`, reportUrls);
          }
        }
        
        // Notify UI about report generation - matching handleBrowserAction format
        // Use baseReportUrl since reportUrls is our single source of truth
        if (baseReportUrl) {
          // Log the report generation
          logYaml(`Report generated successfully`, { reportUrl: baseReportUrl });
          
          // Send standardized report event
          if (sendWebSocketUpdate) {
            sendWebSocketUpdate(userId, {
              event: 'actionReport', // Match event name used in handleBrowserAction
              taskId,
              url: baseReportUrl,  // Use baseReportUrl from our single source of truth
              reportPath: reportPath,
              executionTime: Date.now() - startTime
            });
          }
        }
        
        // Find a raw report file for this run if one exists (similar to what the browser version does)
        try {
          if (fs.existsSync(reportDir)) {
            const reportFiles = fs.readdirSync(reportDir);
            const reportFilePattern = new RegExp(`web-.*${taskId}.*\.html$`);
            const matchingFile = reportFiles.find(file => reportFilePattern.test(file));
            
            if (matchingFile) {
              const nexusReportUrl = `${baseUrl}/nexus_run/report/${matchingFile}`;
              console.log(`[ProcessYamlTask] Found matching report file: ${nexusReportUrl}`);
              
              // Update the task with both report paths
              await updateTaskInDatabase(taskId, {
                reportPath: reportUrl,
                nexusReportUrl: nexusReportUrl
              });
              
              // Send WebSocket update with report paths
              sendWebSocketUpdate(userId, {
                event: 'reportGenerated',
                taskId,
                reportUrl: reportUrl,
                nexusReportUrl: nexusReportUrl,
                timestamp: new Date().toISOString()
              });
            } else {
              // Just use the main report path
              await updateTaskInDatabase(taskId, {
                reportPath: reportUrl
              });
              
              sendWebSocketUpdate(userId, {
                event: 'reportGenerated',
                taskId,
                reportUrl: reportUrl,
                timestamp: new Date().toISOString()
              });
            }
          }
        } catch (fsError) {
          logYaml(`Error checking for report files`, { error: fsError.toString() });
        }
      } else {
        logYaml(`No report generation available, skipping report creation`);
        await updateTaskInDatabase(taskId, {
          reportPath: null
        });
      }
      
      // Send final progress update with the log
      sendProgressUpdate(95, `Finalizing YAML execution`);
      
      logYaml(`Execution completed successfully`, { result });
      
      // Update final task status in database
      await updateTaskInDatabase(taskId, {
        status: 'completed',
        progress: 100,
        result: JSON.stringify(formattedResult)
      });
      
      // Send final 100% progress update
      sendProgressUpdate(100, `YAML map execution completed`);
      
      // Make sure nexusReportUrl is defined - use the same URL as reportUrl if not specified
      const nexusReportUrl = formattedResult.nexusReportUrl || reportUrl;
      
      // Generate AI summary of the task execution
      logYaml(`Generating AI summary of YAML execution`);
      const aiSummary = await generateAiSummary(userId, yamlLog, yamlMap, steps, formattedResult);
      
      // Add AI summary to the formatted result
      if (aiSummary) {
        formattedResult.aiSummary = aiSummary;
        
        // Keep the same aiPrepared structure but update the summary
        formattedResult.aiPrepared = {
          summary: aiSummary.summary,
          results: formattedResult.aiPrepared.results,
          nexusReportUrl: formattedResult.aiPrepared.nexusReportUrl,
          landingReportUrl: formattedResult.aiPrepared.landingReportUrl,
          runReport: formattedResult.aiPrepared.runReport,
          screenshot: formattedResult.aiPrepared.screenshot
        };
        
        logYaml(`AI summary generated successfully`, { summary: aiSummary.summary });
        
        // Update database with AI summary
        await updateTaskInDatabase(taskId, {
          result: JSON.stringify(formattedResult),
          summary: aiSummary.summary
        });
      }
      
      // Calculate safe screenshot URL here - outside of conditionals
      // This ensures it's always defined regardless of execution path
      safeScreenshotUrl = finalScreenshotPath ? 
        `${baseUrl}/nexus_run/${path.basename(finalScreenshotPath)}` : 
        '';
      
      // Send task completion event - matching format in handleBrowserAction
      if (sendWebSocketUpdate) {
        // Extract the original YAML execution result from earlier stage  
        // This is the real result with mapRun data, not the AI-generated summary
        const originalExecutionResult = result || {};
        logYaml('Original YAML execution result', { originalExecutionResult });
        
        // Instead of stringifying again, create a proper object structure that matches what server.js expects
        // This is the direct fix for the "split into individual letters" issue
        const taskResult = {
          // Use the URLs from formattedResult with empty string fallbacks to prevent null values
          nexusReportUrl: formattedResult.nexusReportUrl || '',
          landingReportUrl: formattedResult.landingReportUrl || '',
          runReport: formattedResult.runReport || '',
          reportUrl: formattedResult.reportUrl || '',
          screenshot: safeScreenshotUrl,
          // CRITICAL: Include the original YAML execution result as the primary result
          result: originalExecutionResult,
          summary: aiSummary ? aiSummary.summary : `Successfully executed YAML map: ${yamlMap.name}`,
          reportPath: reportPath || '',
          executionTime: Date.now() - startTime,
          yamlMapId,
          yamlMapName: yamlMap.name,
          aiPrepared: {
            summary: aiSummary ? aiSummary.summary : `Successfully executed YAML map: ${yamlMap.name}`,
            results: originalExecutionResult,
            // Include the same URLs in aiPrepared with safe values
            nexusReportUrl: formattedResult.nexusReportUrl || '',
            landingReportUrl: formattedResult.landingReportUrl || '',
            runReport: formattedResult.runReport || '',
            reportUrl: formattedResult.reportUrl || '',
            screenshot: safeScreenshotUrl
          }
        };
        
        // Log the final data structure being sent
        logYaml('Sending task completion event with properly structured data', {
          hasResult: !!originalExecutionResult,
          urls: {
            nexusReportUrl: taskResult.nexusReportUrl,
            landingReportUrl: taskResult.landingReportUrl,
            reportUrl: taskResult.reportUrl
          }
        });
        
        // Use the incrementally built summary from mapRunSummaryDetails
        let displaySummaryString = "";
        if (mapRunSummaryDetails.length > 0) {
          displaySummaryString = mapRunSummaryDetails.join('\n'); // Join with newlines for readability
          logYaml('Using incrementally built summary for task completion card', { summaryLength: displaySummaryString.length });
        } else {
          displaySummaryString = `Successfully executed YAML map: ${yamlMap?.name || 'YAML Map'}`;
          logYaml('No incremental summary details found, using generic success message.');
        }

        // Ensure a non-empty summary string as a final fallback
        if (!displaySummaryString || displaySummaryString.trim() === '') {
          displaySummaryString = `Execution completed for ${yamlMap?.name || 'default YAML map'}.`;
          logYaml('Display summary was empty after processing, using final fallback.');
        }

        logYaml('Final displaySummaryString for task completion card', { displaySummaryString });
        
        // Send the task completion event with exact structure CommandCenter.jsx expects
        sendWebSocketUpdate(userId, {
          event: 'taskComplete',  // Event type
          taskId,                 // Task ID used for tracking
          progress: 100,          // Always 100% for completed tasks
          status: 'completed',    // Status must be 'completed'
          error: null,           // No error for successful completion
          command: `Execute YAML: ${yamlMap?.name || 'Unknown Map'}`, // Command description
          log: yamlLog,           // Full log array for reference
          executionTime: (Date.now() - startTime), // Execution duration
          timestamp: new Date().toISOString(), // Current timestamp
          
          // Top-level summary field (critical - UI displays this directly)
          summary: displaySummaryString,
          
          // Result object structure
          result: {
            // Report URLs with fallbacks
            nexusReportUrl: reportUrl || '',
            landingReportUrl: reportUrl || '',
            reportUrl: reportUrl || '',
            runReport: reportUrl || '',
            
            // Screenshot information
            screenshot: safeScreenshotUrl || '',
            screenshotPath: finalScreenshotPath || '',
            
            // Original result data
            result: result || {},
            
            // Include properly formatted summary in both places the UI checks
            summary: displaySummaryString,
            
            // AI prepared data (UI checks here first for summaries)
            aiPrepared: {
              summary: displaySummaryString,
              results: formattedResult?.aiPrepared?.results || result || {}
            }
          },
        });
      }
    } catch (reportError) {
      logYaml(`Error generating report`, { error: reportError.toString(), stack: reportError.stack });
      
      // Despite report error, send a final progress update to ensure task doesn't appear hanging
      sendProgressUpdate(95, `Report generation error, but continuing task completion`);
      
      // Emit error notification for UI but don't fail the task
      if (sendWebSocketUpdate) {
        sendWebSocketUpdate(userId, {
          event: 'actionWarning',
          taskId,
          stepIndex,
          warning: `Report generation encountered an error: ${reportError.message}`,
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Clean up
    logYaml(`Cleaning up browser for task ${taskId}`);
    if (browser) {
      try {
        await browser.close();
        logYaml(`Browser closed successfully`);
      } catch (browserCloseError) {
        logYaml(`Error closing browser`, { error: browserCloseError.toString() });
        // Continue despite browser close error
      }
    }
    
    // Create a single source of truth for all URLs
    // This ensures all URL variables are properly initialized before use
    
    // Find any existing report files for this task
    let existingReportUrl = '';
    
    try {
      // Look for any report files that might match this task
      if (fs.existsSync(`${runDir}/report`)) {
        const reportFiles = fs.readdirSync(`${runDir}/report`);
        const reportFilePattern = new RegExp(`web-.*${taskId}.*\.html$`);
        const matchingFile = reportFiles.find(file => reportFilePattern.test(file));
        
        if (matchingFile) {
          existingReportUrl = `${baseUrl}/nexus_run/report/${matchingFile}`;
          logYaml(`Found matching report file: ${existingReportUrl}`);
        }
      }
    } catch (fsError) {
      logYaml(`Error checking for report files`, { error: fsError.toString() });
    }

    // Complete task handling the same way as in other parts of the application
    logYaml(`Completing task processing for ${taskId}`);
    
    // Update our URL variables with their final values
    
    // First, update the screenshot URL if we have a path
    safeScreenshotUrl = finalScreenshotPath ? 
      `${baseUrl}/nexus_run/${path.basename(finalScreenshotPath)}` : 
      '';
      
    // Then create the base report URL from reportPath or fall back to existing report
    baseReportUrl = reportPath ? 
      `${baseUrl}/nexus_run/report/${path.basename(reportPath)}` : 
      existingReportUrl || '';
      
    // Update our single source of truth for URLs
    reportUrl = baseReportUrl; // Update the globally defined reportUrl variable
    reportUrls.reportUrl = baseReportUrl;
    reportUrls.nexusReportUrl = baseReportUrl;
    reportUrls.landingReportUrl = baseReportUrl;
    reportUrls.runReport = baseReportUrl;
    
    // Log the final URLs to help with debugging
    logYaml('Final report URLs being used', reportUrls);
    
    // Update the existing formattedResult with final values for rich UI display
    // This UPDATES the existing formattedResult variable instead of creating a new one
    formattedResult = {
      ...formattedResult,
      yamlMapId: yamlMapId,
      yamlMapName: yamlMap?.name || 'YAML Map',
      executionTime: (Date.now() - startTime),
      // Use our single source of truth for all URLs
      ...reportUrls,
      screenshot: safeScreenshotUrl, // Last screenshot - using the safe initialized version
      // IMPORTANT: Include the original YAML execution result (mapRun data)
      result: result || undefined,
      raw: {
        // Ensure we have default values for all fields to prevent reference errors
        pageText: rawExtractedText || '',
        url: yamlMapUrl || 'N/A',
        yamlMapId: yamlMapId || '',
        yamlMapName: yamlMap?.name || 'Unknown Map'
      },
      // Include fields expected by TaskBar
      reportPath: reportPath,
      screenshotPath: finalScreenshotPath,
      // Ensure we have a consistent set of data for the task result
      extractedInfo: rawExtractedText || '',
      steps: steps || []
    };
    
    // Update aiPrepared separately to ensure we don't lose any values
    // Use the existing aiPrepared if it exists, otherwise create a new empty object
    const existingAiPrepared = formattedResult.aiPrepared || {};
    
    formattedResult.aiPrepared = {
      ...existingAiPrepared,  // Preserve any existing values
      summary: `Successfully executed YAML map: ${yamlMap?.name || 'Unknown Map'}`,
      results: result || { message: 'Task completed' },
      // Use our single source of truth (reportUrls) for all URL fields
      nexusReportUrl: reportUrls.nexusReportUrl,
      landingReportUrl: reportUrls.landingReportUrl,
      runReport: reportUrls.runReport,
      reportUrl: reportUrls.reportUrl,
      screenshot: safeScreenshotUrl  // Use safeScreenshotUrl instead of screenshotUrl
    };
    
    logYaml('Final formattedResult prepared for task completion', {
      hasResult: !!result,
      hasReport: !!reportUrls.reportUrl,  // Use reportUrls object
      hasScreenshot: !!safeScreenshotUrl  // Use safeScreenshotUrl instead of screenshotUrl
    });
    
    // Send final progress update only if not already completed
    if (!isTaskCompleted) {
      sendProgressUpdate(100, `YAML map execution completed`);
    }
    
    // Send standardized task completion event (this triggers handleTaskCompletion in the UI)
    // Format must EXACTLY match what the frontend expects to see
    // Only send if we have WebSocket and haven't already sent completion
    if (sendWebSocketUpdate && !isTaskCompleted) {
        
      // IMPORTANT: We need to update the task in the database first with ALL URLs
      // to ensure they're available in the task completion event
      await updateTaskInDatabase(taskId, {
        status: 'completed',
        progress: 100,
        // Store ALL report URLs directly in task.result to ensure they reach the client
        result: {
          nexusReportUrl: reportUrl,
          landingReportUrl: reportUrl,
          runReport: reportUrl,
          reportUrl: reportUrl,
          screenshot: screenshotUrl,
          reportPath: reportPath,
          executionTime: Date.now() - startTime,
          yamlMapId: yamlMapId || '',
          yamlMapName: yamlMap?.name || 'Unknown Map',
          // Include the YAML execution result directly
          result: result || {},
          // Include AI summary information
          aiPrepared: formattedResult.aiPrepared,
          // Use the real data for summary instead of generic text
          summary: mapRunSummary || `Successfully executed YAML map: ${yamlMap?.name || 'Unknown Map'}`
        }
      });
      
      // Log the report URLs being saved
      logYaml('Saving final result with report URLs', {
        reportUrl,
        screenshotUrl,
        hasResult: !!result
      });
      
      // These specific fields are required by the frontend
      // Format EXACTLY matching what CommandCenter.jsx expects to process
      const taskCompletionEvent = {
        event: 'taskComplete',  // Event type
        taskId,                 // Task ID used for tracking
        progress: 100,          // Always 100% for completed tasks
        status: 'completed',    // Status must be 'completed'
        error: null,           // No error for successful completion
        command: `Execute YAML: ${yamlMap?.name || 'Unknown Map'}`, // Command description
        log: yamlLog,           // Full log array for reference
        executionTime: (Date.now() - startTime), // Execution duration
        timestamp: new Date().toISOString(), // Current timestamp
          
        // Top-level summary field (critical - UI displays this directly)
        summary: displaySummaryString,
          
        // Result object structure - exactly matching expected format
        result: {
          // Report URLs with fallbacks
          nexusReportUrl: reportUrl || '',
          landingReportUrl: reportUrl || '',
          reportUrl: reportUrl || '',
          runReport: reportUrl || '',
            
          // Screenshot information
          screenshot: safeScreenshotUrl || '',
          screenshotPath: finalScreenshotPath || '',
          reportPath: reportPath || '',
            
          // Additional metadata
          executionTime: Date.now() - startTime,
          yamlMapId: yamlMapId || '',
          yamlMapName: yamlMap?.name || 'Unknown Map',
            
          // Original result data
          result: result || {},
            
          // Include properly formatted summary in both places the UI checks
          summary: displaySummaryString,
            
          // AI prepared data (UI checks here first for summaries)
          aiPrepared: {
            summary: displaySummaryString,
            results: formattedResult?.aiPrepared?.results || result || {}
          }
        },
        // Add item outside of the stringified result for TaskBar
        item: {
          type: 'summary',
          title: `YAML Map: ${yamlMap?.name || 'Unknown Map'}`,
          content: `Successfully executed YAML map with ${steps?.length || 0} steps`,
          executionTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };
      
      logYaml(`Sending task completion event`, { event: 'taskComplete' });
      sendWebSocketUpdate(userId, taskCompletionEvent);
      
      // Mark task as completed after sending the completion event
      // This prevents duplicate events from being processed
      isTaskCompleted = true;
    }
    
    // Return in same format as handleBrowserAction for consistent handling by processTask
    return {
      success: true,
      error: null,
      task_id: taskId, // Note: handleBrowserAction uses task_id, not taskId
      status: 'completed',
      closed: browser ? false : true, // Browser status
      currentUrl: yamlMapUrl || 'N/A',
      stepIndex: stepIndex,
      actionOutput: `Successfully executed YAML map: ${yamlMap.name}`,
      pageTitle: yamlMap.name,
      result: result, // Original execution result
      extractedInfo: result?.data || {}, // Any data extracted during execution
      actionLog: yamlLog, // Full execution log
      screenshotPath: finalScreenshotPath, // Screenshot URL if taken
      reportPath: reportPath, // Report path if generated
      formattedResult: formattedResult, // Our rich formatted result for UI
      browserSession: browser ? { browser, agent, page, closed: false } : null, // Browser session if available
      state: {
        assertion: `YAML Map ${yamlMap.name} executed successfully`,
        yamlMapId,
        yamlMapName: yamlMap.name,
        executionTime: Date.now() - startTime
      }
    };
  } catch (error) {
    logYaml(`Error executing YAML map`, { error: error.toString(), stack: error.stack });
    
    // Send progress update with error - using the same format as handleBrowserAction
    if (sendWebSocketUpdate) {
      sendWebSocketUpdate(userId, { 
        event: 'stepProgress', 
        taskId, 
        stepIndex, 
        progress: 0, 
        message: `Error: ${error.message}`,
        log: yamlLog,
        error: true
      });
    }
    
    // Update task with error in database
    await updateTaskInDatabase(taskId, {
      status: 'error',
      statusMessage: `Error executing YAML map: ${error.message}`,
      error: error.message,
      progress: 0
    });
    
    // Send task error notification - matches format in handleBrowserAction
    if (sendWebSocketUpdate) {
      // Update our step status to error
      if (steps && steps.length > 0) {
        steps[0].status = 'error';
        steps[0].progress = 0;
      }
      
      // Send stepProgress with error
      sendWebSocketUpdate(userId, { 
        event: 'stepProgress', 
        taskId, 
        stepIndex: 0, 
        progress: 0, 
        message: `Error: ${error.message}`,
        log: yamlLog,
        error: true,
        item: {
          type: 'error',
          title: 'YAML Map Execution Error',
          content: error.message || 'Unknown error occurred',
          timestamp: new Date().toISOString()
        }
      });
      
      // Send standardized taskError event
      sendWebSocketUpdate(userId, {
        event: 'taskError',  // Standard event name used across the codebase
        taskId,
        error: error.message,
        log: yamlLog,
        timestamp: new Date().toISOString(),
        stack: error.stack, // Include stack trace for debugging
        // Include item property for TaskBar UI
        item: {
          type: 'error',
          title: 'YAML Map Execution Failed',
          content: error.message || 'Unknown error occurred',
          timestamp: new Date().toISOString()
        }
      });
    }
    
    // Trim action log for error response, just like handleBrowserAction does
    const trimmedLog = yamlLog.map(entry => {
      const shortMsg = entry.message.length > 150 
        ? entry.message.substring(0, 150) + '...'
        : entry.message;
      return { ...entry, message: shortMsg };
    });
    
    // Return error in same format as handleBrowserAction, don't throw
    // This allows consistent error handling in processTask
    return {
      success: false,
      error: error.message,
      task_id: taskId,
      status: 'error',
      actionLog: trimmedLog,
      currentUrl: yamlMapUrl || 'N/A',
      stepIndex: stepIndex,
      stack: error.stack
    };
  }
}

// Function removed to prevent duplicate declaration
// The extractYamlMapIdFromPrompt function is already defined at the top of this file
// SUNDAY 18 May alternative solution to YAMLs