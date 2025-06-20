/**
 * YAML Map Processing Utility
 * Handles execution of YAML maps using the Nexus agent
 */
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import { getPuppeteerLaunchOptions } from './puppeteerConfig.js';

// Track browser instances for cleanup
let activeBrowsers = new Set();

/**
 * Clean up browser instances
 * @param {Error} [error] - Optional error that occurred
 * @returns {Promise<void>}
 */
async function cleanupBrowser(error) {
  if (error) {
    console.error('[YAML] Error during cleanup:', error);
  }
  
  const browsersToClose = Array.from(activeBrowsers);
  activeBrowsers.clear();
  
  await Promise.allSettled(
    browsersToClose.map(async browser => {
      try {
        // First close all pages
        const pages = await browser.pages();
        await Promise.allSettled(
          pages.map(page => page.close().catch(() => {}))
        );
        
        // Then close the browser
        await browser.close();
      } catch (err) {
        console.error('[YAML] Error during browser cleanup:', err);
      }
    })
  );
}
import YamlMap from '../models/YamlMap.js';
import { generateReport } from './reportGenerator.js';
import OpenAI from 'openai';
import os from 'os';

// Configure Puppeteer with stealth plugin
puppeteer.use(StealthPlugin());

// Get Puppeteer launch options with YAML-specific settings
const getYamlPuppeteerOptions = async () => {
  // Get base options
  const options = await getPuppeteerLaunchOptions();
  
  // Use headless mode in production, non-headless in development
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Set viewport to be within GPT-4o limits (max 2000x768 or 768x2000)
  const viewport = {
    width: 1024,  // Reduced from 1280 to be safer
    height: 768,   // Standard 4:3 ratio that fits within limits
    deviceScaleFactor: 1,
  };
  
  // Clean up args to remove any existing viewport or window-size args
  const cleanedArgs = (options.args || []).filter(arg => 
    !arg.startsWith('--window-size=') && 
    !arg.startsWith('--start-maximized')
  );
  
  // Add our viewport settings
  cleanedArgs.push(`--window-size=${viewport.width},${viewport.height}`);
  
  return {
    ...options,
    headless: isProduction ? 'new' : false,  // Headless in production, normal in development
    defaultViewport: viewport,
    args: cleanedArgs,
    ignoreDefaultArgs: ['--enable-automation'],
    // Ensure we have a clean user data directory for each instance
    userDataDir: path.join(
      os.tmpdir(), 
      `puppeteer_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
    )
  };
};

// Initialize OpenAI client if API key is available
let openaiClient;
if (process.env.OPENAI_API_KEY) {
  try {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log('[YAML Processor] OpenAI client initialized successfully.');
  } catch (e) {
    console.error('[YAML Processor] Failed to initialize OpenAI client:', e.message);
    openaiClient = null;
  }
} else {
  console.warn('[YAML Processor] OPENAI_API_KEY is not set. AI summary features will be disabled.');
  openaiClient = null;
}

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
          result = step.result.substring(0, 800);
        } else if (typeof step.result === 'object') {
          result = JSON.stringify(step.result).substring(0, 800);
        }
      }
      
      return {
        task: taskName,
        result: result
      };
    });
    
    // Use yamlMap.yaml for the original script content, truncate if too long
    const originalYamlContent = yamlMap.yaml ? yamlMap.yaml.substring(0, 1500) : 'Original YAML content not available.';
    const prompt = `
I have just completed an automated browser task based on the following YAML script for the user.
My name for this task was "${yamlMap.name}".

Original YAML Script (or beginning of it):
------
${originalYamlContent}
------

Here's a summary of my execution:
Execution Log (last ${yamlLog.slice(-20).length} entries):
${condensedLog}

Key Steps I Took and Their Results:
${JSON.stringify(keySteps, null, 2)}

My Task Now Is To Report Concisely:
1.  **Primary Goal**: Based on the YAML, what was the main objective I was trying to achieve?
2.  **Final Outcome**: What was the actual final result or key piece of information I obtained? Be specific.
3.  **My Process**: Briefly describe the key actions I performed to get to the outcome.
4.  **Challenges Faced**: Were there any significant issues, errors, or deviations from the YAML script's plan during my execution? If so, what were they?
5.  **Overall Summary**: A very brief (1-2 sentences) wrap-up of the execution.

Please provide your report in a JSON object with the following keys: "primaryGoal", "finalOutcome", "processSummary", "challengesFaced", "overallSummary".
    `;
    
    // Call OpenAI API
    console.log(`[YamlSummary] Requesting AI summary for YAML map ${yamlMap._id}`);
    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o', // Use most capable model for summary
      messages: [
        { role: 'system', content: "You are an AI assistant that has just executed an automated browser task based on a YAML script. Your goal is to report on the outcome, what you observed, and any challenges encountered, as if you performed the task yourself. Respond in JSON format based on the user's instructions." },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 1000,
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
        primaryGoal: 'Unknown due to parsing error.',
        finalOutcome: 'Unknown due to parsing error.',
        processSummary: 'Unable to generate detailed AI summary due to parsing error.',
        challengesFaced: ['Error parsing AI model response.'],
        overallSummary: 'YAML map execution completed, but AI summary parsing failed.'
      };
    }
  } catch (error) {
    console.error('[YamlSummary] Error generating AI summary:', error);
    return {
      primaryGoal: 'Unknown due to an error.',
      finalOutcome: 'Unknown due to an error.',
      processSummary: 'Unable to generate AI summary due to an internal error during generation.',
      challengesFaced: ['An error occurred while attempting to generate the AI summary.'],
      overallSummary: 'YAML map execution completed, but AI summary generation failed.'
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

  // Validate runDir at the start
  if (!runDir || typeof runDir !== 'string') {
    throw new Error('Invalid or missing runDir parameter');
  }

  // Declare key variables at the top
  let yamlMap = null;           // Will hold the fetched YAML map
  let yamlMapUrl = 'N/A';       // Default value if no URL is set
  const isProduction = process.env.NODE_ENV === 'production';
  const baseUrl = isProduction ? '' : (process.env.BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'));
  const reportDir = path.resolve(runDir, 'report');
  let reportPath = null;
  let nexusReportUrl = null; // Initialized
  let landingReportUrl = null; // Initialized
  let generatedReportUrl = null; // General report URL from generator
  let screenshotUrl = null;
  let finalScreenshotPath = null;
  let rawExtractedText = '';
  let formattedResult = null;
  const yamlLog = [];
  const stepIndex = 0;
  let currentProgress = 0;
  let isTaskCompleted = false;

  const steps = [{
    id: 'yaml-step-0',
    index: 0,
    type: 'yaml',
    name: yamlMapId ? `Execute YAML Map ${yamlMapId}` : 'Execute YAML Map',
    status: 'running'
  }];

  // Helper function to log messages
  const logYaml = (message, data = null) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      step: stepIndex,
      message,
      data
    };
    yamlLog.push(logEntry);
    console.log(`[YAML] Task ${taskId} log:`, { level: 'info', message, data });

    if (sendWebSocketUpdate) {
      sendWebSocketUpdate(userId, {
        event: 'planLog',
        taskId,
        message,
        metadata: data || {},
        item: {
          type: 'log',
          title: 'YAML Process Log',
          content: message?.substring(0, 100) || 'Log entry',
          timestamp: new Date().toISOString()
        }
      });
      sendWebSocketUpdate(userId, {
        event: 'stepLog',
        taskId,
        stepIndex,
        log: logEntry,
        item: {
          type: 'log',
          title: `YAML Step ${stepIndex}`,
          content: message?.substring(0, 100) || 'Log entry',
          timestamp: new Date().toISOString()
        }
      });
      if (message.includes('completed') || message.includes('captured') || message.includes('generated') || data?.screenshotUrl || data?.reportUrl) {
        sendWebSocketUpdate(userId, {
          event: 'intermediateResult',
          taskId,
          stepIndex,
          item: {
            type: message.includes('screenshot') ? 'screenshot' : message.includes('report') ? 'report' : 'info',
            title: message.substring(0, 80),
            content: data ? JSON.stringify(data).substring(0, 150) : message,
            url: data?.screenshotUrl || data?.reportUrl || null,
            timestamp: new Date().toISOString()
          }
        });
      }
    }
  };

  // Helper function to send progress updates
  const sendProgressUpdate = (progressPercent, progressMessage, metadata = {}) => {
    if (isTaskCompleted && progressPercent >= 100) return;
    currentProgress = progressPercent;
    steps[0].progress = progressPercent;
    steps[0].status = progressPercent >= 100 ? 'completed' : progressPercent <= 0 ? 'error' : 'running';
    if (progressPercent >= 100) isTaskCompleted = true;
    if (sendWebSocketUpdate) {
      sendWebSocketUpdate(userId, {
        event: 'stepProgress',
        taskId,
        stepIndex,
        progress: progressPercent,
        message: progressMessage,
        log: yamlLog,
        item: {
          type: 'progress',
          // Safely handle undefined yamlMap
          title: `YAML Map: ${yamlMap ? yamlMap.name : 'Unknown Map'} (${progressPercent}%)`,
          content: progressMessage || 'Processing YAML map',
          progress: progressPercent,
          timestamp: new Date().toISOString()
        }
      });
    }
    // Send intermediate result for significant milestones
    if (metadata.action || metadata.screenshotUrl || metadata.reportUrl) {
      sendWebSocketUpdate(userId, {
        event: 'intermediateResult',
        taskId,
        stepIndex,
        item: {
          type: metadata.action ? 'action' : metadata.screenshotUrl ? 'screenshot' : 'report',
          title: metadata.action || progressMessage,
          content: metadata.action
            ? `Executed: ${metadata.action}`
            : metadata.screenshotUrl
            ? `Captured screenshot`
            : `Generated report`,
          url: metadata.screenshotUrl || metadata.reportUrl || null,
          timestamp: new Date().toISOString(),
          metadata
        }
      });
    }
    updateTaskInDatabase(taskId, { progress: progressPercent });
  };

  const startTime = Date.now();

  try {
    logYaml(`Starting YAML map execution for map ID ${yamlMapId}`);

    // Fetch yamlMap early
    yamlMap = await YamlMap.findById(yamlMapId);
    if (!yamlMap) {
      throw new Error(`YAML map not found with ID: ${yamlMapId}`);
    }
    logYaml(`YAML map found: ${yamlMap.name}`, {
      yamlMapName: yamlMap.name,
      description: yamlMap.description || 'No description',
      tags: yamlMap.tags || []
    });
    yamlMapUrl = yamlMap.url || url || 'N/A'; // Set yamlMapUrl here

    // Now send progress updates after yamlMap is defined
    sendProgressUpdate(10, `Loading YAML Map ${yamlMapId}`);
    sendProgressUpdate(20, `Preparing to execute YAML map: ${yamlMap.name}`);

    await updateTaskInDatabase(taskId, {
      status: 'executing',
      statusMessage: `Executing YAML map: ${yamlMap.name}`,
      yamlMapId,
      yamlMapName: yamlMap.name,
      progress: 10
    });

    sendWebSocketUpdate(userId, {
      event: 'yamlMapStarted',
      taskId,
      yamlMapId,
      yamlMapName: yamlMap.name,
      timestamp: new Date().toISOString()
    });

    const logEntry = {
      type: 'yamlMapExecutionStart',
      yamlMapId,
      yamlMapName: yamlMap.name,
      description: yamlMap.description || 'No description',
      taskId,
      timestamp: new Date().toISOString()
    };
    if (tasksStore) {
      logYaml(`Adding step log to tasksStore for task ${taskId}`);
      tasksStore.addStepLog(taskId, logEntry);
    } else {
      logYaml(`No tasksStore provided, skipping addStepLog`);
    }

    sendWebSocketUpdate(userId, {
      event: 'planLog',
      message: `Executing YAML map: ${yamlMap.name}`,
      taskId,
      stepNumber: 1
    });

    let engineInfo;
    if (setupNexusEnvironment) {
      engineInfo = await setupNexusEnvironment(userId, engine);
    }

    console.log(`[ProcessYamlTask] Environment setup complete for task ${taskId}`);
    await updateTaskInDatabase(taskId, { progress: 20 });

    yamlMap.usageCount = (yamlMap.usageCount || 0) + 1;
    // Initialize Puppeteer with centralized configuration
    let browser;
    let page;
    let agent;

    try {
      console.log(`[ProcessYamlTask] Initializing browser for task ${taskId}`);
      const launchOptions = await getYamlPuppeteerOptions();
      
      // Add any additional browser arguments needed for container environments
      launchOptions.args = [
        ...(launchOptions.args || []),
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-site-isolation-trials'
      ];

      // Set environment variables for container compatibility
      process.env.CHROME_DEVEL_SANDBOX = '/tmp/chrome-sandbox';
      process.env.DISPLAY = ':99';
      
      // Create a unique temporary directory for this browser instance
      const tempDir = path.join(os.tmpdir(), `puppeteer-profile-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`);
      fs.mkdirSync(tempDir, { recursive: true });
      
      // Add user data directory to launch options
      launchOptions.userDataDir = tempDir;
      launchOptions.args.push(`--user-data-dir=${tempDir}`);

      console.log(`[ProcessYamlTask] Launching browser with options:`, 
        JSON.stringify({
          ...launchOptions,
          // Don't log the entire environment for security
          env: { ...Object.keys(launchOptions.env || {}).reduce((acc, key) => ({
            ...acc,
            [key]: key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN') ? '***REDACTED***' : launchOptions.env[key]
          }), {}) }
        }, null, 2)
      );

      browser = await puppeteer.launch(launchOptions);
      
      // Set up browser cleanup function
      const cleanupBrowser = async (error = null) => {
        console.log('[ProcessYamlTask] Cleaning up browser resources...');
        const errors = [];
        
        try {
          if (browser) {
            try {
              const pages = await browser.pages();
              await Promise.all(pages.map(p => p.close().catch(e => {
                console.error('Error closing page:', e);
                errors.push(e);
              })));
              await browser.close().catch(e => {
                console.error('Error closing browser:', e);
                errors.push(e);
              });
            } catch (e) {
              console.error('Error during browser cleanup:', e);
              errors.push(e);
            } finally {
              // Clean up the temporary directory
              if (tempDir && fs.existsSync(tempDir)) {
                try {
                  fs.rmSync(tempDir, { recursive: true, force: true });
                } catch (e) {
                  console.error('Error cleaning up temp directory:', e);
                  errors.push(e);
                }
              }
            }
          }
          
          // Remove all event listeners to prevent memory leaks
          process.removeAllListeners('SIGTERM');
          process.removeAllListeners('SIGINT');
          process.removeAllListeners('SIGHUP');
          process.removeAllListeners('uncaughtException');
          process.removeAllListeners('unhandledRejection');
          
          if (error) {
            console.error('[ProcessYamlTask] Error during YAML processing:', error);
            // Only throw if we're not already handling an error
            if (!error.handled) {
              throw error;
            }
          }
          
          return errors.length > 0 ? errors : null;
        } catch (e) {
          console.error('Unexpected error during cleanup:', e);
          throw e;
        }
      };

      // Handle process termination signals - but don't exit the process
      const handleShutdown = async (signal) => {
        console.log(`[ProcessYamlTask] Received ${signal}, cleaning up...`);
        try {
          await cleanupBrowser();
          console.log(`[ProcessYamlTask] Cleanup complete after ${signal}`);
        } catch (e) {
          console.error(`[ProcessYamlTask] Error during ${signal} cleanup:`, e);
        }
      };

      // Set up signal handlers
      process.on('SIGTERM', () => handleShutdown('SIGTERM'));
      process.on('SIGINT', () => handleShutdown('SIGINT'));
      process.on('SIGHUP', () => handleShutdown('SIGHUP'));
      
      // Handle uncaught exceptions and rejections
      process.on('uncaughtException', (err) => {
        console.error('[ProcessYamlTask] Uncaught exception:', err);
        err.handled = true;
        cleanupBrowser(err).catch(console.error);
      });
      
      process.on('unhandledRejection', (reason, promise) => {
        console.error('[ProcessYamlTask] Unhandled rejection at:', promise, 'reason:', reason);
        const err = reason instanceof Error ? reason : new Error(String(reason));
        err.handled = true;
        cleanupBrowser(err).catch(console.error);
      });

      // Create a new page with better error handling
      page = await browser.newPage();
      
      // Set viewport to match our YAML processor settings
      await page.setViewport({
        width: 1024,  // Matches GPT-4o limits (max 2000x768 or 768x2000)
        height: 768,
        deviceScaleFactor: 1
      });
      
      // Handle page errors to prevent crashes
      page.on('error', error => {
        console.error('[ProcessYamlTask] Page error:', error);
      });
      
      // Handle dialog events to prevent unhandled dialogs from blocking execution
      page.on('dialog', async dialog => {
        console.log(`[ProcessYamlTask] Dialog ${dialog.type()}: ${dialog.message()}`);
        await dialog.dismiss().catch(() => {});
      });
      
      // Track all pages in this browser instance
      const pages = new Set([page]);
      
      // Handle new pages (tabs) being created
      browser.on('targetcreated', async target => {
        try {
          const newPage = await target.page();
          if (newPage && !pages.has(newPage)) {
            console.log('[ProcessYamlTask] New page/tab opened');
            pages.add(newPage);
            
            // Set up error handling for the new page
            newPage.on('error', error => {
              console.error('[ProcessYamlTask] Page error in new tab:', error);
            });
            
            // Set viewport for the new page to match our settings
            await newPage.setViewport({
              width: 1024,
              height: 768,
              deviceScaleFactor: 1
            });
            
            // When the new page is closed, clean it up
            newPage.on('close', () => {
              pages.delete(newPage);
              console.log('[ProcessYamlTask] Page closed');
            });
          }
        } catch (error) {
          console.error('[ProcessYamlTask] Error handling new page:', error);
        }
      });
      
      // Store pages in the browser context for cleanup later
      browser.pages = pages;

      console.log(`[ProcessYamlTask] Browser initialized for task ${taskId}`);
      await updateTaskInDatabase(taskId, { progress: 40 });

      console.log(`[ProcessYamlTask] Creating Nexus agent with page for task ${taskId}`);
      agent = new PuppeteerAgent(page);
      console.log(`[ProcessYamlTask] Agent initialized for task ${taskId}`);
    } catch (initError) {
      console.error(`[ProcessYamlTask] Error initializing PuppeteerAgent:`, initError);
      try {
        // Clean up resources if they were partially initialized
        if (page) await page.close().catch(console.error);
        if (browser) await browser.close().catch(console.error);
      } catch (cleanupError) {
        console.error('[ProcessYamlTask] Error during cleanup after initialization failure:', cleanupError);
      }
      
      // Log the error and continue with the task
      logYaml('Error initializing browser', { 
        error: initError.message,
        stack: initError.stack
      });
      
      // Update task status to failed
      await updateTaskInDatabase(taskId, { 
        status: 'failed',
        error: `Failed to initialize browser: ${initError.message}`,
        progress: 100
      });
      
      // Return a proper error response instead of throwing
      return {
        success: false,
        error: `Failed to initialize browser: ${initError.message}`,
        errorDetails: process.env.NODE_ENV === 'development' ? 
          { stack: initError.stack } : undefined,
        yamlLog,
        steps: steps.map(step => ({
          ...step,
          status: 'failed',
          error: initError.message
        }))
      };
    }

    if (yamlMapUrl !== 'N/A') {
      try {
        const urlObj = new URL(yamlMapUrl);
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
          console.log(`[ProcessYamlTask] Navigating to URL: ${yamlMapUrl}`);
          await page.goto(yamlMapUrl);
          // Extract page text after navigation
          rawExtractedText = await page.evaluate(() => document.body.innerText).catch(err => {
            logYaml(`Error extracting page text`, { error: err.toString() });
            return '';
          });
          rawExtractedText = rawExtractedText.substring(0, 3000); // Limit size
        } else {
          console.warn(`[ProcessYamlTask] Invalid URL protocol: ${yamlMapUrl} - skipping navigation`);
        }
      } catch (urlError) {
        console.warn(`[ProcessYamlTask] Invalid URL format provided: ${yamlMapUrl} - skipping navigation`);
      }
    } else {
      console.log(`[ProcessYamlTask] No URL provided - skipping navigation`);
    }

      // Ensure we have a valid YAML content
      if (!yamlMap.yaml || typeof yamlMap.yaml !== 'string') {
        throw new Error('Invalid or missing YAML content');
      }
      
      const yamlContent = yamlMap.yaml;
      const taskMatches = yamlContent.match(/name:/g);
      const totalTasks = taskMatches ? taskMatches.length : 0;
      let lastProgressUpdate = 40;
      let stepCount = 0;
      
      // Track if we've encountered an error during execution
      let executionError = null;

    const progressCallback = (stepInfo) => {
      try {
        stepCount++;
        const executionProgress = Math.min(50, Math.floor((stepCount / (totalTasks * 2)) * 50));
        const totalProgress = 50 + executionProgress;
        if (totalProgress > lastProgressUpdate) {
          lastProgressUpdate = totalProgress;
          sendProgressUpdate(totalProgress, `Executing YAML step: ${stepInfo.command || 'Unknown action'}`, {
            action: stepInfo.command,
            url: stepInfo.url || yamlMapUrl
          });
        }
      } catch (error) {
        console.error('[ProcessYamlTask] Error in progress callback:', error);
      }
    };

    let agentRunOutput;
    let executionResult;
    
    try {
      console.log(`[ProcessYamlTask] Starting YAML execution for task ${taskId}`);
      
      // Add retry logic for YAML execution
      const maxRetries = 3;
      let lastError;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          agentRunOutput = await agent.runYaml(yamlMap.yaml, {
            progressCallback,
            enableLogging: true,
            // Add any additional options needed for stability
            waitUntil: 'networkidle2',
            timeout: 30000 // 30 second timeout
          });
          break; // If successful, exit the retry loop
        } catch (retryError) {
          lastError = retryError;
          console.error(`[ProcessYamlTask] Attempt ${attempt} failed:`, retryError);
          
          if (attempt < maxRetries) {
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            console.log(`[ProcessYamlTask] Retrying (${attempt + 1}/${maxRetries})...`);
          }
        }
      }
      
      // If we've exhausted all retries, throw the last error
      if (!agentRunOutput && lastError) {
        throw lastError;
      }
      executionResult = agentRunOutput?.result;
      
      if (!executionResult) {
        throw new Error('No execution result returned from YAML processor');
      }
      
      console.log(`[ProcessYamlTask] YAML execution completed for task ${taskId}`);
    } catch (executionError) {
      console.error(`[ProcessYamlTask] Error during YAML execution for task ${taskId}:`, executionError);
      
      // Check if the error is due to page navigation
      if (executionError.message.includes('Target closed') || 
          executionError.message.includes('Protocol error') ||
          executionError.message.includes('frame was detached')) {
        console.error('[ProcessYamlTask] Page navigation error detected, attempting recovery...');
        // Attempt to recover by creating a new page
        try {
          if (page && !page.isClosed()) {
            await page.close().catch(() => {});
          }
          page = await browser.newPage();
          await page.setViewport({
            width: 1024,
            height: 768,
            deviceScaleFactor: 1
          });
          // You might want to navigate back to a specific URL or retry the operation
        } catch (recoveryError) {
          console.error('[ProcessYamlTask] Recovery attempt failed:', recoveryError);
          // Continue with the original error
        }
      }
      
      throw executionError; // Re-throw the error after handling
      
      // Log the error
      logYaml('Error during YAML execution', { 
        error: executionError.message,
        stack: executionError.stack
      });
      
      // Update task status
      await updateTaskInDatabase(taskId, { 
        status: 'failed',
        error: `YAML execution failed: ${executionError.message}`,
        progress: 100
      });
      
      // Clean up resources
      await cleanupBrowser(executionError).catch(console.error);
      
      // Return error response
      return {
        success: false,
        error: `YAML execution failed: ${executionError.message}`,
        errorDetails: process.env.NODE_ENV === 'development' ? 
          { stack: executionError.stack } : undefined,
        yamlLog,
        steps: steps.map(step => ({
          ...step,
          status: 'failed',
          error: executionError.message
        }))
      };
    } finally {
      // Ensure we always clean up resources, even if there was an error
      if (!executionError) {
        await cleanupBrowser().catch(console.error);
      }
    }

    const endTime = Date.now();
    console.log(`[ProcessYamlTask] YAML execution completed for task ${taskId}`);

    const completionLogEntry = {
      type: 'yamlMapExecutionComplete',
      yamlMapId,
      yamlMapName: yamlMap.name,
      taskId,
      executionTime: endTime - startTime,
      timestamp: new Date().toISOString(),
      result: JSON.stringify(executionResult)
    };
    if (tasksStore) {
      logYaml(`Adding completion log to tasksStore for task ${taskId}`);
      tasksStore.addStepLog(taskId, completionLogEntry);
    } else {
      logYaml(`No tasksStore provided, skipping addStepLog for completion`);
    }

    if (sendWebSocketUpdate) {
      sendWebSocketUpdate(userId, {
        event: 'actionComplete',
        taskId,
        stepIndex,
        actionType: 'yamlMap',
        yamlMapId,
        yamlMapName: yamlMap.name,
        executionTime: endTime - startTime,
        result: JSON.stringify(executionResult),
        timestamp: new Date().toISOString()
      });
    }

    try {
      sendProgressUpdate(85, `Capturing final screenshot`);
      const screenshotFilename = `final-screenshot-${taskId}.png`;
      finalScreenshotPath = path.resolve(runDir, screenshotFilename);

      logYaml(`Attempting to take screenshot to ${finalScreenshotPath}`);
      if (page && typeof page.screenshot === 'function') {
        await page.screenshot({ path: finalScreenshotPath, fullPage: true });
        logYaml(`Final screenshot saved to ${finalScreenshotPath}`);
      } else if (browser && typeof browser.pages === 'function') {
        const pages = await browser.pages();
        if (pages && pages.length > 0) {
          const activePage = pages[pages.length - 1];
          await activePage.screenshot({ path: finalScreenshotPath, fullPage: true });
          logYaml(`Final screenshot saved via browser.pages to ${finalScreenshotPath}`);
        } else {
          logYaml(`No pages available for screenshot`, { error: true });
          finalScreenshotPath = null;
        }
      } else {
        logYaml(`No screenshot capabilities available`, { error: true });
        finalScreenshotPath = null;
      }

      if (finalScreenshotPath) {
        // Mirror the exact same path structure as in processTaskCompletion
        screenshotUrl = `/nexus_run/${runId}/${path.basename(finalScreenshotPath)}`;
        logYaml(`Screenshot captured successfully`, { screenshotUrl });
        if (sendWebSocketUpdate) {
          sendWebSocketUpdate(userId, {
            event: 'actionScreenshot',
            taskId,
            stepIndex,
            screenshotUrl,
            timestamp: new Date().toISOString()
          });
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
        await updateTaskInDatabase(taskId, { screenshotPath: screenshotUrl });
        sendWebSocketUpdate(userId, {
          event: 'screenshotTaken',
          taskId,
          screenshotUrl,
          timestamp: new Date().toISOString()
        });
      }
    } catch (screenshotError) {
      console.error(`[ProcessYamlTask] Error taking final screenshot:`, screenshotError);
      logYaml(`Error capturing screenshot`, { error: screenshotError.toString() });
      finalScreenshotPath = null;
    }

    // Generate AI summary before formattedResult
    logYaml(`Generating AI summary of YAML execution`);
    let aiSummary;
    try {
      aiSummary = await generateAiSummary(userId, yamlLog, yamlMap, steps, {
        taskId,
        yamlMapId,
        yamlMapName: yamlMap.name,
        executionTime: endTime - startTime,
        result: executionResult
      });
    } catch (summaryError) {
      logYaml(`Error generating AI summary`, { error: summaryError.toString() });
      aiSummary = { summary: `Successfully executed YAML map: ${yamlMap.name}` };
    }

    // Initialize formattedResult with richer structure
    formattedResult = {
      success: true,
      error: null,
      taskId,
      command: `YAML Map: ${yamlMap?.name || 'Unknown Map'}`,
      url: yamlMapUrl,
      status: 'completed',
      timestamp: new Date().toISOString(),
      executionTime: endTime - startTime,
      progress: 100,
      raw: {
        pageText: rawExtractedText,
        yamlMapId: yamlMapId,
        yamlMapName: yamlMap?.name || 'Unknown Map',
        executionTime: endTime - startTime,
        // Store the execution result in a structured format for display
        executionResult: executionResult
      },
      // Add a formatted version of the execution result for direct display
      formattedExecutionResult: {
        description: `YAML map ${yamlMap?.name || 'Unknown Map'} executed successfully`,
        result: executionResult
      },
      extractedInfo: rawExtractedText,
      intermediateResults: steps.map(step => ({
        step: step.index,
        status: step.status,
        screenshot: screenshotUrl || null,
        extractedInfo: step.message || null
      })),
      steps: steps.slice(0, 50), // Limit to 50 steps
      // Add aiPrepared field if it doesn't exist yet
      aiPrepared: {
        summary: aiSummary?.summary || `Successfully executed YAML map: ${yamlMap?.name || 'Unknown Map'}`
      }
    };

    // Generate comprehensive report (Starts ~line 625)
    try { // This is the try block for report generation AND AI summary
      sendProgressUpdate(90, `Generating execution report`);
      logYaml(`Using report directory: ${reportDir}`);

      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
        logYaml(`Created report directory: ${reportDir}`);
      }

      const reportGeneratorModule = await import('./reportGenerator.js').catch(async (importError) => {
        logYaml(`Error importing reportGenerator`, { error: importError.toString() });
        const reportGeneratorPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './reportGenerator.js');
        return await import(reportGeneratorPath).catch((fallbackError) => {
          logYaml(`Fallback import for reportGenerator failed`, { error: fallbackError.toString() });
          return null;
        });
      });

      if (reportGeneratorModule && typeof reportGeneratorModule.generateReport === 'function') {
        const reportPrompt = `YAML Map Execution: ${yamlMap?.name || 'Unknown YAML Map'}`;
        const reportResults = [{
          summary: formattedResult?.aiPrepared?.overallSummary || `Execution of ${yamlMap?.name || 'map'} completed.`,
          result: executionResult,
          metadata: { 
            yamlMapId: yamlMapId,
            yamlMapName: yamlMap?.name,
            // executionTime: endTime - startTime // Ensure endTime and startTime are in scope or pass pre-calculated duration
          }
        }];

        // STEP 1: First find and process midscene report to get URLs, then generate landing report
        // This follows the same correct approach we implemented in server.js
        let midsceneReportPath = null;
        let currentNexusReportUrl = null;
        let currentRawReportUrl = null;
        let generatedReportDetails = null;
        
        // STEP 2: Import editMidsceneReport and process midscene report first
        try {
          // Import the midscene editor
          const { editMidsceneReport } = await import('./midsceneReportEditor.js');
          
          if (agent && agent.reportFile && fs.existsSync(agent.reportFile)) {
            midsceneReportPath = agent.reportFile;
            logYaml(`[YamlProcessor] Found midscene report at ${midsceneReportPath}`);
            
            // Edit midscene report to get the final path
            try {
              midsceneReportPath = await editMidsceneReport(midsceneReportPath);
              logYaml(`[YamlProcessor] Successfully edited midscene report: ${midsceneReportPath}`);
              
              // Extract the filename to create consistent URLs
              const reportFilename = path.basename(midsceneReportPath);
              
              // Set URLs based on the same filename
              currentNexusReportUrl = `/external-report/${reportFilename}`;
              const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? '' : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'));
              currentRawReportUrl = `${baseUrl}/raw-report/${reportFilename}`;
              
              logYaml(`[YamlProcessor] Created consistent report URLs:`);
              logYaml(`[YamlProcessor] - Nexus URL: ${currentNexusReportUrl}`);
              logYaml(`[YamlProcessor] - Raw URL: ${currentRawReportUrl}`);
            } catch (editError) {
              // Failed to edit the report
              logYaml(`[YamlProcessor] Error editing midscene report: ${editError.message}`, { stack: editError.stack });
              throw new Error(`Failed to edit midscene report: ${editError.message}`);
            }
          } else {
            // No report file available from agent
            logYaml(`[YamlProcessor] No midscene report found from agent`);
            throw new Error('No midscene report available from agent');
          }
        } catch (midsceneError) {
          // Handle any errors in finding or processing the midscene report
          logYaml(`[YamlProcessor] ${midsceneError.message}`, { stack: midsceneError.stack });
          
          // Create fallback URLs with timestamp for uniqueness
          const timestamp = Date.now();
          const fallbackFilename = `web-fallback-${timestamp}.html`;
          
          currentNexusReportUrl = `/external-report/${fallbackFilename}`;
          const baseUrl = isProduction ? '' : (process.env.BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'));
          currentRawReportUrl = `${baseUrl}/raw-report/${fallbackFilename}`;
          
          logYaml(`[YamlProcessor] Using fallback URLs due to error:`);
          logYaml(`[YamlProcessor] - Nexus URL: ${currentNexusReportUrl}`);
          logYaml(`[YamlProcessor] - Raw URL: ${currentRawReportUrl}`);
        }
        
        // STEP 3: Generate landing report with the correct URLs
        try {
          logYaml(`[YamlProcessor] Generating landing report with URLs:`);
          logYaml(`[YamlProcessor] - Nexus URL: ${currentNexusReportUrl}`);
          logYaml(`[YamlProcessor] - Raw URL: ${currentRawReportUrl}`);
          
          // Call generateReport with the URLs we got from processing midscene report
          generatedReportDetails = await reportGeneratorModule.generateReport(
            reportPrompt, 
            reportResults, 
            finalScreenshotPath, 
            runId, 
            reportDir,
            currentNexusReportUrl,  // Use URLs from midscene report
            currentRawReportUrl
          );
          
          logYaml(`[YamlProcessor] Successfully generated landing report`);
        } catch (reportGenError) {
          logYaml(`[YamlProcessor] Error generating landing report: ${reportGenError.message}`, { stack: reportGenError.stack });
          throw reportGenError; // Critical error, rethrow
        }

        // STEP 4: Extract final report information
        const localReportPath = generatedReportDetails.reportPath; 
        const currentGeneratedReportUrl = generatedReportDetails.generatedReportUrl; 
        const currentLandingReportUrl = generatedReportDetails.landingReportUrl;
        
        // STEP 5: Update metadata with the report URLs
        // There's no yamlContext or agent.context available in the original code
        // Instead, store these URLs in the formattedResult which is what gets returned
        if (formattedResult && typeof formattedResult === 'object') {
          // Make sure the raw property exists
          if (!formattedResult.raw) formattedResult.raw = {};
          
          // Add the report URLs to the result data
          formattedResult.raw.midsceneReportUrl = currentNexusReportUrl;
          formattedResult.raw.landingReportUrl = currentLandingReportUrl;
          formattedResult.raw.rawReportUrl = currentRawReportUrl;
          
          logYaml(`[YamlProcessor] Added report URLs to formatted result`);
        }

        logYaml('Report details from reportGenerator:', { 
          reportPath: localReportPath, 
          generatedReportUrl: currentGeneratedReportUrl, 
          landingReportUrl: currentLandingReportUrl,
          nexusReportUrl: currentNexusReportUrl,
          rawNexusPath: generatedReportDetails.rawNexusPath
        });

        if (sendWebSocketUpdate) {
          sendWebSocketUpdate(userId, {
            event: 'reportGenerated',
            taskId,
            stepIndex,
            reportUrl: currentNexusReportUrl || currentLandingReportUrl, // Send most comprehensive URL
            timestamp: new Date().toISOString()
          });
        }

        if (!formattedResult) formattedResult = {};
        if (!formattedResult.aiPrepared) formattedResult.aiPrepared = {};

        formattedResult.aiPrepared.landingReportUrl = currentLandingReportUrl;
        formattedResult.aiPrepared.generatedReportUrl = currentNexusReportUrl || currentGeneratedReportUrl; 
        formattedResult.aiPrepared.nexusReportUrl = currentNexusReportUrl;
        formattedResult.aiPrepared.rawReportUrl = generatedReportDetails.rawReportUrl; 
        formattedResult.reportPath = generatedReportDetails.rawNexusPath || localReportPath;
        formattedResult.reportUrl = currentNexusReportUrl || currentLandingReportUrl;

        // Standardize URLs to be relative paths, not absolute URLs with hostname
        // Remove hostname prefix if present
        const standardizeUrl = (url) => {
          if (!url) return null;
          // If it's already a relative path starting with /, just return it
          if (url.startsWith('/')) return url;
          // If it's an absolute URL with hostname, extract the path
          if (url.startsWith('http')) {
            try {
              const urlObj = new URL(url);
              return urlObj.pathname;
            } catch (e) {
              return url;
            }
          }
          return url;
        };
        
        // Standardize all URLs to relative format
        formattedResult.reportUrl = standardizeUrl(formattedResult.reportUrl);
        formattedResult.aiPrepared.landingReportUrl = standardizeUrl(formattedResult.aiPrepared.landingReportUrl);
        formattedResult.aiPrepared.nexusReportUrl = standardizeUrl(formattedResult.aiPrepared.nexusReportUrl);
        formattedResult.aiPrepared.rawReportUrl = standardizeUrl(formattedResult.aiPrepared.rawReportUrl);
        
        // Verify that the report files actually exist
        // First verify Nexus Report URL
        if (formattedResult.aiPrepared.nexusReportUrl) {
          const nexusReportName = formattedResult.aiPrepared.nexusReportUrl.startsWith('/') ?
            formattedResult.aiPrepared.nexusReportUrl.substring(formattedResult.aiPrepared.nexusReportUrl.lastIndexOf('/') + 1) :
            formattedResult.aiPrepared.nexusReportUrl;
          
          // Check in nexus_run/report directory
          const nexusReportPath = path.join(process.cwd(), 'nexus_run', 'report', nexusReportName);
          
          if (!fs.existsSync(nexusReportPath)) {
            // If not found, check in midscene_run/report
            const midsceneReportPath = path.join(process.cwd(), 'midscene_run', 'report', nexusReportName);
            
            if (!fs.existsSync(midsceneReportPath)) {
              logYaml(`Nexus report file not found at ${nexusReportPath} or ${midsceneReportPath}`, { warn: true });
            } else {
              logYaml(`Nexus report file found at fallback location: ${midsceneReportPath}`);
            }
          } else {
            logYaml(`Verified nexus report file exists at: ${nexusReportPath}`);
          }
        }
        
        // Now verify Raw Report URL
        if (formattedResult.aiPrepared.rawReportUrl) {
          const rawReportName = formattedResult.aiPrepared.rawReportUrl.startsWith('/') ?
            formattedResult.aiPrepared.rawReportUrl.substring(formattedResult.aiPrepared.rawReportUrl.lastIndexOf('/') + 1) :
            formattedResult.aiPrepared.rawReportUrl;
          
          // Check in nexus_run/report directory
          const rawReportPath = path.join(process.cwd(), 'nexus_run', 'report', rawReportName);
          const runSpecificPath = path.join(process.cwd(), 'nexus_run', runId, 'report', rawReportName);
          
          if (!fs.existsSync(rawReportPath) && !fs.existsSync(runSpecificPath)) {
            logYaml(`Raw report file not found at ${rawReportPath} or ${runSpecificPath}`, { warn: true });
            
            // We should try to regenerate the raw report if it doesn't exist
            const regeneratedRawReportPath = path.join(process.cwd(), 'nexus_run', runId, 'report', rawReportName);
            try {
              // Create a simplified raw report from the available data
              const rawReportContent = `<!DOCTYPE html>
<html>
<head>
  <title>Raw Report - ${yamlMap.name}</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    h1 { color: #333; }
    pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>Raw YAML Execution Report</h1>
  <h2>Task Information</h2>
  <pre>${JSON.stringify({taskId, yamlMapName: yamlMap.name, timestamp: new Date().toISOString()}, null, 2)}</pre>
  <h2>Execution Result</h2>
  <pre>${JSON.stringify(executionResult, null, 2)}</pre>
  <h2>Execution Steps</h2>
  <pre>${JSON.stringify(steps, null, 2)}</pre>
</body>
</html>`;
              
              // Ensure directory exists
              if (!fs.existsSync(path.dirname(regeneratedRawReportPath))) {
                fs.mkdirSync(path.dirname(regeneratedRawReportPath), { recursive: true });
              }
              
              // Write the raw report file
              fs.writeFileSync(regeneratedRawReportPath, rawReportContent, 'utf8');
              logYaml(`Regenerated missing raw report file at: ${regeneratedRawReportPath}`);
              
              // Update the raw report URL to use this regenerated file
              formattedResult.aiPrepared.rawReportUrl = `/direct-report/${rawReportName}`;
            } catch (error) {
              logYaml(`Failed to regenerate raw report: ${error.message}`, { error: true, stack: error.stack });
            }
          } else {
            const foundPath = fs.existsSync(rawReportPath) ? rawReportPath : runSpecificPath;
            logYaml(`Verified raw report file exists at: ${foundPath}`);
          }
        }
        
        logYaml('Formatted result report URLs set:', {
          reportUrl: formattedResult.reportUrl,
          landingReportUrl: formattedResult.aiPrepared.landingReportUrl,
          nexusReportUrl: formattedResult.aiPrepared.nexusReportUrl,
          rawReportUrl: formattedResult.aiPrepared.rawReportUrl,
          reportPath: formattedResult.reportPath
        });
      }
    } catch (reportError) { // Catch for report generation errors
      logYaml(`Error during report generation phase`, { error: reportError.toString(), stack: reportError.stack });
      sendProgressUpdate(95, `Report generation error. Task completion continues.`);
      if (!formattedResult) formattedResult = {};
      if (!formattedResult.aiPrepared) formattedResult.aiPrepared = {};
      formattedResult.aiPrepared.nexusReportUrl = null;
      formattedResult.aiPrepared.rawReportUrl = null;
      formattedResult.aiPrepared.landingReportUrl = null;
      formattedResult.reportUrl = null;
      reportPath = null; generatedReportUrl = null; landingReportUrl = null; nexusReportUrl = null;
      if (sendWebSocketUpdate) {
         sendWebSocketUpdate(userId, { event: 'actionWarning', taskId, message: `Report generation failed: ${reportError.message}` });
      }
      await updateTaskInDatabase(taskId, { statusMessage: `Execution completed, report generation failed: ${reportError.message}`, reportPath: null, reportUrl: null, nexusReportUrl: null, rawReportUrl: null });
    }

    // AI Summary Generation (if openaiClient is available)
    let aiSummaryResult = null;
      try {
        sendProgressUpdate(97, 'Generating AI summary of execution...');
        logYaml('Attempting to generate AI summary...');
        aiSummaryResult = await generateAiSummary(userId, yamlLog, yamlMap, steps, executionResult);
        
        let displaySummary = "";
        const rawResultString = executionResult ? (typeof executionResult === 'string' ? executionResult : JSON.stringify(executionResult, null, 2)) : 'No raw result data available.';
        displaySummary += `Actual Execution Result:\n------------------------\n${rawResultString}\n\n`;
        displaySummary += `AI-Generated Report:\n--------------------
`;

        if (aiSummaryResult && typeof aiSummaryResult === 'object') {
            if (aiSummaryResult.primaryGoal) displaySummary += `Primary Goal: ${aiSummaryResult.primaryGoal}\n`;
            if (aiSummaryResult.finalOutcome) displaySummary += `Final Outcome: ${aiSummaryResult.finalOutcome}\n`;
            if (aiSummaryResult.processSummary) displaySummary += `Process Summary: ${aiSummaryResult.processSummary}\n`;
            // Robust handling for challengesFaced
            if (aiSummaryResult.challengesFaced) {
                if (Array.isArray(aiSummaryResult.challengesFaced) && aiSummaryResult.challengesFaced.length > 0) {
                    // Filter out empty strings or strings that are just whitespace before joining
                    const actualChallenges = aiSummaryResult.challengesFaced.filter(challenge => typeof challenge === 'string' && challenge.trim() !== "");
                    if (actualChallenges.length > 0) {
                        displaySummary += `Challenges Faced: ${actualChallenges.join(', ')}\n`;
                    }
                } else if (typeof aiSummaryResult.challengesFaced === 'string' && aiSummaryResult.challengesFaced.trim() !== "" && aiSummaryResult.challengesFaced.toLowerCase() !== "none") {
                    // If it's a meaningful single string, display it
                    displaySummary += `Challenges Faced: ${aiSummaryResult.challengesFaced.trim()}\n`;
                }
            }
            if (aiSummaryResult.overallSummary) displaySummary += `Overall Summary: ${aiSummaryResult.overallSummary}\n`;
            logYaml('AI summary successfully generated and combined with raw results.');
        } else {
            displaySummary += 'AI summary data is not available or not in the expected format.\n';
            logYaml('AI summary generation returned null or unparseable structure.');
        }
        if (!formattedResult.aiPrepared) formattedResult.aiPrepared = {}; // Ensure aiPrepared exists
        formattedResult.aiPrepared.rawResult = executionResult; 
        formattedResult.aiPrepared.aiSummaryData = aiSummaryResult; 
        formattedResult.aiPrepared.displaySummary = displaySummary; 

      } catch (aiError) {
        logYaml('Error during AI summary generation attempt', { error: aiError.toString(), stack: aiError.stack });
        const rawResultString = executionResult ? (typeof executionResult === 'string' ? executionResult : JSON.stringify(executionResult, null, 2)) : 'No raw result data available.';
        let displaySummary = `Actual Execution Result:\n------------------------\n${rawResultString}\n\nAI-Generated Report:\n--------------------
AI summary generation failed: ${aiError.message}\n`;
        if (!formattedResult.aiPrepared) formattedResult.aiPrepared = {};
        formattedResult.aiPrepared.rawResult = executionResult;
        formattedResult.aiPrepared.aiSummaryData = null;
        formattedResult.aiPrepared.displaySummary = displaySummary;
      }

    sendProgressUpdate(100, `YAML execution and post-processing finished.`);
    // Extract the actual result text to use as the primary task completion message
    let resultMessage = '';
    if (executionResult && typeof executionResult === 'object') {
      // If it's an object with numbered keys (like {0: 'weather info'}), extract the value
      if (executionResult['0']) {
        resultMessage = executionResult['0'];
      } else {
        // Try to get first property value or stringify the whole object
        const firstValue = Object.values(executionResult)[0];
        resultMessage = firstValue || JSON.stringify(executionResult);
      }
    } else if (executionResult) {
      resultMessage = executionResult.toString();
    }
    
    // Extract the actual result message from nested objects if needed
    let cleanResultMessage = '';
    if (executionResult && typeof executionResult === 'object') {
      if (executionResult['0'] && executionResult['0'].description) {
        // Extract just the description text from the nested structure
        cleanResultMessage = executionResult['0'].description;
      } else {
        // Handle other object formats - try to get meaningful data
        const firstValue = Object.values(executionResult)[0];
        if (firstValue && typeof firstValue === 'object' && firstValue.description) {
          cleanResultMessage = firstValue.description;
        } else {
          // Fallback to a nicely formatted JSON
          cleanResultMessage = JSON.stringify(executionResult, null, 2);
        }
      }
    } else if (executionResult) {
      cleanResultMessage = String(executionResult);
    } else {
      cleanResultMessage = 'No result data available';
    }
    
    // Use the clean message for display but log the full object for debugging
    logYaml(`Execution result: ${cleanResultMessage}`, { 
      result: typeof executionResult === 'object' ? 
        JSON.parse(JSON.stringify(executionResult)) : executionResult 
    });
    // This is the end of the main try block for processYamlMapTask
    // The 'return { success: true, ... }' object will be constructed using 'formattedResult'
    // which now includes 'aiPrepared.displaySummary'.

    return {
      success: true,
      error: null,
      task_id: taskId,
      status: 'completed',
      closed: browser ? false : true,
      currentUrl: yamlMapUrl,
      stepIndex: stepIndex,
      actionOutput: `Successfully executed YAML map: ${yamlMap.name}`,
      pageTitle: yamlMap.name,
      result: executionResult,
      extractedInfo: executionResult?.data || {},
      actionLog: yamlLog.slice(-50), // Limit to last 50 logs
      screenshotPath: finalScreenshotPath,
      reportPath: reportPath, // This is the directory or specific main report file path
      // Ensure URLs from formattedResult are used, falling back to null
      nexusReportUrl: formattedResult?.aiPrepared?.nexusReportUrl || null,
      rawReportUrl: formattedResult?.aiPrepared?.rawReportUrl || null,
      landingReportUrl: formattedResult?.aiPrepared?.landingReportUrl || null,
      reportUrl: formattedResult?.reportUrl || generatedReportUrl || null, // General report URL
      formattedResult: formattedResult,
      browserSession: browser ? { browser, agent, page, closed: false } : null,
      state: {
        assertion: `YAML Map ${yamlMap.name} executed successfully`,
        yamlMapId,
        yamlMapName: yamlMap.name,
        executionTime: endTime - startTime
      }
    };
  } catch (error) {
    logYaml(`Error executing YAML map`, { error: error.toString(), stack: error.stack });
    if (sendWebSocketUpdate) {
      sendWebSocketUpdate(userId, {
        event: 'stepProgress',
        taskId,
        stepIndex,
        progress: 0,
        message: `Error: ${error.message}`,
        log: yamlLog.slice(-50), // Limit logs
        error: true
      });
    }
    await updateTaskInDatabase(taskId, {
      status: 'error',
      statusMessage: `Error executing YAML map: ${error.message}`,
      error: error.message,
      progress: 0
    });
    if (sendWebSocketUpdate) {
      if (steps && steps.length > 0) {
        steps[0].status = 'error';
        steps[0].progress = 0;
      }
      sendWebSocketUpdate(userId, {
        event: 'stepProgress',
        taskId,
        stepIndex: 0,
        progress: 0,
        message: `Error: ${error.message}`,
        log: yamlLog.slice(-50), // Limit logs
        error: true,
        item: {
          type: 'error',
          title: 'YAML Map Execution Error',
          content: error.message || 'Unknown error occurred',
          timestamp: new Date().toISOString()
        }
      });
      sendWebSocketUpdate(userId, {
        event: 'taskError',
        taskId,
        error: error.message,
        log: yamlLog.slice(-50), // Limit logs
        timestamp: new Date().toISOString(),
        stack: error.stack,
        item: {
          type: 'error',
          title: 'YAML Map Execution Failed',
          content: error.message || 'Unknown error occurred',
          timestamp: new Date().toISOString()
        }
      });
    }
    const trimmedLog = yamlLog.slice(-50).map(entry => {
      const shortMsg = entry.message.length > 150
        ? entry.message.substring(0, 150) + '...'
        : entry.message;
      return { ...entry, message: shortMsg };
    });
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