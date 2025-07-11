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

/**
 * Check if an error is a quota/rate limit error
 * @param {Error|Object} error - The error to check
 * @returns {boolean} - True if this is a quota/rate limit error
 */
function isQuotaError(error) {
  if (!error) return false;
  
  // Check for HTTP status code 429 (Too Many Requests)
  if (error.status === 429) return true;
  
  // Check for common quota/rate limit error codes and messages
  const quotaIndicators = [
    'quota',
    'rate limit',
    'rate_limit',
    'too many requests',
    'insufficient_quota',
    'billing',
    'credit',
    'limit reached',
    '429',
    'usage limit',
    'usage_limit',
    'quota exceeded'
  ];
  
  const errorString = (error.message || '').toLowerCase() + 
                    (error.code ? ' ' + error.code.toString().toLowerCase() : '');
  
  return quotaIndicators.some(indicator => 
    errorString.includes(indicator.toLowerCase())
  );
}

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


// Custom error class for user-friendly error handling
class UserFriendlyError extends Error {
  constructor(code, message, originalError = null) {
    super(message);
    this.code = code;
    this.originalError = originalError;
  }

  toString() {
    return this.message;
  }

  toLog() {
    return this.originalError
      ? `${this.message}: ${this.originalError.message}\n${this.originalError.stack}`
      : this.message;
  }
}

// Helper function to map errors to user-friendly versions
function mapErrorToUserFriendly(error) {
  if (error.message.includes('429') || error.message.includes('quota exceeded') || error.code === 'QUOTA_EXCEEDED') {
    return new UserFriendlyError(
      'QUOTA_EXCEEDED',
      'API Quota Exceeded: You have exceeded your API quota. Please check your plan and billing details.',
      error
    );
  } else if (error.message.includes('Target closed') || error.message.includes('Protocol error') || error.message.includes('frame was detached')) {
    return new UserFriendlyError(
      'NAVIGATION_ERROR',
      'Navigation Error: There was an issue navigating to the specified URL. Please try again.',
      error
    );
  } else if (error.message.includes('YAML map not found')) {
    return new UserFriendlyError(
      'YAML_MAP_NOT_FOUND',
      'The specified YAML map does not exist.',
      error
    );
  } else if (error.message.includes('Failed to initialize browser')) {
    return new UserFriendlyError(
      'BROWSER_INIT_ERROR',
      'Failed to initialize the browser. Please try again later.',
      error
    );
  } else if (error.message.includes('Invalid or missing')) {
    return new UserFriendlyError(
      'INVALID_INPUT',
      'Invalid or missing parameters provided.',
      error
    );
  } else if (error.message.includes('Invalid URL')) {
    return new UserFriendlyError(
      'INVALID_URL',
      'Invalid URL protocol. Only HTTP and HTTPS are supported.',
      error
    );
  } else if (error.message.includes('No execution result')) {
    return new UserFriendlyError(
      'EXECUTION_ERROR',
      'No execution result returned from YAML processor.',
      error
    );
  } else if (error.message.includes('Invalid or missing YAML content')) {
    return new UserFriendlyError(
      'INVALID_YAML',
      'Invalid or missing YAML content.',
      error
    );
  } else {
    return new UserFriendlyError(
      'UNKNOWN_ERROR',
      'An unexpected error occurred. Please try again later.',
      error
    );
  }
}

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

  // Validate runDir
  if (!runDir || typeof runDir !== 'string') {
    throw new UserFriendlyError('INVALID_INPUT', 'Invalid or missing runDir parameter');
  }

  // Initialize variables
  let yamlMap = null;
  let yamlMapUrl = 'N/A';
  const isProduction = process.env.NODE_ENV === 'production';
  const baseUrl = isProduction
    ? ''
    : process.env.BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const reportDir = path.resolve(runDir, 'report');
  let reportPath = null;
  let nexusReportUrl = null;
  let landingReportUrl = null;
  let generatedReportUrl = null;
  let screenshotUrl = null;
  let finalScreenshotPath = null;
  let rawExtractedText = '';
  let formattedResult = null;
  const yamlLog = [];
  const stepIndex = 0;
  let currentProgress = 0;
  let isTaskCompleted = false;
  let browser = null;
  let tempDir = null;
  let cleanupBrowser = null;

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
        log: yamlLog.slice(-50),
        item: {
          type: 'progress',
          title: `YAML Map: ${yamlMap ? yamlMap.name : 'Unknown Map'} (${progressPercent}%)`,
          content: progressMessage || 'Processing YAML map',
          progress: progressPercent,
          timestamp: new Date().toISOString()
        }
      });
    }
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

    // Fetch YAML map
    yamlMap = await YamlMap.findById(yamlMapId);
    if (!yamlMap) {
      throw new UserFriendlyError('YAML_MAP_NOT_FOUND', 'The specified YAML map does not exist.');
    }
    logYaml(`YAML map found: ${yamlMap.name}`, {
      yamlMapName: yamlMap.name,
      description: yamlMap.description || 'No description',
      tags: yamlMap.tags || []
    });
    yamlMapUrl = yamlMap.url || url || 'N/A';

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

    // Initialize Puppeteer
    let page, agent;
    try {
      console.log(`[ProcessYamlTask] Initializing browser for task ${taskId}`);
      const launchOptions = await getYamlPuppeteerOptions();
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
      process.env.CHROME_DEVEL_SANDBOX = '/tmp/chrome-sandbox';
      process.env.DISPLAY = ':99';
      tempDir = path.join(os.tmpdir(), `puppeteer-profile-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`);
      fs.mkdirSync(tempDir, { recursive: true });
      launchOptions.userDataDir = tempDir;
      launchOptions.args.push(`--user-data-dir=${tempDir}`);

      console.log(`[ProcessYamlTask] Launching browser with options:`, {
        ...launchOptions,
        env: Object.keys(launchOptions.env || {}).reduce((acc, key) => ({
          ...acc,
          [key]: key.includes('KEY') || key.includes('SECRET') || key.includes('TOKEN') ? '***REDACTED***' : launchOptions.env[key]
        }), {})
      });

      browser = await puppeteer.launch(launchOptions);

      cleanupBrowser = async (error = null) => {
        console.log('[ProcessYamlTask] Cleaning up browser resources...');
        const errors = [];
        try {
          if (browser) {
            const pages = await browser.pages();
            await Promise.all(pages.map(p => p.close().catch(e => {
              console.error('Error closing page:', e);
              errors.push(e);
            })));
            await browser.close().catch(e => {
              console.error('Error closing browser:', e);
              errors.push(e);
            });
          }
          if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
          }
          process.removeAllListeners('SIGTERM');
          process.removeAllListeners('SIGINT');
          process.removeAllListeners('SIGHUP');
          process.removeAllListeners('uncaughtException');
          process.removeAllListeners('unhandledRejection');
          if (error && !error.handled) {
            error.handled = true;
            throw error;
          }
          return errors.length > 0 ? errors : null;
        } catch (e) {
          console.error('Unexpected error during cleanup:', e);
          throw e;
        }
      };

      process.on('SIGTERM', () => cleanupBrowser().catch(console.error));
      process.on('SIGINT', () => cleanupBrowser().catch(console.error));
      process.on('SIGHUP', () => cleanupBrowser().catch(console.error));
      process.on('uncaughtException', (err) => {
        console.error('[ProcessYamlTask] Uncaught exception:', err);
        err.handled = true;
        cleanupBrowser(err).catch(console.error);
      });
      process.on('unhandledRejection', (reason) => {
        console.error('[ProcessYamlTask] Unhandled rejection:', reason);
        const err = reason instanceof Error ? reason : new Error(String(reason));
        err.handled = true;
        cleanupBrowser(err).catch(console.error);
      });

      page = await browser.newPage();
      await page.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
      page.on('error', error => console.error('[ProcessYamlTask] Page error:', error));
      page.on('dialog', async dialog => {
        console.log(`[ProcessYamlTask] Dialog ${dialog.type()}: ${dialog.message()}`);
        await dialog.dismiss().catch(() => {});
      });

      const pages = new Set([page]);
      browser.on('targetcreated', async target => {
        try {
          const newPage = await target.page();
          if (newPage && !pages.has(newPage)) {
            console.log('[ProcessYamlTask] New page/tab opened');
            pages.add(newPage);
            newPage.on('error', error => console.error('[ProcessYamlTask] Page error in new tab:', error));
            await newPage.setViewport({ width: 1024, height: 768, deviceScaleFactor: 1 });
            newPage.on('close', () => {
              pages.delete(newPage);
              console.log('[ProcessYamlTask] Page closed');
            });
          }
        } catch (error) {
          console.error('[ProcessYamlTask] Error handling new page:', error);
        }
      });
      browser.pages = pages;

      console.log(`[ProcessYamlTask] Browser initialized for task ${taskId}`);
      await updateTaskInDatabase(taskId, { progress: 40 });

      agent = new PuppeteerAgent(page);
      console.log(`[ProcessYamlTask] Agent initialized for task ${taskId}`);
    } catch (initError) {
      throw mapErrorToUserFriendly(initError);
    }

    // Navigate to URL
    if (yamlMapUrl !== 'N/A') {
      try {
        const urlObj = new URL(yamlMapUrl);
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
          throw new UserFriendlyError('INVALID_URL', 'Invalid URL protocol. Only HTTP and HTTPS are supported.');
        }
        console.log(`[ProcessYamlTask] Navigating to URL: ${yamlMapUrl}`);
        await page.goto(yamlMapUrl);
        rawExtractedText = await page.evaluate(() => document.body.innerText).catch(err => {
          logYaml(`Error extracting page text`, { error: err.toString() });
          return '';
        });
        rawExtractedText = rawExtractedText.substring(0, 3000);
      } catch (urlError) {
        throw mapErrorToUserFriendly(urlError);
      }
    } else {
      console.log(`[ProcessYamlTask] No URL provided - skipping navigation`);
    }

    // Validate YAML content
    if (!yamlMap.yaml || typeof yamlMap.yaml !== 'string') {
      throw new UserFriendlyError('INVALID_YAML', 'Invalid or missing YAML content.');
    }

    // Execute YAML
    const yamlContent = yamlMap.yaml;
    const taskMatches = yamlContent.match(/name:/g);
    const totalTasks = taskMatches ? taskMatches.length : 0;
    let lastProgressUpdate = 40;
    let stepCount = 0;

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

    let agentRunOutput, executionResult;
    try {
      console.log(`[ProcessYamlTask] Starting YAML execution for task ${taskId}`);
      const maxRetries = 3;
      let lastError;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          agentRunOutput = await agent.runYaml(yamlMap.yaml, {
            progressCallback,
            enableLogging: true,
            waitUntil: 'networkidle2',
            timeout: 30000
          });
          break;
        } catch (retryError) {
          lastError = retryError;
          console.error(`[ProcessYamlTask] Attempt ${attempt} failed:`, retryError);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            console.log(`[ProcessYamlTask] Retrying (${attempt + 1}/${maxRetries})...`);
          }
        }
      }
      if (!agentRunOutput && lastError) {
        throw mapErrorToUserFriendly(lastError);
      }
      executionResult = agentRunOutput?.result;
      if (!executionResult) {
        throw new UserFriendlyError('EXECUTION_ERROR', 'No execution result returned from YAML processor.');
      }
      console.log(`[ProcessYamlTask] YAML execution completed for task ${taskId}`);
    } catch (executionError) {
      throw mapErrorToUserFriendly(executionError);
    }

    const endTime = Date.now();

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

    // Capture screenshot
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
      logYaml(`Error capturing screenshot: ${screenshotError.message}`);
      finalScreenshotPath = null;
    }

    // Generate AI summary
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
      logYaml(`Error generating AI summary: ${summaryError.message}`);
      aiSummary = { summary: `Successfully executed YAML map: ${yamlMap.name}` };
    }

    // Initialize formattedResult
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
        yamlMapId,
        yamlMapName: yamlMap?.name || 'Unknown Map',
        executionTime: endTime - startTime,
        executionResult
      },
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
      steps: steps.slice(0, 50),
      aiPrepared: {
        summary: aiSummary?.summary || `Successfully executed YAML map: ${yamlMap?.name || 'Unknown Map'}`
      }
    };

    // Generate report
    try {
      sendProgressUpdate(90, `Generating execution report`);
      logYaml(`Using report directory: ${reportDir}`);

      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
        logYaml(`Created report directory: ${reportDir}`);
      }

      const reportGeneratorModule = await import('./reportGenerator.js').catch(async (importError) => {
        logYaml(`Error importing reportGenerator: ${importError.message}`);
        const reportGeneratorPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './reportGenerator.js');
        return await import(reportGeneratorPath).catch((fallbackError) => {
          logYaml(`Fallback import for reportGenerator failed: ${fallbackError.message}`);
          return null;
        });
      });

      if (reportGeneratorModule && typeof reportGeneratorModule.generateReport === 'function') {
        const reportPrompt = `YAML Map Execution: ${yamlMap?.name || 'Unknown YAML Map'}`;
        const reportResults = [{
          summary: formattedResult?.aiPrepared?.overallSummary || `Execution of ${yamlMap?.name || 'map'} completed.`,
          result: executionResult,
          metadata: { yamlMapId, yamlMapName: yamlMap?.name }
        }];

        let midsceneReportPath = null;
        let currentNexusReportUrl = null;
        let currentRawReportUrl = null;
        let generatedReportDetails = null;

        try {
          const { editMidsceneReport } = await import('./midsceneReportEditor.js');
          if (agent && agent.reportFile && fs.existsSync(agent.reportFile)) {
            midsceneReportPath = await editMidsceneReport(agent.reportFile);
            logYaml(`[YamlProcessor] Successfully edited midscene report: ${midsceneReportPath}`);
            const reportFilename = path.basename(midsceneReportPath);
            currentNexusReportUrl = `/external-report/${reportFilename}`;
            currentRawReportUrl = `${baseUrl}/raw-report/${reportFilename}`;
            logYaml(`[YamlProcessor] Created consistent report URLs:`, {
              nexusUrl: currentNexusReportUrl,
              rawUrl: currentRawReportUrl
            });
          } else {
            throw new Error('No midscene report available from agent');
          }
        } catch (midsceneError) {
          logYaml(`[YamlProcessor] No midscene report found: ${midsceneError.message}`);
          const timestamp = Date.now();
          const fallbackFilename = `web-fallback-${timestamp}.html`;
          currentNexusReportUrl = `/external-report/${fallbackFilename}`;
          currentRawReportUrl = `${baseUrl}/raw-report/${fallbackFilename}`;
          logYaml(`[YamlProcessor] Using fallback URLs:`, {
            nexusUrl: currentNexusReportUrl,
            rawUrl: currentRawReportUrl
          });
        }

        try {
          generatedReportDetails = await reportGeneratorModule.generateReport(
            reportPrompt,
            reportResults,
            finalScreenshotPath,
            runId,
            reportDir,
            currentNexusReportUrl,
            currentRawReportUrl
          );
          logYaml(`[YamlProcessor] Successfully generated landing report`);
        } catch (reportGenError) {
          logYaml(`[YamlProcessor] Error generating landing report: ${reportGenError.message}`);
          throw reportGenError;
        }

        const localReportPath = generatedReportDetails.reportPath;
        const currentGeneratedReportUrl = generatedReportDetails.generatedReportUrl;
        const currentLandingReportUrl = generatedReportDetails.landingReportUrl;

        if (!formattedResult.raw) formattedResult.raw = {};
        formattedResult.raw.midsceneReportUrl = currentNexusReportUrl;
        formattedResult.raw.landingReportUrl = currentLandingReportUrl;
        formattedResult.raw.rawReportUrl = currentRawReportUrl;

        formattedResult.aiPrepared.landingReportUrl = currentLandingReportUrl;
        formattedResult.aiPrepared.generatedReportUrl = currentNexusReportUrl || currentGeneratedReportUrl;
        formattedResult.aiPrepared.nexusReportUrl = currentNexusReportUrl;
        formattedResult.aiPrepared.rawReportUrl = generatedReportDetails.rawReportUrl;
        formattedResult.reportPath = generatedReportDetails.rawNexusPath || localReportPath;
        formattedResult.reportUrl = currentNexusReportUrl || currentLandingReportUrl;

        const standardizeUrl = (url) => {
          if (!url) return null;
          if (url.startsWith('/')) return url;
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

        formattedResult.reportUrl = standardizeUrl(formattedResult.reportUrl);
        formattedResult.aiPrepared.landingReportUrl = standardizeUrl(formattedResult.aiPrepared.landingReportUrl);
        formattedResult.aiPrepared.nexusReportUrl = standardizeUrl(formattedResult.aiPrepared.nexusReportUrl);
        formattedResult.aiPrepared.rawReportUrl = standardizeUrl(formattedResult.aiPrepared.rawReportUrl);

        if (formattedResult.aiPrepared.nexusReportUrl) {
          const nexusReportName = formattedResult.aiPrepared.nexusReportUrl.startsWith('/')
            ? formattedResult.aiPrepared.nexusReportUrl.substring(formattedResult.aiPrepared.nexusReportUrl.lastIndexOf('/') + 1)
            : formattedResult.aiPrepared.nexusReportUrl;
          const nexusReportPath = path.join(process.cwd(), 'nexus_run', 'report', nexusReportName);
          const midsceneReportPath = path.join(process.cwd(), 'midscene_run', 'report', nexusReportName);
          if (!fs.existsSync(nexusReportPath) && !fs.existsSync(midsceneReportPath)) {
            logYaml(`Nexus report file not found at ${nexusReportPath} or ${midsceneReportPath}`, { warn: true });
          } else {
            logYaml(`Verified nexus report file exists at: ${fs.existsSync(nexusReportPath) ? nexusReportPath : midsceneReportPath}`);
          }
        }

        if (formattedResult.aiPrepared.rawReportUrl) {
          const rawReportName = formattedResult.aiPrepared.rawReportUrl.startsWith('/')
            ? formattedResult.aiPrepared.rawReportUrl.substring(formattedResult.aiPrepared.rawReportUrl.lastIndexOf('/') + 1)
            : formattedResult.aiPrepared.rawReportUrl;
          const rawReportPath = path.join(process.cwd(), 'nexus_run', 'report', rawReportName);
          const runSpecificPath = path.join(process.cwd(), 'nexus_run', runId, 'report', rawReportName);
          if (!fs.existsSync(rawReportPath) && !fs.existsSync(runSpecificPath)) {
            logYaml(`Raw report file not found at ${rawReportPath} or ${runSpecificPath}`, { warn: true });
            const regeneratedRawReportPath = path.join(process.cwd(), 'nexus_run', runId, 'report', rawReportName);
            try {
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
              if (!fs.existsSync(path.dirname(regeneratedRawReportPath))) {
                fs.mkdirSync(path.dirname(regeneratedRawReportPath), { recursive: true });
              }
              fs.writeFileSync(regeneratedRawReportPath, rawReportContent, 'utf8');
              logYaml(`Regenerated missing raw report file at: ${regeneratedRawReportPath}`);
              formattedResult.aiPrepared.rawReportUrl = `/direct-report/${rawReportName}`;
            } catch (error) {
              logYaml(`Failed to regenerate raw report: ${error.message}`);
            }
          } else {
            logYaml(`Verified raw report file exists at: ${fs.existsSync(rawReportPath) ? rawReportPath : runSpecificPath}`);
          }
        }

        logYaml('Formatted result report URLs set:', {
          reportUrl: formattedResult.reportUrl,
          landingReportUrl: formattedResult.aiPrepared.landingReportUrl,
          nexusReportUrl: formattedResult.aiPrepared.nexusReportUrl,
          rawReportUrl: formattedResult.aiPrepared.rawReportUrl,
          reportPath: formattedResult.reportPath
        });

        if (sendWebSocketUpdate) {
          sendWebSocketUpdate(userId, {
            event: 'reportGenerated',
            taskId,
            stepIndex,
            reportUrl: currentNexusReportUrl || currentLandingReportUrl,
            timestamp: new Date().toISOString()
          });
        }
      }
    } catch (reportError) {
      logYaml(`Error during report generation: ${reportError.message}`);
      sendProgressUpdate(95, `Report generation error. Task completion continues.`);
      formattedResult.aiPrepared.nexusReportUrl = null;
      formattedResult.aiPrepared.rawReportUrl = null;
      formattedResult.aiPrepared.landingReportUrl = null;
      formattedResult.reportUrl = null;
      reportPath = null;
      generatedReportUrl = null;
      landingReportUrl = null;
      nexusReportUrl = null;
      if (sendWebSocketUpdate) {
        sendWebSocketUpdate(userId, {
          event: 'actionWarning',
          taskId,
          message: `Report generation failed: ${reportError.message}`
        });
      }
      await updateTaskInDatabase(taskId, {
        statusMessage: `Execution completed, report generation failed: ${reportError.message}`,
        reportPath: null,
        reportUrl: null,
        nexusReportUrl: null,
        rawReportUrl: null
      });
    }

    // Generate AI summary for display
    let aiSummaryResult = null;
    try {
      sendProgressUpdate(97, 'Generating AI summary of execution...');
      logYaml('Attempting to generate AI summary...');
      aiSummaryResult = await generateAiSummary(userId, yamlLog, yamlMap, steps, executionResult);
      let displaySummary = '';
      const rawResultString = executionResult
        ? (typeof executionResult === 'string' ? executionResult : JSON.stringify(executionResult, null, 2))
        : 'No raw result data available.';
      displaySummary += `Actual Execution Result:\n------------------------\n${rawResultString}\n\n`;
      displaySummary += `AI-Generated Report:\n--------------------\n`;
      if (aiSummaryResult && typeof aiSummaryResult === 'object') {
        if (aiSummaryResult.primaryGoal) displaySummary += `Primary Goal: ${aiSummaryResult.primaryGoal}\n`;
        if (aiSummaryResult.finalOutcome) displaySummary += `Final Outcome: ${aiSummaryResult.finalOutcome}\n`;
        if (aiSummaryResult.processSummary) displaySummary += `Process Summary: ${aiSummaryResult.processSummary}\n`;
        if (aiSummaryResult.challengesFaced) {
          if (Array.isArray(aiSummaryResult.challengesFaced) && aiSummaryResult.challengesFaced.length > 0) {
            const actualChallenges = aiSummaryResult.challengesFaced.filter(challenge => typeof challenge === 'string' && challenge.trim() !== '');
            if (actualChallenges.length > 0) {
              displaySummary += `Challenges Faced: ${actualChallenges.join(', ')}\n`;
            }
          } else if (typeof aiSummaryResult.challengesFaced === 'string' && aiSummaryResult.challengesFaced.trim() !== '' && aiSummaryResult.challengesFaced.toLowerCase() !== 'none') {
            displaySummary += `Challenges Faced: ${aiSummaryResult.challengesFaced.trim()}\n`;
          }
        }
        if (aiSummaryResult.overallSummary) displaySummary += `Overall Summary: ${aiSummaryResult.overallSummary}\n`;
        logYaml('AI summary successfully generated and combined with raw results.');
      } else {
        displaySummary += 'AI summary data is not available or not in the expected format.\n';
        logYaml('AI summary generation returned null or unparseable structure.');
      }
      formattedResult.aiPrepared.rawResult = executionResult;
      formattedResult.aiPrepared.aiSummaryData = aiSummaryResult;
      formattedResult.aiPrepared.displaySummary = displaySummary;
    } catch (aiError) {
      logYaml(`Error during AI summary generation: ${aiError.message}`);
      const rawResultString = executionResult
        ? (typeof executionResult === 'string' ? executionResult : JSON.stringify(executionResult, null, 2))
        : 'No raw result data available.';
      formattedResult.aiPrepared.rawResult = executionResult;
      formattedResult.aiPrepared.aiSummaryData = null;
      formattedResult.aiPrepared.displaySummary = `Actual Execution Result:\n------------------------\n${rawResultString}\n\nAI-Generated Report:\n--------------------\nAI summary generation failed: ${aiError.message}\n`;
    }

    sendProgressUpdate(100, `YAML execution and post-processing finished.`);

    let resultMessage = '';
    if (executionResult && typeof executionResult === 'object') {
      if (executionResult['0']) {
        resultMessage = executionResult['0'];
      } else {
        const firstValue = Object.values(executionResult)[0];
        resultMessage = firstValue || JSON.stringify(executionResult);
      }
    } else if (executionResult) {
      resultMessage = executionResult.toString();
    }

    let cleanResultMessage = '';
    if (executionResult && typeof executionResult === 'object') {
      if (executionResult['0'] && executionResult['0'].description) {
        cleanResultMessage = executionResult['0'].description;
      } else {
        const firstValue = Object.values(executionResult)[0];
        cleanResultMessage = firstValue && typeof firstValue === 'object' && firstValue.description
          ? firstValue.description
          : JSON.stringify(executionResult, null, 2);
      }
    } else if (executionResult) {
      cleanResultMessage = String(executionResult);
    } else {
      cleanResultMessage = 'No result data available';
    }

    logYaml(`Execution result: ${cleanResultMessage}`, {
      result: typeof executionResult === 'object' ? JSON.parse(JSON.stringify(executionResult)) : executionResult
    });

    return {
      success: true,
      error: null,
      task_id: taskId,
      status: 'completed',
      closed: browser ? false : true,
      currentUrl: yamlMapUrl,
      stepIndex,
      actionOutput: `Successfully executed YAML map: ${yamlMap.name}`,
      pageTitle: yamlMap.name,
      result: executionResult,
      extractedInfo: executionResult?.data || {},
      actionLog: yamlLog.slice(-50),
      screenshotPath: finalScreenshotPath,
      reportPath,
      nexusReportUrl: formattedResult?.aiPrepared?.nexusReportUrl || null,
      rawReportUrl: formattedResult?.aiPrepared?.rawReportUrl || null,
      landingReportUrl: formattedResult?.aiPrepared?.landingReportUrl || null,
      reportUrl: formattedResult?.reportUrl || generatedReportUrl || null,
      formattedResult,
      browserSession: browser ? { browser, agent, page, closed: false } : null,
      state: {
        assertion: `YAML Map ${yamlMap.name} executed successfully`,
        yamlMapId,
        yamlMapName: yamlMap.name,
        executionTime: endTime - startTime
      }
    };
  } catch (error) {
    const userError = mapErrorToUserFriendly(error);

    // Log detailed error for developers
    console.error(`[ProcessYamlTask] Error: ${userError.toLog()}`);
    logYaml(`Error executing YAML map: ${userError.message}`, {
      error: userError.toString(),
      errorCode: userError.code,
      timestamp: new Date().toISOString()
    });

    // Update task status
    await updateTaskInDatabase(taskId, {
      status: 'error',
      statusMessage: userError.message,
      error: userError.message,
      progress: 0,
      errorCode: userError.code,
      ...(userError.code === 'QUOTA_EXCEEDED' && {
        errorType: 'quota_exceeded',
        errorDetails: {
          code: userError.code,
          message: userError.message,
          timestamp: new Date().toISOString()
        }
      })
    });

    // Send WebSocket updates
    if (sendWebSocketUpdate) {
      sendWebSocketUpdate(userId, {
        event: 'stepProgress',
        taskId,
        stepIndex,
        progress: 0,
        message: userError.message,
        log: yamlLog.slice(-50),
        error: true
      });

      if (steps && steps.length > 0) {
        steps[0].status = 'error';
        steps[0].progress = 0;
      }

      const eventType = userError.code === 'QUOTA_EXCEEDED' ? 'quotaExceeded' : 'taskError';
      sendWebSocketUpdate(userId, {
        event: eventType,
        taskId,
        message: userError.message,
        error: userError.message,
        timestamp: new Date().toISOString(),
        ...(userError.code === 'QUOTA_EXCEEDED' && {
          errorType: 'quota_exceeded',
          errorCode: userError.code,
          retryable: false,
          helpUrl: '/settings/billing',
          action: 'upgrade_plan'
        })
      });

      if (userError.code === 'QUOTA_EXCEEDED') {
        sendWebSocketUpdate(userId, {
          event: 'notification',
          type: 'error',
          title: 'API Quota Exceeded',
          message: 'You have exceeded your API quota. Please check your plan.',
          action: {
            label: 'Upgrade Plan',
            url: '/settings/billing'
          },
          timestamp: new Date().toISOString()
        });
      }
    }

    // Prepare error response
    const errorResponse = {
      success: false,
      error: userError.message,
      task_id: taskId,
      status: 'error',
      currentUrl: yamlMapUrl || 'N/A',
      stepIndex,
      actionLog: yamlLog.slice(-50).map(entry => ({
        ...entry,
        message: entry.message && entry.message.length > 150 ? entry.message.substring(0, 150) + '...' : entry.message || 'No message'
      }))
    };

    // Include stack trace only in development mode
    if (!isProduction && userError.originalError) {
      errorResponse.stack = userError.originalError.stack;
    }

    return errorResponse;
  } finally {
    if (cleanupBrowser) {
      await cleanupBrowser().catch(err => console.error('[ProcessYamlTask] Cleanup error:', err));
    }
  }
}