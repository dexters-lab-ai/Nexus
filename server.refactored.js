// ======================================
// 1. CORE IMPORTS
// ======================================
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { WebSocketServer } from 'ws';
import winston from 'winston';
import pRetry from 'p-retry';
import { v4 as uuidv4 } from 'uuid';
import { Semaphore } from 'async-mutex';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import OpenAI from 'openai';
import { AbortError } from 'p-retry';

// ======================================
// 2. MODEL IMPORTS
// ======================================
import User from './src/models/User.js';
import Message from './src/models/Message.js';
import Task from './src/models/Task.js';
import ChatHistory from './src/models/ChatHistory.js';
import Billing from './src/models/Billing.js';

// ======================================
// 3. UTILS & REPORT GENERATORS
// ======================================
import { stripLargeFields } from './src/utils/stripLargeFields.js';
import { generateReport } from './src/utils/reportGenerator.js';
import { editMidsceneReport } from './src/utils/midsceneReportEditor.js';
import reportHandlers from './src/utils/reportFileFixer.js';
import executionHelper from './src/utils/execution-helper.js';
const { determineExecutionMode } = executionHelper;

// ======================================
// 4. CONFIGURATION & ENVIRONMENT
// ======================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of environment variables that should be available to the client
const clientEnvVars = [
  'API_URL',
  'FRONTEND_URL'
];

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production'
  ? path.resolve(__dirname, '.env.production')
  : path.resolve(__dirname, '.env.development');

console.log('Loading environment from:', envFile);
console.log('File exists:', fs.existsSync(envFile));

// Load the environment file
const result = dotenv.config({ path: envFile });

// Ensure VITE_ prefixed variables are set for the client
clientEnvVars.forEach(key => {
  // If VITE_ prefixed version exists, use it
  if (process.env[`VITE_${key}`]) {
    // If non-prefixed version doesn't exist, create it for server-side use
    if (!process.env[key]) {
      process.env[key] = process.env[`VITE_${key}`];
    }
  } 
  // If non-prefixed version exists, ensure VITE_ prefixed version is set for client
  else if (process.env[key]) {
    process.env[`VITE_${key}`] = process.env[key];
  }
});

// Log all relevant environment variables for debugging
const relevantVars = {};
Object.entries(process.env).forEach(([key, value]) => {
  if (key.includes('VITE_') || key.includes('API_') || key.includes('WS_') || key.includes('FRONTEND_')) {
    relevantVars[key] = value;
  }
});
console.log('Environment variables loaded:', relevantVars);

if (result.error) {
  console.error('Error loading .env file:', result.error);
  process.exit(1);
}

// Import environment configuration
import config from './src/config/env.js';

// Global unhandled promise rejection handler for Puppeteer errors
process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message && reason.message.includes('Request is already handled')) {
    logger.debug('[Puppeteer] Ignoring known issue: Request is already handled');
  } else {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  }
});

// ======================================
// 5. CONSTANTS & GLOBALS
// ======================================
const PORT = config.port;
const NODE_ENV = config.nodeEnv;
const MAX_CONCURRENT_BROWSERS = 5;
const OPENAI_API_KAIL = process.env.OPENAI_API_KAIL;

// Track active browser sessions (singleton instance)
// Engine configuration
const ENGINE_KEY_MAPPING = {
  'gpt-4o': 'openai',
  'qwen-2.5-vl-72b': 'qwen',
  'gemini-2.5-pro': 'google',
  'ui-tars': 'uitars'
};

const KEY_ENGINE_MAPPING = Object.entries(ENGINE_KEY_MAPPING).reduce((acc, [engine, keyType]) => {
  acc[keyType] = engine;
  return acc;
}, {});

// ======================================
// 6. LOGGER SETUP
// ======================================
// Ensure run/report directories exist
const NEXUS_RUN_DIR = path.join(__dirname, 'nexus_run');
fs.mkdirSync(NEXUS_RUN_DIR, { recursive: true });
const REPORT_DIR = path.join(NEXUS_RUN_DIR, 'report');
fs.mkdirSync(REPORT_DIR, { recursive: true });
const LOG_DIR = path.join(NEXUS_RUN_DIR, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const ARTIFACTS_DIR = path.join(NEXUS_RUN_DIR, 'artifacts');
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

// Export paths for use elsewhere in the application
global.NEXUS_PATHS = {
  RUN_DIR: NEXUS_RUN_DIR,
  REPORT_DIR: REPORT_DIR,
  LOG_DIR: LOG_DIR,
  ARTIFACTS_DIR: ARTIFACTS_DIR
};

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(LOG_DIR, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(LOG_DIR, 'combined.log') })
  ]
});

if (NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

logger.info(`Nexus run directory structure prepared at ${NEXUS_RUN_DIR}`);

/**
 * Helper function to conditionally log debug messages.
 */
function debugLog(msg, data = null) {
  if (NODE_ENV !== 'production') {
    if (data) {
      logger.debug(msg, data);
    } else {
      logger.debug(msg);
    }
  }
}

// ======================================
// 7. DATABASE CONNECTION & UTILITIES
// ======================================
mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB with retry logic and proper error handling
 * @returns {Promise<boolean>} True if connection was successful
 */
async function connectToDatabase() {
  const startTime = Date.now();
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    console.log(`Connected to MongoDB in ${Date.now() - startTime}ms`);
    return true; // Successfully connected
  } catch (err) {
    console.error('Mongoose connection error:', err);
    
    // Check if connection has gone away or if it's a network issue
    const isTemporaryError = 
      err.name === 'MongoNetworkError' || 
      err.message.includes('topology was destroyed') || 
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('timed out');
    
    if (!isTemporaryError) {
      // If it's a permanent error (like auth failure), abort retries
      throw new AbortError(`MongoDB permanent connection error: ${err.message}`);
    }
    
    // For temporary errors, throw the original error to allow retry
    throw err;
  }
}

/**
 * Ensure database indexes are created with proper error handling
 */
async function ensureIndexes() {
  try {
    await Promise.all([
      User.createIndexes(),
      Task.createIndexes(),
      Message.createIndexes(),
      ChatHistory.createIndexes(),
      Billing.createIndexes()
    ]);
    
    logger.info('Database indexes ensured');
  } catch (error) {
    logger.error('Error ensuring database indexes:', error);
    // Don't fail the application if index creation fails
    // The application can still function, but queries might be slower
  }
}

/**
 * Checks if a browser session is healthy and operational
 * @param {Object} session - Browser session object
 * @returns {Promise<boolean>} - True if session is healthy
 */
async function isBrowserSessionHealthy(session) {
  if (!session || !session.browser) return false;
  
  try {
    const pages = await session.browser.pages();
    return Array.isArray(pages) && pages.length > 0 && pages[0].isClosed !== true;
  } catch (err) {
    logger.error(`Browser health check failed: ${err.message}`);
    return false;
  }
}

/**
 * Get a human-readable display name for an engine
 * @param {string} engineId - The engine ID
 * @returns {string} - Human-readable display name
 */
function getEngineDisplayName(engineId) {
  const displayNames = {
    'gpt-4o': 'OpenAI GPT-4o',
    'qwen-2.5-vl-72b': 'Qwen 2.5',
    'gemini-2.5-pro': 'Google Gemini',
    'ui-tars': 'UI-TARS'
  };
  return displayNames[engineId] || engineId;
}

// ======================================
// 8. EXPRESS APP & MIDDLEWARE
// ======================================
const app = express();
/*
// Generate a nonce for CSP
const generateNonce = () => {
  return randomBytes(16).toString('base64');
};

import { cdnAndCookieFixer } from './src/middleware/cdnFixer.js';

// Apply CDN and cookie fixer middleware FIRST
app.use(cdnAndCookieFixer);

// Add CSP nonce to all responses
app.use((req, res, next) => {
  // Generate a new nonce for each request
  res.locals.cspNonce = generateNonce();
  next();
});
*/
const server = createServer(app);

// 7.2 Session store (must come before any route that reads/writes req.session)
const MONGO_URI = config.mongoUri || process.env.MONGO_URI;
// Session configuration with secure settings
const sessionMiddleware = session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.secureCookies, // Set based on environment
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: config.isProduction ? 'lax' : 'lax',
    domain: config.cookieDomain === 'localhost' ? undefined : config.cookieDomain
  },
  store: MongoStore.create({
    mongoUrl: MONGO_URI,
    ttl: 24 * 60 * 60 // 24 hours
  }),
  name: 'nexus.sid',
  unset: 'destroy'
});

// Apply middleware with proper ordering
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(sessionMiddleware);

// Enhanced CORS middleware with permissive CORS setup
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Add request logging
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url, ip } = req;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const contentLength = res.get('Content-Length') || 0;
    
    logger.info(`${method} ${url} ${statusCode} - ${duration}ms - ${contentLength}b`, {
      method,
      url,
      status: statusCode,
      duration,
      contentLength,
      ip,
      userAgent: req.headers['user-agent']
    });
  });
  
  next();
});

// ======================================
// 9. WEBSOCKET SERVER
// ======================================
const wss = new WebSocketServer({ 
  server,
  path: '/ws',
  clientTracking: true,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
    threshold: 1024
  }
});

// Track active connections and unsent messages
const activeConnections = new Map();
const unsentMessages = new Map();

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  
  if (pathname !== '/ws') {
    logger.warn(`Rejected WebSocket connection to invalid path: ${pathname}`);
    socket.destroy();
    return;
  }
  
  try {
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.isAlive = true;
      ws.on('pong', () => { 
        ws.isAlive = true; 
        ws.lastPong = Date.now();
      });
      ws.connectedAt = Date.now();
      ws.lastPong = Date.now();
      wss.emit('connection', ws, request);
    });
  } catch (error) {
    logger.error('WebSocket upgrade error:', error);
    socket.destroy();
  }
});

// Handle new WebSocket connections
wss.on('connection', (ws, req) => {
  // Extract user ID from URL
  const userIdParam = req.url.split('userId=')[1]?.split('&')[0];
  const userId = userIdParam ? decodeURIComponent(userIdParam) : null;
  
  if (!userId) {
    logger.error('WebSocket connection rejected: Missing userId');
    ws.send(JSON.stringify({ 
      type: 'error', 
      message: 'Missing userId parameter' 
    }));
    ws.close();
    return;
  }
  
  const clientIp = req.socket.remoteAddress || 'unknown';
  logger.info(`New WebSocket connection from user: ${userId}, IP: ${clientIp}`);
  
  // Initialize user's connection set if it doesn't exist
  if (!activeConnections.has(userId)) {
    activeConnections.set(userId, new Set());
  }
  
  // Add connection to user's set
  const userConnections = activeConnections.get(userId);
  userConnections.add(ws);
  
  // Send any queued messages
  if (unsentMessages.has(userId)) {
    const queuedMessages = unsentMessages.get(userId);
    queuedMessages.forEach(message => {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error(`Failed to send queued message to user ${userId}:`, error);
      }
    });
    unsentMessages.delete(userId);
  }
  
  // Handle incoming messages
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      logger.debug(`Received message from user ${userId}:`, data);
      
      // Handle different message types
      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({ 
            type: 'pong', 
            timestamp: Date.now() 
          }));
          break;
          
        // Add more message handlers as needed
        default:
          logger.debug(`Unhandled WebSocket message type: ${data.type}`);
      }
      
    } catch (error) {
      logger.error('Error processing WebSocket message:', error);
      
      // Send error back to client
      try {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
          error: error.message
        }));
      } catch (sendError) {
        logger.error('Failed to send error message to client:', sendError);
      }
    }
  });
  
  // Handle connection close
  ws.on('close', () => {
    logger.info(`WebSocket connection closed for user: ${userId}`);
    
    // Remove connection from active connections
    if (activeConnections.has(userId)) {
      const userConnections = activeConnections.get(userId);
      userConnections.delete(ws);
      
      // Clean up if no more connections for this user
      if (userConnections.size === 0) {
        activeConnections.delete(userId);
      }
    }
    
    // Clean up any resources
    if (ws.taskCleanup) {
      try {
        ws.taskCleanup();
      } catch (cleanupError) {
        logger.error('Error during WebSocket cleanup:', cleanupError);
      }
    }
  });
  
  // Handle errors
  ws.on('error', (error) => {
    logger.error(`WebSocket error for user ${userId}:`, error);
  });
  
  // Send initial connection confirmation
  try {
    ws.send(JSON.stringify({ 
      type: 'connection_established', 
      userId,
      timestamp: Date.now(),
      serverVersion: process.env.npm_package_version || '1.0.0'
    }));
  } catch (sendError) {
    logger.error('Failed to send connection confirmation:', sendError);
  }
});

// Health check for WebSocket connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      logger.warn(`Terminating inactive WebSocket connection for user: ${ws.userId}`);
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping(null, false, (err) => {
      if (err) {
        logger.error('WebSocket ping error:', err);
        ws.terminate();
      }
    });
  });
}, 30000); // Check every 30 seconds

// WebSocket keep-alive and health check
const WEBSOCKET_PING_INTERVAL = 30000; // 30 seconds
const WEBSOCKET_TIMEOUT = 60000; // 60 seconds

const pingInterval = setInterval(() => {
  const now = Date.now();
  
  wss.clients.forEach((ws) => {
    try {
      // Check if connection is unresponsive
      if (now - ws.lastPong > WEBSOCKET_TIMEOUT) {
        logger.warn(`Terminating unresponsive WebSocket connection`);
        ws.terminate();
        return;
      }
      
      // Send ping if connection is alive
      if (ws.isAlive !== false) {
        ws.isAlive = false;
        ws.ping(() => {
          // Empty callback to handle potential errors
        });
      }
    } catch (error) {
      logger.error('Error in WebSocket keep-alive:', error);
    }
  });
}, WEBSOCKET_PING_INTERVAL);

// Clean up on server shutdown
process.on('SIGTERM', () => {
  clearInterval(pingInterval);
  
  // Close all WebSocket connections gracefully
  wss.clients.forEach((ws) => {
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1001, 'Server shutting down');
      }
    } catch (error) {
      logger.error('Error closing WebSocket:', error);
    }
  });
  
  // Close the WebSocket server
  wss.close(() => {
    logger.info('WebSocket server closed');
  });
});

// ======================================
// 10. STATIC FILES & ROUTES
// ======================================

// Add security headers middleware
/*
app.use((req, res, next) => {
  // Set common security headers for all responses
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  
  next();
});
*/

// Serve static assets at the end of the static file setup
serveStaticAssets(app);

/**
 * Set security headers for static files
 * @param {Object} res - Response object
 * @param {string} filePath - Path to the file being served
 */
const setStaticFileHeaders = (res, filePath) => {
  // Cache control for different file types
  const cacheControl = {
    'default': 'public, max-age=31536000, immutable',
    'html': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'api': 'no-cache, no-store, must-revalidate'
  };
  
  if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|wasm|glb|hdr|webp|avif)$/i)) {
    res.setHeader('Cache-Control', cacheControl.default);
  } else if (filePath.match(/\.(html|htm)$/i)) {
    res.setHeader('Cache-Control', cacheControl.html);
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
};

// === REPORT & RUN STATIC SERVING (MUST COME FIRST) ===
// Serve reports and report directories before any other static or SPA fallback
reportHandlers.setupReportServing(app);
reportHandlers.setupReportRedirector(app);
app.use('/nexus_run', express.static(NEXUS_RUN_DIR));
app.use('/midscene_run', (req, res, next) => {
  // Extract the path after /midscene_run/
  const subPath = req.path;
  // Redirect to the equivalent nexus_run path
  const newPath = `/nexus_run${subPath}`;
  res.redirect(301, newPath);
});

// === GENERAL STATIC ASSETS ===
// Serve static files from node_modules directory with proper MIME types
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));
app.use('/vendors', express.static(path.join(__dirname, 'public', 'vendors'), {
  setHeaders: (res, path) => {
    if (path.match(/\.(woff2?|ttf|otf|eot)$/)) {
      // Add CORS headers for font files
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // Set proper MIME types for font files
      if (path.endsWith('.ttf')) {
        res.setHeader('Content-Type', 'font/ttf');
      } else if (path.endsWith('.woff')) {
        res.setHeader('Content-Type', 'font/woff');
      } else if (path.endsWith('.woff2')) {
        res.setHeader('Content-Type', 'font/woff2');
      } else if (path.endsWith('.eot')) {
        res.setHeader('Content-Type', 'application/vnd.ms-fontobject');
      } else if (path.endsWith('.otf')) {
        res.setHeader('Content-Type', 'font/otf');
      }
    }
  }
}));

app.use(express.static(path.join(__dirname, 'dist')));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));

// Serve static files from src directory with proper MIME types
app.use('/src', express.static(path.join(__dirname, 'src'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    } else if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
  }
}));

// static file serving base before the loop below it
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use('/images', express.static(path.join(__dirname, 'public', 'assets', 'images')));
app.use('/models', express.static('public/models'));
app.use('/draco', express.static('public/draco'));
app.use('/assets', (req, res, next) => {
  const publicPath = path.join(__dirname, 'public', req.path);
  if (fs.existsSync(publicPath)) {
    return express.static(path.join(__dirname, 'public'))(req, res, next);
  }
  const demoPath = path.join(__dirname, 'bruno_demo_temp/static/assets', req.path);
  if (fs.existsSync(demoPath)) {
    return express.static(path.join(__dirname, 'bruno_demo_temp/static/assets'))(req, res, next);
  }
  next();
});

// Define static directories to serve with their options
const staticDirs = [
  { 
    path: path.join(__dirname, 'dist'), 
    route: '/',
    options: {
      index: false,
      setHeaders: setStaticFileHeaders,
      fallthrough: false,
      dotfiles: 'ignore',
      etag: true,
      lastModified: true,
      maxAge: '1y'
    }
  },
  { 
    path: path.join(__dirname, 'public'), 
    route: '/public',
    options: {
      index: false,
      setHeaders: setStaticFileHeaders,
      fallthrough: false,
      dotfiles: 'ignore',
      etag: true,
      lastModified: true,
      maxAge: '1y'
    }
  },
  { 
    path: path.join(__dirname, 'public', 'assets'), 
    route: '/assets',
    options: {
      index: false,
      setHeaders: setStaticFileHeaders,
      fallthrough: false,
      dotfiles: 'ignore',
      etag: true,
      lastModified: true,
      maxAge: '1y'
    }
  },
  { 
    path: path.join(__dirname, 'public', 'models'), 
    route: '/models',
    options: {
      index: false,
      setHeaders: setStaticFileHeaders,
      fallthrough: false,
      dotfiles: 'ignore',
      etag: true,
      lastModified: true,
      maxAge: '1y'
    }
  },
  { 
    path: path.join(__dirname, 'node_modules'), 
    route: '/node_modules',
    options: {
      index: false,
      setHeaders: setStaticFileHeaders,
      fallthrough: true,
      dotfiles: 'ignore',
      etag: true,
      lastModified: true,
      maxAge: '1y'
    }
  },
  { 
    path: path.join(__dirname, 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts'), 
    route: '/webfonts',
    options: {
      index: false,
      fallthrough: false,
      dotfiles: 'ignore',
      etag: true,
      lastModified: true,
      maxAge: '1y',
      setHeaders: (res, filePath) => {
        // Set proper MIME types for font files
        const mimeTypes = {
          '.css': 'text/css',
          '.woff2': 'font/woff2',
          '.woff': 'font/woff',
          '.ttf': 'font/ttf',
          '.eot': 'application/vnd.ms-fontobject',
          '.svg': 'image/svg+xml'
        };
        
        const ext = path.extname(filePath).toLowerCase();
        if (mimeTypes[ext]) {
          res.setHeader('Content-Type', mimeTypes[ext]);
        }
        
        // Set cache headers
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }
];

// Serve all static directories
staticDirs.forEach(({ path: dirPath, route, options }) => {
  if (fs.existsSync(dirPath)) {
    app.use(route, express.static(dirPath, options));
    logger.info(`Serving static files from ${dirPath} on route ${route}`);
  } else {
    logger.warn(`Static directory not found: ${dirPath}`);
  }
});

// Add specific static routes for /js and /src
// Serve /js route from public/js
if (fs.existsSync(path.join(__dirname, 'public', 'js'))) {
  app.use('/js', express.static(path.join(__dirname, 'public', 'js'), {
    setHeaders: setStaticFileHeaders,
    index: false,
    fallthrough: false,
    dotfiles: 'ignore',
    etag: true,
    lastModified: true,
    maxAge: '1y'
  }));
  logger.info(`Serving static files from public/js on route /js`);
} else {
  logger.warn(`Static directory not found: public/js`);
}

// Serve /src route from root src
if (fs.existsSync(path.join(__dirname, 'src'))) {
  app.use('/src', express.static(path.join(__dirname, 'src'), {
    setHeaders: setStaticFileHeaders,
    index: false,
    fallthrough: false,
    dotfiles: 'ignore',
    etag: true,
    lastModified: true,
    maxAge: '1y'
  }));
  logger.info(`Serving static files from src on route /src`);
} else {
  logger.warn(`Static directory not found: src`);
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.stack}`);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
    });
  }
  next(err);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found'
  });
});

// Authentication guard middleware
const guard = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/login.html');
  }
  next();
};

// Serve index.html for root route with authentication check
app.get('/', guard, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
});

// Serve old.html without authentication
app.get('/old.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'old.html'), {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
});

// Support legacy /logout path
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login.html');
  });
});

// Loop over the other .html endpoints
const pages = ['history', 'guide', 'settings'];
pages.forEach(page => {
  app.get(`/${page}.html`, guard, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', `${page}.html`));
  });
});

// Keep catch-all route for SPA (after specific routes)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.match(/\.[a-z0-9]+$/i)) {
    return next();
  }
  const indexPath = path.join(__dirname, 'index.html');
  res.sendFile(indexPath, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
});

// Final error handler for unhandled routes
app.use((req, res) => {
  res.status(404).send('Not Found');
});

// Special handling for model files in development
if (NODE_ENV !== 'production') {
  const devModelsPath = path.join(__dirname, 'src', 'models');
  if (fs.existsSync(devModelsPath)) {
    app.use('/models', express.static(devModelsPath, {
      setHeaders: setStaticFileHeaders,
      index: false,
      fallthrough: false,
      dotfiles: 'ignore'
    }));
    logger.info(`Serving development models from ${devModelsPath}`);
  }
}

// Handle 404 for static files
app.use((req, res, next) => {
  if (req.accepts('html') && !req.path.includes('.')) {
    // For HTML5 client-side routing - serve index.html
    res.sendFile(path.join(__dirname, 'dist', 'index.html'), {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } else {
    next();
  }
});

// Import and use routes
import authRoutes from './src/routes/auth.js';
import taskRoutes from './src/routes/tasks.js';
import billingRoutes from './src/routes/billing.js';
import yamlMapsRoutes from './src/routes/yaml-maps.js';
import userRoutes from './src/routes/user.js';
import historyRouter    from './src/routes/history.js';
import customUrlsRouter from './src/routes/customUrls.js';
import settingsRouter   from './src/routes/settings.js';
import { requireAuth }  from './src/middleware/requireAuth.js';
import serveStaticAssets from './src/middleware/staticAssets.js';
import messagesRouter from './src/routes/messages.js';

// API routes
// Public routes (no auth required)
app.use('/api/auth', authRoutes);

// Protected routes (require authentication)
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/history', requireAuth, historyRouter);
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/custom-urls', requireAuth, customUrlsRouter);
app.use('/api/yaml-maps', requireAuth, yamlMapsRoutes);
app.use('/api/billing', requireAuth, billingRoutes);
app.use('/api/user', requireAuth, userRoutes);
app.use('/api/messages', requireAuth, messagesRouter);

// Static assets (no auth required)
app.use('/api/assets', serveStaticAssets);

// Health check endpoint with detailed status
app.get('/api/health', (req, res) => {
  const healthcheck = {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now(),
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    env: NODE_ENV,
    dbStatus: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    websocketConnections: wss.clients.size,
    activeUsers: activeConnections.size
  };
  
  res.status(200).json(healthcheck);
});

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/assets/images/dail-fav.png'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  const errorId = uuidv4();
  const errorDetails = {
    id: errorId,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  };
  
  // Log the error with context
  logger.error(`[${errorId}] ${err.message}`, {
    error: err.stack,
    ...errorDetails
  });
  
  // Don't leak stack traces in production
  const errorResponse = NODE_ENV === 'production' 
    ? { 
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        errorId
      }
    : {
        error: err.name,
        message: err.message,
        stack: err.stack,
        ...errorDetails
      };
  
  res.status(err.status || 500).json(errorResponse);
});

// ======================================
// 10. DATABASE MANAGEMENT
// ======================================

/**
 * Clear the database once on startup if needed
 * This is useful for development and testing
 */
async function clearDatabaseOnce() {
  try {
    // Check if we should clear the database
    if (process.env.CLEAR_DB_ON_START === 'true') {
      console.log('Clearing database...');
      await Promise.all([
        User.deleteMany({}),
        Message.deleteMany({}),
        Task.deleteMany({}),
        ChatHistory.deleteMany({}),
        Billing.deleteMany({})
      ]);
      console.log('✅ Database cleared');
    }
  } catch (error) {
    console.error('Error clearing database:', error);
    // Don't fail startup if clearing fails
  }
}


// ======================================
// 11.a. BROWSER SESSION MANAGEMENT
// ======================================
// Initialize browser session tracking
const activeBrowsers = new Map();
const browserSemaphore = new Semaphore(MAX_CONCURRENT_BROWSERS);

// Set up session health monitoring
const browserSessionHeartbeat = setInterval(async () => {
  logger.debug(`Running heartbeat check on ${activeBrowsers.size} active browser sessions`);
  const sessionsToClean = [];
  
  for (const [taskId, session] of activeBrowsers.entries()) {
    try {
      if (!session || session.closed || session.hasReleased || !session.page) {
        sessionsToClean.push(taskId);
        continue;
      }
      
      if (Date.now() - (session.lastActivity || 0) > 30 * 60 * 1000) { // 30 minutes inactive
        logger.info(`Cleaning up inactive browser session ${taskId}`);
        sessionsToClean.push(taskId);
        if (session.release && typeof session.release === 'function') {
          session.release();
        }
        try {
          if (session.page && !session.page.isClosed()) {
            await session.page.close();
          }
          if (session.browser) {
            await session.browser.close();
          }
        } catch (err) {
          logger.error('Error cleaning up browser session:', err);
        }
      }
    } catch (error) {
      logger.error('Error in browser session heartbeat:', error);
      sessionsToClean.push(taskId);
    }
  }
  
  // Clean up dead sessions
  sessionsToClean.forEach(taskId => activeBrowsers.delete(taskId));
}, 5 * 60 * 1000); // Check every 5 minutes

// ======================================
// 11.b. SERVER INITIALIZATION
// ======================================

/**
 * Start the application with proper error handling and cleanup
 */
async function startApp() {
  try {
    // Connect to MongoDB with retries
    await pRetry(connectToDatabase, {
      retries: 5,
      minTimeout: 2000,
      onFailedAttempt: error => {
        console.log(`MongoDB connection attempt ${error.attemptNumber} failed. Retrying...`);
      }
    });
    
    console.log('✅ MongoDB connected');
    
    // Clear database if needed (for development)
    await clearDatabaseOnce();
    
    // Ensure indexes are created
    await ensureIndexes();
    
    // Start the HTTP server
    return new Promise((resolve) => {
      server.listen(PORT, () => {
        console.log(`\n🚀 Server started successfully!`);
        console.log(`================================`);
        console.log(`Environment: ${config.nodeEnv}`);
        console.log(`Port: ${PORT}`);
        console.log(`API URL: ${config.apiUrl}`);
        console.log(`Frontend URL: ${config.frontendUrl}`);
        console.log(`WebSocket URL: ${config.wsUrl}`);
        console.log(`================================\n`);
        
        // Resolve with the server instance
        resolve(server);
      });
    });
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
};

// Start the server
startApp();

// ======================================
// 12. CLEANUP AND SHUTDOWN HANDLERS
// ======================================

/**
 * Clean up resources before shutting down
 */
async function cleanupResources() {
  try {
    logger.info('Starting cleanup of resources...');
    
    // Close WebSocket server if it exists
    if (wss) {
      logger.info('Closing WebSocket server...');
      await new Promise((resolve) => {
        // Close all active WebSocket connections
        wss.clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.terminate();
          }
        });
        
        // Close the WebSocket server
        wss.close(() => {
          logger.info('WebSocket server closed');
          resolve();
        });
      });
    }
    
    // Close MongoDB connection if connected
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      logger.info('Closing MongoDB connection...');
      await mongoose.connection.close();
      logger.info('MongoDB connection closed');
    }
    
    // Clear any intervals
    if (browserSessionHeartbeat) {
      logger.info('Clearing browser session heartbeat...');
      clearInterval(browserSessionHeartbeat);
    }
    
    // Clean up any active browser sessions
    if (activeBrowsers && activeBrowsers.size > 0) {
      logger.info(`Cleaning up ${activeBrowsers.size} active browser sessions...`);
      const cleanupPromises = Array.from(activeBrowsers.values()).map(async (session) => {
        try {
          if (session && !session.closed && typeof session.release === 'function') {
            await session.release();
          }
        } catch (error) {
          logger.error('Error cleaning up browser session:', error);
        }
      });
      
      await Promise.all(cleanupPromises);
      activeBrowsers.clear();
    }
    
    logger.info('Cleanup completed successfully');
  } catch (error) {
    logger.error('Error during cleanup:', error);
    // Don't throw, we want to continue with shutdown
  }
}

// Handle graceful shutdown
async function handleShutdown(signal) {
  logger.info(`\n${signal} received - shutting down gracefully...`);
  
  try {
    // Start cleanup with a timeout
    const cleanupPromise = cleanupResources();
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 10000)); // 10s timeout
    
    await Promise.race([cleanupPromise, timeoutPromise]);
    logger.info('Graceful shutdown completed');
  } catch (error) {
    logger.error('Error during shutdown:', error);
  } finally {
    process.exit(0);
  }
}

// Register signal handlers
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  if (reason && reason.message && reason.message.includes('Request is already handled')) {
    logger.debug('[Puppeteer] Ignoring known issue: Request is already handled');
  } else {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Attempt cleanup before exiting
  cleanupResources()
    .then(() => process.exit(1))
    .catch(() => process.exit(1));
});

// Initialize Puppeteer
puppeteerExtra.use(StealthPlugin());

// ======================================
// 12. HELPER FUNCTIONS
// ======================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export for use in other modules
export {
  app,
  server,
  wss,
  activeConnections,
  activeBrowsers,
  browserSemaphore,
  logger,
  config,
  sleep
};
