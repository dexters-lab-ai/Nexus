/**
 * Shared Puppeteer Configuration
 * Centralized configuration for Puppeteer launch options
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get Puppeteer launch options with appropriate settings for the current environment
 * @returns {Promise<Object>} Puppeteer launch options
 */
async function getPuppeteerLaunchOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // In production, use a unique directory for each instance to prevent lock file conflicts
  // In development, use a fixed directory for easier debugging
  const profileDir = isProduction 
    ? path.join(os.tmpdir(), `puppeteer_${Math.random().toString(36).substring(2, 15)}`)
    : path.join(os.tmpdir(), 'puppeteer_dev_profile');
    
  // Ensure the profile directory exists and has correct permissions
  try {
    // Remove existing directory if it exists to prevent lock file conflicts
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
    
    // Create fresh directory with correct permissions
    fs.mkdirSync(profileDir, { recursive: true, mode: 0o755 });
    
    // Set up minimal preferences file to prevent first-run dialogs
    const prefsPath = path.join(profileDir, 'Default', 'Preferences');
    const prefsDir = path.dirname(prefsPath);
    
    if (!fs.existsSync(prefsDir)) {
      fs.mkdirSync(prefsDir, { recursive: true, mode: 0o755 });
    }
    
    const prefs = {
      'profile': {
        'exit_type': 'Normal',
        'exited_cleanly': true
      },
      'browser': {
        'has_seen_welcome_page': true
      }
    };
    
    fs.writeFileSync(prefsPath, JSON.stringify(prefs), 'utf8');
    
  } catch (error) {
    console.error(`[Puppeteer] Error setting up profile directory ${profileDir}:`, error.message);
    // Fall back to in-memory profile if we can't create a directory
    console.warn('[Puppeteer] Falling back to in-memory profile (no persistence)');
    launchOptions.userDataDir = undefined;
  }

  // Common launch options for all environments
  const launchOptions = {
    headless: isProduction ? 'new' : false,
    ignoreHTTPSErrors: true,
    // Only set userDataDir if we successfully created a profile directory
    ...(profileDir && { userDataDir: profileDir }),
    // Single source of truth for viewport size - 1280x720 (16:9) stays well within GPT-4o's limits
    defaultViewport: { 
      width: 1280, 
      height: 720,  // Reduced from 1024 to 720 to stay well within GPT-4o's 2000x768 limit
      deviceScaleFactor: 1 
    },
    args: [
      // Core stability flags
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      
      // Window and display settings - match viewport size
      '--window-size=1280,720',
      '--no-first-run',
      
      // Performance optimizations
      '--disable-extensions',
      '--disable-software-rasterizer',
      '--disable-accelerated-2d-canvas',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--password-store=basic',
      '--use-mock-keychain',
      '--mute-audio',
      
      // Graphics handling - simplified and consistent
      ...(isProduction ? [
        '--disable-gpu',
        '--disable-3d-apis',
        '--disable-d3d11',
        '--disable-d3d12',
        '--disable-webgl',
        '--disable-software-rasterizer'
      ] : [
        '--enable-gpu',
        '--enable-webgl',
        '--use-gl=desktop',
        '--enable-accelerated-2d-canvas',
        '--window-position=0,0'
      ]),
      
      // Feature flags - simplified and consistent
      '--disable-features=' + (isProduction 
        ? 'AudioServiceOutOfProcess,TranslateUI,Translate,ImprovedCookieControls,' +
          'LazyFrameLoading,GlobalMediaControls,MediaRouter,NetworkService,OutOfBlinkCors,' +
          'OutOfProcessPdf,OverlayScrollbar,PasswordGeneration,RendererCodeIntegrity,' +
          'SpareRendererForSitePerProcess,TopChromeTouchUi,VizDisplayCompositor,site-per-process'
        : 'TranslateUI,Translate,ImprovedCookieControls,MediaRouter,NetworkService'),
      
      // Security - more conservative settings
      '--disable-blink-features=AutomationControlled',
      // Prevent multiple instances from conflicting
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-session-crashed-bubble',
      '--disable-background-networking',
      '--disable-sync',
      // Fix for Docker container issues
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
      // Disable various background network services
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--password-store=basic',
      '--use-mock-keychain'
    ]
  };
  
  try {
    if (isProduction) {
      // In production, prioritize the path from environment variables
      const possiblePaths = [
        process.env.PUPPETEER_EXECUTABLE_PATH,   // Explicit override first
        process.env.CHROME_BIN,                  // Then Dockerfile ENV
        '/usr/bin/chromium',                     // Standard Debian/Ubuntu
        '/usr/bin/chromium-browser',             // Alternative path
        '/usr/bin/google-chrome-stable'          // Fallback to Chrome
      ].filter(Boolean);
      
      // Try each path until we find one that exists
      let foundPath = false;
      for (const execPath of possiblePaths) {
        if (!execPath) continue;
        
        try {
          if (fs.existsSync(execPath)) {
            launchOptions.executablePath = execPath;
            console.log(`[Production] Using Chromium at: ${execPath}`);
            foundPath = true;
            break;
          } else {
            console.log(`[Puppeteer] Chromium not found at: ${execPath}`);
          }
        } catch (error) {
          console.error(`[Puppeteer] Error checking path ${execPath}:`, error.message);
        }
      }
      
      if (!foundPath) {
        console.warn('[Production] No valid Chromium path found in environment variables or default locations');
        console.warn('Falling back to Puppeteer\'s bundled Chromium');
        launchOptions.executablePath = await puppeteer.executablePath();
      }
      
      // Production-specific settings
      launchOptions.dumpio = true; // Enable for debugging
      launchOptions.pipe = true;   // Use pipe instead of WebSocket
      
      // Ensure proper permissions for Chrome sandbox
      if (launchOptions.executablePath && fs.existsSync(launchOptions.executablePath)) {
        try {
          await fs.promises.chmod(launchOptions.executablePath, 0o755);
          
          // Set up Chrome sandbox wrapper
          const sandboxPath = process.env.CHROME_DEVEL_SANDBOX || '/tmp/chrome-sandbox';
          if (!fs.existsSync(sandboxPath)) {
            await fs.promises.writeFile(
              sandboxPath,
              '#!/bin/sh\nexec "$@" --no-sandbox',
              { mode: 0o755 }
            );
          }
          
          // Ensure the sandbox wrapper is executable
          await fs.promises.chmod(sandboxPath, 0o755);
          
          // Set environment variable for the sandbox
          process.env.CHROME_DEVEL_SANDBOX = sandboxPath;
          
          // Create necessary directories
          await Promise.all([
            fs.promises.mkdir('/tmp/chrome-user-data', { recursive: true }),
            fs.promises.mkdir('/tmp/chrome', { recursive: true })
          ]);
          
          // Set environment variables
          launchOptions.env = {
            ...process.env,
            CHROME_DEVEL_SANDBOX: sandboxPath,
            DISPLAY: ':99',
            NO_AT_BRIDGE: '1',
            DBUS_SESSION_BUS_ADDRESS: '/dev/null',
            XDG_RUNTIME_DIR: '/tmp/chrome'
          };
          
          // Set the user data directory to a writable location
          const userDataDir = path.join(process.cwd(), 'chrome-profile');
          if (!fs.existsSync(userDataDir)) {
            fs.mkdirSync(userDataDir, { recursive: true });
          }
          launchOptions.userDataDir = userDataDir;
          
          console.log('[Production] Configured Chromium with optimized settings for Docker');
        } catch (err) {
          console.error('Error setting up Chrome sandbox:', err);
        }
      }
    } else {
      // Development settings
      launchOptions.dumpio = true;
      launchOptions.timeout = 30000;
    }
    
    console.log('Puppeteer launch options:', {
      executablePath: launchOptions.executablePath || 'puppeteer-default',
      headless: launchOptions.headless,
      argsCount: launchOptions.args?.length || 0
    });
    
    return launchOptions;
  } catch (error) {
    console.error('Error in getPuppeteerLaunchOptions:', error);
    throw error;
  }
}

/**
 * Get debug-configured launch options with non-headless settings
 * @returns {Promise<Object>} Puppeteer launch options with debug settings
 */
async function getDebugLaunchOptions() {
  const baseOptions = await getPuppeteerLaunchOptions();
  return {
    ...baseOptions,
    headless: false, // Always non-headless for debugging
    defaultViewport: { width: 1280, height: 720 }
  };
}

export { getPuppeteerLaunchOptions, getDebugLaunchOptions };