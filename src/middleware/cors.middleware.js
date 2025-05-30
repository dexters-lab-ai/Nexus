import config from '../config/env.js';

/**
 * CORS middleware with dynamic origin validation and enhanced security headers
 */
export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  const isWebSocket = req.headers.upgrade === 'websocket';
  
  // Security headers that should be set on all responses
  const securityHeaders = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site'
  };

  // Set security headers
  Object.entries(securityHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Handle WebSocket upgrade requests
  if (isWebSocket) {
    return handleWebSocketUpgrade(req, res, next);
  }
  
  // Check if origin is allowed for regular HTTP requests
  if (origin && isOriginAllowed(origin)) {
    // Set CORS headers
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-CSRF-Token');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  } else if (origin) {
    console.warn(`Blocked request from disallowed origin: ${origin}`);
    return res.status(403).json({ 
      error: 'Not allowed by CORS',
      message: 'The request was blocked due to CORS policy.'
    });
  }
  
  next();
};

/**
 * Check if the origin is allowed based on configuration
 */
function isOriginAllowed(origin) {
  return config.cors.allowedOrigins.some(allowed => {
    try {
      const allowedUrl = new URL(allowed);
      const originUrl = new URL(origin);
      
      // Check if protocol, hostname and port match
      return (
        allowedUrl.protocol === originUrl.protocol &&
        allowedUrl.hostname === originUrl.hostname &&
        (allowedUrl.port || '80') === (originUrl.port || '80')
      );
    } catch (e) {
      // If URL parsing fails, do a simple string comparison
      return origin === allowed || origin.startsWith(allowed.replace(/\/+$/, ''));
    }
  });
}

/**
 * Handle WebSocket upgrade requests
 */
function handleWebSocketUpgrade(req, res, next) {
  const origin = req.headers.origin;
  
  if (origin && isOriginAllowed(origin)) {
    // For WebSocket, we need to handle the upgrade manually
    if (req.method === 'GET' && req.headers.upgrade === 'websocket') {
      // Set the necessary headers for WebSocket upgrade
      res.setHeader('Upgrade', 'websocket');
      res.setHeader('Connection', 'Upgrade');
      // Continue with the WebSocket handshake
      return next();
    }
  }
  
  // If we get here, the WebSocket upgrade is not allowed
  console.warn(`Blocked WebSocket upgrade from disallowed origin: ${origin}`);
  res.status(403).json({ 
    error: 'WebSocket connection not allowed',
    message: 'The WebSocket upgrade was blocked due to CORS policy.'
  });
}

export default corsMiddleware;
