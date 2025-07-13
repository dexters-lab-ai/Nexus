import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get Puppeteer launch options optimized for production (Docker) or development (localhost)
 * @returns {Promise<Object>} Puppeteer launch options
 */
async function getPuppeteerLaunchOptions() {
  const isProduction = process.env.NODE_ENV === 'production';
  const profileDir = path.join(os.tmpdir(), `puppeteer_${process.pid}_${Date.now()}`);
  let userDataDir = profileDir;

  try {
    if (fs.existsSync(profileDir)) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn(`[Puppeteer] Failed to clean profile directory ${profileDir}: ${cleanupError.message}`);
      }
    }
    fs.mkdirSync(profileDir, { recursive: true, mode: 0o755 });
    const prefsPath = path.join(profileDir, 'Default', 'Preferences');
    const prefsDir = path.dirname(prefsPath);
    if (!fs.existsSync(prefsDir)) {
      fs.mkdirSync(prefsDir, { recursive: true, mode: 0o755 });
    }
    const prefs = {
      profile: { exit_type: 'Normal', exited_cleanly: true },
      browser: { has_seen_welcome_page: true },
    };
    fs.writeFileSync(prefsPath, JSON.stringify(prefs), 'utf8');
  } catch (error) {
    console.error(`[Puppeteer] Error setting up profile directory ${profileDir}: ${error.message}`);
    userDataDir = undefined; // Fallback to in-memory profile
  }

  const launchOptions = {
    headless: isProduction ? 'new' : false,
    ignoreHTTPSErrors: true,
    ...(userDataDir && { userDataDir }),
    defaultViewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    timeout: 30000,
    dumpio: true, // Enable browser logs for debugging
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1280,720',
      '--no-first-run',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-breakpad',
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-default-apps',
      '--disable-hang-monitor',
      '--disable-ipc-flooding-protection',
      '--disable-prompt-on-repost',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--password-store=basic',
      '--use-mock-keychain',
      '--mute-audio',
      '--disable-gpu', '--disable-3d-apis', '--disable-webgl',
      '--disable-features=' + (isProduction
        ? 'AudioServiceOutOfProcess,TranslateUI,LazyFrameLoading,GlobalMediaControls,MediaRouter,NetworkService'
        : 'TranslateUI,MediaRouter,NetworkService'),
      '--disable-blink-features=AutomationControlled',
    ],
  };

  if (isProduction) {
    const possiblePaths = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      process.env.CHROME_BIN,
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome-stable',
    ].filter(Boolean);

    for (const execPath of possiblePaths) {
      if (fs.existsSync(execPath)) {
        launchOptions.executablePath = execPath;
        console.log(`[Production] Using Chromium at: ${execPath}`);
        break;
      }
    }
    if (!launchOptions.executablePath) {
      console.warn('[Production] Falling back to Puppeteer\'s bundled Chromium');
      launchOptions.executablePath = await puppeteer.executablePath();
    }

    launchOptions.pipe = true;

    if (launchOptions.executablePath && fs.existsSync(launchOptions.executablePath)) {
      try {
        await fs.promises.chmod(launchOptions.executablePath, 0o755);
        const sandboxPath = process.env.CHROME_DEVEL_SANDBOX || '/tmp/chrome-sandbox';
        if (!fs.existsSync(sandboxPath)) {
          await fs.promises.writeFile(sandboxPath, '#!/bin/sh\nexec "$@" --no-sandbox', { mode: 0o755 });
        }
        await fs.promises.chmod(sandboxPath, 0o755);
        process.env.CHROME_DEVEL_SANDBOX = sandboxPath;

        await Promise.all([
          fs.promises.mkdir('/tmp/chrome-user-data', { recursive: true }),
          fs.promises.mkdir('/tmp/chrome', { recursive: true }),
        ]);

        launchOptions.env = {
          ...process.env,
          CHROME_DEVEL_SANDBOX: sandboxPath,
          DISPLAY: ':99',
          NO_AT_BRIDGE: '1',
          DBUS_SESSION_BUS_ADDRESS: '/dev/null',
          XDG_RUNTIME_DIR: '/tmp/chrome',
        };

        const chromeProfileDir = path.join(process.cwd(), 'chrome-profile');
        if (!fs.existsSync(chromeProfileDir)) {
          fs.mkdirSync(chromeProfileDir, { recursive: true });
        }
        launchOptions.userDataDir = chromeProfileDir;
        console.log('[Production] Configured Chromium for Docker');
      } catch (err) {
        console.error('Error setting up Chrome sandbox:', err);
      }
    }
  }

  console.log('Puppeteer launch options:', {
    executablePath: launchOptions.executablePath || 'puppeteer-default',
    headless: launchOptions.headless,
    argsCount: launchOptions.args?.length || 0,
  });

  return launchOptions;
}

/**
 * Debug-specific launch options for non-headless debugging
 * @returns {Promise<Object>} Puppeteer launch options
 */
async function getDebugLaunchOptions() {
  const baseOptions = await getPuppeteerLaunchOptions();
  return {
    ...baseOptions,
    headless: false,
    defaultViewport: { width: 1280, height: 720 },
  };
}

export { getPuppeteerLaunchOptions, getDebugLaunchOptions };