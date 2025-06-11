// src/middleware/cors.middleware.js
/**
 * CORS Middleware
 * 
 * Handles Cross-Origin Resource Sharing with proper security settings
 * and session support
 */
import { corsConfig } from '../config/server.config.js';

// List of allowed origins (whitelist)
const allowedOrigins = [
  'https://operator-pjcgr.ondigitalocean.app',
  'http://localhost:3000',
  'http://localhost:5173' // Vite dev server
];

// Cache for origin validation
const originCache = new Map();

/**
 * Check if the origin is allowed
 */
function isOriginAllowed(origin) {
  if (!origin) return false;
  
  // Check cache first
  if (originCache.has(origin)) {
    return originCache.get(origin);
  }
  
  // Check if the origin is in the allowed list
  const allowed = allowedOrigins.some(allowedOrigin => {
    try {
      const url = new URL(origin);
      const allowedUrl = new URL(allowedOrigin);
      
      // Match protocol, hostname, and port
      return url.protocol === allowedUrl.protocol &&
             url.hostname === allowedUrl.hostname &&
             (url.port || '80') === (allowedUrl.port || '80');
    } catch (e) {
      return false;
    }
  });
  
  // Cache the result
  originCache.set(origin, allowed);
  return allowed;
}

/**
 * CORS Middleware
 */
export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  
  // Set CORS headers
  if (origin && isOriginAllowed(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
    // In development, allow any origin for easier testing
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  
  // Set standard CORS headers
  res.header('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
  res.header('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
  res.header('Access-Control-Max-Age', corsConfig.maxAge.toString());
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    // Add additional headers for preflight
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    res.header('Content-Length', '0');
    res.header('Content-Type', 'text/plain');
    return res.status(204).end();
  }
  
  // Add security headers for all responses
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'DENY');
  res.header('X-XSS-Protection', '1; mode=block');
  
  // Add CSP header in production
  if (process.env.NODE_ENV === 'production') {
    res.header(
      'Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "font-src 'self' data:; " +
      "connect-src 'self' https://api.openai.com wss:;"
    );
  }
  
  next();
};

// Default export for backward compatibility
export default corsMiddleware;