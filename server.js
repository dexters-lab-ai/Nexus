// ======================================
// 0. LOAD ENVIRONMENT VARIABLES
// ======================================
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// 1. CORE IMPORTS
// ======================================
import fs from 'fs';
import { randomBytes } from 'crypto';
import express from 'express';
import { createServer } from 'http';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { WebSocket, WebSocketServer } from 'ws';
import winston from 'winston';
import pRetry from 'p-retry';
import { v4 as uuidv4 } from 'uuid';
import { Semaphore } from 'async-mutex';
import puppeteer from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { PuppeteerAgent } from '@midscene/web/puppeteer';
import { getPuppeteerLaunchOptions, getDebugLaunchOptions } from './src/utils/puppeteerConfig.js';
import OpenAI from 'openai';
import { AbortError } from 'p-retry';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';

// Create Express app
const app = express();

// ======================================
// 0.1 HEALTH CHECK ENDPOINT
// ======================================
// Health check endpoint - must be the first route to ensure it's never overridden
// CORS preflight handler for /api/health
app.options('/api/health', (req, res) => {
  const origin = req.headers.origin || '';
  const isAllowedOrigin = origin.endsWith('.ondigitalocean.app') || 
                       origin.includes('localhost:') || 
                       origin.includes('127.0.0.1:');
  
  if (isAllowedOrigin) {
    // Always set CORS headers for preflight
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID, Cache-Control, Pragma');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Expose-Headers', 'Content-Type, Authorization, X-Request-ID, Cache-Control, Pragma, X-Requested-With');
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    res.header('Vary', 'Origin');
    
    // For preflight requests, respond with 204 No Content
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  }
  
  return res.status(204).end();
});

app.get('/api/health', (req, res) => {
  try {
    const origin = req.headers.origin || '';
    const isAllowedOrigin = origin.endsWith('.ondigitalocean.app') || 
                         origin.includes('localhost:') || 
                         origin.includes('127.0.0.1:');
    
    // Set CORS headers
    if (isAllowedOrigin) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID, Cache-Control, Pragma');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Expose-Headers', 'Content-Type, Authorization, X-Request-ID, Cache-Control, Pragma, X-Requested-With');
      res.header('Vary', 'Origin');
    }
    
    // Set response headers
    res.set('Content-Type', 'application/json');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    
    // Basic health check data
    const healthData = {
      status: 'ok',
      serverReady: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '1.0.0',
      nodeVersion: process.version,
      requestId: uuidv4(),
      headers: process.env.NODE_ENV === 'development' ? {
        origin: req.headers.origin,
        host: req.headers.host,
        'user-agent': req.headers['user-agent']
      } : undefined
    };
    
    return res.status(200).json(healthData);
  } catch (error) {
    console.error('Health check error:', error);
    
    // Ensure we can still set headers
    if (!res.headersSent) {
      res.set('Content-Type', 'application/json');
      
      // Set CORS headers even in error case
      const origin = req.headers.origin || '';
      if (origin.endsWith('.ondigitalocean.app') || 
          origin.includes('localhost:') || 
          origin.includes('127.0.0.1:')) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Vary', 'Origin');
      }
      
      res.status(500).json({
        status: 'error',
        serverReady: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } else {
      // If headers were already sent, log the error but don't try to send another response
      console.error('Headers already sent when trying to send error response');
    }
  }
});

// Track connection attempts and failures
const connectionAttempts = new Map();

// Track active connections and unsent messages
const userConnections = new Map(); // Maps userId -> Set of WebSocket connections
const unsentMessages = new Map(); // Maps userId -> Array of pending messages

/**
 * Update a WebSocket connection's user ID and authentication state
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} newUserId - New user ID
 * @param {boolean} isAuthenticated - Whether the user is authenticated
 */
function updateUserConnection(ws, newUserId, isAuthenticated) {
  const oldUserId = ws.userId;
  
  // If user ID hasn't changed, just update auth status
  if (oldUserId === newUserId) {
    ws.isAuthenticated = isAuthenticated;
    return;
  }

  // Remove from old user's connections
  if (oldUserId && userConnections.has(oldUserId)) {
    const oldUserWsSet = userConnections.get(oldUserId);
    oldUserWsSet.delete(ws);
    if (oldUserWsSet.size === 0) {
      userConnections.delete(oldUserId);
    }
  }

  // Add to new user's connections
  if (!userConnections.has(newUserId)) {
    userConnections.set(newUserId, new Set());
  }
  userConnections.get(newUserId).add(ws);

  // Update connection properties
  ws.userId = newUserId;
  ws.isAuthenticated = isAuthenticated;

  console.log(`[WebSocket] Updated connection ${ws.connectionId} from userId=${oldUserId} to userId=${newUserId}`, {
    isAuthenticated,
    timestamp: new Date().toISOString()
  });
}

// Create WebSocket server and handle HTTP upgrade
let wss;

/**
 * Check if an origin is allowed
 * 
 * This function allows all origins since we're using Cloudflare for security.
 * Security is handled at the Cloudflare level using WAF, rate limiting, and other security features.
 */
function isOriginAllowed(origin) {
  // Allow all origins - security is handled by Cloudflare
  return true;
}

function setupWebSocketServer(server) {
  // Create WebSocket server with configuration
  const wss = new WebSocket.Server({ 
    noServer: true, // Handle upgrade manually
    perMessageDeflate: {
      zlibDeflateOptions: { chunkSize: 1024, memLevel: 7, level: 3 },
      clientNoContextTakeover: true,
      serverNoContextTakeover: true,
      serverMaxWindowBits: 10,
      concurrencyLimit: 10,
      threshold: 1024
    },
    clientTracking: true,
    verifyClient: (info, done) => {
      // This runs before the upgrade request is accepted
      // We'll handle session validation during the upgrade
      done(true);
    }
  });

  // Store the server instance globally for cleanup
  global.wss = wss;

  // WebSocket server event listeners
  wss.on('listening', () => {
    console.log('[WebSocket] Server ready');
    
    // Set up periodic cleanup of dead connections and check connection health
    setInterval(() => {
      const now = Date.now();
      
      // Check all user connections
      for (const [userId, connections] of userConnections.entries()) {
        for (const ws of connections) {
          // Check if connection is still alive
          if (ws.isAlive === false) {
            console.log(`[WebSocket] Terminating dead connection for user ${userId}`);
            ws.terminate();
            connections.delete(ws);
            continue;
          }
          
          // Mark as not alive until next ping
          ws.isAlive = false;
          ws.ping();
        }
        
        // Remove user entry if no more connections
        if (connections.size === 0) {
          userConnections.delete(userId);
          unsentMessages.delete(userId);
        }
      }
    }, 30000); // Check every 30 seconds
  });

  wss.on('error', (error) => {
    console.error('[WebSocket] Server error:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
  });
  
  // WebSocket connection handler - individual connection management is handled in the upgrade handler
  wss.on('connection', (ws) => {
    // Connection logging is handled in the upgrade handler
    // All event handlers are set up in the upgrade handler to avoid duplication
  });

  // Handle HTTP server upgrade for WebSocket connections
  server.on('upgrade', (request, socket, head) => {
    // Set a connection timeout
    socket.setTimeout(10000, () => {
      if (!socket.destroyed) {
        console.log('[WebSocket] Connection upgrade timed out');
        socket.write('HTTP/1.1 408 Request Timeout\r\n\r\n');
        socket.destroy();
      }
    });

    // Skip session validation for health checks
    if (request.url === '/health') {
      socket.write('HTTP/1.1 200 OK\r\n\r\n');
      return socket.destroy();
    }
    
    // Add CORS headers for WebSocket upgrade
    const origin = request.headers.origin;
    if (origin && isOriginAllowed(origin)) {
      request.headers['access-control-allow-origin'] = origin;
      request.headers['access-control-allow-credentials'] = 'true';
    }

    // Handle WebSocket upgrade with session validation
    sessionMiddleware(request, {}, async (err) => {
      if (err) {
        console.error('[WebSocket] Session middleware error:', err);
        socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        return socket.destroy();
      }
      
      try {
        // Ensure session exists
        if (!request.session) {
          request.session = {};
        }
        
        const session = request.session;
        let userId = session.userId || session.user; // Handle both formats
        let isNewSession = !userId;
        
        // Only create guest session for new sessions that aren't API requests
        if (isNewSession && !request.url.startsWith('/api/')) {
          userId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          session.userId = userId; // Use consistent property name
          session.user = userId; // Keep both for backward compatibility
          console.log('[WebSocket] Created new guest session:', userId);
          
          // Save the session before proceeding
          await new Promise((resolve, reject) => {
            session.save((err) => {
              if (err) {
                console.error('[WebSocket] Error saving session:', err);
                return reject(err);
              }
              resolve();
            });
          });
        }
        
        if (!userId) {
          console.error('[WebSocket] No user ID in session');
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          return socket.destroy();
        }
        
        // Determine if user is authenticated
        const isAuthenticated = userId && !userId.startsWith('guest_');
        
        // Proceed with WebSocket upgrade
        wss.handleUpgrade(request, socket, head, (ws) => {
          // Clear the timeout as we've successfully upgraded
          socket.setTimeout(0);
          
          // Connection metadata
          const connectionId = `${Date.now()}-${randomBytes(4).toString('hex')}`;
          const clientIp = request.socket.remoteAddress;
          
          // Store connection info using consistent property names
          ws.userId = userId;
          ws.isAuthenticated = isAuthenticated;
          ws.connectedAt = Date.now();
          ws.lastPong = Date.now();
          ws.isAlive = true;
          ws.connectionId = connectionId;
          
          console.log(`[WebSocket] New connection: ${connectionId} (${isAuthenticated ? 'authenticated' : 'guest'})`);
          
          // Add to user connections tracking
          if (!userConnections.has(userId)) {
            userConnections.set(userId, new Set());
          }
          userConnections.get(userId).add(ws);
          
          // Log connection count for this user
          console.log(`[WebSocket] User ${userId} now has ${userConnections.get(userId).size} active connections`);
          
          // Set up ping/pong for connection health
          ws.on('pong', () => {
            const now = Date.now();
            ws.isAlive = true;
            ws.lastPong = now;
            ws.lastActivity = now;
            ws.waitingForPong = false;
            
            // Clear any pending ping timeout
            if (ws.pingTimeout) {
              clearTimeout(ws.pingTimeout);
              ws.pingTimeout = null;
            }
            
            // Set a new ping timeout
            ws.pingTimeout = setTimeout(() => {
              if (ws.readyState !== WebSocket.OPEN) return;
              
              if (ws.waitingForPong) {
                // No pong received in time, terminate connection
                console.log(`[WebSocket] No pong received from ${ws.userId}, terminating connection`);
                ws.terminate();
              } else {
                // Send a ping if connection is still open
                if (ws.readyState === WebSocket.OPEN) {
                  try {
                    ws.waitingForPong = true;
                    ws.ping();
                    
                    // Set a shorter timeout to wait for the pong
                    ws.pingTimeout = setTimeout(() => {
                      if (ws.waitingForPong && ws.readyState === WebSocket.OPEN) {
                        console.log(`[WebSocket] No pong received from ${ws.userId} after ping, terminating connection`);
                        ws.terminate();
                      }
                    }, 5000); // 5 seconds to receive pong
                  } catch (error) {
                    console.error(`[WebSocket] Error sending ping to ${ws.userId}:`, error.message);
                    ws.terminate();
                  }
                }
              }
            }, 30000); // Send ping every 30 seconds
          });
          
          // Set up ping interval for this connection
          const setupPingInterval = (ws) => {
            // Clear any existing interval
            if (ws.pingInterval) {
              clearInterval(ws.pingInterval);
            }
            
            // Set up new interval to send pings
            ws.pingInterval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                try {
                  ws.ping();
                } catch (error) {
                  console.error(`[WebSocket] Error sending ping:`, error);
                }
              }
            }, 45000); // Send ping every 45 seconds (less than the 60s timeout)
          };
          
          // Initialize ping interval
          setupPingInterval(ws);
          
          // Send initial ping to start the keepalive
          ws.ping(JSON.stringify({ type: 'ping', timestamp: Date.now() }));

          // Connection is already tracked in userConnections
          console.log(`[WebSocket] New ${isAuthenticated ? 'auth' : 'guest'} connection: ${connectionId}`);
          
          // Send welcome message
          const welcomeMsg = {
            type: 'connection_established',
            connectionId,
            userId,
            isAuthenticated,
            timestamp: Date.now()
          };
          
          ws.send(JSON.stringify(welcomeMsg));
          
          // Send connection ack with user info (required by frontend)
          ws.send(JSON.stringify({
            event: 'connection_ack',
            timestamp: new Date().toISOString(),
            userId: userId,
            connectionCount: userConnections.get(userId).size
          }));
          
          // Send any queued messages for this user
          if (unsentMessages.has(userId)) {
            const queued = unsentMessages.get(userId);
            console.log(`[WebSocket] Sending ${queued.length} queued messages to user ${userId}`);
            queued.forEach(msg => {
              try {
                ws.send(JSON.stringify(msg));
              } catch (error) {
                console.error(`[WebSocket] Error sending queued message to user ${userId}:`, error);
              }
            });
            unsentMessages.delete(userId);
          }
          
          // Handle incoming messages
          const handleMessage = (message) => {
            try {
              const now = Date.now();
              ws.lastActivity = now; // Update last activity timestamp
              
              // Parse message if it's JSON
              let data;
              try {
                data = JSON.parse(message);
              } catch (e) {
                // Not a JSON message, ignore
                return;
              }
              
              // Log message with connection details (filter out pings from logs)
              if (data.type !== 'ping' && data.type !== 'pong') {
                console.log(`[WebSocket] Message from ${connectionId} (${userId}):`, data);
              }
              
              // Handle application-level ping (client-initiated)
              if (data.type === 'ping') {
                // Update connection timestamp
                ws.lastPong = now;
                ws.isAlive = true;
                
                // Clear any pending ping timeout
                if (ws.pingTimeout) {
                  clearTimeout(ws.pingTimeout);
                  ws.pingTimeout = null;
                }
                
                // Clear waitingForPong flag if set
                ws.waitingForPong = false;
                
                // Send pong response
                try {
                  ws.send(JSON.stringify({
                    type: 'pong',
                    timestamp: now,
                    originalTimestamp: data.timestamp || now
                  }));
                } catch (error) {
                  console.error(`[${connectionId}] Error sending pong:`, error);
                }
                return;
              }
              
              // Handle application-level pong (response to our ping)
              if (data.type === 'pong') {
                ws.waitingForPong = false;
                ws.lastPong = now;
                ws.isAlive = true;
                
                // Clear any pending ping timeout
                if (ws.pingTimeout) {
                  clearTimeout(ws.pingTimeout);
                  ws.pingTimeout = null;
                }
                
                // Log RTT if we have the original timestamp
                if (data.originalTimestamp) {
                  const rtt = now - data.originalTimestamp;
                  if (process.env.NODE_ENV !== 'production') {
                    // Received pong, connection healthy
                  }
                }
                return;
              }
              
              // Handle authentication state updates
              if (data.type === 'update_auth_state') {
                const { userId: newUserId, isAuthenticated: newAuthState } = data;
                
                // Validate input
                if (typeof newAuthState !== 'boolean') {
                  console.error('[WebSocket] Invalid auth update - isAuthenticated must be boolean');
                  ws.send(JSON.stringify({
                    type: 'auth_error',
                    error: 'Invalid authentication data',
                    timestamp: Date.now()
                  }));
                  return;
                }
                
                if (!newUserId) {
                  console.error('[WebSocket] Invalid auth update - userId is required');
                  ws.send(JSON.stringify({
                    type: 'auth_error',
                    error: 'User ID is required',
                    timestamp: Date.now()
                  }));
                  return;
                }
                
                // Update the connection with new auth state
                updateUserConnection(ws, newUserId, newAuthState);
                
                // Acknowledge the auth update
                ws.send(JSON.stringify({
                  type: 'auth_state_updated',
                  success: true,
                  userId: ws.userId,
                  isAuthenticated: ws.isAuthenticated,
                  timestamp: Date.now()
                }));
                
                console.log(`[WebSocket] Auth state updated for ${connectionId}:`, {
                  userId: ws.userId,
                  isAuthenticated: ws.isAuthenticated,
                  userConnections: userConnections.get(ws.userId)?.size || 0
                });
                
                return;
              }
              
              // Handle other message types here...
              
            } catch (error) {
              console.error(`[WebSocket] Error processing message from ${connectionId}:`, error);
            }
          };
          
          // Set up message handler
          ws.on('message', handleMessage);
          
          /**
           * Clean up WebSocket connection resources
           */
          const cleanupConnection = () => {
            if (!ws || !connectionId) return;
            
            console.log(`[WebSocket] Cleaning up connection: ${connectionId} (${userId || 'unknown'})`);
            
            // Clear ping interval if it exists
            if (ws.pingInterval) {
              clearInterval(ws.pingInterval);
              ws.pingInterval = null;
            }
            
            // Clear ping timeout if it exists
            if (ws.pingTimeout) {
              clearTimeout(ws.pingTimeout);
              ws.pingTimeout = null;
            }
            
            // Remove from user connections
            if (userId && userConnections.has(userId)) {
              const userWsSet = userConnections.get(userId);
              if (userWsSet) {
                userWsSet.delete(ws);
                
                if (userWsSet.size === 0) {
                  userConnections.delete(userId);
                  console.log(`[WebSocket] Removed last connection for user ${userId}`);
                }
              }
            }
            
            // Clean up any message queue if it exists
            if (ws.messageQueue) {
              ws.messageQueue = null;
            }
            
            // Clear any event listeners to prevent memory leaks
            ws.removeAllListeners('pong');
            ws.removeAllListeners('ping');
            ws.removeAllListeners('message');
            ws.removeAllListeners('close');
            ws.removeAllListeners('error');
            
            // Clear any ping intervals or timeouts
            if (ws.pingInterval) {
              clearInterval(ws.pingInterval);
              ws.pingInterval = null;
            }
            if (ws.pingTimeout) {
              clearTimeout(ws.pingTimeout);
              ws.pingTimeout = null;
            }
            
            // Force close the connection if it's still open
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.terminate();
              } catch (e) {
                console.error(`[${connectionId}] Error terminating connection:`, e);
              }
            }
            
            console.log(`[WebSocket] Connection cleanup complete for ${connectionId}`);
          };
          
          // Handle connection close
          const handleClose = (code, reason) => {
            const closeInfo = {
              connectionId,
              userId,
              code,
              reason: reason?.toString() || 'No reason provided',
              wasClean: ws.readyState === ws.CLOSED,
              connectedAt: ws.connectedAt ? new Date(ws.connectedAt).toISOString() : 'unknown',
              duration: ws.connectedAt ? `${((Date.now() - ws.connectedAt) / 1000).toFixed(2)}s` : 'unknown'
            };
            
            console.log(`[WebSocket] Connection closed: ${connectionId}`);
            
            // Clean up resources
            cleanupConnection();
            
            // Log connection statistics
            const activeUsers = userConnections.size;
            console.log(`[WebSocket] Connection stats - Active: ${activeUsers}`);
          };
          
          // Handle errors
          const handleError = (error) => {
            const errorInfo = {
              connectionId,
              userId,
              error: error.message,
              stack: error.stack,
              timestamp: new Date().toISOString()
            };
            
            console.error(`[WebSocket] Connection error: ${error.message || 'Unknown error'}`);
            
            // Clean up resources
            cleanupConnection();
            
            // Force close the connection if not already closed
            if (ws.readyState === ws.OPEN) {
              try {
                ws.terminate();
              } catch (terminateError) {
                console.error(`[WebSocket] Error terminating connection ${connectionId}:`, terminateError);
              }
            }
          };
          
          // Set up close and error handlers
          ws.on('close', handleClose);
          ws.on('error', handleError);
          
          // Set up ping interval for this connection
          const pingInterval = setInterval(() => {
            if (ws.readyState === ws.OPEN) {
              try {
                ws.ping();
                console.log(`[${connectionId}] Sent ping`);
              } catch (error) {
                console.error(`[${connectionId}] Error sending ping:`, error);
                ws.terminate();
              }
            }
          }, 30000); // Send a ping every 30 seconds
          
          // Store the interval ID for cleanup
          ws.pingInterval = pingInterval;
          
          // Set up a one-time handler for when the connection is closed
          const onClose = () => {
            clearInterval(pingInterval);
            // Remove all event listeners to prevent memory leaks
            ws.removeAllListeners('pong');
            ws.removeAllListeners('ping');
            ws.removeAllListeners('message');
            ws.removeAllListeners('close');
            ws.removeAllListeners('error');
            
            // Clean up any remaining intervals or timeouts
            if (ws.pingInterval) {
              clearInterval(ws.pingInterval);
              ws.pingInterval = null;
            }
            if (ws.pingTimeout) {
              clearTimeout(ws.pingTimeout);
              ws.pingTimeout = null;
            }
          };
          
          ws.once('close', onClose);
          ws.once('error', onClose);
        });
      } catch (error) {
        console.error('[WebSocket] Upgrade error:', error);
        if (!socket.destroyed) {
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
          socket.destroy();
        }
      }
    });
  });
  
  // Constants for ping/pong timing
  const PING_INTERVAL = 30000; // 30 seconds between pings
  const PONG_TIMEOUT = 45000;  // 45 seconds to wait for pong before timeout
  
  // Track all ping intervals for cleanup
  const pingIntervals = new Map();
  
  // Clean up all intervals when server closes
  wss.on('close', () => {
    console.log('WebSocket server closing, cleaning up intervals...');
    for (const [connectionId, interval] of pingIntervals.entries()) {
      clearInterval(interval);
      pingIntervals.delete(connectionId);
    }
  });
  
  // Helper function to setup ping interval for a connection
  function setupPingInterval(ws) {
    // Clear any existing interval
    if (ws.pingInterval) {
      clearInterval(ws.pingInterval);
    }
    
    // Set up new interval for checking connection health
    ws.pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          // Check if we've received any activity recently
          const now = Date.now();
          const timeSinceLastActivity = now - (ws.lastActivity || 0);
          
          // If no activity for too long, terminate the connection
          if (timeSinceLastActivity > 60000) { // 60 seconds of no activity
            console.log(`[${ws.connectionId}] No activity for ${Math.floor(timeSinceLastActivity/1000)}s, disconnecting`);
            ws.terminate();
            return;
          }
          
          // If we're waiting for a pong and it's been too long, terminate
          if (ws.waitingForPong && ws.lastPingTime && (now - ws.lastPingTime > 10000)) {
            console.log(`[${ws.connectionId}] No pong received in ${now - ws.lastPingTime}ms, disconnecting`);
            ws.terminate();
            return;
          }
          
          // Only send a new ping if we're not already waiting for a pong
          if (!ws.waitingForPong) {
            ws.waitingForPong = true;
            ws.lastPingTime = now;
            
            // Send a simple ping (no data to minimize traffic)
            ws.ping(null, (err) => {
              if (err) {
                console.error(`[${ws.connectionId}] Error sending ping:`, err);
                ws.waitingForPong = false;
              }
            });
          }
          
        } catch (error) {
          console.error(`[${ws.connectionId}] Error in connection check:`, error);
        }
      }
    }, 30000); // Check connection every 30 seconds
    
    // Store interval for cleanup
    pingIntervals.set(ws.connectionId, ws.pingInterval);
    
    // Clean up interval when connection closes
    const cleanup = () => {
      if (ws.pingInterval) {
        clearInterval(ws.pingInterval);
        pingIntervals.delete(ws.connectionId);
      }
      if (ws.pingTimeout) {
        clearTimeout(ws.pingTimeout);
      }
    };
    
    ws.once('close', cleanup);
    ws.once('error', cleanup);
  };
  
  return wss;
}

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
import * as reportHandlers from './src/utils/reportFileFixer.js';
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

// Logger Configuration - Simplified
const logger = winston.createLogger({
  level: 'warn', // Default to warn level
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: NODE_ENV !== 'production' }),
    winston.format.splat(),
    winston.format.simple()
  ),
  defaultMeta: { service: 'nexus-backend' },
  transports: [
    new winston.transports.Console()
  ]
});

// Only log startup message if not in test environment
if (process.env.NODE_ENV !== 'test') {
  logger.info(`Nexus run directory structure prepared at ${NEXUS_RUN_DIR}`);
}

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
import { connectDB, closeDB } from './src/config/database.js';

// Set mongoose options
mongoose.set('strictQuery', true);

/**
 * Connect to MongoDB with retry logic and proper error handling
 * @returns {Promise<boolean>} True if connection was successful
 */
async function connectToDatabase() {
  const startTime = Date.now();
  try {
    await connectDB();
    console.log(`Connected to MongoDB in ${Date.now() - startTime}ms`);
    return true;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    
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
// 8. EXPRESS APP & MIDDLEWARE - IN ORDER
// ======================================
// Session configuration with secure settings
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true, // Allow uninitialized sessions for guests
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    domain: process.env.NODE_ENV === 'production' ? 
      (process.env.COOKIE_DOMAIN || '.ondigitalocean.app') : undefined,
    path: '/'  // Ensure cookie is sent for all paths
  },
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 7 * 24 * 60 * 60, // 7 days
    autoRemove: 'interval',
    autoRemoveInterval: 60, // Check for expired sessions every 60 minutes
    collectionName: 'sessions',
    stringify: false,
    touchAfter: 3600, // 1 hour - only update session if it's been modified
    crypto: {
      secret: process.env.SESSION_ENCRYPTION_KEY || 'your-encryption-key'
    }
  }),
  name: 'nexus.sid',
  unset: 'destroy',
  proxy: true, // Trust the reverse proxy (e.g., Nginx, Cloudflare)
  rolling: true, // Reset the cookie maxAge on every request
  saveUninitialized: true, // Save new sessions
  genid: function(req) {
    // Generate guest ID if no user is logged in
    if (!req.session || !req.session.user) {
      return `guest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    }
    return uuidv4(); // Use UUIDs for authenticated session IDs
  }
});

// ======================================
// 8.1 BODY PARSERS (MUST come before any route handlers)
// ======================================
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// ======================================
// 8.2 SESSION MIDDLEWARE
// ======================================
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1); // Trust first proxy
}
app.use(sessionMiddleware);

// ======================================
// 8.3 GUEST SESSION HANDLING
// ======================================
app.use((req, res, next) => {
  // Skip session creation for WebSocket upgrade, API validation, and socket.io requests
  if (req.path === '/api/auth/validate-session' || 
      req.path.startsWith('/socket.io/') || 
      req.headers.upgrade === 'websocket') {
    return next();
  }
  
  // Only create guest session for non-API routes
  if (!req.session.user && !req.path.startsWith('/api/')) {
    req.session.user = `guest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    console.log('Created guest session:', req.session.user);
  }
  next();
});

// Skip logging for 404s on specific endpoints
app.use((req, res, next) => {
  const skipLogging = 
    (req.path === '/api/user/available-engines' && req.method === 'GET' && res.statusCode === 404);
  
  // If we should skip logging, override the end method
  if (skipLogging) {
    const originalEnd = res.end;
    res.end = function (chunk, encoding) {
      res.end = originalEnd;
      return res.end(chunk, encoding);
    };
  }
  
  next();
});

// 8.4 Enhanced CORS Middleware for all environments
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Always allow requests with no origin (like mobile apps or curl requests)
  if (!origin) return next();
  
  // Allow localhost and 127.0.0.1 in development
  const isLocalhost = origin.includes('localhost:') || origin.includes('127.0.0.1:');
  
  // In production, allow any *.ondigitalocean.app subdomain
  if (isProduction || isLocalhost) {
    if (isProduction ? origin.endsWith('.ondigitalocean.app') : true) {
      // Set CORS headers
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID, Cache-Control, Pragma');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID, Cache-Control, Pragma, Content-Range, X-Total-Count');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
      res.setHeader('Vary', 'Origin');
      
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      return next();
    }
  } 
  // In development, allow common localhost origins
  else {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:3420',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:3420',
      `http://${req.headers.host}`,
      `https://${req.headers.host}`
    ];
    
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Range, X-Total-Count, X-Request-ID');
      res.setHeader('Vary', 'Origin');
      
      if (req.method === 'OPTIONS') {
        return res.status(204).end();
      }
      return next();
    }
  }
  
  // If we get here, the origin is not allowed
  if (isProduction) {
    // In production, block unauthorized origins
    return res.status(403).json({ 
      error: 'Not allowed by CORS',
      message: 'The origin is not allowed to access this resource',
      allowedOrigins: []
    });
  }
  
  // 8.5 CSP Middleware - Configured to work with CORS and session configurations
  const cspDirectives = [
    `default-src 'self' data: blob:`,
    `connect-src 'self' ${isAllowedOrigin ? origin : ''} ws: wss: data: blob: ${isProduction ? '' : 'http://localhost:*'}`,
    // Allow WebGL and WebAssembly
    `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' data: blob: https:`,
    // Allow inline styles and external stylesheets
    `style-src 'self' 'unsafe-inline' data: blob: https:`,
    // Allow images and media from any source
    `img-src 'self' data: blob: https: *`,
    // Allow fonts from any source
    `font-src 'self' data: blob: https: *`,
    // Allow media from any source
    `media-src 'self' data: blob: https: *`,
    // Allow WebWorkers
    `worker-src 'self' blob: data: https:`,
    // Allow WebGL and WebGPU contexts
    `child-src 'self' blob: data: https:`,
    // Allow iframes
    `frame-src 'self' data: blob: https:`,
    // Required for WebGL and WebGPU
    `script-src-elem 'self' 'unsafe-inline' 'unsafe-eval' https:`,
    `style-src-elem 'self' 'unsafe-inline' https:`,
    // Allow WebGL and WebGPU
    `worker-src 'self' blob: data:`,
    // Allow WebAssembly
    `wasm-unsafe-eval 'self'`,
    // Allow WebGL and WebGPU
    `require-trusted-types-for 'script'`
  ].join('; ') + ';';
  
  // Set security headers
  res.setHeader('Content-Security-Policy', cspDirectives);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Feature-Policy', "geolocation 'self'; microphone 'none'; camera 'none'");
  
  next();
});

// 8.6 CDN and cookie fixer middleware
// 8.7 Request Logging - only log server errors (5xx) and skip common non-error paths
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url, ip } = req;
  
  // Skip logging for common non-error paths
  const skipPaths = [
    '/api/health',
    '/favicon.ico',
    '/robots.txt',
    '/sitemap.xml',
    '/static/',
    '/assets/',
    '/_next/',
    '/__nextjs_',
    '/_nuxt/'
  ];
  
  if (skipPaths.some(path => url.startsWith(path))) {
    return next();
  }
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    const contentLength = res.get('Content-Length') || 0;
    
    // Log 5xx errors (server errors) and 404s for non-API routes in development
    const shouldLog = 
      statusCode >= 500 || 
      (process.env.NODE_ENV === 'development' && statusCode === 404 && !url.startsWith('/api/'));
    
    if (shouldLog) {
      const logData = {
        method,
        url,
        status: statusCode,
        duration: `${duration}ms`,
        contentLength: contentLength ? `${contentLength}b` : '0b',
        ip,
        userAgent: req.headers['user-agent']
      };
      
      // Use appropriate log level based on status code
      if (statusCode >= 500) {
        logger.error('Server error', logData);
      } else {
        logger.warn('Client error', logData);
      }
    }
  });
  
  next();
});

// ======================================
// 9. SERVER INITIALIZATION
// ======================================

let httpServer;

async function startApp() {
  try {
    // Connect to MongoDB with retry logic
    await pRetry(connectToDatabase, {
      retries: 5,
      minTimeout: 2000,
      onFailedAttempt: error => {
        console.log(`MongoDB connection attempt ${error.attemptNumber} failed. Retrying...`);
      }
    });
    
    console.log('✅ MongoDB connected');
    
    // Clear database and ensure indexes
    await clearDatabaseOnce();
    await ensureIndexes();
    
    // Create HTTP server
    httpServer = createServer(app);
    
    // Initialize WebSocket server with the HTTP server
    const wss = setupWebSocketServer(httpServer);
    
    // Store server instances globally for cleanup
    global.httpServer = httpServer;
    global.wss = wss;
    
    // Get port from environment or use default 3420 for development
    const PORT = process.env.PORT || 3420;
    
    // Handle server errors
    httpServer.on('error', (error) => {
      console.error('HTTP server error:', error);
      if (error.syscall !== 'listen') {
        throw error;
      }
      
      // Handle specific listen errors with friendly messages
      switch (error.code) {
        case 'EACCES':
          console.error(`Port ${PORT} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          console.error(`Port ${PORT} is already in use`);
          process.exit(1);
          break;
        default:
          throw error;
      }
    });
    
    // Handle process termination
    const gracefulShutdown = () => {
      console.log('\n🛑 Shutting down gracefully...');
      
      // Close WebSocket server
      if (wss) {
        console.log('Closing WebSocket server...');
        wss.close(() => {
          console.log('WebSocket server closed');
        });
      }
      
      // Close HTTP server
      if (httpServer) {
        console.log('Closing HTTP server...');
        httpServer.close(() => {
          console.log('HTTP server closed');
          process.exit(0);
        });
      }
      
      // Force exit after timeout
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };
    // Start the server
    return new Promise((resolve, reject) => {
      const HOST = process.env.HOST || '0.0.0.0';  // Default to all interfaces
      
      // Handle server errors
      httpServer.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${PORT} is already in use. Please check for other running instances.`);
          // Try to find and list processes using the port
          require('child_process').exec(`netstat -ano | findstr :${PORT}`, (err, stdout) => {
            if (stdout) {
              console.log('Processes using port:', stdout);
            }
          });
        }
        reject(error);
      });

      httpServer.listen(PORT, HOST, () => {
        const protocol = process.env.NODE_ENV === 'production' ? 'wss' : 'ws';
        const host = process.env.NODE_ENV === 'production' 
          ? process.env.APP_DOMAIN || 'operator-io236.ondigitalocean.app'
          : 'localhost';
        
        // To:
        const wsPath = '/ws';
        const wsUrl = `${protocol}://${host}${process.env.NODE_ENV === 'production' ? '' : `:${PORT}`}${wsPath}`;

        console.log(`\n🚀 Server running on port ${PORT}`);
        console.log(`🌐 WebSocket available at ${wsUrl}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);

        const ROBOT_ICON = '\u001b[38;5;39m🤖\u001b[0m'; // Bright blue robot
        const LAB_ICON = '\u001b[38;5;208m🧪\u001b[0m';   // Orange lab flask
        const GEAR_ICON = '\u001b[38;5;220m⚙️\u001b[0m';   // Yellow gear

        console.log(`\n${ROBOT_ICON}  \u001b[1mO.P.E.R.A.T.O.R - Nexus Server started successfully!\u001b[0m`);
        console.log(`================================`);
        console.log(`${LAB_ICON}  Environment: \u001b[36m${process.env.NODE_ENV || 'development'}\u001b[0m`);
        console.log(`${GEAR_ICON}  Port: \u001b[33m${PORT}\u001b[0m`);
        console.log(`${ROBOT_ICON}  API URL: \u001b[32m${config.apiUrl}\u001b[0m`);
        console.log(`${LAB_ICON}  Frontend URL: \u001b[35m${config.frontendUrl}\u001b[0m`);
        console.log(`${ROBOT_ICON}  WebSocket URL: \u001b[34m${wsUrl}\u001b[0m`);
        console.log(`================================\n`);
        
        // Update config with the correct WebSocket URL
        if (config) {
          config.wsUrl = wsUrl;
        }
        
        // Store the server and WebSocket instances globally for cleanup
        global.httpServer = httpServer;
        global.wss = wss;
        
        resolve(httpServer);
      });
    }).catch(error => {
      console.error('Failed to start server:', error.message);
      if (error.code === 'EADDRINUSE') {
        console.log('\nTo fix this issue, try one of these commands in a new terminal:');
        console.log('1. Kill all Node.js processes: taskkill /F /IM node.exe');
        console.log('2. Or find and kill the specific process using port 3420:');
        console.log('   netstat -ano | findstr :3420');
        console.log('   taskkill /F /PID <PID> (replace <PID> with the process ID from above)');
      }
      process.exit(1);
    });
  } catch (err) {
    console.error('Failed to start application:', err);
    process.exit(1);
  }
}

// ====================================
// 10. ROUTES & MIDDLEWARE
// ======================================
import authRoutes from './src/routes/auth.js';
import taskRoutes from './src/routes/tasks.js';
import billingRoutes from './src/routes/billing.js';
import yamlMapsRoutes from './src/routes/yaml-maps.js';
import userRoutes from './src/routes/user.js';
import historyRouter from './src/routes/history.js';
import customUrlsRouter from './src/routes/customUrls.js';
import settingsRouter from './src/routes/settings.js';
import { requireAuth } from './src/middleware/requireAuth.js';
import messagesRouter from './src/routes/messages.js';
import { setStaticFileHeaders } from './src/middleware/staticAssets.js';
import serveStaticAssets from './src/middleware/staticAssets.js';

// 1. API ROUTES (must come before static files and catch-all)
// =================================================
app.use('/api/yaml-maps', yamlMapsRoutes);

// Authentication guard middleware
/*
const guard = (req, res, next) => {
  // Skip authentication for static files and login page
  if (
    req.path === '/api/health' ||
    req.path.startsWith('/css/') || 
    req.path.startsWith('/assets/') ||
    req.path.startsWith('/js/') ||
    req.path.startsWith('/images/') ||
    req.path.endsWith('.css') ||
    req.path.endsWith('.js') ||
    req.path.endsWith('.png') ||
    req.path.endsWith('.jpg') ||
    req.path.endsWith('.jpeg') ||
    req.path.endsWith('.gif') ||
    req.path.endsWith('.svg') ||
    req.path.endsWith('.woff') ||
    req.path.endsWith('.woff2') ||
    req.path.endsWith('.ttf') ||
    req.path.endsWith('.eot') ||
    req.path === '/login.html' ||
    req.path === '/'
  ) {
    return next();
  }
  
  // Require authentication for all other routes
  if (!req.session.user) {
    return res.redirect('/login.html');
  }
  next();
};
*/

// ======================================
// 2. API ROUTES
// =================================================

// Public API routes (no auth required)
app.use('/api/auth', authRoutes);


// API: Who Am I (userId sync endpoint) - Moved to robust implementation below

// Protected API routes (require authentication)
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/history', requireAuth, historyRouter);
app.use('/api/tasks', requireAuth, taskRoutes);
app.use('/api/custom-urls', requireAuth, customUrlsRouter);
app.use('/api/yaml-maps', requireAuth, yamlMapsRoutes);
app.use('/api/billing', requireAuth, billingRoutes);
app.use('/api/user', requireAuth, userRoutes);
app.use('/api/messages', requireAuth, messagesRouter);

// ======================================
// 2. API ROUTES (must come before static files)
// ======================================

// NLI API endpoint - Handles both chat and task classification
app.get('/api/nli', requireAuth, async (req, res) => {
  // Get user ID from session first thing
  const userId = req.session.user;
  const prompt = req.query.prompt;
  const requestedEngine = req.query.engine || req.session.browserEngine;
  
  if (typeof prompt !== 'string' || !prompt.trim()) {
    res.status(400).json({ success: false, error: 'Prompt query parameter is required.' });
    return;
  }
  
  // If engine is specified, validate it
  if (requestedEngine) {
    const validEngines = ['gpt-4o', 'qwen-2.5-vl-72b', 'gemini-2.5-pro', 'ui-tars'];
    if (!validEngines.includes(requestedEngine)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid engine specified'
      });
    }
    
    // Store the selected browser engine in the session for future browser automation tasks
    req.session.browserEngine = requestedEngine;
    console.log(`[NLI] Updated browser engine to: ${requestedEngine} (this only affects automation tasks, not chat)`);
    
    // Check if the user has access to this engine
    const keyInfo = await checkEngineApiKey(userId, requestedEngine);
    
    if (!keyInfo.hasKey) {
      return res.status(400).json({
        success: false,
        error: `No API key available for ${requestedEngine}. Please configure one in Settings.`,
        keyInfo
      });
    }
    
    // If using default key, notify the user
    if (keyInfo.usingDefault) {
      notifyApiKeyStatus(userId, keyInfo);
    }
  }
  
  // IMPORTANT: Clean up old tempEngine from session if it exists
  // This ensures complete separation between chat and browser automation
  if (req.session.tempEngine) {
    console.log(`[NLI] Removing deprecated tempEngine=${req.session.tempEngine} from session`);
    // If we have tempEngine but no browserEngine, migrate it
    if (!req.session.browserEngine) {
      req.session.browserEngine = req.session.tempEngine;
      console.log(`[NLI] Migrated tempEngine to browserEngine=${req.session.browserEngine}`);
    }
    // Remove the old variable
    delete req.session.tempEngine;
    req.session.save();
  }
  
  // classify prompt
  let classification;
  try {
    classification = await openaiClassifyPrompt(prompt, userId);
  } catch (err) {
    console.error('Classification error', err);
    classification = 'chat';
  }

  // Fetch user document (needed for multiple code paths)
  const userDoc = await User.findById(userId).lean();
  const userEmail = userDoc?.email;
  
  if (classification === 'task') {
    // Set headers for SSE (Server-Sent Events)
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.flushHeaders();
    
    // Persist user command in chat history
    let chatHistory = await ChatHistory.findOne({ userId }) || new ChatHistory({ userId, messages: [] });
    chatHistory.messages.push({ role: 'user', content: prompt, timestamp: new Date() });
    await chatHistory.save();
    
    // Create task
    const taskId = new mongoose.Types.ObjectId();
    const runId  = uuidv4();
    const runDir = path.join(NEXUS_RUN_DIR, runId);
    fs.mkdirSync(runDir, { recursive: true });
    
    // Map engine to provider for execution mode determination
    const engineToProvider = {
      'gpt-4o': 'openai',
      'qwen-2.5-vl-72b': 'qwen',
      'gemini-2.5-pro': 'google',
      'ui-tars': 'uitars'
    };
    
    // Get user's execution mode preference 
    const executionModePreference = userDoc.settings?.executionMode || 'step-planning';
    
    // Determine current engine and provider
    const engine = req.session.browserEngine || 'gpt-4o'; // Default to gpt-4o if not specified
    const provider = engineToProvider[engine] || 'openai';
    
    // Determine actual execution mode based on rules
    const executionMode = determineExecutionMode(provider, prompt, executionModePreference);
    console.log(`[Task] Using execution mode: ${executionMode} for provider: ${provider} (engine: ${engine})`);
    
    // Save task to database
    await new Task({ 
      _id: taskId, 
      userId, 
      command: prompt, 
      status: 'pending', 
      progress: 0, 
      startTime: new Date(), 
      runId,
      executionMode,
      engine
    }).save();
    
    // Update user's active tasks
    await User.updateOne({ _id: userId }, { 
      $push: { 
        activeTasks: { 
          _id: taskId.toString(), 
          command: prompt, 
          status: 'pending', 
          startTime: new Date(),
          executionMode,
          engine
        } 
      } 
    });
    
    // Send task start event
    res.write('data: ' + JSON.stringify({ 
      event: 'taskStart', 
      payload: { 
        taskId: taskId.toString(), 
        command: prompt, 
        startTime: new Date() 
      } 
    }) + '\n\n');
    
    // Start task processing
    processTask(userId, userEmail, taskId.toString(), runId, runDir, prompt, null, null)
      .catch(err => {
        console.error('Error in processTask:', err);
        res.write('data: ' + JSON.stringify({ 
          event: 'taskError', 
          taskId: taskId.toString(), 
          error: 'Error processing task' 
        }) + '\n\n');
      });
      
    // Poll for task updates
    const interval = setInterval(async () => {
      try {
        const task = await Task.findById(taskId).lean();
        if (!task) {
          clearInterval(interval);
          res.write('data: ' + JSON.stringify({ 
            event: 'taskError', 
            taskId: taskId.toString(), 
            error: 'Task not found' 
          }) + '\n\n');
          return res.end();
        }
        
        const done = ['completed', 'error'].includes(task.status);
        const evtName = done ? 'taskComplete' : 'stepProgress';
        
        // For completed tasks, ensure all report links are included in the payload
        let resultWithLinks = task.result || {};
        if (done) {
          // Guarantee all report URLs are present by providing fallbacks
          resultWithLinks = {
            ...resultWithLinks,
            landingReportUrl: resultWithLinks.landingReportUrl || resultWithLinks.runReport || null,
            nexusReportUrl: resultWithLinks.nexusReportUrl || null,
            runReport: resultWithLinks.runReport || resultWithLinks.landingReportUrl || null,
            reportUrl: resultWithLinks.reportUrl || resultWithLinks.nexusReportUrl || 
                      resultWithLinks.landingReportUrl || resultWithLinks.runReport || 
                      (resultWithLinks.screenshot ? resultWithLinks.screenshot : null)
          };
          
          console.log(`[TaskCompletion] Enhanced data for task ${taskId}:`, {
            landingReportUrl: resultWithLinks.landingReportUrl,
            nexusReportUrl: resultWithLinks.nexusReportUrl,
            reportUrl: resultWithLinks.reportUrl
          });
        }
        
        // Send update
        res.write('data: ' + JSON.stringify({
          event: evtName,
          payload: {
            taskId: taskId.toString(),
            status: task.status,
            progress: task.progress || 0,
            result: resultWithLinks,
            timestamp: new Date()
          }
        }) + '\n\n');
        
        // If task is done, clean up and close the connection
        if (done) {
          clearInterval(interval);
          // Give some time for the last message to be sent
          setTimeout(() => res.end(), 100);
        }
      } catch (err) {
        console.error('Error polling task status:', err);
        clearInterval(interval);
        res.write('data: ' + JSON.stringify({
          event: 'taskError',
          taskId: taskId.toString(),
          error: 'Error checking task status'
        }) + '\n\n');
        res.end();
      }
    }, 1000); // Poll every second
  } else {
    // Handle chat response
    try {
      // Set headers for streaming
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      res.flushHeaders();
      
      // Stream the response
      for await (const event of streamNliThoughts(userId, prompt)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        // @ts-ignore
        if (typeof res.flush === 'function') {
          // @ts-ignore
          res.flush();
        }
      }
      
      res.end();
    } catch (error) {
      console.error('Error in NLI streaming:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Error generating response' });
      } else {
        res.write('data: ' + JSON.stringify({
          event: 'error',
          content: 'An error occurred while generating the response.'
        }) + '\n\n');
        res.end();
      }
    }
  }
});


app.post('/api/nli', requireAuth, async (req, res) => {
  // Accept both { prompt } and legacy { inputText }
  let prompt = req.body.prompt;
  if (!prompt && req.body.inputText) {
    prompt = req.body.inputText;
    console.debug('[DEBUG] /nli: Using legacy inputText as prompt:', prompt);
  }
  if (typeof prompt !== 'string') {
    console.error('[ERROR] /nli: Prompt must be a string. Got:', typeof prompt, prompt);
    return res.status(400).json({ success: false, error: 'Prompt must be a string.' });
  }

  // Sanitize and validate prompt
  prompt = prompt.trim();
  if (prompt.length === 0) {
    console.error('[ERROR] /nli: Prompt is empty after trim.');
    return res.status(400).json({ success: false, error: 'Prompt cannot be empty.' });
  }
  const MAX_PROMPT_LENGTH = 5000;
  if (prompt.length > MAX_PROMPT_LENGTH) {
    console.error(`[ERROR] /nli: Prompt too long (${prompt.length} chars). Max is ${MAX_PROMPT_LENGTH}.`);
    return res.status(400).json({ success:false, error: `Prompt too long (max ${MAX_PROMPT_LENGTH} chars).` });
  }

  const userId = req.session.user;
  const user   = await User.findById(userId).select('email openaiApiKey').lean();
  if (!user) return res.status(400).json({ success: false, error: 'User not found' });

  let classification;
  try {
    classification = await openaiClassifyPrompt(prompt, userId);
  } catch (err) {
    console.error('Classification error', err);
    classification = 'task';
  }

  if (classification === 'task') {
    // fetch user for email
    const userDoc = await User.findById(userId).lean();
    const userEmail = userDoc?.email;
    // persist user in chat history
    let chatHistory = await ChatHistory.findOne({ userId }) || new ChatHistory({ userId, messages: [] });
    chatHistory.messages.push({ role: 'user', content: prompt, timestamp: new Date() });
    await chatHistory.save();

    const taskId = new mongoose.Types.ObjectId();
    const runId  = uuidv4();
    const runDir = path.join(NEXUS_RUN_DIR, runId);
    fs.mkdirSync(runDir, { recursive: true });

    // … save Task + push to User.activeTasks …
    await new Task({ _id: taskId, userId, command: prompt, status: 'pending', progress: 0, startTime: new Date(), runId }).save();
    await User.updateOne({ _id: userId }, { $push: { activeTasks: { _id: taskId.toString(), command: prompt, status: 'pending', startTime: new Date() } } });

    sendWebSocketUpdate(userId, { event: 'taskStart', payload: { taskId: taskId.toString(), command: prompt, startTime: new Date() } });
    
    // CRITICAL FIX: Always provide a valid default URL for tasks initiated through NLI route
    // This ensures thought bubbles are handled correctly as with direct task execution
    const defaultUrl = "https://www.google.com";
    processTask(userId, userEmail, taskId.toString(), runId, runDir, prompt, defaultUrl, null);
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.flushHeaders();
    res.write('data: ' + JSON.stringify({ event: 'taskStart', payload: { taskId: taskId.toString(), command: prompt, startTime: new Date() } }) + '\n\n');
    // poll for updates
    const interval = setInterval(async () => {
      try {
        const task = await Task.findById(taskId).lean();
        if (!task) {
          clearInterval(interval);
          res.write('data: ' + JSON.stringify({ event: 'taskError', taskId: taskId.toString(), error: 'Task not found' }) + '\n\n');
          return res.end();
        }
        const done = ['completed','error'].includes(task.status);
        const evtName = done ? 'taskComplete' : 'stepProgress';
        const payload = { taskId: taskId.toString(), progress: task.progress, result: task.result, error: task.error };
        res.write('data: ' + JSON.stringify({ event: evtName, ...payload }) + '\n\n');
        if (done) {
          clearInterval(interval);
          return res.end();
        }
      } catch (err) {
        console.error('Task polling error:', err);
      }
    }, 2000);
    req.on('close', () => clearInterval(interval));
  } else {
    // chat streaming
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });
    res.flushHeaders();
    for await (const evt of streamNliThoughts(userId, prompt)) {
      res.write('data: ' + JSON.stringify(evt) + '\n\n');
    }
    res.end();
  }
});

// ======================================
// 3. STATIC ASSETS (served last, after all API routes)
// ======================================

// Special handling for model files in development
if (NODE_ENV !== 'production') {
  // In development, only serve backend assets
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
  
  // In development, don't serve static frontend files - let Vite handle them
  console.log('[Dev] Running in development mode - Vite will serve frontend assets');
} else {
  // In production, serve static files from dist and public
  app.use(express.static(path.join(__dirname, 'dist'), {
    index: false,
    setHeaders: setStaticFileHeaders
  }));
  
  app.use(express.static(path.join(__dirname, 'public'), {
    index: false,
    setHeaders: setStaticFileHeaders
  }));
}

// ======================================
// 4. APPLICATION ROUTES (HTML routes)
// ======================================

// Serve index.html for root route with authentication check
app.get('/', (req, res) => {
  // In development, if we're in a container with Vite running on port 3000
  if (process.env.NODE_ENV === 'development' && process.env.DOCKER === 'true') {
    // In container, Vite is on the same host but different port
    console.log('[Docker Dev] Redirecting to Vite dev server for root route');
    return res.redirect('http://localhost:3000');
  }
  
  // In production, serve index.html from dist
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

// Serve other HTML pages with authentication
const pages = ['history', 'guide', 'settings'];
pages.forEach(page => {
  app.get(`/${page}.html`, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', `${page}.html`));
  });
});

// Favicon
app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/assets/images/dail-fav.png'));
});


// 2. STATIC FILES (must come before authentication)
// =================================================
// In development, we don't serve static files from the backend
// as they are handled by Vite dev server on port 3000
if (process.env.NODE_ENV !== 'development') {
  // Serve static files from dist in production
  app.use(express.static(path.join(__dirname, 'dist'), {
    setHeaders: (res, path) => {
      // Set CORS headers for all static files
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Set proper content type based on file extension
      const ext = path.split('.').pop().toLowerCase();
      if (ext === 'css') {
        res.setHeader('Content-Type', 'text/css');
      } else if (ext === 'js') {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) {
        res.setHeader('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`);
      }
    }
  }));
  
  // Serve webfonts from public/webfonts with correct MIME types
  app.use('/webfonts', express.static(path.join(__dirname, 'public', 'webfonts'), {
    setHeaders: (res, filePath) => {
      // Set appropriate content type based on file extension
      const ext = path.extname(filePath).toLowerCase().substring(1);
      if (ext === 'woff2') {
        res.setHeader('Content-Type', 'font/woff2');
      } else if (ext === 'woff') {
        res.setHeader('Content-Type', 'font/woff');
      } else if (ext === 'ttf') {
        res.setHeader('Content-Type', 'font/ttf');
      } else if (ext === 'eot') {
        res.setHeader('Content-Type', 'application/vnd.ms-fontobject');
      } else if (ext === 'svg') {
        res.setHeader('Content-Type', 'image/svg+xml');
      }
      // Add caching headers
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  }));

  // Serve public directory for other static assets with proper MIME types
  app.use(express.static(path.join(__dirname, 'public'), {
    setHeaders: (res, filePath) => {
      // Set proper content type based on file extension
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.svg') {
        res.setHeader('Content-Type', 'image/svg+xml');
      } else if (ext === '.css') {
        res.setHeader('Content-Type', 'text/css');
      } else if (ext === '.js') {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
        res.setHeader('Content-Type', `image/${ext.slice(1)}`);
      } else if (ext === '.ico') {
        res.setHeader('Content-Type', 'image/x-icon');
      }
    }
  }));
  
  // Serve CSS files from dist/css and its subdirectories
  app.use('/css', express.static(path.join(__dirname, 'dist', 'css'), {
    setHeaders: (res, filePath) => {
      // Only set Content-Type for CSS files
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (filePath.endsWith('.svg')) {
        res.setHeader('Content-Type', 'image/svg+xml');
      }
    },
    // Enable directory listing to serve files from subdirectories
    index: false,
    redirect: false
  }));
  
  // Serve static files from dist directory with proper MIME types
  app.use(express.static(path.join(__dirname, 'dist'), {
    setHeaders: (res, filePath) => {
      // Set proper content type based on file extension
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.css') {
        res.setHeader('Content-Type', 'text/css');
      } else if (ext === '.svg') {
        res.setHeader('Content-Type', 'image/svg+xml');
      } else if (ext === '.js') {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
        res.setHeader('Content-Type', `image/${ext.slice(1)}`);
      } else if (ext === '.ico') {
        res.setHeader('Content-Type', 'image/x-icon');
      }
    }
  }));
  
  console.log('Serving static files from:', path.join(__dirname, 'dist'));
}

// ======================================
// 8.4 REPORT SERVING MIDDLEWARE
// ======================================
// Set up report serving and redirector middleware
// This must be after static file serving to ensure proper routing
reportHandlers.setupReportServing(app);
reportHandlers.setupReportRedirector(app);
console.log('Report serving middleware initialized');

// Serve nexus_run directory with proper caching
app.use('/nexus_run', express.static(NEXUS_RUN_DIR, {
  setHeaders: (res, path) => {
    // Ensure proper caching for static files
    res.setHeader('Cache-Control', 'public, max-age=31536000');
  }
}));

// Legacy redirect for midscene_run -> nexus_run
app.use('/midscene_run', (req, res) => {
  const subPath = req.path;
  const newPath = `/nexus_run${subPath}`;
  res.redirect(301, newPath);
});


// =====================================================
// 3. 404 & SPA Catch All HANDLERS 
// ====================================================
// 404 handler for API routes (must come after all other routes but before error handlers)
// API 404 handler - will be moved to the end of the file
const api404Handler = (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
};

// SPA Catch-All Route - will be moved to the end of the file
const spaCatchAll = (req, res, next) => {
  // Skip API routes and files with extensions
  if (req.path.startsWith('/api/') || req.path.match(/\.[a-z0-9]+$/i)) {
    return next();
  }
  
  // In containerized development, redirect to Vite dev server for frontend routes
  if (process.env.NODE_ENV === 'development' && process.env.DOCKER === 'true') {
    const viteUrl = `http://localhost:3000${req.path}`;
    console.log(`[Docker Dev] Redirecting to Vite dev server: ${viteUrl}`);
    return res.redirect(viteUrl);
  }
  
  // In production, serve index.html from dist
  res.sendFile(path.join(__dirname, 'dist', 'index.html'), {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Content-Type-Options': 'nosniff'
    }
  });
};

// 404 handler - will be moved to the end of the file
const html404Handler = (req, res) => {
  // In development, let the frontend handle 404s
  if (process.env.NODE_ENV === 'development' && process.env.DOCKER === 'true') {
    return res.redirect(`http://localhost:3000${req.path}`);
  }
  
  if (req.accepts('html')) {
    const errorPage = path.join(__dirname, 'dist', '404.html');
    if (fs.existsSync(errorPage)) {
      return res.status(404).sendFile(errorPage);
    }
    return res.status(404).send('Page not found');
  } else if (req.accepts('json')) {
    return res.status(404).json({ error: 'Not Found' });
  } else {
    return res.status(404).type('txt').send('Not Found');
  }
};

// Error handler 1 - will be moved to the end of the file
const errorHandler1 = (err, req, res, next) => {
  // If headers have already been sent, delegate to the default Express error handler
  if (res.headersSent) {
    return next(err);
  }
  
  logger.error(`Unhandled error: ${err.stack}`);
  
  // Set the response status code
  const statusCode = err.statusCode || 500;
  
  // Send JSON response
  res.status(statusCode).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// Error handler 2 - will be moved to the end of the file
const errorHandler2 = (err, req, res, next) => {
  // If headers have already been sent, delegate to the default Express error handler
  if (res.headersSent) {
    return next(err);
  }

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
  const errorResponse = process.env.NODE_ENV === 'production' 
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
};

// ======================================
// 10.a START THE SERVER
// ======================================

// Start the application
  startApp().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });


// ======================================
// 10.b DATABASE MANAGEMENT
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

/**
 * Get or create a browser session with proper error handling and recovery
 * @param {string} taskId - Task ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Browser session object
 */
async function getOrCreateBrowserSession(taskId, userId) {
  const sessionKey = `${userId}:${taskId}`;
  
  // Check if we have a valid existing session
  const existingSession = activeBrowsers.get(sessionKey);
  if (existingSession) {
    try {
      // Verify the session is still valid and browser is connected
      if (existingSession.browser && existingSession.browser.isConnected()) {
        const pages = await existingSession.browser.pages();
        if (pages && pages.length >= 0) {
          existingSession.lastActivity = Date.now();
          logger.debug(`[BrowserSession] Reusing existing session for task ${taskId}`);
          return existingSession;
        }
      }
    } catch (error) {
      logger.warn(`[BrowserSession] Existing session invalid (${error.message}), creating new one`);
      await cleanupBrowserSession(sessionKey).catch(e => 
        logger.error('Error during session cleanup:', e)
      );
    }
  }

  // Acquire semaphore to limit concurrent browsers
  let release;
  try {
    release = await browserSemaphore.acquire();
    logger.debug(`[BrowserSession] Acquired semaphore for task ${taskId}`);
  } catch (error) {
    logger.error(`[BrowserSession] Failed to acquire semaphore for task ${taskId}:`, error);
    throw new Error('Server busy. Please try again later.');
  }
  
  try {
    // Double check if another request created a session while we were waiting
    const currentSession = activeBrowsers.get(sessionKey);
    if (currentSession) {
      logger.debug(`[BrowserSession] Found new session created by another request for task ${taskId}`);
      release();
      return currentSession;
    }

    logger.info(`[BrowserSession] Launching new browser for task ${taskId}`);
    const launchOptions = await getPuppeteerLaunchOptions();
    
    // Add additional debugging for launch options
    logger.debug('[BrowserSession] Launch options:', {
      headless: launchOptions.headless,
      args: launchOptions.args.filter(arg => !arg.includes('--disable-dev-shm-usage')),
      executablePath: launchOptions.executablePath
    });

    // Add Stealth plugin to avoid detection
    puppeteerExtra.use(StealthPlugin());
    
    // Add timeout to browser launch
    const browserLaunchTimeout = 30000; // 30 seconds
    
    // Launch browser with timeout
    let browser;
    try {
      const launchPromise = puppeteerExtra.launch({
        ...launchOptions,
        timeout: browserLaunchTimeout,
        // Ensure we're using the correct executable path
        executablePath: launchOptions.executablePath || undefined,
        // Force new browser instance
        ignoreDefaultArgs: ['--disable-extensions'],
        // Additional stability args
        args: [
          ...(launchOptions.args || []),
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-web-security',
          '--disable-site-isolation-trials'
        ].filter(Boolean),
        // Disable default viewport to prevent extra memory usage
        defaultViewport: null
      });
      
      // Add timeout to browser launch
      browser = await Promise.race([
        launchPromise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Browser launch timed out')), browserLaunchTimeout)
        )
      ]);
      
      logger.info(`[BrowserSession] Successfully launched browser for task ${taskId}`);
    } catch (error) {
      logger.error(`[BrowserSession] Failed to launch browser for task ${taskId}:`, error);
      throw new Error(`Failed to start browser: ${error.message}`);
    }
    
    // Create a new session object with proper cleanup
    const session = {
      browser,
      page: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      taskId,
      userId,
      hasReleased: false,
      closing: false,
      release: () => {
        if (!session.hasReleased) {
          logger.debug(`[BrowserSession] Releasing semaphore for task ${taskId}`);
          session.hasReleased = true;
          release();
        }
      },
      close: async () => {
        if (session.closing) return;
        session.closing = true;
        
        logger.info(`[BrowserSession] Closing session for task ${taskId}`);
        try {
          if (session.page && typeof session.page.close === 'function' && !session.page.isClosed()) {
            await session.page.close().catch(e => 
              logger.error(`[BrowserSession] Error closing page for task ${taskId}:`, e)
            );
          }
          if (session.browser && session.browser.isConnected()) {
            await session.browser.close().catch(e => 
              logger.error(`[BrowserSession] Error closing browser for task ${taskId}:`, e)
            );
          }
        } finally {
          session.release();
          activeBrowsers.delete(sessionKey);
          logger.info(`[BrowserSession] Session closed for task ${taskId}`);
        }
      },
      // Helper method to create a new page with error handling
      newPage: async () => {
        try {
          const page = await browser.newPage();
          session.page = page;
          
          // Add basic error handling to the page
          page.on('error', error => {
            logger.error(`[BrowserSession] Page error in task ${taskId}:`, error);
          });
          
          // Log page creation for debugging
          logger.debug(`[BrowserSession] Created new page for task ${taskId}`);
          return page;
        } catch (error) {
          logger.error(`[BrowserSession] Failed to create page for task ${taskId}:`, error);
          throw new Error(`Failed to create new page: ${error.message}`);
        }
      }
    };

    // Store the session
    activeBrowsers.set(sessionKey, session);
    logger.info(`[BrowserSession] New session created for task ${taskId}, total active sessions: ${activeBrowsers.size}`);
    
    // Set up cleanup on browser close
    browser.once('disconnected', () => {
      logger.info(`[BrowserSession] Browser disconnected for task ${taskId}`);
      cleanupBrowserSession(sessionKey).catch(e => 
        logger.error('Error in browser disconnect handler:', e)
      );
    });

    return session;
  } catch (error) {
    logger.error(`[BrowserSession] Failed to create browser session for task ${taskId}:`, error);
    
    // Ensure we always release the semaphore on error
    if (release && typeof release === 'function') {
      release();
    }
    
    // Rethrow with more context
    const errorMessage = error.message || 'Unknown error creating browser session';
    throw new Error(`Browser session creation failed: ${errorMessage}`);
  }
}

/**
 * Clean up browser session
 * @param {string} sessionKeyOrTaskId - Either a session key (userId:taskId) or just taskId for backward compatibility
 */
async function cleanupBrowserSession(sessionKeyOrTaskId) {
  // Check if this is a full session key (userId:taskId) or just taskId
  const sessionKey = sessionKeyOrTaskId.includes(':') 
    ? sessionKeyOrTaskId 
    : Array.from(activeBrowsers.keys()).find(key => key.endsWith(`:${sessionKeyOrTaskId}`)) || sessionKeyOrTaskId;

  const session = activeBrowsers.get(sessionKey);
  if (!session) {
    logger.debug(`[BrowserSession] No active session found for ${sessionKeyOrTaskId}`);
    return;
  }

  // Mark session as closing to prevent multiple cleanups
  if (session.closing) {
    logger.debug(`[BrowserSession] Session ${sessionKey} is already being closed`);
    return;
  }
  session.closing = true;

  logger.info(`[BrowserSession] Cleaning up session ${sessionKey}`);
  
  try {
    // Close page if it exists and is not already closed
    if (session.page && typeof session.page.close === 'function' && !session.page.isClosed()) {
      try {
        await session.page.close();
        logger.debug(`[BrowserSession] Closed page for session ${sessionKey}`);
      } catch (error) {
        logger.error(`[BrowserSession] Error closing page for session ${sessionKey}:`, error);
      }
    }

    // Close browser if it exists and is connected
    if (session.browser && typeof session.browser.close === 'function' && session.browser.isConnected()) {
      try {
        await session.browser.close();
        logger.debug(`[BrowserSession] Closed browser for session ${sessionKey}`);
      } catch (error) {
        logger.error(`[BrowserSession] Error closing browser for session ${sessionKey}:`, error);
      }
    }

    // Call release function if it exists and hasn't been called yet
    if (typeof session.release === 'function' && !session.hasReleased) {
      try {
        await session.release();
        session.hasReleased = true;
        logger.debug(`[BrowserSession] Released resources for session ${sessionKey}`);
      } catch (error) {
        logger.error(`[BrowserSession] Error releasing resources for session ${sessionKey}:`, error);
      }
    }
  } catch (error) {
    logger.error(`[BrowserSession] Error during cleanup of session ${sessionKey}:`, error);
  } finally {
    // Always remove from active sessions, even if cleanup failed
    activeBrowsers.delete(sessionKey);
    logger.info(`[BrowserSession] Session ${sessionKey} cleanup completed`);
  }
}

// Add cleanup handler to process termination events
process.on('SIGTERM', async () => {
  console.log('SIGTERM received - cleaning up browser sessions');
  for (const [taskId] of activeBrowsers) {
    await cleanupBrowserSession(taskId);
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT received - cleaning up browser sessions');
  for (const [taskId] of activeBrowsers) {
    await cleanupBrowserSession(taskId);
  }
  process.exit(0);
});

// Set up session health monitoring
const browserSessionHeartbeat = setInterval(async () => {
  logger.debug(`[BrowserSession] Running heartbeat check on ${activeBrowsers.size} active browser sessions`);
  const cleanupPromises = [];
  const now = Date.now();
  
  for (const [sessionKey, session] of activeBrowsers.entries()) {
    try {
      // Skip if session is already marked for cleanup
      if (!session || session.closed || session.hasReleased) {
        cleanupPromises.push(cleanupBrowserSession(sessionKey));
        continue;
      }
      
      // Check for inactive sessions (30 minutes of inactivity)
      const inactiveFor = now - (session.lastActivity || 0);
      if (inactiveFor > 30 * 60 * 1000) {
        logger.info(`[BrowserSession] Cleaning up inactive browser session ${sessionKey} (inactive for ${Math.floor(inactiveFor / 1000 / 60)}m)`);
        cleanupPromises.push(cleanupBrowserSession(sessionKey));
        continue;
      }
      
      // Verify browser is still responsive
      try {
        const pages = await session.browser.pages().catch(() => []);
        if (!pages || pages.length === 0) {
          logger.warn(`[BrowserSession] Browser session ${sessionKey} has no pages, cleaning up`);
          cleanupPromises.push(cleanupBrowserSession(sessionKey));
        }
      } catch (error) {
        logger.warn(`[BrowserSession] Browser session ${sessionKey} is not responsive:`, error.message);
        cleanupPromises.push(cleanupBrowserSession(sessionKey));
      }
    } catch (error) {
      logger.error(`[BrowserSession] Error checking session ${sessionKey}:`, error);
      cleanupPromises.push(cleanupBrowserSession(sessionKey));
    }
  }
  
  // Wait for all cleanups to complete
  if (cleanupPromises.length > 0) {
    await Promise.allSettled(cleanupPromises);
  }
}, 5 * 60 * 1000); // Check every 5 minutes


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
    if (global.wss || wss) {
      const wsServer = global.wss || wss;
      logger.info('Closing WebSocket server...');
      
      try {
        // Close all active WebSocket connections
        if (wsServer.clients) {
          wsServer.clients.forEach(client => {
            try {
              if (client.readyState === WebSocket.OPEN) {
                client.terminate();
              }
            } catch (err) {
              logger.error('Error terminating WebSocket client:', err);
            }
          });
        }
        
        // Close the WebSocket server
        await new Promise((resolve) => {
          if (wsServer.close) {
            wsServer.close(() => {
              logger.info('WebSocket server closed');
              resolve();
            });
          } else {
            resolve();
          }
        });
      } catch (error) {
        logger.error('Error during WebSocket server cleanup:', error);
      }
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
// 12. HELPER FUNCTIONS
// ======================================

/**
 * Sleep for a specified number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/**
 * Shared function for saving task completion messages consistently
 * This ensures that all task completions use the same format and logic
 * regardless of how they were triggered (natural completion or forced)
 */
async function saveTaskCompletionMessages(userId, taskId, prompt, contentText, aiSummary, meta = {}) {
  try {
    console.log(`[Task ${taskId}] Saving task completion messages with consistent formatting`);
    
    // CRITICAL CHANGE: Prioritize aiSummary for the message content when available
    // This ensures we're always using the richest possible summary
    let completeMessage = aiSummary || contentText;
    
    // Add report URLs if available
    let reportInfo = [];
    if (meta.nexusReportUrl) reportInfo.push(`Analysis Report: ${meta.nexusReportUrl}`);
    if (meta.landingReportUrl) reportInfo.push(`Landing Page Report: ${meta.landingReportUrl}`);
    
    // Only append report URLs if they're not already included in the summary
    if (reportInfo.length > 0 && !completeMessage.includes('Task Reports Available')) {
      completeMessage += '\n\nTask Reports Available:\n- ' + reportInfo.join('\n- ');
    }
    
    // Add task prompt if not already included in the summary
    if (!completeMessage.toLowerCase().includes(prompt.toLowerCase().substring(0, 20))) {
      completeMessage = `Task: "${prompt}"\n\n${completeMessage}`;
    }
    
    console.log(`[Task ${taskId}] Using rich AI summary for task completion: ${completeMessage.substring(0, 100)}...`);
    
    // Save to ChatHistory
    let taskChatHistory = await ChatHistory.findOne({ userId });
    if (!taskChatHistory) taskChatHistory = new ChatHistory({ userId, messages: [] });
    
    taskChatHistory.messages.push({
      role: 'assistant',
      content: completeMessage,
      timestamp: new Date(),
      meta: {
        taskId,
        type: 'command'
      }
    });
    
    await taskChatHistory.save();
    console.log(`[Task ${taskId}] Updated ChatHistory with rich AI summary`);
    
    // Save to Message collection with full metadata
    await Message.create({
      userId,
      role: 'assistant',
      type: 'command',
      content: completeMessage,
      taskId,
      timestamp: new Date(),
      meta: {
        // Always include the AI summary for future reference
        summary: aiSummary || completeMessage,
        // Include all the metadata passed in
        ...meta
      }
    });
    
    console.log(`[Task ${taskId}] Saved consistent task completion message with rich AI summary and reports`);
    return true;
  } catch (error) {
    console.error(`[Task ${taskId}] Error saving task completion messages:`, error);
    return false;
  }
}

// --- WebSocket helper functions ---
async function sendWebSocketUpdate(userId, data) {
  // Only send WebSocket updates for streaming events; skip chat HTTP replies
  if (!data.event) {
    console.debug('[WebSocket] Skipped non-event data over WS:', data);
    return;
  }

  const connections = userConnections.get(userId);
  const connectionCount = connections ? connections.size : 0;
  /*
  console.log(`[WebSocket] Sending update to userId=${userId}`, {
    event: data.event,
    connectionCount,
    hasConnections: connectionCount > 0,
    timestamp: new Date().toISOString()
  });
  */

  if (connections && connections.size > 0) {
    let successfulSends = 0;
    let failedSends = 0;
    let closedConnections = 0;

    connections.forEach((ws, index) => {
      const connectionInfo = {
        connectionIndex: index,
        readyState: ws.readyState,
        isOpen: ws.readyState === WebSocket.OPEN, // Use WebSocket.OPEN constant
        connectionDuration: ws.connectedAt ? `${(new Date() - ws.connectedAt) / 1000}s` : 'unknown'
      };

      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(data));
          successfulSends++;
          /*
          console.debug(`[WebSocket] Successfully sent to userId=${userId}`, {
            ...connectionInfo,
            eventType: data.event,
            dataSize: JSON.stringify(data).length
          });
          */
        } catch (error) {
          failedSends++;
          console.error(`[WebSocket] Failed to send to userId=${userId}`, {
            ...connectionInfo,
            error: error.toString(),
            stack: error.stack
          });
        }
      } else {
        closedConnections++;
        console.warn(`[WebSocket] Skipping closed connection for userId=${userId}`, connectionInfo);
      }
    });
    /*
    console.log(`[WebSocket] Send summary for userId=${userId}`, {
      totalConnections: connections.size,
      successfulSends,
      failedSends,
      closedConnections,
      timestamp: new Date().toISOString()
    });
    */
  } else {
    console.log(`[WebSocket] No active connections for userId=${userId}. Queuing message.`);
    if (!unsentMessages.has(userId)) {
      unsentMessages.set(userId, []);
      console.log(`[WebSocket] Created new message queue for userId=${userId}`);
    }
    
    const queue = unsentMessages.get(userId);
    queue.push(data);
    
    console.log(`[WebSocket] Queued message for userId=${userId}`, {
      queueSize: queue.length,
      event: data.event,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Streamlined content processor that only keeps essential information for database storage.
 * Removes images, large content, and unnecessary data to optimize database usage.
 * @param {Object} obj - Object to inspect
 * @returns {Object} - Object with only essential information preserved
 */
function handleLargeContent(obj) {
  // If not an object or null, return as is
  if (!obj || typeof obj !== 'object') return obj;
  
  // For arrays, process each item but limit size
  if (Array.isArray(obj)) {
    // Hard limit of 50 items per array to save space
    if (obj.length > 50) {
      // Don't log this for silent operation
      return obj.slice(0, 50).map(item => handleLargeContent(item));
    }
    return obj.map(item => handleLargeContent(item));
  }
  
  // For objects, process each property with strict filtering
  const result = {};
  
  // CRITICAL: Always preserve report URLs if they exist
  const reportUrlKeys = ['nexusReportUrl', 'landingReportUrl', 'reportUrl', 'runReport', 'screenshotPath'];
  for (const urlKey of reportUrlKeys) {
    if (obj[urlKey] !== undefined) {
      // Directly copy URL values without processing
      result[urlKey] = obj[urlKey];
    }
  }
  
  for (const [key, value] of Object.entries(obj)) {
    // Skip storing these entirely - never needed in DB
    // Only skip screenshot and other large fields, but ALLOW screenshotPath (URL to saved screenshot)
    if (['pageContext', 'rawPageHtml', 'html', 'rawHtml', 
         'dom', 'tree', 'base64', 'image', 'images'].includes(key)) {
      continue; // Skip this field completely
    }
    
    // Special handling for screenshot - we want to keep the URL if it's a string path
    // but remove if it's base64 data
    if (key === 'screenshot') {
      // If it's a string URL/path, keep it. If base64 or null, skip it entirely
      if (typeof value === 'string' && !value.startsWith('data:')) {
        result[key] = value; // Keep screenshot URLs/paths
      } else {
        continue; // Skip base64 screenshots or null values
      }
    }
    
    // Very aggressive limiting for large content fields - always null out full page content
    // This saves significant DB space by not storing any extracted page content at all
    if (['extractedInfo', 'rawPageText', 'pageContent', 'pageText'].includes(key)) {
      // Don't store any page content in the database at all
      result[key] = null;
      // If we need to keep metadata about the extraction, store that instead
      if (typeof value === 'object' && value !== null) {
        // If it has properties like timestamp or metadata, just keep those
        const { timestamp, url, success, metadata } = value;
        if (timestamp) result.timestamp = timestamp;
        if (url) result.url = url;
        if (success !== undefined) result.success = success;
        if (metadata) result.metadata = handleLargeContent(metadata);
      }
    }
    // Remove all base64 images completely
    else if (typeof value === 'string' && value.startsWith('data:image')) {
      // Skip entirely - don't even store a placeholder
      continue;
    }
    // Hard limit on all string fields
    else if (typeof value === 'string' && value.length > 10000) {
      result[key] = value.substring(0, 10000);
    }
    // Process nested objects
    else if (typeof value === 'object' && value !== null) {
      // Process the object
      const processed = handleLargeContent(value);
      
      // For result objects, double-check that we preserved report URLs
      if (key === 'result') {
        // Ensure report URLs in the result object are preserved
        for (const urlKey of ['nexusReportUrl', 'landingReportUrl', 'reportUrl', 'runReport', 'screenshotPath']) {
          if (value[urlKey] !== undefined && processed[urlKey] === undefined) {
            // URL was lost during processing, restore it
            processed[urlKey] = value[urlKey];
            console.log(`[URL Preservation] Restored ${urlKey} in nested result object: ${value[urlKey]}`); 
          }
        }
      }
      
      result[key] = processed;
    }
    // Keep essential values as is
    else {
      result[key] = value;
    }
  }
  return result;
}

// Track tasks that have already been completed to prevent double-completion
const completedTasks = new Set();

/**
 * Update task in database and notify clients with optimized storage.
 * Saves images to filesystem instead of database and retains only essential data.
 * @param {string} taskId - Task ID
 * @param {Object} updates - Updates to apply
 */
async function updateTaskInDatabase(taskId, updates) {
  if (typeof updates !== 'object' || updates === null) {
    console.error(`[Database] Invalid updates parameter: expected an object, received ${typeof updates}`);
    return;
  }
  
  // Guard against overwriting report URLs in completed tasks
  if (updates.status === 'completed') {
    // If this task was already marked as completed, check if we should proceed
    if (completedTasks.has(taskId)) {
      // Only allow updates that include report URLs
      if (!updates.result || 
          (!updates.result.nexusReportUrl && !updates.result.landingReportUrl && !updates.result.reportUrl)) {
        console.log(`[TaskCompletion] Preventing second completion of task ${taskId} without report URLs`);
        return; // Skip this update to protect existing URLs
      }
    } else {
      // Mark this task as completed to prevent future overwrites
      completedTasks.add(taskId);
      
      // Get the full task to include original command in the completion event
      try {
        const task = await Task.findById(taskId).lean();
        if (task && task.prompt) {
          updates.result = updates.result || {};
          updates.result.originalCommand = task.prompt;
          console.log(`[TaskCompletion] Added original command to completion event for task ${taskId}`);
        }
      } catch (err) {
        console.error(`[TaskCompletion] Error fetching task for completion:`, err);
      }
    }
  }
  
  // Create a copy to avoid modifying the original
  const sizeLimitedUpdates = {...updates};
  
  // Process and optimize task data for storage
  console.log(`[TaskCompletion] Applying database size limits to task result...`);
  
  // Helper function to save any image to filesystem
  const saveImageToFile = async (imageData, prefix = 'img') => {
    if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:image')) {
      return null;
    }
    
    try {
      // Extract the base64 data
      const base64Data = imageData.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
      // Create a unique filename
      const filename = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}.jpg`;
      const filePath = path.join(process.cwd(), 'nexus_run', taskId, filename);
      // Ensure directory exists
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      // Write the file
      fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
      // Return the URL path
      return `/nexus_run/${taskId}/${filename}`;
    } catch (error) {
      console.error(`[Database] Failed to save image: ${error.message}`);
      return null;
    }
  };

  // Process result object - store only URLs, not images
  if (sizeLimitedUpdates.result) {
    // Main screenshot processing
    if (sizeLimitedUpdates.result.screenshot && typeof sizeLimitedUpdates.result.screenshot === 'string') {
      if (sizeLimitedUpdates.result.screenshot.startsWith('data:image')) {
        // Save image to file and store URL
        const imageUrl = await saveImageToFile(sizeLimitedUpdates.result.screenshot, 'screenshot');
        if (imageUrl) {
          sizeLimitedUpdates.result.screenshotPath = imageUrl;
        }
        // Always remove the base64 data
        delete sizeLimitedUpdates.result.screenshot;
      }
    }
    
    // Preserve only these key URLs that we need
    const keysToKeep = [
      'nexusReportUrl', 'landingReportUrl', 'reportUrl', 'screenshotPath',
      'extractedInfo', 'elementText', 'status', 'error'
    ];
    
    // Create a new result object with only essential data
    const essentialResult = {};
    for (const key of keysToKeep) {
      if (sizeLimitedUpdates.result[key] !== undefined) {
        essentialResult[key] = sizeLimitedUpdates.result[key];
        
        // Further limit text fields
        if (typeof essentialResult[key] === 'string' && essentialResult[key].length > 5000 &&
            key !== 'nexusReportUrl' && key !== 'landingReportUrl' && key !== 'reportUrl' && key !== 'screenshotPath') {
          essentialResult[key] = essentialResult[key].substring(0, 5000);
        }
      }
    }
    
    // Replace the full result with our optimized version
    sizeLimitedUpdates.result = essentialResult;
  }
  
  // Optimize intermediateResults - keep only URLs and essential data
  if (sizeLimitedUpdates.intermediateResults && Array.isArray(sizeLimitedUpdates.intermediateResults)) {
    // Limit to max 50 items
    if (sizeLimitedUpdates.intermediateResults.length > 50) {
      sizeLimitedUpdates.intermediateResults = sizeLimitedUpdates.intermediateResults.slice(0, 50);
    }
    
    // Process each result
    sizeLimitedUpdates.intermediateResults = await Promise.all(
      sizeLimitedUpdates.intermediateResults.map(async (result) => {
        if (!result || typeof result !== 'object') return result;
        
        // Create a simplified version with only essential fields
        const simplified = {};
        
        // Process screenshot/image if present
        if (result.screenshot && typeof result.screenshot === 'string' && 
            result.screenshot.startsWith('data:image')) {
          const imageUrl = await saveImageToFile(result.screenshot, 'step');
          if (imageUrl) {
            simplified.screenshotPath = imageUrl;
          }
        } else if (result.screenshotPath) {
          simplified.screenshotPath = result.screenshotPath;
        }
        
        // Keep only essential text data, limited to reasonable size
        if (result.extractedInfo) {
          simplified.extractedInfo = typeof result.extractedInfo === 'string' 
            ? result.extractedInfo.substring(0, 5000) 
            : result.extractedInfo;
        }
        
        // Copy other essential fields
        ['status', 'error', 'elementText', 'step', 'action'].forEach(key => {
          if (result[key] !== undefined) {
            simplified[key] = result[key];
          }
        });
        
        return simplified;
      })
    );
  }
  
  // Always apply our aggressive content limiter as final step
  sizeLimitedUpdates.result = handleLargeContent(sizeLimitedUpdates.result);
  sizeLimitedUpdates.intermediateResults = handleLargeContent(sizeLimitedUpdates.intermediateResults);
  
  // Ensure all other fields are also optimized
  if (sizeLimitedUpdates.extractedInfo) {
    sizeLimitedUpdates.extractedInfo = handleLargeContent(sizeLimitedUpdates.extractedInfo);
  }
  
  // Remove these entirely - never needed in DB
  ['pageContent', 'rawPageText', 'rawHtml', 'html'].forEach(key => {
    if (sizeLimitedUpdates[key]) {
      delete sizeLimitedUpdates[key];
    }
  });
  
  // Other potentially large fields - simplify aggressively
  if (sizeLimitedUpdates.stepMap) {
    // Just keep the structure but remove large content
    sizeLimitedUpdates.stepMap = handleLargeContent(sizeLimitedUpdates.stepMap);
  }
  
  console.log(`[Database] Updating task ${taskId}:`, Object.keys(sizeLimitedUpdates));
  try {
    // First, check if this is a completion event with report URLs
    const isCompletionWithReports = 
      updates.status === 'completed' && 
      updates.result && 
      (updates.result.nexusReportUrl || updates.result.landingReportUrl || updates.result.reportUrl);
    
    // If this is a completion with reports, log it for debugging
    if (isCompletionWithReports) {
      console.log(`[TaskCompletion] Updating task ${taskId} with report URLs:`, {
        nexusReportUrl: updates.result.nexusReportUrl,
        landingReportUrl: updates.result.landingReportUrl,
        reportUrl: updates.result.reportUrl
      });
    }

    // Update the database FIRST - before sending any events
    const task = await Task.findByIdAndUpdate(taskId, { $set: sizeLimitedUpdates }, { new: true });
    if (!task) {
      console.warn(`[Database] Task ${taskId} not found for update`);
      return;
    }
    
    // After database update, verify the URLs were properly saved
    if (isCompletionWithReports) {
      console.log(`[TaskCompletion] Verified URLs in DB for task ${taskId}:`, {
        nexusReportUrl: task.result?.nexusReportUrl,
        landingReportUrl: task.result?.landingReportUrl,
        reportUrl: task.result?.reportUrl
      });
    }
    
    // For completed tasks with report URLs, ensure we're using the database values in the update
    if (updates.status === 'completed' && task.result) {
      // Create a new updates object that uses database values for report URLs
      const enhancedUpdates = {...updates};
      
      // If the task has report URLs in the database, use those instead
      if (!enhancedUpdates.result) enhancedUpdates.result = {};
      
      // Only replace if the database has values and updates doesn't
      if (task.result.nexusReportUrl && !enhancedUpdates.result.nexusReportUrl) {
        enhancedUpdates.result.nexusReportUrl = task.result.nexusReportUrl;
      }
      if (task.result.landingReportUrl && !enhancedUpdates.result.landingReportUrl) {
        enhancedUpdates.result.landingReportUrl = task.result.landingReportUrl;
      }
      if (task.result.reportUrl && !enhancedUpdates.result.reportUrl) {
        enhancedUpdates.result.reportUrl = task.result.reportUrl;
      }
      
      // Replace the updates with our enhanced version
      updates = enhancedUpdates;
    }

    // Determine the appropriate event based on the update properties
    let eventName;
    if (updates.status === 'pending') eventName = 'taskStart';
    else if (updates.status === 'completed') {
      eventName = 'taskComplete';
      // Ensure we're not losing report URLs in the payload
      if (updates.result) {
        // Log the values to ensure they're being properly passed
        console.log(`[TaskCompletion] Sending task completion event for task ${taskId} with URLs:`, {
          landingReportUrl: updates.result.landingReportUrl,
          nexusReportUrl: updates.result.nexusReportUrl,
          reportUrl: updates.result.reportUrl,
          screenshot: updates.result.screenshot
        });
      }
    }
    else if (updates.status === 'error') eventName = 'taskError';
    else if ('progress' in updates) eventName = 'stepProgress';
    else if ('intermediateResults' in updates) eventName = 'intermediateResult';
    else eventName = 'taskUpdate';
    sendWebSocketUpdate(task.userId.toString(), { event: eventName, payload: { taskId, ...updates } });
  } catch (error) {
    console.error(`[Database] Error updating task:`, error);
  }
}

/**
 * Process task completion and generate reports.
 * @param {string} userId - User ID
 * @param {string} taskId - Task ID
 * @param {Array} intermediateResults - Intermediate results
 * @param {string} originalPrompt - Original user prompt
 * @param {string} runDir - Run directory
 * @param {string} runId - Run ID
 * @returns {Object} - Final result
 */
async function processTaskCompletion(userId, taskId, intermediateResults, originalPrompt, runDir, runId) {
  console.log(`[TaskCompletion] Processing completion for task ${taskId}`);
  try {
    let finalScreenshot = null;
    let lastTaskId = null;
    let agent = null;
    if (intermediateResults.length > 0) {
      const lastResult = intermediateResults[intermediateResults.length - 1];
      if (lastResult.task_id && activeBrowsers.has(lastResult.task_id)) {
        lastTaskId = lastResult.task_id;
        const { page, agent: activeAgent } = activeBrowsers.get(lastResult.task_id);
        finalScreenshot = await page.screenshot({ encoding: 'base64' });
        agent = activeAgent;
      }
      // Only use lastResult.screenshot if it's not a base64 string (should be a URL)
      if (lastResult.screenshot && !lastResult.screenshot.startsWith('data:image')) {
        finalScreenshotUrl = lastResult.screenshot; // It's already a URL, just use it
      } else if (lastResult.screenshot) {
        // If it's a base64 string, we'll save it to a file below
        finalScreenshot = lastResult.screenshot;
      }
    }
    let finalScreenshotUrl = null;
    if (finalScreenshot) {
      const finalScreenshotPath = path.join(runDir, `final-screenshot-${Date.now()}.png`);
      fs.writeFileSync(finalScreenshotPath, Buffer.from(finalScreenshot, 'base64'));
      console.log(`[TaskCompletion] Saved final screenshot to ${finalScreenshotPath}`);
      finalScreenshotUrl = `/nexus_run/${runId}/${path.basename(finalScreenshotPath)}`;
    }

    // NEW FLOW: First process the midscene report to get URLs, then generate the landing report
    
    // 1. Initialize URL variables
    let midsceneReportPath = null;
    let nexusReportUrl = null;
    let reportRawUrl = null; // Use a different variable name to avoid redeclaration
    
    // 2. First, handle the midscene report if available
    if (agent) {
      await agent.writeOutActionDumps();
      midsceneReportPath = agent.reportFile;
      
      if (midsceneReportPath && fs.existsSync(midsceneReportPath)) {
        try {
          // Edit the midscene report first
          midsceneReportPath = await editMidsceneReport(midsceneReportPath);
          console.log(`[NexusReport] Updated report at ${midsceneReportPath}`);
          // Update Nexus Report Url
          nexusReportUrl = `/external-report/${path.basename(midsceneReportPath)}`;
        } catch (error) {
          console.warn(`[NexusReport] Error editing report: ${error.message}`);
        }
      }
    }
    
    // 3. Now generate the landing report with the URLs from the midscene report
    // rawReport was extracted from the planLogs - old implementation code lost for noe
    console.log(`[TaskCompletion] Generating landing report with URLs:`, nexusReportUrl, reportRawUrl);
    const reportResult = await generateReport(
      originalPrompt,
      intermediateResults,
      finalScreenshotUrl,
      runId,
      REPORT_DIR,
      nexusReportUrl,
      reportRawUrl
    );
    
    // 4. Extract the report path
    const landingReportPath = reportResult.reportPath;

    const rawPageText = intermediateResults
      .map(step => (step && step.result && step.result.extractedInfo) || '')
      .join('\n');

    const currentUrl = (intermediateResults[intermediateResults.length - 1]?.result?.currentUrl) || 'N/A';
    
    // Instead of generating a new summary, extract the summary from the task_complete call
    // Look for the task_complete summary in the last steps
    let summary = '';
    
    // First, try to get the summary from the task_complete call (most reliable)
    const lastSteps = [...intermediateResults].reverse().slice(0, 3); // Look at last 3 steps
    
    // Try to find a task_complete call summary
    for (const step of lastSteps) {
      if (step && step.action === 'task_complete' && step.result && step.result.summary) {
        summary = step.result.summary;
        console.log(`[TaskCompletion] Using summary from task_complete call: ${summary}`);
        break;
      }
      
      // Also check other formats the summary might be in
      if (step && step.action && step.action.includes('complete') && step.summary) {
        summary = step.summary;
        console.log(`[TaskCompletion] Using summary from task completion step: ${summary}`);
        break;
      }
    }
    
    // If we couldn't find a task_complete summary, check if a summary exists in markCompleted call
    if (!summary) {
      for (const step of lastSteps) {
        if (step && step.type === 'completion' && step.message) {
          summary = step.message;
          console.log(`[TaskCompletion] Using summary from completion message: ${summary}`);
          break;
        }
      }
    }
    
    // Still no summary? Check if any step has a completion marker
    if (!summary) {
      for (const step of intermediateResults) {
        if (step && ((step.markCompleted === true) || (step.completed === true))) {
          if (step.summary || step.message || step.result?.message) {
            summary = step.summary || step.message || step.result?.message;
            console.log(`[TaskCompletion] Using summary from marked complete step: ${summary}`);
            break;
          }
        }
      }
    }
    
    // Final fallback: use the last step output
    if (!summary) {
      const lastStep = intermediateResults[intermediateResults.length - 1];
      if (lastStep) {
        if (lastStep.result && (lastStep.result.extractedInfo || lastStep.result.actionOutput)) {
          summary = lastStep.result.extractedInfo || lastStep.result.actionOutput;
        } else if (typeof lastStep === 'string') {
          summary = lastStep;
        } else if (lastStep.message) {
          summary = lastStep.message;
        }
      }
      
      // If we still have nothing, use the prompt as a fallback
      if (!summary) {
        summary = `Task execution completed for: ${originalPrompt}`;
      }
      
      console.log(`[TaskCompletion] Using fallback summary: ${summary}`);
    }

    // Enhanced logging for report URLs - helps with debugging
    // Use the new external-report endpoint instead of direct paths to avoid React Router interference
    const landingReportUrl = landingReportPath && typeof landingReportPath === 'string' ? 
      `/external-report/${path.basename(landingReportPath)}` : 
      (reportResult.landingReportUrl || null);
    
    // Get the raw report URL from the report result if available
    let rawReportUrl = reportResult?.rawReportUrl || null;
    
    console.log(`[TaskCompletion] Enhanced report links for task ${taskId}:`, { 
      landingReportPath,
      midsceneReportPath,
      landingReportUrl,
      nexusReportUrl,
      rawReportUrl,
      finalScreenshotUrl,
      reportExists: landingReportPath ? fs.existsSync(landingReportPath) : false,
      midsceneExists: midsceneReportPath ? fs.existsSync(midsceneReportPath) : false
    });
    
    // Make sure we have at least one valid report URL
    let primaryReportUrl = null;
    
    // Check and verify each possible report URL in order of preference
    if (nexusReportUrl) {
      // Extract the basename from the URL - ensure it's a string first
      const reportName = typeof nexusReportUrl === 'string' ? 
        path.basename(nexusReportUrl) : 
        nexusReportUrl.includes?.('/') ? nexusReportUrl.substring(nexusReportUrl.lastIndexOf('/') + 1) : 'report.html';

      // Check if the file exists in the report directory
      const absPath = path.join(process.cwd(), 'nexus_run', 'report', reportName);
      
      if (fs.existsSync(absPath)) {
        primaryReportUrl = nexusReportUrl;
        console.log(`[TaskCompletion] Using verified nexusReportUrl: ${nexusReportUrl}`);
      } else if (midsceneReportPath && fs.existsSync(midsceneReportPath)) {
        // If the nexus file doesn't exist but the midscene one does, use that
        primaryReportUrl = nexusReportUrl; // Still use the nexus URL but it will be redirected
        console.log(`[TaskCompletion] Using midscene file for nexusReportUrl: ${nexusReportUrl}`);
      } else {
        console.warn(`[TaskCompletion] nexusReportUrl points to non-existent file: ${absPath}`);
      }
    }
    
    if (!primaryReportUrl && landingReportUrl) {
      // Extract the basename from the URL
      const reportName = path.basename(landingReportUrl);
      
      // Check if the file exists in the report directory
      const absPath = path.join(process.cwd(), 'nexus_run', 'report', reportName);
      
      if (fs.existsSync(absPath)) {
        primaryReportUrl = landingReportUrl;
        console.log(`[TaskCompletion] Using verified landingReportUrl: ${landingReportUrl}`);
      } else {
        console.warn(`[TaskCompletion] landingReportUrl points to non-existent file: ${absPath}`);
      }
    }
    
    // Check and verify raw report URL
    let verifiedRawReportUrl = null;
    if (rawReportUrl) {
      // Extract the basename from the URL
      const rawReportName = typeof rawReportUrl === 'string' ? 
        path.basename(rawReportUrl) : 
        rawReportUrl.includes?.('/') ? rawReportUrl.substring(rawReportUrl.lastIndexOf('/') + 1) : 'raw-report.html';
      
      // Check if the file exists in the report directory
      const rawReportPath = path.join(process.cwd(), 'nexus_run', 'report', rawReportName);
      
      if (fs.existsSync(rawReportPath)) {
        verifiedRawReportUrl = rawReportUrl;
        console.log(`[TaskCompletion] Using verified rawReportUrl: ${rawReportUrl}`);
      } else {
        // Try fallback in the run directory
        const runReportPath = path.join(process.cwd(), 'nexus_run', runId, 'report', rawReportName);
        if (fs.existsSync(runReportPath)) {
          verifiedRawReportUrl = rawReportUrl;
          console.log(`[TaskCompletion] Found raw report in run directory: ${runReportPath}`);
        } else {
          console.warn(`[TaskCompletion] rawReportUrl points to non-existent file: ${rawReportPath}`);
          // If not found, will be kept as null
        }
      }
    }
    
    // Final fallback to screenshot
    if (!primaryReportUrl && finalScreenshotUrl) {
      primaryReportUrl = finalScreenshotUrl;
      console.log(`[TaskCompletion] Falling back to screenshot URL: ${finalScreenshotUrl}`);
    }
    
    // Compose a lean result object for success (only essential fields, no raw page content)
    // Only include urls and metadata, not full page content to save DB space
    let finalResult = {
      success: true,
      taskId,
      raw: {
        // Don't store the full page text to save DB space
        pageText: rawPageText, 
        url: currentUrl
      },
      aiPrepared: {
        summary: summary,
        // Include report URLs in the AI-prepared section for easier access
        nexusReportUrl: nexusReportUrl,
        landingReportUrl: landingReportUrl,
        rawReportUrl: verifiedRawReportUrl,
        // Get actual result data from the intermediateResults if available
        rawResult: intermediateResults && intermediateResults.length > 0 && 
          intermediateResults[intermediateResults.length - 1]?.result?.result || null,
        // Extract a clean, readable result message from the potentially nested object
        // This extracts just the weather description or other important content
        cleanResult: (function() {
          const resultObj = intermediateResults && intermediateResults.length > 0 && 
            intermediateResults[intermediateResults.length - 1]?.result?.result;
          
          if (!resultObj) return 'No result data available';
          
          // Handle nested structure common in YAML results
          if (resultObj && typeof resultObj === 'object') {
            // For weather results which are often in format {0: {description: 'Weather info...'}}  
            if (resultObj['0'] && resultObj['0'].description) {
              return resultObj['0'].description;
            }
            
            // Try to access first property if it has a description
            const firstValue = Object.values(resultObj)[0];
            if (firstValue && typeof firstValue === 'object' && firstValue.description) {
              return firstValue.description;
            }
          }
          
          // Fallback to string representation
          return typeof resultObj === 'object' ? 
            JSON.stringify(resultObj) : String(resultObj);
        })(),
        // Add a combined summary with report URLs and clean result data for AI memory and chat model context
        enhancedSummary: `${summary}\n\nActual Result: ${(function() {
          const resultObj = intermediateResults && intermediateResults.length > 0 && 
            intermediateResults[intermediateResults.length - 1]?.result?.result;
          
          if (!resultObj) return 'No result data available';
          
          // Handle nested structure common in YAML results
          if (resultObj && typeof resultObj === 'object') {
            // For weather results which are often in format {0: {description: 'Weather info...'}}  
            if (resultObj['0'] && resultObj['0'].description) {
              return resultObj['0'].description;
            }
            
            // Try to access first property if it has a description
            const firstValue = Object.values(resultObj)[0];
            if (firstValue && typeof firstValue === 'object' && firstValue.description) {
              return firstValue.description;
            }
          }
          
          // Fallback to string representation
          return typeof resultObj === 'object' ? 
            JSON.stringify(resultObj) : String(resultObj);
        })()}\n\nTask Reports Available:\n${nexusReportUrl ? `- Analysis Report: ${nexusReportUrl}` : ''}${landingReportUrl ? `\n- Landing Page Report: ${landingReportUrl}` : ''}${verifiedRawReportUrl ? `\n- Raw Report: ${verifiedRawReportUrl}` : ''}`
      },
      screenshot: finalScreenshotUrl,
      // Only store essential step data, not full content or large objects
      steps: intermediateResults.map(step => {
        if (step.getSummary) {
          return step.getSummary();
        } else {
          // Make sure we're not storing large objects in steps
          const { result, ...stepData } = step;
          return {
            ...stepData,
            // Only keep success, currentUrl, and essential fields from result
            result: result ? {
              success: result.success,
              currentUrl: result.currentUrl,
              // Don't store full extractedInfo or navigableElements
              extractedInfo: null,
              navigableElements: null
            } : null
          };
        }
      }),
      landingReportUrl: landingReportUrl,
      nexusReportUrl: nexusReportUrl || null,
      runReport: landingReportUrl, // alias for frontend
      // Don't store full intermediate results to save DB space
      intermediateResults: [], 
      error: null,
      // For compatibility, always provide a reportUrl with verified URL
      reportUrl: primaryReportUrl
    };
    
    // Apply size limiting to the entire finalResult object to ensure it fits in MongoDB's 16MB limit
    console.log('[TaskCompletion] Applying database size limits to task result...');
    finalResult = handleLargeContent(finalResult);
    console.log('[TaskCompletion] Size limiting complete');

    // Explicitly update the Task document with the report URLs to ensure they are stored in the database
    // This prevents the URLs from being lost during polling
    try {
      await Task.updateOne(
        { _id: taskId },
        { 
          $set: {
            'result.nexusReportUrl': finalResult.nexusReportUrl,
            'result.landingReportUrl': finalResult.landingReportUrl,
            'result.reportUrl': finalResult.reportUrl,
            'result.runReport': finalResult.runReport,
            status: 'completed'
          }
        }
      );
      console.log(`[TaskCompletion] Successfully updated Task document with report URLs for task ${taskId}`);
    } catch (dbError) {
      console.error(`[TaskCompletion] Error updating Task document with report URLs:`, dbError);
    }

    return finalResult;
  } catch (error) {
    console.error(`[TaskCompletion] Error:`, error);
    const errorReportFile = `error-report-${Date.now()}.html`;
    const errorReportPath = path.join(REPORT_DIR, errorReportFile);
    
    // Create a proper HTML error report rather than just a string
    const errorHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nexus Error Report</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #eee;
            background-color: #1a1a2e;
            max-width: 900px;
            margin: 0 auto;
            padding: 2rem;
          }
          .error-box {
            background-color: #272741;
            border-left: 5px solid #fd3259;
            padding: 1rem 2rem;
            margin: 2rem 0;
            border-radius: 0 5px 5px 0;
          }
          pre {
            background-color: #0f0f1b;
            padding: 1rem;
            border-radius: 5px;
            overflow-x: auto;
          }
          h1, h2 {
            color: #4cc9f0;
          }
          .nexus-logo {
            text-align: center;
            margin-bottom: 2rem;
          }
          .timestamp {
            color: #aaa;
            font-size: 0.9rem;
          }
        </style>
      </head>
      <body>
        <div class="nexus-logo">
          <h1>Nexus</h1>
        </div>
        
        <h2>Task Error Report</h2>
        <p class="timestamp">Generated on: ${new Date().toLocaleString()}</p>
        
        <div class="error-box">
          <h3>Error Details</h3>
          <pre>${error.message || 'Unknown error'}</pre>
          ${error.stack ? `<h3>Stack Trace</h3><pre>${error.stack}</pre>` : ''}
        </div>
      </body>
    </html>
    `;
    
    fs.writeFileSync(errorReportPath, errorHtml);
    
    // Compose a full result object for error (all fields, nulls for missing, error fields set)
    // Try to extract any available screenshot or report URLs from intermediate results
    let errorScreenshot = null;
    let errorLandingReportUrl = null;
    let errornexusReportUrl = null;
    let errorRunReport = null;
    
    // Safely access intermediate results with null/undefined checks
    if (Array.isArray(intermediateResults) && intermediateResults.length > 0) {
      const lastResult = intermediateResults[intermediateResults.length - 1];
      if (lastResult && typeof lastResult === 'object') {
        // Safely check each property
        if (lastResult.screenshot) errorScreenshot = lastResult.screenshot;
        if (lastResult.landingReportUrl) errorLandingReportUrl = lastResult.landingReportUrl;
        if (lastResult.nexusReportUrl) errornexusReportUrl = lastResult.nexusReportUrl;
        if (lastResult.runReport) errorRunReport = lastResult.runReport;
      }
    }
    // Return a minimal error result with no raw page content
    const errorResult = {
      success: false,
      taskId,
      raw: { pageText: null, url: null },
      aiPrepared: { summary: null },
      screenshot: errorScreenshot,
      steps: [], // Don't save any steps data on error
      landingReportUrl: errorLandingReportUrl,
      nexusReportUrl: `/nexus_run/report/${errorReportFile}`,
      runReport: errorRunReport,
      intermediateResults: [], // Explicitly empty intermediateResults 
      error: error.message,
      // Always provide a reportUrl for error compatibility using the external-report endpoint
      reportUrl: `/external-report/${errorReportFile}`
    };
    
    // Log the error result structure for debugging
    console.log(`[TaskCompletion] Returning error result structure:`, JSON.stringify({
      success: errorResult.success,
      hasError: !!errorResult.error,
      errorMsg: errorResult.error,
      reportUrls: {
        nexusReportUrl: errorResult.nexusReportUrl,
        landingReportUrl: errorResult.landingReportUrl,
        reportUrl: errorResult.reportUrl
      }
    }));
    
    return errorResult;

  } finally {
    if (activeBrowsers.size > 0) {
      for (const [id, session] of activeBrowsers.entries()) {
        if (!session.closed) {
          try {
            await session.browser.close();
            // Handle release with better type checking and error handling
            if (session.release !== undefined) {
              if (typeof session.release === 'function') {
                try {
                  session.release();
                  console.debug(`[TaskCompletion] Successfully released semaphore for session ${id}`);
                } catch (e) {
                  console.debug(`[TaskCompletion] Error releasing semaphore for session ${id}:`, e);
                }
              } else {
                console.warn(`[TaskCompletion] release is ${typeof session.release} for session ${id}, attempting to call anyway`);
                try {
                  // Try to call it if it's not undefined (might be a promise or other callable)
                  const result = session.release;
                  if (result && typeof result.then === 'function') {
                    // Handle if it's a promise
                    result.catch(e => console.debug(`[TaskCompletion] Error from release promise for session ${id}:`, e));
                  }
                } catch (e) {
                  console.debug(`[TaskCompletion] Error handling non-function release for session ${id}:`, e);
                }
              }
            } else {
              console.warn(`[TaskCompletion] release is not defined for session ${id}, skipping release`);
            }
            session.closed = true;
            activeBrowsers.delete(id);
            console.log(`[TaskCompletion] Closed browser session ${id}`);
          } catch (error) {
            console.error(`[TaskCompletion] Error closing browser session ${id}:`, error);
          }
        }
      }
    }
  }
}

/**
 * TaskPlan - Class to manage the execution plan for a browser task
 */
class TaskPlan {
  constructor(userId, taskId, prompt, initialUrl, runDir, runId, maxSteps = 20) {
    this.userId = userId;
    this.taskId = taskId;
    this.prompt = prompt;
    this.initialUrl = initialUrl;
    this.runDir = runDir;
    this.runId = runId;
    this.steps = [];
    this.currentStepIndex = -1;
    this.maxSteps = maxSteps;
    this.currentState = [];          // Array to store all state objects (assertions, page states, etc.)
    this.extractedInfo = [];         // Array to keep a history of extracted info
    this.navigatableElements = [];   // Array to hold navigable elements (can be cumulative)
    this.planLog = [];
    this.completed = false;
    this.summary = null;    
    this.currentUrl = initialUrl || 'Not specified';
    // Store the user's OpenAI API key for use in PuppeteerAgent initialization.
    this.userOpenaiKey = null;
    // Store the browser session for reuse across steps
    this.browserSession = null;
  }

  log(message, metadata = {}) {
    const entry = { timestamp: new Date().toISOString(), message, ...metadata };
    this.planLog.push(entry);
    console.log(`[Task ${this.taskId}] ${message}`, metadata);
    sendWebSocketUpdate(this.userId, { event: 'planLog', taskId: this.taskId, message, metadata });
  }

  /**
   * Create a new step in the plan.
   * After execution, a short step summary is generated and stored in step.stepSummary.
   * @param {string} type - 'action' or 'query'
   * @param {string} instruction - Instruction for the step
   * @param {Object} args - Associated arguments
   * @returns {PlanStep} - The created step.
   */
  createStep(type, instruction, args) {
    const step = {
      index: this.steps.length,
      type,
      instruction,
      args,
      status: 'pending',
      result: null,
      error: null,
      execute: async (plan) => {
        try {
          step.status = 'running';
          plan.log(`Executing step ${step.index + 1}: ${step.type} - ${step.instruction}`);
          let result;
          if (step.type === 'action') {
            result = await plan.executeBrowserAction(step.args, step.index);
          } else {
            result = await plan.executeBrowserQuery(step.args, step.index);
          }
          step.result = result;
          step.status = result.success ? 'completed' : 'failed';
          plan.currentUrl = result.currentUrl || plan.currentUrl;
          if (result.state) {
            plan.updateGlobalState(result);
          }
          plan.log(`Step ${step.index + 1} ${step.status}`);
          return result;
        } catch (error) {
          step.status = 'failed';
          step.error = error.message;
          plan.log(`Step ${step.index + 1} failed: ${error.message}`, { stack: error.stack });
          return { success: false, error: error.message, currentUrl: plan.currentUrl };
        }
      },
      getSummary: () => ({
        index: step.index,
        type: step.type,
        instruction: step.instruction,
        status: step.status,
        success: step.result?.success || false,
        stepSummary: step.stepSummary || 'No summary'
      })
    };
    this.steps.push(step);
    this.currentStepIndex = this.steps.length - 1;
    return step;
  }

  getCurrentStep() {
    if (this.currentStepIndex >= 0 && this.currentStepIndex < this.steps.length) {
      return this.steps[this.currentStepIndex];
    }
    return null;
  }

  markCompleted(summary) {
    this.completed = true;
    this.summary = summary;
    this.log(`Task marked as completed: ${summary}`);
  }

   /**
   * Helper method to update globals when a result is received.
   */
   updateGlobalState(result) {
    if (result.state && result.state.assertion) {
      this.currentState.push({ assertion: result.state.assertion });
    } else if (this.currentState.length === 0) {
      this.currentState.push({ assertion: 'No assertion available' });
    }
    
    let extracted = 'No extracted info available';
    if (result.extractedInfo) {
      if (typeof result.extractedInfo === 'object' && result.extractedInfo.pageContent) {
        extracted = result.extractedInfo.pageContent;
      } else if (typeof result.extractedInfo === 'string') {
        extracted = result.extractedInfo;
      }
    }
    this.extractedInfo.push(extracted);
    
    if (result.navigableElements && Array.isArray(result.navigableElements)) {
      this.navigatableElements = this.navigatableElements.concat(result.navigableElements);
    } else if (this.navigatableElements.length === 0) {
      this.navigatableElements = [];
    }
  }

  /**
   * Generate a system prompt that includes progress and state details.
   * @returns {string} - The generated system prompt.
   */
  generateSystemPrompt() {
    const latestState = (Array.isArray(this.currentState) && this.currentState.length)
      ? this.currentState[this.currentState.length - 1]
      : { assertion: 'No assertion available' };
    const assertionSummary = latestState.assertion || 'No assertion available';

    const latestExtracted = (Array.isArray(this.extractedInfo) && this.extractedInfo.length)
      ? this.extractedInfo[this.extractedInfo.length - 1]
      : 'No extracted info available';
    const extractedSummary = latestExtracted
      ? latestExtracted.substring(0, 700) + '...'
      : 'No extracted info available';

    const progressSummary = this.steps.length > 0
      ? this.steps.map(step => 
          `- Step ${step.index + 1}: ${step.type.toUpperCase()} - ${step.instruction} (${step.status})`
        ).join('\n')
      : 'No steps executed yet';

    const lastStepSummary = (this.steps.length > 0 && this.steps[this.steps.length - 1].stepSummary)
      ? this.steps[this.steps.length - 1].stepSummary
      : 'No summary available';

    const recentFailures = this.steps.slice(-3)
      .filter(step => step.status === 'failed')
      .map(step => 
        `- Step ${step.index + 1}: ${step.instruction} failed (${step.error || 'Unknown error'})`
      ).join('\n') || 'No recent failures';

    return `
You are an AI assistant automating browser tasks with resilience and adaptability. 
You never fail to accomplish the task and reason all steps until you accomplish it. 
You always instruct towards achieving the "Main Task".

GUIDELINES:
1. PERSISTENCE: Never give up on a task. If one approach fails, try alternative methods.
2. AUTONOMY: You must determine steps needed without user input after initial request.
3. PLANNING: You can take in a plan and execute it, or create a step-by-step plan based on previous results.
4. ADAPTABILITY: Adjust your plan based on new information. Analyze all changes in new information carefully to see differences then decide.
5. COMMUNICATION: Clearly explain your actions and reasoning.
6. PROGRESS TRACKING: Indicate task progress and status.
7. EXTRACTING DATA: Always provide instructions to extract all necessary page data.
8. NAVIGATION EFFICIENCY: Check the current page before navigating.
9. NEXT STEP PRECISION: Plan incremental steps based on the latest state and data.

TIPS:
- browser_action and browser_query can handle complex instructions like "look for BTC and click it", "click search bar, type 'cats', press enter or click search button"
- passing semi-complex instructions is key to achieving success. e.g one combined instruction like: "Type Cats in search bar and press enter", instead of breaking it into 2 steps.
- breaking down tasks to too simple instructions can lead to failure.
- call task_complete when you have completed the main task.

CURRENT TASK: "${this.prompt}"
Starting URL: ${this.initialUrl || 'Not specified'}
Current Step: ${this.currentStepIndex + 1} of ${this.maxSteps}
Current URL: ${this.currentUrl || 'Not yet navigated'}

PROGRESS SUMMARY (based on previous step): ${lastStepSummary}
FULL STEP SUMMARY:
${progressSummary}
Recent Failures:
${recentFailures}
Extracted Information:
- ${extractedSummary}
Assertion (Page State):
- ${assertionSummary}

[END OF SUMMARY]

Proceed with actions toward the Main Task: "${this.prompt}".
    `.trim();
  }

  getSummary() {
    return {
      taskId: this.taskId,
      prompt: this.prompt,
      initialUrl: this.initialUrl,
      currentUrl: this.currentUrl,
      steps: this.steps.map(step => step.getSummary()),
      completed: this.completed,
      summary: this.summary,
      planLog: this.planLog,
      currentStepIndex: this.currentStepIndex,
      maxSteps: this.maxSteps
    };
  }

  async executeBrowserAction(args, stepIndex) {
    // Pass current URL to avoid unnecessary navigation on subsequent steps
    if (!args.url && this.currentUrl && this.currentUrl !== 'Not specified') {
      args.url = this.currentUrl;
    }
    
    // Execute the action, passing in our existing browser session
    const result = await handleBrowserAction(
      args,
      this.userId,
      this.taskId,
      this.runId,
      this.runDir,
      stepIndex,
      this.browserSession
    );
    
    // If the result has a browserSession, store it for future steps
    if (result.browserSession) {
      this.browserSession = result.browserSession;
      this.log('Browser session maintained for future steps');
    }
    
    return result;
  }

  async executeBrowserQuery(args, stepIndex) {
    // Pass current URL to avoid unnecessary navigation on subsequent steps
    if (!args.url && this.currentUrl && this.currentUrl !== 'Not specified') {
      args.url = this.currentUrl;
    }
    
    // Execute the query, passing in our existing browser session
    const result = await handleBrowserQuery(
      args,
      this.userId,
      this.taskId,
      this.runId,
      this.runDir,
      stepIndex,
      this.browserSession
    );
    
    // If the result has a browserSession, store it for future steps
    if (result.browserSession) {
      this.browserSession = result.browserSession;
      this.log('Browser session maintained for future steps');
    }
    
    return result;
  }

  updateBrowserSession(session) {
    this.browserSession = session;
    if (session && session.currentUrl) {
      this.currentUrl = session.currentUrl;
    }
    this.log(`Updated browser session, current URL: ${this.currentUrl}`);
  }
}

/**
 * PlanStep - Class to manage an individual step in the execution plan
 */
class PlanStep {
  constructor(index, type, instruction, args, userId, taskId, runDir) {
    this.index = index;
    this.type = type;
    this.instruction = instruction;
    this.args = args;
    this.userId = userId;
    this.taskId = taskId;
    this.runDir = runDir;
    this.status = 'pending';
    this.result = null;
    this.startTime = new Date();
    this.endTime = null;
    this.logs = [];
    this.error = null;
    this.stepSummary = null; 
  }

  log(message, data = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      step: this.index,
      message,
      data: data ? (typeof data === 'object' ? JSON.stringify(data) : data) : null
    };
    this.logs.push(logEntry);
    console.log(`[PlanStep:${this.index}] ${message}`);
  }

  async generateStepSummary() {
    if (this.stepSummary) return this.stepSummary;
    try {
      const summaryResponse = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Summarize this task\'s step result data like a task supervisor following on key progress:' },
          { role: 'user', content: JSON.stringify(this.getSummary()) }
        ],
        temperature: 0,
        max_tokens: 5
      });
      const summary = summaryResponse.choices[0].message.content.trim();
      this.stepSummary = summary;
      return summary;
    } catch (error) {
      console.error(`Error generating step summary: ${error.message}`);
      this.stepSummary = 'No summary';
      return this.stepSummary;
    }
  }

  async execute(plan) {
    this.log(`Starting execution: ${this.type} - ${this.instruction}`);
    this.status = 'running';
    
    try {
      const trimmedStepLogs = this.logs.map(entry => {
        const shortMsg = entry.message.length > 150 ? entry.message.substring(0, 150) + '...' : entry.message;
        return { ...entry, message: shortMsg };
      });
      sendWebSocketUpdate(this.userId, { 
        event: 'stepProgress', 
        taskId: this.taskId, 
        stepIndex: this.index, 
        progress: 10, 
        message: `Starting: ${this.instruction}`,
        log: trimmedStepLogs
      });
  
      let result;
      if (this.type === 'action') {
        result = await plan.executeBrowserAction(this.args, this.index);
      } else {
        result = await plan.executeBrowserQuery(this.args, this.index);
      }
      this.result = result;
      this.status = result.success ? 'completed' : 'failed';
      this.endTime = new Date();
      
      // Update the plan’s global state.
      plan.updateGlobalState(result);
      plan.extractedInfo = result.extractedInfo || 'No content extracted';
      plan.updateBrowserSession({ currentUrl: result.currentUrl });
      if (result.state) {
        plan.currentState = result.state;
      } else {
        plan.currentState = {
          pageDescription: 'No content extracted',
          navigableElements: [],
          currentUrl: result.currentUrl || plan.currentUrl
        };
      }
  
      const trimmedActionLogs = (result.actionLog || []).map(entry => {
        const shortMsg = entry.message.length > 150 ? entry.message.substring(0, 150) + '...' : entry.message;
        return { ...entry, message: shortMsg };
      });
  
      const finalTrimmedStepLogs = this.logs.map(entry => {
        const shortMsg = entry.message.length > 150 ? entry.message.substring(0, 150) + '...' : entry.message;
        return { ...entry, message: shortMsg };
      });
  
      sendWebSocketUpdate(this.userId, { 
        event: 'stepProgress', 
        taskId: this.taskId, 
        stepIndex: this.index, 
        progress: 100, 
        message: this.status === 'completed' ? 'Step completed' : 'Step failed',
        log: [...finalTrimmedStepLogs, ...trimmedActionLogs]
      });
  
      console.log(`[Task ${this.taskId}] Step ${this.index} completed`, {
        status: this.status,
        type: this.type,
        url: result.currentUrl
      });
      
      await this.generateStepSummary();
  
      return result;
    } catch (error) {
      this.log(`Error executing step: ${error.message}`);
      this.status = 'failed';
      this.endTime = new Date();
      this.error = error.message;
      
      const trimmedLogs = this.logs.map(entry => {
        const shortMsg = entry.message.length > 150 ? entry.message.substring(0, 150) + '...' : entry.message;
        return { ...entry, message: shortMsg };
      });
  
      sendWebSocketUpdate(this.userId, { 
        event: 'stepProgress', 
        taskId: this.taskId, 
        stepIndex: this.index, 
        progress: 100, 
        message: `Error: ${error.message}`,
        log: trimmedLogs
      });
      
      console.log(`[Task ${this.taskId}] Step ${this.index} failed`, { error: error.message });
      
      return {
        success: false,
        error: error.message,
        actionLog: trimmedLogs,
        currentUrl: plan.currentUrl,
        task_id: this.taskId,
        stepIndex: this.index
      };
    }
  }

  getSummary() {
    return {
      index: this.index,
      type: this.type,
      instruction: this.instruction,
      args: this.args,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime ? (this.endTime - this.startTime) : null,
      resultSummary: this.result ? {
        success: this.result.success,
        currentUrl: this.result.currentUrl,
        error: this.result.error,
        extractedInfo: this.result.extractedInfo,
        navigableElements: this.result.navigableElements
      } : null,
      logs: this.logs,
      error: this.error,
      stepSummary: this.stepSummary
    };
  }
}
/**
 * Get an OpenAI client for this user, specifically configured for CHAT PURPOSES ONLY.
 * This simplified function handles chat models (GPT-4o, Claude, Gemini, etc.)
 * 
 * TODO: This function needs proper SDK implementation for non-OpenAI providers:
 * - Currently only OpenAI models (GPT-4o, GPT-4o-mini, GPT-3.5-turbo) are fully supported
 * - Claude models require the Anthropic SDK with different parameters
 * - Gemini models need Google's generative AI SDK
 * - Grok models have OpenAI-compatible API but may need specific streaming setup
 * 
 * The current implementation returns an OpenAI client which will only work properly with
 * OpenAI models. For other providers, we need to modify streamNliThoughts() to handle
 * the different client SDKs and request formats.
 * 
 * Note: This is NOT used for browser automation, which is handled by setupNexusEnvironment().
 */
async function getUserOpenAiClient(userId) {
  // Define standard default keys for different providers
  const DEFAULT_KEYS = {
    'openai': process.env.DEFAULT_GPT4O_KEY || '',
    'qwen': process.env.DEFAULT_OPENROUTER_KEY || '',
    'google': process.env.DEFAULT_GEMINI_KEY || '',
    'anthropic': process.env.DEFAULT_CLAUDE_KEY || '',
    'xai': process.env.DEFAULT_GROK_KEY || ''
  };
  
  // Define provider-specific base URLs
  const PROVIDER_BASE_URLS = {
    'openai': process.env.CUSTOM_OPENAI_ENDPOINT || undefined,
    'anthropic': 'https://api.anthropic.com',
    'google': 'https://generativelanguage.googleapis.com/v1beta/openai/',
    'qwen': 'https://openrouter.ai/api/v1',
    'xai': 'https://api.groq.com/openai/v1'
  };
  
  // Map from model to provider
  const MODEL_PROVIDER_MAPPING = {
    // OpenAI models
    'gpt-4o': 'openai',
    'gpt-4o-mini': 'openai',
    'gpt-3.5-turbo': 'openai',
    // Claude models
    'claude-3-opus': 'anthropic',
    'claude-3-sonnet': 'anthropic',
    'claude-3-haiku': 'anthropic',
    // Gemini models
    'gemini-1.5-pro': 'google',
    'gemini-1.5-flash': 'google',
    // Grok models
    'grok-1': 'xai'
  };
  
  // Track whether we're using a default key
  let usingDefaultKey = false;
  let keySource = 'user';
  
  // Fetch user's preferences and API keys
  const user = await User
    .findById(userId)
    .select('openaiApiKey apiKeys preferredEngine modelPreferences')
    .lean();

  if (!user) {
    console.error(`[OpenAIClient] User ${userId} not found, using default GPT-4o key`);
    usingDefaultKey = true;
    keySource = 'system-default';
    return new OpenAI({ 
      apiKey: DEFAULT_KEYS['openai'],
      defaultQuery: { usingDefaultKey, keySource, engine: 'gpt-4o', provider: 'openai' }
    });
  }

  // Get the user's preferred chat model, defaulting to gpt-4o if not set
  let preferredModel = user?.modelPreferences?.chat || 'gpt-4o';
  console.log(`[Chat] Using chat model preference: ${preferredModel}`);
  
  // Determine the provider for this model
  const provider = MODEL_PROVIDER_MAPPING[preferredModel] || 'openai';
  
  // If model isn't supported, fall back to gpt-4o
  if (!provider) {
    console.warn(`[OpenAIClient] Unsupported model ${preferredModel}, falling back to gpt-4o`);
    preferredModel = 'gpt-4o';
  }
  
  // Get the base URL for this provider
  const baseURL = PROVIDER_BASE_URLS[provider];
  
  // Map from provider to schema key in User model
  const PROVIDER_SCHEMA_MAPPING = {
    'openai': 'gpt4o',
    'anthropic': 'claude',
    'google': 'gemini',
    'xai': 'grok',
    'qwen': 'qwen'
  };

  // Get the schema key for the user's API keys
  const schemaKey = PROVIDER_SCHEMA_MAPPING[provider];
  
  // Check for the appropriate API key
  let apiKey;
  
  // First try user's stored key for this provider
  if (user?.apiKeys?.[schemaKey] && user.apiKeys[schemaKey].trim().length > 0) {
    apiKey = user.apiKeys[schemaKey].trim();
    keySource = 'user';
    usingDefaultKey = false;
  } 
  // For OpenAI, check legacy key as well
  else if (provider === 'openai' && user?.openaiApiKey && user.openaiApiKey.trim().length > 0) {
    apiKey = user.openaiApiKey.trim();
    keySource = 'legacy';
    usingDefaultKey = false;
  } 
  // If no user key, try default key
  else if (DEFAULT_KEYS[provider] && DEFAULT_KEYS[provider].trim().length > 0) {
    apiKey = DEFAULT_KEYS[provider];
    keySource = 'system-default';
    usingDefaultKey = true;
  } 
  // If no key available for preferred model, fall back to GPT-4o
  else {
    // Notify the user that we're falling back
    notifyApiKeyStatus(userId, {
      hasKey: false,
      engine: preferredModel,
      provider,
      message: `No API key available for ${preferredModel}, falling back to gpt-4o`
    });
    
    // Reset to GPT-4o
    preferredModel = 'gpt-4o';
    
    // Try user's GPT-4o key
    if (user?.apiKeys?.gpt4o && user.apiKeys.gpt4o.trim().length > 0) {
      apiKey = user.apiKeys.gpt4o.trim();
      keySource = 'fallback-user';
      usingDefaultKey = false;
    } 
    // Try legacy key
    else if (user?.openaiApiKey && user.openaiApiKey.trim().length > 0) {
      apiKey = user.openaiApiKey.trim();
      keySource = 'fallback-legacy';
      usingDefaultKey = false;
    }
    // Try default key
    else if (DEFAULT_KEYS['openai'] && DEFAULT_KEYS['openai'].trim().length > 0) {
      apiKey = DEFAULT_KEYS['openai'];
      keySource = 'fallback-system';
      usingDefaultKey = true;
    }
    // No keys available at all
    else {
      console.error(`[OpenAIClient] No API keys available for user ${userId}`);
      throw new Error('No API keys available');
    }
  }

  // Log what we're using but mask most of the key
  const maskedKey = apiKey.length > 8 
    ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` 
    : '[none]';
  console.log(
    `[ChatClient] Using ${preferredModel} with key ${maskedKey} for user ${userId} ` +
    `(source: ${keySource}, default: ${usingDefaultKey})`
  );
  
  // Create client with appropriate configuration and metadata
  return new OpenAI({ 
    apiKey, 
    baseURL,
    defaultQuery: { usingDefaultKey, keySource, engine: preferredModel, provider }
  });
}


/**
 * Check if a user has a valid API key for the specified engine
 * @param {string} userId - User ID
 * @param {string} engineName - Engine name (gpt-4o, qwen-2.5-vl-72b, etc.)
 * @returns {Object} - Object containing whether key exists and source
 */
export async function checkEngineApiKey(userId, engineName) {
  // Validate the engine name is one we support
  if (!Object.keys(ENGINE_KEY_MAPPING).includes(engineName)) {
    console.warn(`Unsupported engine requested: ${engineName}, falling back to gpt-4o`);
    engineName = 'gpt-4o'; // Default fallback
  }
  
  // Map from engine name to API key type
  const apiKeyType = ENGINE_KEY_MAPPING[engineName];
  
  // Map from engine name to database schema key
  const engineToSchemaKey = {
    'gpt-4o': 'gpt4o',
    'qwen-2.5-vl-72b': 'qwen',
    'gemini-2.5-pro': 'gemini',
    'ui-tars': 'uitars'
  };
  
  // Get the schema key for this engine
  const schemaKey = engineToSchemaKey[engineName];
  console.log(`[API Key Check] Checking API key for engine ${engineName} using schema key ${schemaKey}`);
  
  // Default fallback keys - mapped to our standardized key types
  const DEFAULT_KEYS = {
    'openai': process.env.DEFAULT_GPT4O_KEY || '',
    'qwen': process.env.DEFAULT_OPENROUTER_KEY || '',
    'google': process.env.DEFAULT_GEMINI_KEY || '',
    'uitars': process.env.DEFAULT_UITARS_KEY || ''
  };
  
  // Fetch user's API keys
  const user = await User
    .findById(userId)
    .select('apiKeys openaiApiKey')
    .lean();

  if (!user) {
    return { 
      hasKey: DEFAULT_KEYS['openai'].length > 0, 
      keySource: 'system-default',
      usingDefault: true,
      engine: 'gpt-4o', // Always fall back to GPT-4o for missing users
      keyType: 'openai'
    };
  }

  // This is where we removed a duplicate nested function
  // The main function already does this check correctly


  // Check if user has the required key based on schema mapping
  if (user?.apiKeys?.[schemaKey] && user.apiKeys[schemaKey].trim().length > 0) {
    console.log(`[API Key Check] Found user API key for ${engineName} in schema key ${schemaKey}`);
    return { 
      hasKey: true, 
      keySource: 'user', 
      usingDefault: false, 
      engine: engineName,
      keyType: apiKeyType 
    };
  }
  
  // Special case for legacy OpenAI key
  if (apiKeyType === 'openai' && user?.openaiApiKey && user.openaiApiKey.trim().length > 0) {
    return { 
      hasKey: true, 
      keySource: 'legacy', 
      usingDefault: false, 
      engine: engineName,
      keyType: apiKeyType 
    };
  }
  
  // Check for default key
  if (DEFAULT_KEYS[apiKeyType] && DEFAULT_KEYS[apiKeyType].length > 0) {
    return { 
      hasKey: true, 
      keySource: 'system-default', 
      usingDefault: true, 
      engine: engineName,
      keyType: apiKeyType 
    };
  }
  
  // If we get here, no key was found - either user or default
  // For ui-tars, we always consider it available
  if (engineName === 'ui-tars') {
    return { 
      hasKey: true, 
      keySource: 'internal', 
      usingDefault: false, 
      engine: engineName,
      keyType: apiKeyType 
    };
  }
  
  // For any other engine, we need to fall back to GPT-4o
  return { 
    hasKey: false, 
    keySource: 'none', 
    usingDefault: false, 
    engine: engineName,
    keyType: apiKeyType,
    fallbackEngine: 'gpt-4o',
    fallbackKeyType: 'openai'
  };
}

/**
 * Notify a user about API key status
 * @param {string} userId - User ID
 * @param {Object} keyInfo - Information about the key status
 */
export function notifyApiKeyStatus(userId, keyInfo) {
  // Log the API key status regardless of notification type
  if (!keyInfo.hasKey) {
    console.log(`[API Key] No API key found for ${keyInfo.engine}, notifying user`);
  } else if (keyInfo.usingDefault) {
    console.log(`[API Key] Using system default API key for ${keyInfo.engine} from source: ${keyInfo.keySource}`);
  } else if (keyInfo.keySource === 'user') {
    console.log(`[API Key] Using user's own API key for ${keyInfo.engine}`);
  }
}

/**
 * Set up environment variables for midscene based on user preferences following
 * the guidelines at https://midscenejs.com/choose-a-model.html
 * This must be called before creating any midscene agent.
 */
async function setupNexusEnvironment(userId) {
  // Default API key fallbacks from environment (for development/testing)
  const DEFAULT_GPT4O_KEY = process.env.DEFAULT_GPT4O_KEY || '';
  const DEFAULT_OPENROUTER_KEY = process.env.DEFAULT_OPENROUTER_KEY || '';
  const DEFAULT_GEMINI_KEY = process.env.DEFAULT_GEMINI_KEY || '';
  const DEFAULT_UITARS_KEY = process.env.DEFAULT_UITARS_KEY || '';

  // Fetch user and their API keys + preferences
  const user = await User
    .findById(userId)
    .select('apiKeys preferredEngine modelPreferences')
    .lean();

  if (!user) {
    console.error(`[MidsceneEnv] User ${userId} not found`);
    return false;
  }

  // Get preferred engine or default to GPT-4o
  const preferredEngine = user?.preferredEngine || 'gpt-4o';
  console.log(`[MidsceneEnv] Setting up engine: ${preferredEngine} for user ${userId}`);

  // Log the state of environment variables before resetting
  console.log(`[MidsceneEnv] BEFORE RESET - Environment variables state:`);
  console.log(`[MidsceneEnv] OPENAI_BASE_URL = ${process.env.OPENAI_BASE_URL || 'not set'}`);
  console.log(`[MidsceneEnv] MIDSCENE_USE_QWEN_VL = ${process.env.MIDSCENE_USE_QWEN_VL || 'not set'}`);
  console.log(`[MidsceneEnv] MIDSCENE_USE_GEMINI = ${process.env.MIDSCENE_USE_GEMINI || 'not set'}`);
  console.log(`[MidsceneEnv] MIDSCENE_USE_VLM_UI_TARS = ${process.env.MIDSCENE_USE_VLM_UI_TARS || 'not set'}`);
  console.log(`[MidsceneEnv] MIDSCENE_MODEL_NAME = ${process.env.MIDSCENE_MODEL_NAME || 'not set'}`);

  // Reset all environment variables to avoid conflicts
  delete process.env.OPENAI_BASE_URL;
  delete process.env.MIDSCENE_USE_QWEN_VL;
  delete process.env.MIDSCENE_USE_GEMINI;
  delete process.env.MIDSCENE_USE_VLM_UI_TARS;
  
  // Standard configuration across all models
  process.env.MIDSCNE
  process.env.MIDSCENE_MAX_STEPS = '20';
  process.env.MIDSCENE_TIMEOUT = '1800000'; // 30 min

  // Configure environment based on selected engine
  switch (preferredEngine) {
    case 'gpt-4o':
      // OpenAI GPT-4o configuration
      const gpt4oKey = (user?.apiKeys?.gpt4o && user.apiKeys.gpt4o.trim().length > 0)
        ? user.apiKeys.gpt4o.trim()
        : DEFAULT_GPT4O_KEY;
      
      process.env.OPENAI_API_KEY = gpt4oKey;
      process.env.MIDSCENE_MODEL_NAME = 'gpt-4o';
      // Optional custom endpoint configuration
      if (process.env.CUSTOM_OPENAI_ENDPOINT) {
        process.env.OPENAI_BASE_URL = process.env.CUSTOM_OPENAI_ENDPOINT;
      }
      
      console.log(`[MidsceneEnv] Configured GPT-4o, hasKey=${gpt4oKey.length > 0}`);
      break;

    case 'qwen-2.5-vl-72b':
      // Qwen-2.5-VL 72B Instruct configuration via OpenRouter per documentation
      // https://midscenejs.com/choose-a-model.html
      const qwenKey = (user?.apiKeys?.qwen && user.apiKeys.qwen.trim().length > 0)
        ? user.apiKeys.qwen.trim()
        : DEFAULT_OPENROUTER_KEY;
      
      // Configure Qwen via OpenRouter approach per documentation
      process.env.OPENAI_BASE_URL = 'https://openrouter.ai/api/v1';
      process.env.OPENAI_API_KEY = qwenKey;
      process.env.MIDSCENE_MODEL_NAME = 'qwen/qwen2.5-vl-72b-instruct';
      process.env.MIDSCENE_USE_QWEN_VL = '1';
      
      console.log(`[MidsceneEnv] Configured Qwen-2.5-VL via OpenRouter, hasKey=${qwenKey.length > 0}`);
      break;

    case 'gemini-2.5-pro':
      // Gemini-2.5-Pro configuration per documentation (https://midscenejs.com/choose-a-model.html)
      const geminiKey = (user?.apiKeys?.gemini && user.apiKeys.gemini.trim().length > 0)
        ? user.apiKeys.gemini.trim()
        : DEFAULT_GEMINI_KEY;
      
      // Debug check for valid Gemini API key format
      if (geminiKey.startsWith('sk-') || !geminiKey.includes('_')) {
        console.warn(`[MidsceneEnv] WARNING: Gemini API key may be in incorrect format! Google API keys typically start with 'AIza' and don't use 'sk-' prefix`);
      }
      
      // Make sure we're using the correct Google API key format
      // According to Google documentation, API keys should be passed without Bearer prefix
      const formattedGeminiKey = geminiKey;
      
      // Configure Gemini per documentation
      process.env.OPENAI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
      process.env.OPENAI_API_KEY = formattedGeminiKey;
      process.env.MIDSCENE_MODEL_NAME = 'gemini-2.5-pro';
      process.env.MIDSCENE_USE_GEMINI = '1';
      
      // Additional debugging info for Gemini setup
      console.log(`[MidsceneEnv] Configured Gemini-2.5-Pro, hasKey=${geminiKey.length > 0}`);
      console.log(`[MidsceneEnv] API key format check: starts with 'AIza'=${geminiKey.startsWith('AIza')}`);
      break;

    case 'ui-tars':
      // UI-TARS configuration with DOUBAO engine according to documentation
      // https://midscenejs.com/choose-a-model.html
      const uitarsKey = (user?.apiKeys?.uitars && user.apiKeys.uitars.trim().length > 0)
        ? user.apiKeys.uitars.trim()
        : DEFAULT_UITARS_KEY;
      
      // Check if the key looks like an inference access point ID
      const isInferencePoint = uitarsKey.startsWith('ep-');
      
      // UI-TARS/DOUBAO configuration
      process.env.OPENAI_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
      process.env.OPENAI_API_KEY = uitarsKey; // API key
      process.env.MIDSCENE_MODEL_NAME = isInferencePoint ? uitarsKey : 'ui-tars-72b-sft'; // Use access point ID or default model
      process.env.MIDSCENE_USE_VLM_UI_TARS = 'DOUBAO';
      
      console.log(`[NexusEnv] Configured UI-TARS (DOUBAO), hasKey=${uitarsKey.length > 3}, using ${isInferencePoint ? 'inference point' : 'default model name'}`);
      break;

    default:
      console.error(`[NexusEnv] Unknown engine: ${preferredEngine}, falling back to GPT-4o`);
      // Fall back to GPT-4o
      const fallbackKey = (user?.apiKeys?.gpt4o && user.apiKeys.gpt4o.trim().length > 0)
        ? user.apiKeys.gpt4o.trim()
        : DEFAULT_GPT4O_KEY;
      
      process.env.OPENAI_API_KEY = fallbackKey;
      process.env.MIDSCENE_MODEL_NAME = 'gpt-4o';
      
      console.log(`[NexusEnv] Fallback to GPT-4o, hasKey=${fallbackKey.length > 0}`);
  }
  
  // Log the final state of environment variables after setup
  console.log(`[MidsceneEnv] AFTER SETUP - Final environment variables state:`);
  console.log(`[MidsceneEnv] OPENAI_BASE_URL = ${process.env.OPENAI_BASE_URL || 'not set'}`);
  console.log(`[MidsceneEnv] OPENAI_API_KEY = ${process.env.OPENAI_API_KEY ? '*****' + process.env.OPENAI_API_KEY.slice(-5) : 'not set'}`);
  console.log(`[MidsceneEnv] MIDSCENE_USE_QWEN_VL = ${process.env.MIDSCENE_USE_QWEN_VL || 'not set'}`);
  console.log(`[MidsceneEnv] MIDSCENE_USE_GEMINI = ${process.env.MIDSCENE_USE_GEMINI || 'not set'}`);
  console.log(`[MidsceneEnv] MIDSCENE_USE_VLM_UI_TARS = ${process.env.MIDSCENE_USE_VLM_UI_TARS || 'not set'}`);
  console.log(`[MidsceneEnv] MIDSCENE_MODEL_NAME = ${process.env.MIDSCENE_MODEL_NAME || 'not set'}`);
  console.log(`[MidsceneEnv] MIDSCENE_MAX_STEPS = ${process.env.MIDSCENE_MAX_STEPS || 'not set'}`);
  console.log(`[MidsceneEnv] MIDSCENE_TIMEOUT = ${process.env.MIDSCENE_TIMEOUT || 'not set'}`);
  
  return true;
}

/**
 * Enhanced browser action handler with comprehensive logging and obstacle management
 * @param {Object} args - Action arguments
 * @param {string} userId - User ID
 * @param {string} taskId - Task ID
 * @param {string} runId - Run ID 
 * @param {string} runDir - Run directory
 * @param {number} currentStep - Current step number
 * @param {Object} existingSession - Existing browser session
 * @returns {Object} - Result of the action
 */
async function handleBrowserAction(args, userId, taskId, runId, runDir, currentStep = 0, existingSession) {
  console.log(`[BrowserAction] Received currentStep: ${currentStep}`);
  
  // Set up environment variables for midscene based on user preferences
  await setupNexusEnvironment(userId);
  
  const { command, url: providedUrl } = args;
  let browser, agent, page, release;

  const actionLog = [];
  const logAction = (message, data = null) => {
    actionLog.push({ timestamp: new Date().toISOString(), step: currentStep, message, data: data ? JSON.stringify(data) : null });
    console.log(`[BrowserAction][Step ${currentStep}] ${message}`, data || '');
  };

  try {
    logAction(`Starting action with command: "${command}", URL: "${providedUrl || 'none provided'}"`);

    // Determine if it's a navigation command and set effective URL.
    const isNavigationCommand = command.toLowerCase().startsWith('navigate to ');
    let effectiveUrl;
    if (isNavigationCommand) {
      const navigateMatch = command.match(/navigate to (\S+)/i);
      if (navigateMatch) {
        effectiveUrl = navigateMatch[1];
        logAction(`Extracted URL from command: ${effectiveUrl}`);
      } else {
        throw new Error("Invalid navigate to command: no URL found");
      }
    } else {
      effectiveUrl = providedUrl;
    }

    // Validate URL for new tasks.
    if (!existingSession && !effectiveUrl) {
      throw new Error("URL required for new tasks");
    }

    // Override session using taskId to ensure unique session per task
    args.task_id = taskId;
    existingSession = activeBrowsers.get(taskId);

    // Browser session management.
    if (existingSession) {
      logAction("Using existing browser session");
      ({ browser, agent, page, release } = existingSession);
      
      // If the page is invalid or closed, create a new one.
      if (!page || page.isClosed()) {
        try {
          // Get a semaphore lock to prevent too many concurrent browser instances
          release = await browserSemaphore.acquire();
          
          if (existingSession) {
            browser = existingSession.browser;
            
            // Use existing page if provided, or get the first one
            page = existingSession.page || (await browser.pages())[0];
            logAction('Re-using previous browser session');
            
            // Initialize midscene agent with just the page (reads env vars internally)
            agent = new PuppeteerAgent(page);
            
            if (effectiveUrl && !isNavigationCommand) {
              logAction(`Navigating to provided URL: ${effectiveUrl}`);
              await page.goto(effectiveUrl, { timeout: 30000, waitUntil: 'networkidle2' });
            }
          } else {
            // Create new session and navigate.
            logAction(`Creating new browser session and navigating to URL: ${effectiveUrl}`);
            release = await browserSemaphore.acquire();
            logAction("Acquired browser semaphore");

            // Get debug-configured launch options
            const launchOptions = await getDebugLaunchOptions();
            
            logAction(`Launching browser with options: ${JSON.stringify(launchOptions, null, 2)}`);
            browser = await puppeteerExtra.launch(launchOptions);
            logAction("Browser launched successfully");
            page = await browser.newPage();
            logAction("New page created");
            await page.setDefaultNavigationTimeout(300000); // 5 minutes

            // Set up listeners.
            page.on('console', msg => {
              debugLog(`Console: ${msg.text().substring(0, 150)}`);
            });
            page.on('pageerror', err => {
              debugLog(`Page error: ${err.message}`);
            });
            page.on('request', req => {
              if (['document', 'script', 'xhr', 'fetch'].includes(req.resourceType()) &&
                  !req.url().includes("challenges.cloudflare.com")) {
                debugLog(`Request: ${req.method()} ${req.url().substring(0, 100)}`);
              }
            });
            page.on('response', res => {
              if (['document', 'script', 'xhr', 'fetch'].includes(res.request().resourceType()) &&
                  !res.url().includes("challenges.cloudflare.com")) {
                debugLog(`Response: ${res.status()} ${res.url().substring(0, 100)}`);
              }
            });
            
            logAction(`Navigating to URL: ${effectiveUrl}`);
            await page.goto(effectiveUrl, { waitUntil: 'domcontentloaded', timeout: 300000 });
            logAction("Navigation completed successfully");
            
            // Initialize midscene agent with just the page (reads env vars internally)
            agent = new PuppeteerAgent(page);
            logAction("Nexus agent initialized");
            activeBrowsers.set(taskId, { browser, agent, page, release, closed: false, hasReleased: false });
            logAction("Browser session stored in active browsers");
          }
        } catch (error) {
          logAction(`Error creating browser session: ${error.message}`);
          throw error;
        }
      }
      
      if (!page || page.isClosed()) {
        logAction("Page is invalid or closed, creating a new one");
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
        agent = new PuppeteerAgent(page);
        activeBrowsers.set(taskId, { browser, agent, page, release, closed: false, hasReleased: false });
      }
    } else {
      // Create new session and navigate.
      logAction(`Creating new browser session and navigating to URL: ${effectiveUrl}`);
      release = await browserSemaphore.acquire();
      logAction("Acquired browser semaphore");
      
      // Get debug-configured launch options
      const launchOptions = await getDebugLaunchOptions();
      
      logAction(`Launching browser with options: ${JSON.stringify(launchOptions, null, 2)}`);
      browser = await puppeteerExtra.launch(launchOptions);
      logAction("Browser launched successfully");
      page = await browser.newPage();
      logAction("New page created");
      await page.setDefaultNavigationTimeout(300000); // 5 minutes

      // Set up listeners.
      page.on('console', msg => {
        debugLog(`Console: ${msg.text().substring(0, 150)}`);
      });
      page.on('pageerror', err => {
        debugLog(`Page error: ${err.message}`);
      });
      page.on('request', req => {
        if (['document', 'script', 'xhr', 'fetch'].includes(req.resourceType()) &&
            !req.url().includes("challenges.cloudflare.com")) {
          debugLog(`Request: ${req.method()} ${req.url().substring(0, 100)}`);
        }
      });
      page.on('response', res => {
        if (['document', 'script', 'xhr', 'fetch'].includes(res.request().resourceType()) &&
            !res.url().includes("challenges.cloudflare.com")) {
          debugLog(`Response: ${res.status()} ${res.url().substring(0, 100)}`);
        }
      });
      
      logAction(`Navigating to URL: ${effectiveUrl}`);
      await page.goto(effectiveUrl, { waitUntil: 'domcontentloaded', timeout: 300000 });
      logAction("Navigation completed successfully");
      
      agent = new PuppeteerAgent(page);
      logAction("PuppeteerAgent initialized");
      activeBrowsers.set(taskId, { browser, agent, page, release, closed: false, hasReleased: false });
      logAction("Browser session stored in active browsers");
    }

    // Progress update.
    sendWebSocketUpdate(userId, { 
      event: 'stepProgress', 
      taskId, 
      stepIndex: currentStep, 
      progress: 30, 
      message: `Executing: ${command}`,
      log: actionLog
    });

    // Set viewport.
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    logAction("Set viewport to 1280x720");

    // Execute action (only for non-navigation commands).
    logAction(`Executing action: "${command}"`);
    await agent.aiAction(command);

    logAction("Action executed successfully");

    // Check for popups.
    const popupCheck = await page.evaluate(() => {
      return {
        url: window.location.href,
        popupOpened: window.opener !== null,
        numFrames: window.frames.length,
        alerts: document.querySelectorAll('[role="alert"]').length
      };
    });
    logAction("Post-action popup check", popupCheck);

    if (popupCheck.popupOpened) {
      logAction("Popup detected - checking for new pages");
      const pages = await browser.pages();
      if (pages.length > 1) {
        logAction(`Found ${pages.length} pages, switching to newest`);
        const newPage = pages[pages.length - 1];
        if (newPage !== page) {
          page = newPage;
          agent = new PuppeteerAgent(page);
          logAction("Switched to new page and reinitialized agent");
        }
      }
      
      // Handle page obstacles.
      logAction("Checking for page obstacles");
      const obstacleResults = await handlePageObstacles(page, agent);
      logAction("Obstacle check results", obstacleResults);
    }

    // Extract rich context (extractedInfo remains separate).
    logAction("Extracting rich page context");
    const { pageContent: extractedInfo, navigableElements } = await extractRichPageContext(
      agent, 
      page, 
      command,
      "Read, scan and observe the page. Then state - What information is now visible on the page? What can be clicked or interacted with?"
    );
    logAction("Rich context extraction complete", { 
      contentLength: typeof extractedInfo === 'string' ? extractedInfo.length : 'object',
      navigableElements: navigableElements.length
    });

    // Capture screenshot.
    const screenshotFilename = `screenshot-${Date.now()}.png`;
    const screenshotPath = path.join(runDir, screenshotFilename);
    const screenshot = await page.screenshot({ encoding: 'base64' });
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot, 'base64'));
    const screenshotUrl = `/nexus_run/${runId}/${screenshotFilename}`;
    logAction("Screenshot captured and saved", { path: screenshotPath });

    const currentUrl = await page.url();
    logAction(`Current URL: ${currentUrl}`);

    console.log('[Server] Preparing to send intermediateResult for taskId:', taskId);
    // Send intermediate result update to the front end with proper error handling
    try {
      sendWebSocketUpdate(userId, {
        event: 'intermediateResult',
        taskId,
        result: {
          screenshotUrl,   
          screenshotPath: screenshotUrl, // Include both for compatibility
          currentUrl,
          extractedInfo,    // Raw extracted info.
          navigableElements
        }
      });
      console.log('[Server] Sent intermediateResult for taskId:', taskId);
    } catch (wsError) {
      console.error(`[Server] Error sending websocket update: ${wsError.message}`);
      logAction(`WebSocket update error: ${wsError.message}`);
      // Continue execution despite WebSocket error
    }

    // Final progress update.
    sendWebSocketUpdate(userId, { 
      event: 'stepProgress', 
      taskId, 
      stepIndex: currentStep, 
      progress: 100, 
      message: 'Action completed',
      log: actionLog
    });

    // Trim action log before returning.
    const trimmedActionLog = actionLog.map(entry => {
      const truncatedMessage = entry.message.length > 700 
        ? entry.message.substring(0, 700) + '...'
        : entry.message;
      return { ...entry, message: truncatedMessage };
    });

    // Create an active browser session to be reused
    const browserSession = { browser, agent, page, release, closed: false, hasReleased: false };
    
    // For efficiency, update the session in the active browsers map as well
    activeBrowsers.set(taskId, browserSession);
    
    // Return full results - now including browserSession for reuse
    // Note: "state" contains only the assertion result.
    return {
      success: true,
      error: null,
      task_id: taskId,
      closed: false,
      currentUrl,
      stepIndex: currentStep,
      actionOutput: `Completed: ${command}`,
      pageTitle: await page.title(),
      extractedInfo,        // Full extraction data.
      navigableElements,      // Navigable elements.
      actionLog: trimmedActionLog,
      screenshotPath: screenshotUrl,
      // Return the browser session so it can be maintained across steps
      browserSession,
      state: {
        assertion: extractedInfo && extractedInfo.pageContent 
        ? extractedInfo.pageContent 
        : 'No content extracted'
      }
    };

  } catch (error) {
    logAction(`Error in browser action: ${error.message}`, { stack: error.stack });
    if (typeof release === 'function') release();

    // Trim action log on error.
    const trimmedActionLog = actionLog.map(entry => {
      const shortMsg = entry.message.length > 150 
        ? entry.message.substring(0, 150) + '...'
        : entry.message;
      return { ...entry, message: shortMsg };
    });

    return {
      success: false,
      error: error.message,
      actionLog: trimmedActionLog,
      currentUrl: page ? await page.url() : null,
      task_id: taskId,
      stepIndex: currentStep
    };
  }
}

/**
 * Enhanced browser query handler with improved logging, obstacle management,
 * and inclusion of a "state" property that holds a concise assertion of the page.
 * @param {Object} args - Query arguments
 * @param {string} userId - User ID
 * @param {string} taskId - Task ID
 * @param {string} runId - Run ID 
 * @param {string} runDir - Run directory
 * @param {number} currentStep - Current step number
 * @param {Object} existingSession - Existing browser session
 * @returns {Object} - Result of the query including state.
 */
async function handleBrowserQuery(args, userId, taskId, runId, runDir, currentStep = 0, existingSession) {
  console.log(`[BrowserQuery] Received currentStep: ${currentStep}`);
  // Set up environment variables for midscene based on user preferences
  await setupNexusEnvironment(userId);
  const { query, url: providedUrl } = args;
  let browser, agent, page, release;

  const actionLog = [];
  const logQuery = (message, data = null) => {
    actionLog.push({ timestamp: new Date().toISOString(), step: currentStep, message, data: data ? JSON.stringify(data) : null });
    console.log(`[BrowserQuery][Step ${currentStep}] ${message}`);
  };

  await updateTaskInDatabase(taskId, {
    status: 'processing',
    progress: 50,
    lastAction: query
  });

  try {
    logQuery(`Starting query: "${query}"`);
    
    const taskKey = taskId;

    if (existingSession) {
      logQuery("Using existing browser session");
      ({ browser, agent, page, release } = existingSession);
      if (!page || page.isClosed()) {
        logQuery("Page is invalid or closed, creating a new one");
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
        agent = new PuppeteerAgent(page);
        activeBrowsers.set(taskId, { browser, agent, page, release, closed: false, hasReleased: false });
      }
    } else if (taskKey && activeBrowsers.has(taskKey)) {
      const session = activeBrowsers.get(taskKey);
      if (!session || !session.browser) {
        logQuery("Browser session not valid, creating a new one.");
        
        // Get debug-configured launch options
        const launchOptions = await getDebugLaunchOptions();
        
        logQuery(`Launching browser with options: ${JSON.stringify(launchOptions, null, 2)}`);
        browser = await puppeteerExtra.launch(launchOptions);
        logQuery("Browser launched successfully");
        page = await browser.newPage();
        logQuery("New page created");
        await page.setDefaultNavigationTimeout(60000); // 60 seconds
        agent = new PuppeteerAgent(page);
        release = null;
        activeBrowsers.set(taskKey, { browser, agent, page, release, closed: false, hasReleased: false });
      } else {
        ({ browser, agent, page, release } = session);
      }
    } else {
      if (!providedUrl) throw new Error("URL required for new tasks");
      logQuery(`Creating new browser session for URL: ${providedUrl}`);
      release = await browserSemaphore.acquire();
      logQuery("Acquired browser semaphore");
      
      // Get debug-configured launch options
      const launchOptions = await getDebugLaunchOptions();
      
      logQuery(`Launching browser with options: ${JSON.stringify(launchOptions, null, 2)}`);
      browser = await puppeteerExtra.launch(launchOptions);
      logQuery("Browser launched successfully");
      page = await browser.newPage();
      logQuery("New page created");
      await page.setDefaultNavigationTimeout(60000); // 60 seconds
      // Set up event listeners.
      page.on('console', msg => {
        debugLog(`Console: ${msg.text().substring(0, 150)}`);
      });
      page.on('pageerror', err => {
        debugLog(`Page error: ${err.message}`);
      });
      page.on('request', req => {
        if (['document', 'script', 'xhr', 'fetch'].includes(req.resourceType()) &&
            !req.url().includes("challenges.cloudflare.com")) {
          debugLog(`Request: ${req.method()} ${req.url().substring(0, 100)}`);
        }
      });
      page.on('response', res => {
        if (['document', 'script', 'xhr', 'fetch'].includes(res.request().resourceType()) &&
            !res.url().includes("challenges.cloudflare.com")) {
          debugLog(`Response: ${res.status()} ${res.url().substring(0, 100)}`);
        }
      });
      
      logQuery(`Navigating to URL: ${providedUrl}`);
      await page.goto(providedUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      logQuery("Navigation completed successfully");
      
      // Initialize midscene agent with just the page (reads env vars internally)
      agent = new PuppeteerAgent(page);
      logQuery("PuppeteerAgent initialized");
      activeBrowsers.set(taskKey, { browser, agent, page, release, closed: false, hasReleased: false });
      logQuery("Browser session stored in active browsers");
    }

    sendWebSocketUpdate(userId, { 
      event: 'stepProgress', 
      taskId, 
      stepIndex: currentStep, 
      progress: 30, 
      message: `Querying: ${query}`,
      log: actionLog
    });
    
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    logQuery("Set viewport to 1280x720");
    
    logQuery(`Executing query: "${query}"`);
    // Perform extraction only once.
    const { pageContent: extractedInfo, navigableElements } = await extractRichPageContext(
      agent, 
      page, 
      "read, scan, extract, and observe",
      query
    );
    logQuery("Query executed successfully");
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const stateCheck = await page.evaluate(() => ({
      url: window.location.href,
      popupOpened: window.opener !== null,
      numFrames: window.frames.length,
      alerts: document.querySelectorAll('[role="alert"]').length
    }));
    logQuery("Post-query state check", stateCheck);
    
    if (stateCheck.popupOpened) {
      logQuery("Popup detected - checking for new pages");
      const pages = await browser.pages();
      if (pages.length > 1) {
        logQuery(`Found ${pages.length} pages, switching to newest`);
        const newPage = pages[pages.length - 1];
        if (newPage !== page) {
          page = newPage;
          agent = new PuppeteerAgent(page);
          logQuery("Switched to new page and reinitialized agent");
        }
      }
    }
    
    const screenshot = await page.screenshot({ encoding: 'base64' });
    const screenshotFilename = `screenshot-${Date.now()}.png`;
    const screenshotPath = path.join(runDir, screenshotFilename);
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot, 'base64'));
    const screenshotUrl = `/nexus_run/${runId}/${screenshotFilename}`;
    logQuery("Screenshot captured and saved", { path: screenshotPath });

    const currentUrl = await page.url();
    logQuery(`Current URL: ${currentUrl}`);
    
    try {
      sendWebSocketUpdate(userId, {
        event: 'intermediateResult',
        taskId,
        result: {
          screenshotUrl,
          screenshotPath: screenshotUrl, // Include both for consistency
          currentUrl,
          extractedInfo: cleanForPrompt(extractedInfo),
          navigableElements: Array.isArray(navigableElements) 
            ? navigableElements.map(el => cleanForPrompt(el))
            : cleanForPrompt(navigableElements)
        }
      });
      logQuery("Sent intermediate result WebSocket update");
    } catch (wsError) {
      console.error(`[BrowserQuery] Error sending WebSocket update: ${wsError.message}`);
      logQuery(`WebSocket update error: ${wsError.message}`);
      // Continue execution despite WebSocket error
    }

    try {
      sendWebSocketUpdate(userId, { 
        event: 'stepProgress', 
        taskId, 
        stepIndex: currentStep, 
        progress: 100, 
        message: 'Query completed',
        log: actionLog
      });
      logQuery("Sent step progress WebSocket update");
    } catch (wsError) {
      console.error(`[BrowserQuery] Error sending step progress update: ${wsError.message}`);
      logQuery(`Step progress WebSocket update error: ${wsError.message}`);
      // Continue execution despite WebSocket error
    }

    const trimmedActionLog = actionLog.map(entry => {
      const truncatedMessage = entry.message.length > 700 
        ? entry.message.substring(0, 700) + '...'
        : entry.message;
      return { ...entry, message: truncatedMessage };
    });

    const assertion = 'After execution, this is whats now visible: ' + extractedInfo.substring(0, 150) + '...';
    logQuery("Assertion for query completed", { assertion });

    // Create a browser session object for reuse
    const browserSession = { browser, agent, page, release, closed: false, hasReleased: false };
    
    // Update the active browsers map
    activeBrowsers.set(taskId, browserSession);
    
    // Return full results with state holding the assertion and browser session for reuse
    return {
      success: true,
      error: null,
      task_id: taskId,
      closed: false,
      currentUrl,
      stepIndex: currentStep,
      actionOutput: `Completed: ${query}`,
      pageTitle: await page.title(),
      extractedInfo,
      navigableElements,
      actionLog: trimmedActionLog,
      screenshotPath: screenshotUrl,
      // Include browser session for reuse across steps
      browserSession,
      state: {
        assertion // The state now holds the concise summary of the page.
      }
    };
  } catch (error) {
    logQuery(`Error in browser query: ${error.message}`, { stack: error.stack });
    if (typeof release === 'function') release();

    const trimmedActionLog = actionLog.map(entry => {
      const shortMsg = entry.message.length > 150 
        ? entry.message.substring(0, 150) + '...'
        : entry.message;
      return { ...entry, message: shortMsg };
    });

    return {
      success: false,
      error: error.message,
      actionLog: trimmedActionLog,
      currentUrl: page ? await page.url() : null,
      task_id: taskId,
      stepIndex: currentStep
    };
  }
}

// Global handler for unhandled promise rejections, particularly for Puppeteer
process.on('unhandledRejection', (reason, promise) => {
  // Only log detailed info for non-puppeteer errors to avoid console spam
  if (reason && reason.message && reason.message.includes('Request is already handled')) {
    // This is a known Puppeteer issue when request interception has race conditions
    // Just log a brief message and continue - it doesn't affect functionality
    console.log('[Puppeteer] Ignoring known issue: Request is already handled');
  } else {
    // For other types of unhandled rejections, log full details
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  }
  // Don't crash the process, allowing the application to continue
});

// ===========================
// MAIN CHAT LOGIC & route entry
// ===========================

// Token usage tracking is implemented further down in the file

/**
 * Quick Classifier that calls your LLM to see if the user wants “chat” or “task”.
 * 
 */
async function openaiClassifyPrompt(prompt, userId) {
  // Declare client outside try block so it's available in the catch block
  let client;
  
  try {
    // IMPORTANT: Always use chat-specific model preference for classification
    // This ensures we're not affected by browser automation engine selection
    client = await getUserOpenAiClient(userId, true); // true = for chat purpose
    
    // Always use a small model for classification to save tokens
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini', 
      messages: [
        { role: 'system', content: 'You classify user messages as "task" or "chat". If its a browser automation instruction classify as task. Else if its neutral or more complex or comment or question classify as chat. Respond ONLY with "task" or "chat".' },
        { role: 'user',   content: prompt }
      ],
      temperature: 0,
      max_tokens: 5
    });
    
    // Estimate token usage (approximate calculation)
    // System prompt (~20 tokens) + user prompt (~tokens based on length) + response (1-5 tokens)
    const promptTokens = Math.ceil(prompt.length / 4); // Rough estimate: 4 chars per token
    const totalTokens = 20 + promptTokens + 5;
    
    // Track token usage
    await trackTokenUsage(userId, totalTokens, "gpt-4o-mini");
    
    const c = resp.choices?.[0]?.message?.content?.toLowerCase() || '';
    return c.includes('task') ? 'task' : 'chat';
  } catch (err) {
    // Handle authentication errors specially
    if (err.status === 401 || err.message?.includes('auth')) {
      const keyType = client?.defaultQuery?.keyType || 'unknown';
      console.error(`Authentication error with ${keyType} API key during classification: ${err.message}`);
      return { error: 'auth', message: `Authentication error with your ${keyType} API key. Please check your settings.` };
    }
    // Handle rate limit errors specifically
    else if (err.status === 429 || err.code === 'insufficient_quota' || err.message?.includes('exceeded your current quota')) {
      const provider = client?.defaultQuery?.provider || 'OpenAI';
      const errorMessage = `Rate limit exceeded with ${provider} API: ${err.message}`;
      console.error('Error classifying prompt:', err);
      return { 
        error: 'rate_limit', 
        message: `🚫 API Quota Exceeded: You've exceeded your ${provider} API quota. Please check your billing details or switch models.` 
      };
    } else {
      console.error('Error classifying prompt:', err);
      return { error: 'general', message: `Error: ${err.message}` };
    }
    // If we return with no return statement, default to chat
  }
}

/**
 * Refactored processTask function using the grand plan approach
 * @param {string} userId - User ID
 * @param {string} userEmail - User email
 * @param {string} taskId - Task ID
 * @param {string} runId - Run ID 
 * @param {string} runDir - Run directory
 * @param {string} prompt - Task prompt
 * @param {string} url - Starting URL
 * @param {string} engine - Engine to use for this task (optional)
 */

// Import YAML map processing utilities
import { processYamlMapTask, extractYamlMapIdFromPrompt } from './src/utils/yamlProcessor.js';

async function processTask(userId, userEmail, taskId, runId, runDir, prompt, url, engine) {
  // --- Unified message persistence: save user command as message ---
  await new Message({
    userId,
    role: 'user',
    type: 'command',
    content: prompt,
    taskId,
    timestamp: new Date()
  }).save();
  console.log(`[ProcessTask] Starting ${taskId}: "${prompt}"`);
  
  // Check if the prompt contains a YAML map reference or if it was attached via the UI
  let yamlMapId = extractYamlMapIdFromPrompt(prompt);
  
  // Also check if the prompt contains a direct YAML map reference that might be formatted differently
  if (!yamlMapId) {
    // Alternative pattern check: Look for "yaml map: ID" pattern
    const yamlMapPattern = /yaml\s+map:?\s+([a-zA-Z0-9]+)/i;
    const match = prompt.match(yamlMapPattern);
    if (match && match[1]) {
      yamlMapId = match[1];
      console.log(`[ProcessTask] Detected YAML map ID from alternative pattern: ${yamlMapId}`);
    }
  }
  
  if (yamlMapId) {
    console.log(`[ProcessTask] Detected YAML map reference: ${yamlMapId}`);
    await Task.updateOne({ _id: taskId }, { $set: { yamlMapId, status: 'executing' } });
  
    // Fetch user document to determine browserEngine
    const user = await User.findById(userId).select('preferredEngine modelPreferences').lean();
    const browserPreference = user?.modelPreferences?.browser;
    const browserEngine = browserPreference || user?.preferredEngine || 'gpt-4o'; // Default to gpt-4o
    console.log(`[ProcessTask] Using browser engine for YAML execution: ${browserEngine}`);
  
    // Verify dependencies
    if (typeof sendWebSocketUpdate !== 'function') {
      console.error(`[ProcessTask] sendWebSocketUpdate is not defined for task ${taskId}`);
      throw new Error('WebSocket update function is not available');
    }
    if (typeof setupNexusEnvironment !== 'function') {
      console.error(`[ProcessTask] setupNexusEnvironment is not defined for task ${taskId}`);
      throw new Error('Nexus environment setup function is not available');
    }

    // Define tasksStore (optional, pass null as default)
    const tasksStore = null; // No store provided; processYamlMapTask handles null

    try {
      const yamlResult = await processYamlMapTask({
        userId,
        userEmail,
        taskId,
        runId,
        runDir,
        yamlMapId,
        url,
        engine: browserEngine,
        tasksStore,
        sendWebSocketUpdate,
        setupNexusEnvironment,
        updateTaskInDatabase: async (taskId, updateData) => {
          return await Task.updateOne({ _id: taskId }, { $set: updateData });
        }
      });
      
      // Close the browser if it's still open after YAML processing
      try {
        if (yamlResult.browserSession && yamlResult.browserSession.browser) {
          console.log(`[ProcessTask] Closing browser for task ${taskId} after YAML processing`);
          await yamlResult.browserSession.browser.close().catch(err => {
            console.error(`[ProcessTask] Error closing browser:`, err);
          });
        }
      } catch (closeBrowserError) {
        console.error(`[ProcessTask] Error during browser cleanup:`, closeBrowserError);
        // Non-critical error, continue with task completion
      }
  
      // Get YAML map name from the result for better display
      const yamlMapName = yamlResult.formattedResult?.raw?.yamlMapName || 'Unknown YAML Map';
      
      // Get the execution result for display in the Task Completion card
      const executionResult = yamlResult.formattedResult?.formattedExecutionResult?.result || 
                           yamlResult.formattedResult?.raw?.executionResult || null;
      
      // Extract clean result messages from the execution results
      let cleanResultMessage = '';
      
      // Try to extract a human-readable result message from the execution result
      if (executionResult) {
        try {
          // If it's already a string, use it directly
          if (typeof executionResult === 'string') {
            cleanResultMessage = executionResult;
          } 
          // If it's an object that needs parsing
          else if (typeof executionResult === 'object') {
            // Check if it's already in the expected format with a description field
            if (executionResult['0'] && executionResult['0'].description) {
              cleanResultMessage = executionResult['0'].description;
            }
            // Look for description in any of the object's properties
            else {
              // First check if it's a simple object with a "0" key containing text
              if (executionResult['0'] && typeof executionResult['0'] === 'string') {
                cleanResultMessage = executionResult['0'];
              }
              // Then search for any description field
              else {
                for (const key in executionResult) {
                  if (executionResult[key] && typeof executionResult[key] === 'object' && executionResult[key].description) {
                    cleanResultMessage = executionResult[key].description;
                    break;
                  }
                }
                
                // If we still don't have a clean message, try to format it nicely
                if (!cleanResultMessage) {
                  // Format the execution result as a readable string
                  if (executionResult['0']) {
                    // Handle numbered results format
                    cleanResultMessage = `Execution result: ${JSON.stringify(executionResult, null, 2)}`;
                  } else {
                    // Try to create a human-readable summary
                    const resultKeys = Object.keys(executionResult);
                    if (resultKeys.length === 1 && typeof executionResult[resultKeys[0]] === 'string') {
                      // Simple single value
                      cleanResultMessage = executionResult[resultKeys[0]];
                    } else {
                      // Format as readable object
                      cleanResultMessage = `Execution result: ${JSON.stringify(executionResult, null, 2)}`;
                    }
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log(`[ProcessTask] Error extracting clean message from execution result:`, e);
          // If parsing fails, use the raw result as string
          cleanResultMessage = String(executionResult);
        }
      }
      
      // Create the full task completion message
      const taskCompletionMessage = `YAML map ${yamlMapName} executed successfully`;
      
      // Add the clean result message if available (without duplicating "executed successfully")
      const fullTaskCompletionMessage = cleanResultMessage ? 
        `${taskCompletionMessage}\n\n${cleanResultMessage}` : 
        taskCompletionMessage;
        
      // Use this message as our success message for all database and WebSocket updates
      const successMessage = fullTaskCompletionMessage;
      
      // Normalize result to match processTaskCompletion structure with enhanced data
      const finalResult = {
        success: yamlResult.success,
        taskId,
        raw: {
          pageText: yamlResult.formattedResult?.raw?.pageText || null,
          url: yamlResult.formattedResult?.url || yamlResult.currentUrl || null,
          yamlMapName: yamlMapName,
          executionResult: executionResult
        },
        aiPrepared: {
          summary: cleanResultMessage, // Use our clean result message here
          nexusReportUrl: yamlResult.formattedResult?.aiPrepared?.nexusReportUrl || null,
          landingReportUrl: yamlResult.formattedResult?.aiPrepared?.landingReportUrl || null,
          runReport: yamlResult.formattedResult?.aiPrepared?.runReport || null,
          executionResult: executionResult // Add execution result to aiPrepared for easy access
        },
        screenshot: yamlResult.formattedResult?.screenshotUrl || yamlResult.formattedResult?.screenshotPath || null,
        screenshotPath: yamlResult.formattedResult?.screenshotPath || null,
        screenshotUrl: yamlResult.formattedResult?.screenshotUrl || yamlResult.formattedResult?.screenshotPath || null,
        steps: yamlResult.formattedResult?.steps || [],
        landingReportUrl: yamlResult.formattedResult?.aiPrepared?.landingReportUrl || null,
        nexusReportUrl: yamlResult.formattedResult?.aiPrepared?.nexusReportUrl || null,
        runReport: yamlResult.formattedResult?.aiPrepared?.runReport || null,
        intermediateResults: yamlResult.formattedResult?.intermediateResults || [],
        error: yamlResult.error || null,
        reportUrl: yamlResult.formattedResult?.reportUrl || yamlResult.formattedResult?.aiPrepared?.nexusReportUrl || yamlResult.formattedResult?.aiPrepared?.landingReportUrl || null,
        aiSummary: successMessage,
        yamlMapName: yamlMapName, // Save the actual YAML map name
        executionResult: executionResult // Save the execution result for display
      };
  
      // Log YAML result for debugging
      console.log('[YAML Screenshot Debug] Processing YAML result:', {
        taskId,
        hasScreenshotInFormattedResult: !!yamlResult.formattedResult?.screenshotUrl,
        formattedResultScreenshot: yamlResult.formattedResult?.screenshotUrl || null,
        formattedResultScreenshotPath: yamlResult.formattedResult?.screenshotPath || null,
        hasActionLog: Array.isArray(yamlResult.actionLog),
        actionLogLength: Array.isArray(yamlResult.actionLog) ? yamlResult.actionLog.length : 0,
        hasScreenshotInActionLog: !!yamlResult.actionLog?.find(log => 
          log.data?.screenshotUrl && 
          log.message?.includes('Screenshot captured successfully')
        )
      });
      // Find the actual screenshot URL from various possible sources for YAML tasks
      let finalScreenshotUrl = null;
      
      // MOST IMPORTANT SOURCE: Check in actionLog for the "Screenshot captured successfully" message
      // This is the most reliable source for YAML tasks as shown in the logs
      if (Array.isArray(yamlResult.actionLog)) {
        console.log('[YAML Screenshot Tracking] Searching actionLog for screenshot messages...');
        // Log all messages to see what's available
        yamlResult.actionLog.forEach((log, index) => {
          if (log.message?.includes('Screenshot')) {
            console.log(`[YAML Screenshot Tracking] Found screenshot-related log entry #${index}:`, { 
              message: log.message,
              hasData: !!log.data,
              hasScreenshotUrl: !!log.data?.screenshotUrl,
              screenshotUrl: log.data?.screenshotUrl
            });
          }
        });
        
        const screenshotLog = yamlResult.actionLog.find(log => 
          log.message?.includes('Screenshot captured successfully') && 
          log.data?.screenshotUrl
        );
        
        if (screenshotLog?.data?.screenshotUrl) {
          // The URL is already in the correct web-friendly format from yamlProcessor
          finalScreenshotUrl = screenshotLog.data.screenshotUrl;
          console.log('[YAML Screenshot Tracking] ✓ Found correctly formatted screenshot URL in actionLog:', finalScreenshotUrl);
        } else {
          console.log('[YAML Screenshot Tracking] × No matching screenshot log entry found with correct criteria');
        }
      } else {
        console.log('[YAML Screenshot Tracking] × No actionLog array available in yamlResult');
      }
      
      // Fallback options if not found in actionLog
      if (!finalScreenshotUrl) {
        // Try direct properties in yamlResult
        finalScreenshotUrl = yamlResult.screenshotUrl || yamlResult.screenshotPath;
        
        // Try in formattedResult
        if (!finalScreenshotUrl && yamlResult.formattedResult) {
          finalScreenshotUrl = yamlResult.formattedResult.screenshotUrl || 
                              yamlResult.formattedResult.screenshotPath || 
                              yamlResult.formattedResult.screenshot;
        }
        
        // Try in steps
        if (!finalScreenshotUrl && yamlResult.formattedResult?.steps?.length > 0) {
          for (const step of yamlResult.formattedResult.steps) {
            const stepScreenshot = step.screenshot || step.screenshotPath || step.screenshotUrl;
            if (stepScreenshot) {
              finalScreenshotUrl = stepScreenshot;
              console.log('[YAML Screenshot Debug] Found screenshot in steps:', finalScreenshotUrl);
              break;
            }
          }
        }
        
        // Try in intermediate results
        if (!finalScreenshotUrl && yamlResult.formattedResult?.intermediateResults?.length > 0) {
          for (const result of yamlResult.formattedResult.intermediateResults) {
            const resultScreenshot = result.screenshot || result.screenshotPath || result.screenshotUrl;
            if (resultScreenshot) {
              finalScreenshotUrl = resultScreenshot;
              console.log('[YAML Screenshot Debug] Found screenshot in intermediateResults:', finalScreenshotUrl);
              break;
            }
          }
        }
      }
      
      // Simple path correction if needed (only for fallback paths)
      if (finalScreenshotUrl && !finalScreenshotUrl.startsWith('/') && 
          !finalScreenshotUrl.startsWith('http') && !finalScreenshotUrl.startsWith('data:')) {
        finalScreenshotUrl = '/' + finalScreenshotUrl;
      }
      
      // If we found a screenshot URL, make sure finalResult has it too for future reference
      if (finalScreenshotUrl) {
        console.log('[YAML Screenshot Tracking] Setting screenshot URL in finalResult:', finalScreenshotUrl);
        
        // Update the finalResult object with the found screenshot URL
        finalResult.screenshotUrl = finalScreenshotUrl;
        finalResult.screenshotPath = finalScreenshotUrl;
        finalResult.screenshot = finalScreenshotUrl;
        
        console.log('[YAML Screenshot Tracking] Updated finalResult:', {
          screenshot: finalResult.screenshot,
          screenshotUrl: finalResult.screenshotUrl,
          screenshotPath: finalResult.screenshotPath
        });
      } else {
        console.warn('[YAML Screenshot Tracking] ⚠️ No screenshot found for YAML task', taskId);
      }

      // Create the update data object with all fields to be set
      const taskUpdateData = {
        status: yamlResult.success ? 'completed' : 'error',
        progress: yamlResult.success ? 100 : 0,
        result: finalResult,
        endTime: new Date(),
        summary: finalResult.aiSummary,
        // Prioritize the newly extracted screenshot URL specifically for YAML tasks
        screenshotUrl: finalScreenshotUrl,
        screenshotPath: finalScreenshotUrl, // Also update the path for consistency
        screenshot: finalScreenshotUrl,     // Add an additional field for maximum compatibility
        nexusReportUrl: finalResult.nexusReportUrl,
        landingReportUrl: finalResult.landingReportUrl
      };
      
      // Log the exact update operation being performed for debugging
      console.log('[YAML Screenshot Tracking] Updating MongoDB Task document with screenshot data:', {
        taskId,
        screenshotFields: {
          screenshot: taskUpdateData.screenshot,
          screenshotUrl: taskUpdateData.screenshotUrl,
          screenshotPath: taskUpdateData.screenshotPath
        }
      });
      
      // Update Task document with final result
      await Task.updateOne(
        { _id: taskId },
        { $set: taskUpdateData }
      );
      
      // Verify the update worked by reading back the document
      try {
        const updatedTask = await Task.findById(taskId).lean();
        console.log('[YAML Screenshot Tracking] Verification - Task after update:', {
          _id: updatedTask._id,
          hasResult: !!updatedTask.result,
          topLevelScreenshot: updatedTask.screenshot,
          topLevelScreenshotUrl: updatedTask.screenshotUrl,
          topLevelScreenshotPath: updatedTask.screenshotPath,
          resultScreenshot: updatedTask.result?.screenshot,
          resultScreenshotUrl: updatedTask.result?.screenshotUrl,
          resultScreenshotPath: updatedTask.result?.screenshotPath,
        });
      } catch (error) {
        console.error('[YAML Screenshot Tracking] Error verifying task update:', error.message);
      }
  
      // Save assistant message using saveTaskCompletionMessages
      await saveTaskCompletionMessages(
        userId,
        taskId,
        prompt,
        fullTaskCompletionMessage, // Use the detailed message with actual results
        fullTaskCompletionMessage, // Use the same detailed message here too
        {
          nexusReportUrl: finalResult.nexusReportUrl,
          landingReportUrl: finalResult.landingReportUrl,
          screenshot: finalResult.screenshot,
          screenshotPath: finalResult.screenshotPath,
          screenshotUrl: finalResult.screenshotUrl,
          completedAt: new Date().toISOString()
        }
      );
  
      // Send thoughtComplete event for UI thought bubble
      sendWebSocketUpdate(userId, {
        event: 'thoughtComplete',
        taskId,
        text: finalResult.aiSummary,
        thought: finalResult.aiSummary
      });
  
      // Send taskComplete event
      sendWebSocketUpdate(userId, {
        event: 'taskComplete',
        taskId,
        progress: 100,
        status: 'completed',
        result: finalResult,
        summary: finalResult.aiSummary,
        log: yamlResult.actionLog ? yamlResult.actionLog.slice(-10) : [], // Safely handle yamlLog
        executionTime: yamlResult.formattedResult?.executionTime || 0,
        timestamp: new Date().toISOString(),
        item: {
          type: 'summary',
          title: `YAML Map: ${yamlResult.formattedResult?.raw?.yamlMapName || 'Unknown Map'}`,
          content: finalResult.aiSummary,
          executionTime: yamlResult.formattedResult?.executionTime || 0,
          timestamp: new Date().toISOString()
        }
      });
  
      return finalResult;
    } catch (error) {
      console.error(`[ProcessTask] Error executing YAML map ${yamlMapId}:`, {
        error: error.message,
        stack: error.stack,
        taskId,
        userId
      });
      const errorResult = {
        success: false,
        taskId,
        raw: { pageText: null, url: null },
        aiPrepared: { summary: null },
        screenshot: null,
        screenshotPath: null,
        screenshotUrl: null,
        steps: [],
        landingReportUrl: null,
        nexusReportUrl: null,
        runReport: null,
        intermediateResults: [],
        error: error.message,
        reportUrl: null,
        aiSummary: `Error executing YAML map: ${error.message}`
      };
  
      // Update Task document with error
      await Task.updateOne(
        { _id: taskId },
        {
          $set: {
            status: 'error',
            progress: 0,
            result: errorResult,
            error: error.message,
            endTime: new Date(),
            summary: errorResult.aiSummary
          }
        }
      );
  
      // Save error message to ChatHistory and Message
      await saveTaskCompletionMessages(
        userId,
        taskId,
        prompt,
        `Error: ${error.message}`,
        errorResult.aiSummary,
        {
          error: error.message,
          completedAt: new Date().toISOString()
        }
      );
  
      // Send taskError event
      sendWebSocketUpdate(userId, {
        event: 'taskError',
        taskId,
        error: error.message,
        log: [], // Use empty array as fallback
        timestamp: new Date().toISOString(),
        item: {
          type: 'error',
          title: 'YAML Map Execution Failed',
          content: error.message,
          timestamp: new Date().toISOString()
        }
      });
  
      throw error;
    } finally {
      console.log(`[ProcessTask] Cleaning up browser session for YAML task ${taskId}`);
      await cleanupBrowserSession(taskId);
    }
  }

  // Fetch the user's preferences including execution mode, browser model, and max steps
  const user = await User.findById(userId).select('executionMode preferredEngine modelPreferences maxSteps').lean();
  const executionMode = user?.executionMode || 'step-planning';
  const maxSteps = user?.maxSteps || 20; // Default to 10 if not set
  
  // First check for explicitly requested engine in the function call
  // Then check user's browser model preference
  // Then fall back to user's general preferred engine
  // Finally default to gpt-4o
  const browserPreference = user?.modelPreferences?.browser;
  const engineToUse = engine || browserPreference || user?.preferredEngine || 'gpt-4o';
  
  console.log(`[ProcessTask] Engine selection for browser automation: ${engineToUse} (from: ${engine ? 'explicit' : browserPreference ? 'browser preference' : user?.preferredEngine ? 'preferred engine' : 'default'})`);
  
  // Check if the engine is valid and the user has access to it
  const keyInfo = await checkEngineApiKey(userId, engineToUse);
  if (!keyInfo.hasKey) {
    console.error(`[ProcessTask] No API key available for ${engineToUse}, falling back to GPT-4o`);
    // Fall back to GPT-4o if no key is available for the specified engine
    // This is a safety fallback that should never happen if the API endpoints are working correctly
    const gpt4oKeyInfo = await checkEngineApiKey(userId, 'gpt-4o');
    if (!gpt4oKeyInfo.hasKey) {
      throw new Error(`No API key available for any engine`);
    }
    // Use GPT-4o as the fallback engine
    // Note: We don't have access to req.session here, but that's fine since we're directly using GPT-4o now
    // Notify the user about the fallback
    notifyApiKeyStatus(userId, {
      hasKey: true,
      engine: 'gpt-4o',
      usingDefault: true,
      keySource: 'fallback-system',
      message: `No API key available for ${engineToUse}, falling back to GPT-4o`
    });
  } else if (keyInfo.usingDefault) {
    // Notify the user that we're using a default key
    notifyApiKeyStatus(userId, keyInfo);
  }
  
  console.log(`[ProcessTask] Using engine: ${engineToUse} with execution mode: ${executionMode} for task ${taskId}`);

  const plan = new TaskPlan(userId, taskId, prompt, url, runDir, runId, maxSteps);
  plan.log(`Plan created with engine: ${engineToUse} and execution mode: ${executionMode}`);

  // Clear any queued old messages for this user to avoid stale deliveries
  unsentMessages.delete(userId);

  try {
    await Task.updateOne({ _id: taskId }, { status:'processing', progress:5 });
    sendWebSocketUpdate(userId, { event:'taskStart', taskId, prompt, url });
    plan.log("taskStart → frontend");

    let taskCompleted = false, consecutiveFailures = 0;

    while (!taskCompleted && plan.currentStepIndex < plan.maxSteps - 1) {
      const systemPrompt = plan.generateSystemPrompt();
      plan.log("SYSTEM PROMPT generated");
      
      let messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ];
      
      if (plan.steps.length > 0) {
        plan.steps.slice(-3).forEach(step => {
          if (step.result) {
            const toolCallId = `call_${step.index}`;
            messages.push({
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: toolCallId,
                  type: "function",
                  function: {
                    name: step.type === 'action' ? 'browser_action' : 'browser_query',
                    arguments: JSON.stringify({
                      [step.type === 'action' ? 'command' : 'query']: step.instruction,
                      task_id: taskId,
                      url: plan.currentUrl
                    })
                  }
                }
              ]
            });
            messages.push({
              role: "tool",
              tool_call_id: toolCallId,
              name: step.type === 'action' ? 'browser_action' : 'browser_query',
              content: JSON.stringify({
                success: step.result.success,
                currentUrl: step.result.currentUrl,
                error: step.result.error,
                extractedInfo: typeof step.result.extractedInfo === 'string'
                  ? step.result.extractedInfo.substring(0, 1500) + '...'
                  : "No extraction",
                navigableElements: Array.isArray(step.result.navigableElements) 
                  ? step.result.navigableElements.slice(0, 30) 
                  : []
              })
            });
          }
        });
      }
      
      if (plan.currentState && plan.currentState.pageDescription) {
        let descriptionText = (typeof plan.currentState.pageDescription === 'string')
          ? plan.currentState.pageDescription.substring(0, 300) + '...'
          : JSON.stringify(plan.currentState.pageDescription).substring(0, 300) + '...';
        messages.push({
          role: "system",
          content: `Current page state: ${descriptionText}`
        });
      }
      
      // Extracted data logged thorough
      if (plan.steps.length > 0) {
        const lastStep = plan.steps[plan.steps.length - 1];
        plan.log("Using extraction from last step", {
          extractedInfo: cleanForPrompt(lastStep.result?.extractedInfo),
          navigableElements: lastStep.result?.navigableElements
        });
      } else {
        plan.log("No intermediate extraction data available.");
      }
      
      // Log which execution mode is being used
      plan.log(`Using execution mode: ${executionMode} for AI request`);
      
      plan.log("Sending function call request to AI", { messages });
      
      // Configure the AI request based on execution mode
      const streamConfig = {
        model: "gpt-4o-mini",
        messages,
        stream: true,
        temperature: 0.3,
        max_tokens: 700,
        tools: [
          {
            type: "function",
            function: {
              name: "browser_action",
              description: "Executes a browser action by specifying a complete natural language instruction, e.g., 'navigate to https://example.com', 'type Sony Wireless headphones into the search bar', or 'click the search button'. The 'command' parameter must include both the verb and the target details.",
              parameters: {
                type: "object",
                properties: {
                  command: { type: "string", description: "Natural language instruction for the browser action, including verb and target" },
                  url: { type: "string", description: "The page URL on which to perform the action" },
                  task_id: { type: "string", description: "Identifier for the current task" }
                },
                required: ["command"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "browser_query",
              description: "Extracts information from the webpage by performing the specified query, e.g., 'list all clickable elements on the page'. The 'query' parameter must clearly state what to extract.",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Natural language query describing what information to extract from the page" },
                  url: { type: "string", description: "The page URL from which to extract information" },
                  task_id: { type: "string", description: "Identifier for the current task" }
                },
                required: ["query"]
              }
            }
          },
          {
            type: "function",
            function: {
              name: "task_complete",
              description: "Signals that the task is complete with a final summary.",
              parameters: {
                type: "object",
                properties: { summary: { type: "string" } },
                required: []
              }
            }
          }
        ],
        tool_choice: "auto"
      };

      // Special handling for UI-TARS and action-planning mode
      const isUiTars = engineToUse === 'ui-tars';
      const isActionPlanning = executionMode === 'action-planning';
      
      if (isUiTars || isActionPlanning) {
        // For UI-TARS or action-planning mode, modify the system prompt to emphasize end-to-end execution
        messages[0].content += "\n\nIMPORTANT: This task will be executed as a DIRECT AUTOMATION INSTRUCTION. " + 
                              "Do not decompose the task into individual steps or attempt to plan a sequence of actions. " + 
                              "Instead, interpret the command as a single, unified task description for the automation system to execute. " + 
                              "Your response should include a clear, comprehensive description of the end goal for the automation tool.";
        
        // Add specialized behavior based on which condition triggered this mode
        if (isUiTars) {
          messages[0].content += "\n\nThis is running on UI-TARS, which has enhanced web automation capabilities. " + 
                                "Focus on the high-level goal rather than specific steps.";
        }
        
        if (isActionPlanning) {
          messages[0].content += "\n\nAction planning mode is enabled. Provide a complete sequence of actions as a single plan. " + 
                                "Think about the full workflow and optimize for efficiency with minimal back-and-forth.";
          
          // Increase temperature for more exploration in action planning mode
          streamConfig.temperature = 0.5;
        }
        
        // Add a user message specifically asking for a direct execution approach
        messages.push({
          role: "user",
          content: "Please treat my request as a direct automation instruction rather than breaking it down into steps. Provide a clear description of what should be accomplished."
        });
      }
      
      // Use the appropriate client based on the selected engine
      let stream;
      
      // Note: We don't need to call setupNexusEnvironment here since it's already called
      // in the lower-level functions (handleBrowserAction and handleBrowserQuery)
      // This avoids redundancy and potential issues with multiple environment setups
      
      // Get a chat client for the orchestration/planning part
      // This client is only used for the planning conversations, not the actual browser automation
      const client = await getUserOpenAiClient(userId);
      
      if (!client) {
        throw new Error(`No chat client available for user ${userId}`);
      }
      
      // Log the model being used for task planning
      const chatModel = client.defaultQuery?.engine || 'gpt-4o';
      plan.log(`Using chat model ${chatModel} for task planning/orchestration`);
      
      stream = await client.chat.completions.create(streamConfig);
      
      let currentFunctionCall = null;
      let accumulatedArgs = '';
      let functionCallReceived = false;
      let thoughtBuffer = '';
      
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        
        if (delta?.content) {
          thoughtBuffer += delta.content;
          // Ensure consistent attribute naming in the WebSocket update
          sendWebSocketUpdate(userId, { 
            event: 'thoughtUpdate', 
            taskId, // This is the key attribute - must be consistently named
            thought: delta.content 
          });
        }
        
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            if (toolCallDelta.index === 0) {
              if (toolCallDelta.function.name && !currentFunctionCall) {
                currentFunctionCall = { name: toolCallDelta.function.name };
                accumulatedArgs = '';
                if (thoughtBuffer) {
                  sendWebSocketUpdate(userId, { event: 'thoughtComplete', taskId, thought: thoughtBuffer });
                  thoughtBuffer = '';
                }
                plan.log(`New tool call started: ${currentFunctionCall.name}`);
                
                // Check if we've reached the maximum steps limit (10 steps)
                // If so, we need to make sure a task_complete is forced if this function call isn't it
                const MAX_STEPS = user?.maxSteps;
                if (plan.steps.length >= MAX_STEPS - 1 && currentFunctionCall.name !== 'task_complete') {
                  plan.log(`WARNING: Reached maximum steps (${MAX_STEPS}). Will force task_complete after this step.`);
                  // Set flag to force task_complete after this function call completes
                  plan.forceTaskComplete = true;
                }
              }
              if (toolCallDelta.function.arguments) {
                accumulatedArgs += toolCallDelta.function.arguments;
                sendWebSocketUpdate(userId, {
                  event: 'functionCallPartial',
                  taskId,
                  functionName: currentFunctionCall?.name,
                  partialArgs: accumulatedArgs
                });
                try {
                  const parsedArgs = JSON.parse(accumulatedArgs);
                  functionCallReceived = true;
                  plan.log(`Function call received: ${currentFunctionCall.name}`, parsedArgs);
                  
                  // Check if we need to force task_complete after this function call
                  const needsForceComplete = plan.forceTaskComplete === true && currentFunctionCall.name !== 'task_complete';
                  
                  // Handle different function types
                  if (currentFunctionCall.name === "browser_action") {
                    const step = plan.createStep('action', parsedArgs.command, parsedArgs);
                    const result = await step.execute(plan);
                    await addIntermediateResult(userId, taskId, result);
                    consecutiveFailures = result.success ? 0 : consecutiveFailures + 1;
                    // Force task_complete if we've reached max steps
                    if (needsForceComplete) {
                      plan.log("Forcing task_complete after this step");
                      // Mark as completed with max steps reached summary
                      const summary = `Task reached maximum steps (20) without explicit completion. Current URL: ${plan.currentUrl || 'N/A'}`;
                      plan.markCompleted(summary, true); // true indicates this was forced
                      
                      // Process task completion
                      const finalResult = await processTaskCompletion(
                        userId,
                        taskId,
                        plan.steps.map(step => step.result || { success: false }),
                        prompt,
                        runDir,
                        runId
                      );
                      
                      // Set the maxStepsReached flag for client awareness
                      finalResult.maxStepsReached = true;
                      
                      // IMPORTANT: Use the original summary from task_complete as the sole source of truth
                      // This fixes inconsistency between different summary sources
                      const aiSummary = summary; // Use the summary from task_complete
                      
                      // Ensure screenshot URL and report URLs are properly included in the task result
                      const enhancedResult = {
                        ...finalResult,
                        // Make sure all screenshot and report URLs are consistently available
                        screenshot: finalResult.screenshot || finalResult.screenshotPath || null,
                        screenshotPath: finalResult.screenshotPath || finalResult.screenshot || null,
                        screenshotUrl: finalResult.screenshotUrl || finalResult.screenshotPath || finalResult.screenshot || null,
                        nexusReportUrl: finalResult.nexusReportUrl || null,
                        landingReportUrl: finalResult.landingReportUrl || null
                      };
                      
                      await Task.updateOne(
                        { _id: taskId },
                        { 
                          $set: { 
                            status: 'completed', 
                            progress: 100, 
                            maxStepsReached: true,
                            result: enhancedResult,
                            endTime: new Date(),
                            summary: aiSummary, // Store the AI-prepared summary in the task record
                            // Also store screenshot and report URLs at the top level for easier access
                            screenshotUrl: enhancedResult.screenshotUrl,
                            screenshotPath: enhancedResult.screenshotPath,
                            nexusReportUrl: enhancedResult.nexusReportUrl,
                            landingReportUrl: enhancedResult.landingReportUrl
                          } 
                        }
                      );
                      
                      // Use the shared function to save task completion messages consistently
                      // This will use the AI-prepared summary instead of a generic message
                      await saveTaskCompletionMessages(
                        userId,
                        taskId,
                        prompt,
                        aiSummary, // Use the rich AI summary
                        aiSummary, // Prioritize AI summary
                        {
                          // Pass all relevant data to the shared function
                          nexusReportUrl: finalResult.nexusReportUrl,
                          landingReportUrl: finalResult.landingReportUrl,
                          errorReportUrl: finalResult.errorReportUrl || null,
                          screenshot: finalResult.screenshot || finalResult.screenshotPath || null,
                          screenshotPath: finalResult.screenshotPath || finalResult.screenshot || null,
                          maxStepsReached: true,
                          completedAt: new Date().toISOString()
                        }
                      );
                      
                      taskCompleted = true;
                      break; // Exit the loop since we've forced completion
                    }
                    
                    if (consecutiveFailures >= 3) {
                      plan.log("Triggering recovery due to consecutive failures");
                      const recoveryStep = plan.createStep('query', 'Suggest a new approach to achieve the Main Task', {
                        query: 'Suggest a new approach to achieve the Main Task',
                        task_id: taskId,
                        url: plan.currentUrl
                      });
                      await recoveryStep.execute(plan);
                      consecutiveFailures = 0;
                    }
                    functionCallReceived = true;
                    break;
                  } else if (currentFunctionCall.name === "browser_query") {
                    const step = plan.createStep('query', parsedArgs.query, parsedArgs);
                    const result = await step.execute(plan);
                    await addIntermediateResult(userId, taskId, result);
                    consecutiveFailures = 0;
                    functionCallReceived = true;
                    
                    // In action-planning mode, we might want to automatically follow up with actions
                    // based on the query results without requiring additional back-and-forth
                    if (executionMode === 'action-planning' && result.success) {
                      plan.log("Action-planning mode: analyzing query results for potential follow-up actions");
                    }
                    
                    break;
                  } else if (currentFunctionCall.name === "task_complete") {
                    const summary = parsedArgs.summary || `Task completed: ${prompt}`;
                    plan.markCompleted(summary);
                    const finalResult = await processTaskCompletion(
                      userId,
                      taskId,
                      plan.steps.map(step => step.result || { success: false }),
                      prompt,
                      runDir,
                      runId
                    );
                    const finalExtracted = (finalResult.raw && finalResult.raw.pageText && 
                                            cleanForPrompt(finalResult.raw.pageText).length > 0)
                      ? cleanForPrompt(finalResult.raw.pageText)
                      : (finalResult.aiPrepared && finalResult.aiPrepared.summary && 
                         cleanForPrompt(finalResult.aiPrepared.summary).length > 0)
                        ? cleanForPrompt(finalResult.aiPrepared.summary)
                        : `Task completed: ${prompt}`;
                    const cleanedFinal = {
                      success: finalResult.success,
                      // Prioritize nexus report URL over current URL for user consumption
                      currentUrl: finalResult.raw?.url || finalResult.currentUrl,
                      // Store both report URLs explicitly for easy access
                      nexusReportUrl: finalResult.nexusReportUrl,
                      landingReportUrl: finalResult.landingReportUrl,
                      // Original URL is still important for context
                      originalUrl: finalResult.raw?.url || finalResult.currentUrl,
                      extractedInfo: finalExtracted,
                      screenshotPath: finalResult.screenshot || finalResult.screenshotPath,
                      timestamp: new Date()
                    };

                    // IMPORTANT: Use the original summary from task_complete as the sole source of truth
                    // This ensures consistency between different parts of the application
                    // Only fall back to other sources if summary is empty
                    const aiSummary = summary && summary.trim().length > 0
                        ? summary  // Use the original summary from task_complete as primary source
                        : (finalResult.aiPrepared?.summary && finalResult.aiPrepared?.summary.trim().length > 0
                            ? finalResult.aiPrepared.summary
                            : finalExtracted);
                    
                    // Store the rich AI summary directly in the task result object
                    // so it can be accessed later without additional database lookups
                    cleanedFinal.aiSummary = aiSummary;
                    
                    // CRITICAL FIX: Ensure screenshot and report URLs are consistently available
                    // This ensures the history.js component can always find and serve these URLs
                    cleanedFinal.screenshotUrl = finalResult.screenshot || finalResult.screenshotPath || null;
                    cleanedFinal.screenshotPath = finalResult.screenshotPath || finalResult.screenshot || null;
                    cleanedFinal.screenshot = finalResult.screenshot || finalResult.screenshotPath || null;
                    
                    // Update the task with the complete result including the AI summary
                    await Task.updateOne(
                      { _id: taskId },
                      { 
                        $set: { 
                          status: 'completed', 
                          progress: 100, 
                          result: cleanedFinal, 
                          endTime: new Date(),
                          // Also store these fields at the top level for easier access by ChatHistory
                          screenshotUrl: cleanedFinal.screenshotUrl,
                          screenshotPath: cleanedFinal.screenshotPath,
                          nexusReportUrl: cleanedFinal.nexusReportUrl,
                          landingReportUrl: cleanedFinal.landingReportUrl,
                          aiSummary: aiSummary
                        } 
                      }
                    );

                    // Use the shared function to save task completion messages consistently
                    await saveTaskCompletionMessages(
                      userId,
                      taskId,
                      prompt,
                      finalExtracted, // Original fallback content
                      aiSummary, // CRITICAL: Use the same summary that was stored in the task document
                      {
                        // Pass all relevant data to the shared function - use cleanedFinal which has normalized URLs
                        nexusReportUrl: cleanedFinal.nexusReportUrl,
                        landingReportUrl: cleanedFinal.landingReportUrl,
                        originalUrl: cleanedFinal.originalUrl || finalResult.raw?.url || finalResult.currentUrl,
                        // Use consistent screenshot path/URL values from the cleaned result
                        screenshot: cleanedFinal.screenshot,
                        screenshotPath: cleanedFinal.screenshotPath,
                        screenshotUrl: cleanedFinal.screenshotUrl,
                        maxStepsReached: finalResult.maxStepsReached || plan.forceTaskComplete || false,
                        completedAt: new Date().toISOString()
                      }
                    );
                    
                    // Log the consistent values used for debugging
                    console.log(`[Task ${taskId}] Using consistent values for task completion:`, {
                      summary: aiSummary.substring(0, 100) + '...',
                      nexusReportUrl: cleanedFinal.nexusReportUrl,
                      landingReportUrl: cleanedFinal.landingReportUrl,
                      screenshotUrl: cleanedFinal.screenshotUrl
                    });
                    
                    // CRITICAL: Send thought completion event with content
                    // This is what makes the thought bubble show the content in the UI
                    try {
                      sendWebSocketUpdate(userId, {
                        event: 'thoughtComplete',
                        taskId: taskId.toString(),
                        text: aiSummary, // This is the content that should show in the thought bubble
                        thought: aiSummary // Fallback for older clients
                      });
                      console.log(`[Task ${taskId}] Sent thought completion with content: ${aiSummary.substring(0, 100)}...`);
                    } catch (wsError) {
                      console.error(`[Task ${taskId}] Error sending thought completion:`, wsError);
                    }
                    
                    console.log(`[Task ${taskId}] Stored AI summary in task result: ${aiSummary.substring(0, 100)}...`);
                    
                    console.log(`[Task ${taskId}] Saved assistant message with summary: ${summary} and reports:`, {
                      nexusReport: finalResult.nexusReportUrl || cleanedFinal.nexusReportUrl,
                      landingReport: finalResult.landingReportUrl || cleanedFinal.landingReportUrl
                    });
                    taskCompleted = true;
                    break;
                  }
                } catch (e) {
                  // Continue accumulating if JSON is incomplete
                }
              }
            }
          }
        }}
      
        if (thoughtBuffer) {
          sendWebSocketUpdate(userId, { event: 'thoughtComplete', taskId, thought: thoughtBuffer });
          thoughtBuffer = "";
        }
      
        if (taskCompleted) {
          plan.log(`Task completed after ${plan.currentStepIndex + 1} steps.`);
          break;
        }
      
        if (!functionCallReceived) {
          plan.log(`No tool call received for step ${plan.currentStepIndex + 1}`);
          const recoveryStep = plan.createStep('query', 'Describe the current page state and available actions', {
            query: 'Describe the current page state and available actions',
            task_id: taskId,
            url: plan.currentUrl
          });
          await recoveryStep.execute(plan);
          consecutiveFailures = 0;
        }
      
        const progress = Math.min(95, Math.floor((plan.currentStepIndex + 1) / plan.maxSteps * 100));
        await Task.updateOne(
          { _id: taskId },
          { $set: { status: 'running', progress, currentStepIndex: plan.currentStepIndex, currentUrl: plan.currentUrl } }
        );
        plan.log(`Task progress updated in DB: ${progress}%`);
    }
    
    if (!taskCompleted) {
      const summary = `Task reached maximum steps (${plan.maxSteps}) without explicit completion. Current URL: ${plan.currentUrl}`;
      plan.markCompleted(summary);
      const finalResult = await processTaskCompletion(
        userId,
        taskId,
        plan.steps.map(step => step.result || { success: false }),
        prompt,
        runDir,
        runId
      );
      
      await Task.updateOne(
        { _id: taskId },
        { $set: { status: 'completed', progress: 100, result: finalResult, endTime: new Date(), summary } }
      );
      
      // Use the shared function to save task completion messages consistently
      await saveTaskCompletionMessages(
        userId,
        taskId,
        prompt,
        summary, // Pass the summary as contentText in case there's no AI summary
        finalResult.aiPrepared?.summary || summary, // Prioritize AI-prepared summary
        {
          // Pass all relevant data to the shared function
          nexusReportUrl: finalResult.nexusReportUrl,
          landingReportUrl: finalResult.landingReportUrl,
          errorReportUrl: finalResult.errorReportUrl || null,
          screenshot: finalResult.screenshot || finalResult.screenshotPath || null,
          screenshotPath: finalResult.screenshotPath || finalResult.screenshot || null,
          maxStepsReached: true,
          completedAt: new Date().toISOString()
        }
      );
    }
  } catch (error) {
    console.error(`[ProcessTask] Error in task ${taskId}:`, error);
    plan.log(`Error encountered: ${error.message}`, { stack: error.stack });
    sendWebSocketUpdate(userId, {
      event: 'taskError',
      taskId,
      error: error.message,
      log: plan.planLog.slice(-10)
    });
    await Task.updateOne(
      { _id: taskId },
      { $set: { status: 'error', error: error.message, endTime: new Date() } }
    );
    // --- Save error message as assistant message to both ChatHistory and Message ---
    let taskChatHistory = await ChatHistory.findOne({ userId });
    if (!taskChatHistory) taskChatHistory = new ChatHistory({ userId, messages: [] });
    taskChatHistory.messages.push({
      role: 'assistant',
      content: `Error: ${error.message}`,
      timestamp: new Date()
    });
    await taskChatHistory.save();
    await Message.create({
      userId,
      role: 'assistant',
      type: 'command',
      content: `Error: ${error.message}`,
      taskId,
      timestamp: new Date(),
      meta: { error: error.message }
    });
    // -------------------------------------------------------------
  } finally {
    console.log(`[ProcessTask] Cleaning up browser session for task ${taskId}`);
    await cleanupBrowserSession(taskId);

    console.log(`[ProcessTask] Task ${taskId} finished with ${plan.steps.length} steps executed.`);
    
    try {
      await Task.updateOne(
        { _id: taskId },
        { $set: { planSummary: plan.getSummary(), stepsExecuted: plan.steps.length } }
      );
      plan.log("Plan summary saved to database.");
    } catch (dbError) {
      console.error(`[ProcessTask] Error saving plan summary:`, dbError);
    }
  }
}

function cleanForPrompt(data) {
  if (data == null) return "";
  let str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  // Remove known placeholder text
  if (str.trim() === "Structured data") return "";
  return str.trim();
}

/**
 * Track token usage for a user
 * @param {string} userId - User ID
 * @param {number} tokensUsed - Number of tokens used
 * @param {string} model - LLM model used
 */
async function trackTokenUsage(userId, tokensUsed, model = 'gpt-4o') {
  try {
    if (!userId || tokensUsed <= 0) return;
    
    // Find or create billing record
    let billing = await Billing.findOne({ userId });
    
    if (!billing) {
      billing = new Billing({
        userId,
        tokens: { used: 0, available: 1000 }, // Start with 1000 free tokens
        requests: { count: 0, limit: 100 },
        plan: 'free'
      });
    }
    
    // Update token usage
    billing.tokens.used += tokensUsed;
    
    // Add transaction for usage
    billing.transactions.push({
      type: 'usage',
      amount: tokensUsed / 1000, // Amount in USD equivalent
      tokens: tokensUsed,
      timestamp: new Date(),
      details: `Used ${tokensUsed} tokens with model ${model}`
    });
    
    // Increment request count
    billing.requests.count += 1;
    
    await billing.save();
    console.log(`Updated token usage for user ${userId}: +${tokensUsed} tokens used`);
    
    // Check if user is out of tokens
    if (billing.tokens.available <= billing.tokens.used && billing.plan !== 'free') {
      console.warn(`User ${userId} has used all available tokens`);
      // Here you could implement logic to notify the user or restrict access
    }
  } catch (err) {
    console.error('Error tracking token usage:', err);
  }
}

/**
 * Helper function to add intermediate results to a task
 * @param {string} userId - User ID
 * @param {string} taskId - Task ID
 * @param {Object} result - Result to add
 */
async function addIntermediateResult(userId, taskId, result) {
  try {
    // Only keep fields you care about, truncating any large text.
    const cleanedResult = {
      success: result.success,
      currentUrl: result.currentUrl,
      extractedInfo: typeof result.extractedInfo === 'string'
        ? result.extractedInfo.substring(0, 1500) + '...'
        : 'Complex data omitted',
      navigableElements: Array.isArray(result.navigableElements) 
        ? result.navigableElements.slice(0, 30) 
        : [],
      screenshotPath: result.screenshotPath,  // Only store path/URL, not raw base64
      timestamp: new Date()
    };

    await Task.updateOne(
      { _id: taskId },
      { 
        $push: { intermediateResults: cleanedResult },
        $set: {
          currentUrl: result.currentUrl,
          lastUpdate: new Date()
        }
      }
    );
  } catch (error) {
    console.error(`[addIntermediateResult] Error:`, error);
  }
}

async function extractRichPageContext(agent, page, command, query) {
  const currentUrl = await page.url();
  const domainType = detectDomainType(currentUrl);
  const domainSpecificPrompt = generateDomainSpecificPrompt(domainType);
  
  const combinedQuery = `
After executing "${command}", thoroughly analyze the page and return a JSON object with the following structure:
{
  "main_content": "Describe the main content visible on the page (listed information, products, tokens, prices, titles, important information).",
  "navigable_elements": [
    "List ALL clickable and navigable elements with their EXACT text as shown on screen."
  ],
  "interactive_controls": [
    "List ALL interactive controls (sliders, toggles, filters, etc.) with their EXACT labels if visible."
  ],
  "data_visualization": [
    "List ALL chart controls, time selectors, indicator buttons with their EXACT labels. Detail chart type (line or graph)"
  ],
  "product_filters": [
    "List ALL product filtering options with their EXACT labels."
  ],
  "search_fields": [
    "List any search fields or input areas with their placeholder text."
  ],
  "pagination": "Describe any pagination controls."
}

${domainSpecificPrompt}

Always detail main page content on center of page.  List any products or tokens lists if available on page.

IGNORE ALL IMAGES of phones, laptops, devices, billboards, or any marketing images simulating data presentation.
Detail charts or graphs including chart type (line/bar/candlestick)
Ensure you return valid JSON. If any field is not present, return an empty string or an empty array as appropriate.
[END OF INSTRUCTION]
${query}
  `;
 
  try {
    let extractedInfo = await agent.aiQuery(combinedQuery);
    if (typeof extractedInfo !== 'string') {
      if (extractedInfo && typeof extractedInfo === 'object') {
        const pageContent = extractedInfo.main_content || "No content extracted";
        const navigableElements = [
          ...(Array.isArray(extractedInfo.navigable_elements) ? extractedInfo.navigable_elements : []),
          ...(Array.isArray(extractedInfo.interactive_controls) ? extractedInfo.interactive_controls : []),
          ...(Array.isArray(extractedInfo.data_visualization) ? extractedInfo.data_visualization : []),
          ...(Array.isArray(extractedInfo.product_filters) ? extractedInfo.product_filters : [])
        ];
        return { pageContent, navigableElements };
      }
      return { pageContent: "No content extracted", navigableElements: [] };
    }
    
    let pageContent = extractedInfo;
    let navigableElements = [];
    try {
      const sections = extractedInfo.split(/(?:\r?\n){1,}/);
      const elementKeywords = [
        "clickable", "navigable", "button", "link", "menu", "filter", "toggle", 
        "checkbox", "select", "dropdown", "chart", "control", "tab", "icon",
        "slider", "candlestick", "time frame", "period", "indicator"
      ];
      
      for (const section of sections) {
        if (elementKeywords.some(keyword => section.toLowerCase().includes(keyword))) {
          const newElements = section.split(/\r?\n/)
                                    .filter(line => line.trim())
                                    .map(line => line.trim());
          navigableElements = [...navigableElements, ...newElements];
        }
      }
      navigableElements = [...new Set(navigableElements)];
    } catch (parseError) {
      console.log("[Rich Context] Error parsing navigable elements:", parseError);
    }
   
    return { 
      pageContent: pageContent || "No content extracted", 
      navigableElements 
    };
  } catch (queryError) {
    console.error(`[Rich Context] Error in AI query:`, queryError);
    return { pageContent: "Error extracting page content: " + queryError.message, navigableElements: [] };
  }
}

function detectDomainType(url) {
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('dextools') || urlLower.includes('dexscreener') ||
      urlLower.includes('coinbase') || urlLower.includes('coingecko') ||
      urlLower.includes('coinmarketcap') || urlLower.includes('binance') ||
      urlLower.includes('jupiterexchange')) {
    return 'cryptoSpecial';
  }
  if (urlLower.includes('amazon') || urlLower.includes('ebay') || 
      urlLower.includes('walmart') || urlLower.includes('etsy')) {
    return 'ecommerce';
  }
  if (urlLower.includes('twitter') || urlLower.includes('facebook') ||
      urlLower.includes('instagram') || urlLower.includes('tiktok')) {
    return 'social';
  }
  return 'general';
}

function generateDomainSpecificPrompt(domainType) {
  if (domainType === 'cryptoSpecial') {
    return `
CRYPTO SPECIAL INTERFACE DETECTED (e.g., Dextools, Dexscreener, Coinbase, Coingecko, Coinmarketcap, Jupiter Exchange):
- Note the side menus, top navigation bars, and dashboard sections.
- Identify buttons such as "Trade", "Charts", "Market", "Analysis".
- Include any filtering dropdowns, time frame selectors, and graph toggles.
- List any visible token names in a list, token labels or information links.
    `;
  } else if (domainType === 'ecommerce') {
    return `
ECOMMERCE SITE DETECTED: Focus on product filters, sort options, "Add to cart" buttons, and product variations.
    `;
  } else if (domainType === 'social') {
    return `
SOCIAL MEDIA SITE DETECTED: Focus on post creation, reply/comment buttons, and timeline navigation controls.
    `;
  } else {
    return `
GENERAL SITE DETECTED: Be comprehensive in finding all interactive elements to navigate this type of website. Emphasize clickable links, menus, and controls.
    `;
  }
}

/**
 * Advanced popup and obstacle handler for web browsing
 * @param {Object} page - Puppeteer page object
 * @param {Object} agent - Browser agent
 * @returns {Object} - Result of the preparation
 */
async function handlePageObstacles(page, agent) {
  console.log(`🔍 [Obstacles] Checking for page obstacles...`);
  const results = {
    obstacles: [],
    actionsAttempted: [],
    success: false
  };

  try {
    // Listen for any dialogs (alerts, confirms, prompts) and auto-accept them.
    page.on('dialog', async (dialog) => {
      console.log(`🔔 [Obstacles] Dialog detected: ${dialog.type()} - ${dialog.message()}`);
      results.obstacles.push(`Dialog: ${dialog.type()} - ${dialog.message()}`);
      await dialog.accept();
      results.actionsAttempted.push(`Accepted ${dialog.type()} dialog`);
    });

    // Prepare a text instruction prompt for obstacles.
    const obstacleCheckPrompt = `
      Analyze the current page for common obstacles such as:
      1. Cookie consent banners,
      2. Newsletter signup modals,
      3. Login walls,
      4. Captcha or Turnstile challenges,
      5. Overlays or popups blocking content.
      
      For each obstacle, list any dismiss button text visible (e.g., "Accept", "Close", "No thanks"). If no obstacles or popups are found, return "no obstacles" or "none detected" only.
      Return a structured answer.
    `;
    
    // Execute the obstacle detection query.
    let obstacles = await agent.aiQuery(obstacleCheckPrompt);
    // Normalize obstacles to text regardless of whether it comes as a string or object.
    let obstaclesText = '';
    if (typeof obstacles === 'string') {
      obstaclesText = obstacles;
    } else if (typeof obstacles === 'object') {
      obstaclesText = JSON.stringify(obstacles, null, 2);
    } else {
      obstaclesText = String(obstacles);
    }
    
    // If no obstacles are detected in text, mark success.
    if (typeof obstaclesText === 'string' &&
        (obstaclesText.toLowerCase().includes('no obstacles') ||
         obstaclesText.toLowerCase().includes('none detected'))) {
      console.log(`✅ [Obstacles] No obstacles detected.`);
      results.success = true;
      return results;
    }
    
    // Otherwise, log the detected obstacles.
    console.log(`⚠️ [Obstacles] Detected: ${obstaclesText.slice(0, 150)}...`);
    results.obstacles.push(obstaclesText);
    
    // Define a list of dismissal actions to attempt.
    const dismissActions = [
      "Find and click 'Accept', 'Accept All', 'I Accept', 'I Agree', or 'Agree'",
      "Find and click 'Continue', 'Close', 'Got it', 'I understand', or 'OK'",
      "Look for and click 'X', 'Close', 'Skip', 'No thanks', or 'Maybe later'",
      "If a CAPTCHA is present, attempt to solve or reload the challenge",
      "Try pressing the 'Escape' key or clicking outside a modal"
    ];
    
    let attemptCount = 0;
    const maxAttempts = 3; // Limit the number of times to retry a single dismiss action.
    
    // Iterate over each dismissal action.
    for (const action of dismissActions) {
      attemptCount = 0;
      let cleared = false;
      while (attemptCount < maxAttempts) {
        try {
          console.log(`🔧 [Obstacles] Attempting dismissal: ${action}`);
          results.actionsAttempted.push(action);
          // Use the agent's action function. Ideally, replace a raw text string with a dedicated method.
          // For example: await agent.scroll({ startBox: [0, 0, 1280, 720], direction: 'down' })
          // For now, we assume aiAction accepts this text.
          await agent.aiAction(action);
          // Wait for a moment to let the page update.
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Check if obstacles are still present.
          const recheck = await agent.aiQuery("Are there any popups, overlays, or banners blocking the main content?");
          if (typeof recheck === 'string' && 
              (recheck.toLowerCase().includes('no') || 
               recheck.toLowerCase().includes('cleared') ||
               recheck.toLowerCase().includes('gone'))) {
            console.log(`✅ [Obstacles] Cleared with action: ${action}`);
            results.success = true;
            cleared = true;
            break;
          }
        } catch (dismissError) {
          console.log(`❌ [Obstacles] Dismissal error on attempt ${attemptCount + 1} for action "${action}": ${dismissError.message}`);
        }
        attemptCount++;
      }
      if (cleared) break;
    }
    
    if (!results.success) {
      console.log(`⚠️ [Obstacles] Unable to clear obstacles after ${maxAttempts * dismissActions.length} attempts.`);
    }
    
    return results;
  } catch (error) {
    console.error(`❌ [Obstacles] Error during obstacle handling: ${error.message}`);
    results.obstacles.push(`Error: ${error.message}`);
    return results;
  }
}

// --- Helper: Ensure userId is present in session, generate guest if needed ---
function ensureUserId(req, res, next) {
  if (!req.session.user) {
    req.session.user = 'guest_' + Date.now() + '_' + Math.floor(Math.random()*100000);
    console.debug('[DEBUG] ensureUserId: Generated guest userId', req.session.user);
  } else {
    console.debug('[DEBUG] ensureUserId: Found userId in session', req.session.user);
  }
  next();
}

// Set-engine route has been moved to src/routes/user.js
// --- API: Who Am I (userId sync endpoint) ---
app.get('/api/whoami', (req, res) => {
  try {
    let userId = null;
    if (req.session && req.session.user) {
      userId = req.session.user;
      console.debug('[whoami] Returning userId from session:', userId);
    } else if (req.session) {
      userId = 'guest_' + Date.now() + '_' + Math.floor(Math.random()*100000);
      req.session.user = userId;
      console.debug('[whoami] Generated new guest userId:', userId);
    } else {
      // Session middleware is broken or not present
      userId = 'guest_' + Date.now() + '_' + Math.floor(Math.random()*100000);
      console.warn('[whoami] WARNING: req.session missing, returning fallback guest userId:', userId);
    }
    res.json({ userId });
  } catch (err) {
    console.error('[whoami] ERROR:', err);
    res.status(500).json({ error: 'Failed to get userId', detail: err.message });
  }
});

// --- Robust API: Who Am I (no /api prefix, for proxy rewrite) ---
app.get('/whoami', (req, res) => {
  try {
    let userId = null;
    if (req.session && req.session.user) {
      userId = req.session.user;
      console.debug('[whoami] Returning userId from session:', userId);
    } else if (req.session) {
      userId = 'guest_' + Date.now() + '_' + Math.floor(Math.random()*100000);
      req.session.user = userId;
      console.debug('[whoami] Generated new guest userId:', userId);
    } else {
      userId = 'guest_' + Date.now() + '_' + Math.floor(Math.random()*100000);
      console.warn('[whoami] WARNING: req.session missing, returning fallback guest userId:', userId);
    }
    res.json({ userId });
  } catch (err) {
    console.error('[whoami] ERROR:', err);
    res.status(500).json({ error: 'Failed to get userId', detail: err.message });
  }
});

/**
 * Unified NLI endpoint (DUPLICATE REMOVED):
 * NOTE: See the main implementation of this route at line ~5561
 */

// --- Unified Message Retrieval Endpoint (backward compatible) ---
app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const limit = parseInt(req.query.limit, 10) || 20;
    // New schema: unified Message collection
    let messages = await Message.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    // Backward compatibility: if empty, try ChatHistory
    if (!messages.length) {
      const chatHistory = await ChatHistory.findOne({ userId });
      if (chatHistory && chatHistory.messages) {
        messages = chatHistory.messages.slice(-limit).reverse().map(m => ({
          userId,
          role: m.role,
          type: 'chat',
          content: m.content,
          timestamp: m.timestamp || null,
          legacy: true
        }));
      }
    }
    return res.json({ success: true, messages: messages.reverse() }); // oldest first
  } catch (err) {
    console.error('[GET /messages] Error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: async generator for streaming thought (and tool) events
async function* streamNliThoughts(userId, prompt) {
  // Persist user prompt
  await new Message({ userId, role: 'user', type: 'chat', content: prompt, timestamp: new Date() }).save();

  // Build enhanced context that includes both chat messages and task results
  // This improved context builder ensures task results with report URLs are included
  async function getEnhancedChatHistory(userId, limit = 20) {
    console.log(`[Chat] Getting enhanced history for user ${userId} with limit ${limit}`);
    
    // Get both regular chat messages and task result messages
    const messages = await Message.find({ 
      userId, 
      $or: [
        { role: { $in: ['user','assistant'] }, type: 'chat' },
        { role: 'assistant', type: 'command' } // Include task results
      ]
    })
    .sort({ timestamp: -1 }) // Sort by newest first to get the most recent messages
    .limit(limit)
    .lean();
    
    console.log(`[Chat] Found ${messages.length} messages for history, including task results`);
    
    // Process messages to ensure they have proper context
    return messages.map(msg => {
      // For task results, enhance with report URLs from meta if available
      if (msg.type === 'command' && msg.meta) {
        let enhancedContent = msg.content;
        
        // Add report URLs to the content if they exist
        const hasReports = msg.meta.nexusReportUrl || msg.meta.landingReportUrl;
        
        if (hasReports) {
          enhancedContent += '\n\nTask Reports Available:';
          if (msg.meta.nexusReportUrl) {
            enhancedContent += `\n- Analysis Report: ${msg.meta.nexusReportUrl}`;
          }
          if (msg.meta.landingReportUrl) {
            enhancedContent += `\n- Landing Page Report: ${msg.meta.landingReportUrl}`;
          }
          console.log(`[Chat] Enhanced task result with report URLs for message ${msg._id}`);
        }
        
        return {
          role: msg.role,
          content: enhancedContent
        };
      }
      
      // Regular chat messages pass through unchanged
      return {
        role: msg.role,
        content: msg.content
      };
    });
  }
  
  // Get enhanced history that includes task results
  const history = await getEnhancedChatHistory(userId, 20);
  console.log(`[Chat] Using ${history.length} messages for context, including task results`);
  
  let buffer = '';
  let fullReply = '';
  
  // Get a chat client using our chat-specific function
  // This automatically selects the user's preferred chat model
  const openaiClient = await getUserOpenAiClient(userId);
  
  // The model will be automatically selected based on the user's chat model preference
  // Default to gpt-4o if extraction fails
  let chatModel = 'gpt-4o';
  
  // Extract the model from the client's default query
  if (openaiClient.defaultQuery?.engine) {
    chatModel = openaiClient.defaultQuery.engine;
  }
  
  console.log(`[Chat] Creating stream with model: ${chatModel}`);
  
  // Define a standard system message that provides robust instructions
  // Instead of complex tool detection logic
  const systemMessage = `You are Nexus, an AI assistant with chat and task capabilities. For general conversation, 
  simply respond helpfully and clearly. DO NOT use tools unless the user explicitly asks for a task, web search, 
  or cryptocurrency information.

Only use tools when:
- The user asks you to perform a web task (use process_task)
- The user asks you to search for information (use internet_search)
- The user asks about cryptocurrency data (use token_info)`;
  
  // Define the standard set of tools always available to the chat model
  const standardTools = [
    {
      type: "function",
      function: {
        name: "process_task",
        description: "Process and execute a web browser task",
        parameters: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The browser task to execute, e.g. 'navigate to google.com and search for cats'"
            }
          },
          required: ["command"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "internet_search",
        description: "Search the internet for information",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query"
            }
          },
          required: ["query"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "token_info",
        description: "Get information about a cryptocurrency token",
        parameters: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "The token symbol, e.g. BTC, ETH"
            }
          },
          required: ["symbol"]
        }
      }
    }
  ];
  
  console.log(`[Chat] Adding system instructions to guide tool usage`);
  
  try {
    // Get history in chronological order and add current prompt
    // The history is sorted newest first, so we need to reverse it
    // and add the current prompt at the end
    const reversedHistory = [...history].reverse();
    
    // Create full message history with system message
    const fullHistory = [
      // First add the system message with instructions
      { role: 'system', content: systemMessage },
      // Then add conversation history in chronological order
      ...reversedHistory,
      // Finally add the current user prompt
      { role: 'user', content: prompt }
    ];
    
    console.log('[Chat] Sending messages in correct chronological order to the AI');
    
    // Create the stream with the appropriate model and tools
    const stream = await openaiClient.chat.completions.create({
      model: chatModel,
      messages: fullHistory,
      stream: true,
      temperature: 0.7,
      max_tokens: 700,
      tools: standardTools
    });
    
    // Process the stream chunks
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        buffer += delta.content;
        fullReply += delta.content;
        yield { event: 'thoughtUpdate', text: delta.content };
        if (/[.?!]\s$/.test(buffer) || buffer.length > 80) buffer = '';
      }
      
      // Enhanced tool call handling with support for full execution
      if (delta?.tool_calls) {
        // We need to collect complete function calls before executing them
        // Use a module-level map to track tool calls across requests
        if (!global.toolCallsInProgress) {
          global.toolCallsInProgress = new Map();
        }
        
        for (const toolCallDelta of delta.tool_calls) {
          const toolCallId = toolCallDelta.index;
          
          // Initialize the tool call if this is the first chunk
          if (!global.toolCallsInProgress.has(toolCallId)) {
            global.toolCallsInProgress.set(toolCallId, {
              name: toolCallDelta.function?.name || '',
              arguments: ''
            });
          }
          
          // Update the stored tool call with the new chunks
          const toolCall = global.toolCallsInProgress.get(toolCallId);
          if (toolCallDelta.function?.name) {
            toolCall.name = toolCallDelta.function.name;
          }
          if (toolCallDelta.function?.arguments) {
            toolCall.arguments += toolCallDelta.function.arguments;
          }
          
          // Emit the partial data for client display
          yield {
            event: 'functionCallPartial',
            functionName: toolCall.name,
            partialArgs: toolCall.arguments || ''
          };
          
          // If the tool call seems complete (has name and valid JSON arguments), execute it
          // We'll also check if the args end with '}' to help detect completion
          try {
            if (toolCall.name && 
                toolCall.arguments && 
                toolCall.arguments.trim().endsWith('}')) {
              
              const args = JSON.parse(toolCall.arguments);
              console.log(`[Chat] Executing tool call: ${toolCall.name}`, args);
              
              // Handle the different tool types
              if (toolCall.name === 'process_task') {
                // Create and execute a task just like the task route does
                const taskId = new mongoose.Types.ObjectId();
                const runId = uuidv4();
                const runDir = path.join(NEXUS_RUN_DIR, runId);
                fs.mkdirSync(runDir, { recursive: true });
                
                // Get user email which is needed for the task processor
                const userDoc = await User.findById(userId).lean();
                const userEmail = userDoc?.email;
                
                // Save the new task
                await new Task({
                  _id: taskId,
                  userId,
                  command: args.command,
                  status: 'pending',
                  progress: 0,
                  startTime: new Date(),
                  runId
                }).save();
                
                // Update user's active tasks
                await User.updateOne(
                  { _id: userId },
                  { $push: { activeTasks: { 
                    _id: taskId.toString(),
                    command: args.command,
                    status: 'pending',
                    startTime: new Date() 
                  }}}
                );
                
                // Notify the client that a task has been created
                sendWebSocketUpdate(userId, { 
                  event: 'taskStart',
                  payload: { 
                    taskId: taskId.toString(),
                    command: args.command,
                    startTime: new Date() 
                  } 
                });
                
                // Notify the client that this task was initiated from chat
                // This allows the frontend to track chat-initiated tasks
                sendWebSocketUpdate(userId, { 
                  event: 'chatTaskStart',
                  taskId: taskId.toString(),
                  command: args.command
                });
                
                // Process the task asynchronously
                processTask(userId, userEmail, taskId.toString(), runId, runDir, args.command);
                
                // Return a response about the task initiation
                yield {
                  event: 'toolResponse',
                  toolName: 'process_task',
                  response: `I've started a browser task to: "${args.command}" (Task ID: ${taskId})\n\nI'll notify you when it's complete.`
                };
              }
              else if (toolCall.name === 'internet_search') {
                // Implement a simple web search
                yield {
                  event: 'toolResponse',
                  toolName: 'internet_search',
                  response: `Searching for: "${args.query}"...\n\nThis functionality is under development.`
                };
              }
              else if (toolCall.name === 'token_info') {
                // Provide cryptocurrency info
                yield {
                  event: 'toolResponse',
                  toolName: 'token_info',
                  response: `Getting price information for ${args.symbol}...\n\nThis functionality is under development.`
                };
              }
              
              // Clear the tool call after execution
              global.toolCallsInProgress.delete(toolCallId);
            }
          } catch (toolError) {
            console.error(`[Chat] Error executing tool call:`, toolError);
            // Don't delete the tool call from the map as it might still be receiving chunks
          }
        }
      }
    }
    
    // Make sure fullReply is initialized as a string at minimum
    if (!fullReply) fullReply = '';
    
    // Ensure the response is not empty before sending thoughtComplete with the original text
    if (fullReply.trim().length > 0) {
      console.log(`[Chat] Generated response of length: ${fullReply.length}`);
      // Return the complete response
      yield { event: 'thoughtComplete', text: fullReply };
      
      // Save the assistant's response for future context
      try {
        await new Message({
          userId,
          role: 'assistant',
          type: 'chat',
          content: fullReply,
          timestamp: new Date()
        }).save();
        console.log(`[Chat] Saved assistant response to message history`);
      } catch (saveError) {
        console.error(`[Chat] Error saving assistant response:`, saveError);
      }
    } else {
      console.log(`[Chat] Generated empty response, sending fallback message`);
      // Even with empty content, send thoughtComplete to unblock the UI
      // Use a fallback message instead of the empty string
      const fallbackMessage = 'I apologize, but I encountered an issue generating a response. Please try again.';
      
      yield { 
        event: 'thoughtComplete', 
        text: fallbackMessage 
      };
      
      // Save the fallback message to avoid empty content errors
      try {
        await new Message({
          userId,
          role: 'assistant',
          type: 'chat',
          content: fallbackMessage,
          timestamp: new Date()
        }).save();
        console.log(`[Chat] Saved fallback response to message history`);
      } catch (saveError) {
        console.error(`[Chat] Error saving fallback response:`, saveError);
      }
    }
    
    // Clear any pending tool calls to prevent them from affecting future requests
    if (global.toolCallsInProgress) {
      global.toolCallsInProgress.clear();
      console.log('[Chat] Cleared any pending tool calls');
    }
  } catch (error) {
    // Handle authentication errors specially
    if (error.status === 401 || error.message?.includes('auth')) {
      const provider = openaiClient.defaultQuery?.provider || 'unknown';
      const errorMessage = `Authentication error with ${provider} API key: ${error.message}`;
      console.error(errorMessage);
      
      // Return a user-friendly error message
      yield { 
        event: 'error', 
        text: `Sorry, there was an authentication problem with your ${provider} API key. ` +
              `Please check your API key in Settings > API Keys and ensure it's valid.`
      };
    } 
    // Handle rate limit errors specifically
    else if (error.status === 429 || error.code === 'insufficient_quota' || error.message?.includes('exceeded your current quota')) {
      const provider = openaiClient.defaultQuery?.provider || 'OpenAI';
      const errorMessage = `Rate limit exceeded with ${provider} API: ${error.message}`;
      console.error(errorMessage);
      
      // Return a specific rate limit error message to the timeline
      yield { 
        event: 'error', 
        text: `🚫 API Quota Exceeded: You've exceeded your ${provider} API quota. ` +
              `Please check your subscription plan and billing details or try switching to a different model in Settings.`
      };
    } else {
      // Handle other errors
      console.error('Error in chat stream:', error);
      yield { 
        event: 'error', 
        text: `Sorry, there was an error: ${error.message}. Please try again.`
      };
    }
  }
  
  // No more code needed here since we're handling everything in the try/catch block
  
  // We already yield the thoughtComplete event in the try/catch block above
  // The final response will be handled by the handleFinalResponse function
  // which is called when we receive the thoughtComplete event
}

const handleFinalResponse = async (userId, finalResponse) => {
  try {
    // Validate that the finalResponse is not empty
    if (!finalResponse || typeof finalResponse !== 'string' || finalResponse.trim().length === 0) {
      console.warn('[NLI] Empty or invalid response received, skipping persistence');
      // Still send WebSocket notification so UI shows the response is done processing
      sendWebSocketUpdate(userId, {
        event: 'nliResponsePersisted',
        content: 'Sorry, there was an issue processing your request. Please try again.'
      });
      return;
    }
    
    await Promise.all([
      // Store in Message collection for individual access
      Message.create({
        userId,
        content: finalResponse,
        role: 'assistant',
        type: 'system',  // Using validated enum value
        timestamp: new Date()
      }),
      
      // Append to ChatHistory for conversation context
      // CRITICAL: Add type:'system' to match Message collection and prevent duplicates
      ChatHistory.updateOne(
        { userId },
        { 
          $push: { 
            messages: { 
              role: 'assistant', 
              type: 'system', // Explicitly add type to match Message collection
              content: finalResponse,
              timestamp: new Date() 
            } 
          } 
        },
        { upsert: true }
      )
    ]);
    
    sendWebSocketUpdate(userId, {
      event: 'nliResponsePersisted',
      content: finalResponse
    });
  } catch (err) {
    console.error('[NLI] Error persisting final response:', err);
    // Consider adding retry logic here if needed
  }
};

// --- API: History endpoints ---
// History routes are now handled by historyRouter

// --- API: User Settings endpoints ---
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await User.findById(userId).exec();
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Extract only the settings information
    res.json({
      success: true,
      apiKeys: {
        gpt4o: user.apiKeys.gpt4o ? true : false,
        qwen: user.apiKeys.qwen ? true : false,
        gemini: user.apiKeys.gemini ? true : false,
        uitars: user.apiKeys.uitars ? true : false
      },
      preferredEngine: user.preferredEngine,
      executionMode: user.executionMode || 'step-planning',
      privacyMode: user.privacyMode || false,
      customUrls: user.customUrls || []
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// API endpoint for user API key management
app.post('/api/user/api-keys', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const { apiKeyType, apiKey } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    // Validate key type against our supported engines
    const validKeyTypes = Object.values(ENGINE_KEY_MAPPING);
    if (!validKeyTypes.includes(apiKeyType)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid API key type. Supported types are: ${validKeyTypes.join(', ')}` 
      });
    }
    
    // Validate provided key
    if (!apiKey || apiKey.trim().length < 8) {  // Most API keys are longer than 8 characters
      return res.status(400).json({ success: false, error: 'Invalid API key provided' });
    }
    
    // Find user
    const user = await User.findOne({ _id: userId });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Make sure apiKeys object exists
    if (!user.apiKeys) {
      user.apiKeys = {};
    }
    
    // Update the appropriate key
    user.apiKeys[apiKeyType] = apiKey;
    await user.save();
    
    // Get the corresponding engine for this key type
    const engineId = KEY_ENGINE_MAPPING[apiKeyType];
    const engineName = getEngineDisplayName(engineId);
    
    // Send notification about key update
    sendWebSocketUpdate(userId, {
      event: 'notification',
      type: 'success',
      title: 'API Key Updated',
      message: `Your ${engineName} API key has been updated successfully`
    });
    
    res.json({ 
      success: true, 
      message: `${engineName} API key updated successfully`,
      engineId,
      keyType: apiKeyType  
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Delete user API key
app.delete('/api/user/api-keys', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const { apiKeyType } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    // Validate key type against our supported engines
    const validKeyTypes = Object.values(ENGINE_KEY_MAPPING);
    if (!validKeyTypes.includes(apiKeyType)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid API key type. Supported types are: ${validKeyTypes.join(', ')}` 
      });
    }
    
    // Find user
    const user = await User.findOne({ _id: userId });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if the key exists before attempting to delete
    if (!user.apiKeys || !user.apiKeys[apiKeyType]) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }
    
    // Delete the key
    delete user.apiKeys[apiKeyType];
    await user.save();
    
    // Get the corresponding engine for this key type
    const engineId = KEY_ENGINE_MAPPING[apiKeyType];
    const engineName = getEngineDisplayName(engineId);
    
    // Send notification about key deletion
    sendWebSocketUpdate(userId, {
      event: 'notification',
      type: 'info',
      title: 'API Key Removed',
      message: `Your ${engineName} API key has been removed`
    });
    
    res.json({ 
      success: true, 
      message: `${engineName} API key deleted successfully`,
      engineId,
      keyType: apiKeyType
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// API endpoint to set user's execution mode preference
app.post('/api/user/set-execution-mode', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const { mode } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    // Validate execution mode
    const validModes = ['step-planning', 'action-planning'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({ success: false, error: 'Invalid execution mode' });
    }
    
    // Find user
    const user = await User.findOne({ _id: userId });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Update the user's execution mode
    user.executionMode = mode;
    await user.save();
    
    // Send notification about mode update
    sendWebSocketUpdate(userId, {
      event: 'notification',
      type: 'success',
      title: 'Execution Mode Updated',
      message: `Your execution mode has been set to ${mode === 'step-planning' ? 'Step Planning' : 'Action Planning (Autopilot)'}`
    });
    
    res.json({
      success: true,
      message: `Execution mode set to ${mode}`
    });
  } catch (error) {
    console.error('Error setting execution mode:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/settings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const { action } = req.body;
    const user = await User.findById(userId).exec();
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Handle different types of settings updates
    switch (action) {
      case 'saveApiKey':
        const { provider, key } = req.body;
        
        if (!provider || !key) {
          return res.status(400).json({ success: false, error: 'Provider and key are required' });
        }
        
        // Initialize apiKeys if it doesn't exist
        if (!user.apiKeys) {
          user.apiKeys = {};
        }
        
        // Save API key
        user.apiKeys[provider] = key;
        await user.save();
        
        return res.json({ success: true, message: `${provider} API key saved successfully` });

      case 'saveLlmPreferences':
        const { models } = req.body;
        
        if (!models) {
          return res.status(400).json({ success: false, error: 'Model preferences are required' });
        }
        
        // Initialize llmPreferences if it doesn't exist
        if (!user.llmPreferences) {
          user.llmPreferences = {};
        }
        
        // Update LLM preferences
        user.llmPreferences = {
          ...user.llmPreferences,
          ...models
        };
        
        await user.save();
        
        return res.json({ success: true, message: 'LLM preferences saved successfully' });
        
      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Error updating user settings:', error);
    return res.status(500).json({ success: false, error: 'Failed to update user settings' });
  }
});

app.delete('/api/settings', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user;
    const { action, provider } = req.body;
    const user = await User.findById(userId).exec();
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (action === 'deleteApiKey') {
      if (!provider) {
        return res.status(400).json({ success: false, error: 'Provider is required' });
      }
      
      // Check if apiKeys and the specific provider key exist
      if (user.apiKeys && user.apiKeys[provider]) {
        // Delete the key
        delete user.apiKeys[provider];
        await user.save();
        
        return res.json({ success: true, message: `${provider} API key deleted successfully` });
      } else {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }
  } catch (error) {
    console.error('Error deleting API key:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete API key' });
  }
});


// Serve static assets - this should be the last middleware
serveStaticAssets(app);

// ======================================
// CATCH-ALL ROUTE AND ERROR HANDLERS
// These must be the last routes in the file
// ======================================

// API 404 handler - catches any undefined API routes
app.use('/api/*', api404Handler);

// SPA catch-all route - serves index.html for client-side routing
app.get('*', spaCatchAll);

// 404 handler for all other routes
app.use(html404Handler);

// Error handling middleware (in order of execution)
app.use(errorHandler1);
app.use(errorHandler2);