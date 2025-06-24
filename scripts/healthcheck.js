#!/usr/bin/env node

import { getConnectedDevices } from '@midscene/android';
import http from 'http';

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

/**
 * Check if Android devices are connected and responsive
 */
async function checkAndroidDevices() {
  try {
    const devices = await getConnectedDevices();
    return {
      status: 'healthy',
      devices: devices.map(d => ({
        udid: d.udid,
        state: d.state,
        model: d.model
      }))
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

// Simple HTTP server for health checks
const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    try {
      const health = await checkAndroidDevices();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        ...health
      }, null, 2));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
  } else if (req.url === '/ready') {
    // Simple readiness check
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ready',
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'not_found',
      timestamp: new Date().toISOString()
    }));
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
server.listen(PORT, HOST, () => {
  console.log(`Health check server running at http://${HOST}:${PORT}`);
});

// Export for testing
if (process.env.NODE_ENV === 'test') {
  module.exports = { checkAndroidDevices };
}
