import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import process from 'process';

const router = express.Router();

// Cache the start time for uptime calculation
const START_TIME = Date.now();

// Helper to get memory usage in MB
const getMemoryUsage = () => {
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 MB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const memoryUsage = process.memoryUsage();
  return {
    rss: formatBytes(memoryUsage.rss), // Resident set size
    heapTotal: formatBytes(memoryUsage.heapTotal),
    heapUsed: formatBytes(memoryUsage.heapUsed),
    external: formatBytes(memoryUsage.external || 0),
    arrayBuffers: formatBytes(memoryUsage.arrayBuffers || 0)
  };
};

/**
 * @route   GET /api/health
 * @desc    Health check endpoint with CORS support
 * @access  Public
 */
router.get('/', (req, res) => {
  const requestId = uuidv4();
  const start = process.hrtime();
  
  // Set CORS headers
  const origin = req.headers.origin || '';
  const isAllowedOrigin = origin.endsWith('.ondigitalocean.app') || 
                       origin.includes('localhost:') || 
                       origin.includes('127.0.0.1:');
  
  if (isAllowedOrigin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  }

  try {
    const healthData = {
      status: 'ok',
      requestId,
      timestamp: new Date().toISOString(),
      uptime: {
        process: process.uptime(),
        server: (Date.now() - START_TIME) / 1000
      },
      environment: process.env.NODE_ENV || 'development',
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      },
      system: {
        hostname: os.hostname(),
        type: os.type(),
        release: os.release(),
        load: os.loadavg(),
        memory: {
          total: Math.round(os.totalmem() / (1024 * 1024)) + ' MB',
          free: Math.round(os.freemem() / (1024 * 1024)) + ' MB',
          usage: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100) + '%'
        },
        cpus: os.cpus().length
      },
      process: {
        pid: process.pid,
        memory: getMemoryUsage(),
        uptime: process.uptime(),
        env: process.env.NODE_ENV || 'development'
      },
      app: {
        name: process.env.npm_package_name || 'Nexus',
        version: process.env.npm_package_version || '1.0.0',
        node_env: process.env.NODE_ENV || 'development'
      }
    };

    // Calculate response time
    const [seconds, nanoseconds] = process.hrtime(start);
    const responseTime = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);
    res.header('X-Response-Time', `${responseTime}ms`);
    res.header('X-Request-ID', requestId);
    
    return res.status(200).json(healthData);
    
  } catch (error) {
    console.error(`[${requestId}] Health check failed:`, error);
    
    // Ensure we don't send sensitive error details in production
    const errorResponse = {
      status: 'error',
      requestId,
      message: 'Health check failed',
      timestamp: new Date().toISOString()
    };
    
    if (process.env.NODE_ENV !== 'production') {
      errorResponse.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }
    
    return res.status(500).json(errorResponse);
  }
});

// Add OPTIONS handler for preflight
router.options('/', (req, res) => {
  const origin = req.headers.origin || '';
  if (origin.endsWith('.ondigitalocean.app') || 
      origin.includes('localhost:') || 
      origin.includes('127.0.0.1:')) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  }
  res.status(204).end();
});

export default router;
