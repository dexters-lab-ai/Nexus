/**
 * Shared Puppeteer Configuration
 * Centralized configuration for Puppeteer launch options
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get Puppeteer launch options with appropriate settings for the current environment
 * @returns {Promise<Object>} Puppeteer launch options
 */
async function getPuppeteerLaunchOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Common launch options for all environments
  const launchOptions = {
    headless: isProduction ? 'new' : false,
    ignoreHTTPSErrors: true,
    defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      
      // Performance optimizations
      '--disable-extensions',
      '--window-size=1280,720',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      
      // Disable unnecessary features
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      
      // Suppress V8 Proxy resolver warnings
      '--disable-features=V8VmFuture',
      '--no-proxy-server',
      '--proxy-bypass-list=*',
      '--disable-extensions',
      '--disable-component-extensions-with-background-pages',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--disable-default-apps',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
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
      '--disable-translate',
      '--metrics-recording-only',
      '--no-first-run',
      '--safebrowsing-disable-auto-update',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disable-blink-features=AutomationControlled',
      '--disable-popup-blocking',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--password-store=basic',
      '--use-mock-keychain',
      '--mute-audio',
      '--safebrowsing-disable-auto-update',
      '--single-process',
      '--disable-webgl',
      '--disable-threaded-animation',
      '--disable-threaded-scrolling',
      '--disable-in-process-stack-traces',
      '--disable-logging',
      '--output=/dev/null',
      '--disable-3d-apis',
      '--disable-d3d11',
      '--disable-d3d12',
      '--disable-direct-composition',
      '--disable-direct-dwrite',
      
      // Security
      '--disable-features=AudioServiceOutOfProcess,TranslateUI,Translate,ImprovedCookieControls,' +
      'LazyFrameLoading,GlobalMediaControls,MediaRouter,NetworkService,OutOfBlinkCors,' +
      'OutOfProcessPdf,OverlayScrollbar,PasswordGeneration,RendererCodeIntegrity,' +
      'SpareRendererForSitePerProcess,TopChromeTouchUi,VizDisplayCompositor,IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--disable-blink-features=AutomationControlled',
      
      // Window settings
      '--window-position=0,0',
      '--start-maximized',
      '--hide-scrollbars'
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
