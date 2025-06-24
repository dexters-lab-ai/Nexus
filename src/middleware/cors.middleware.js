// src/middleware/cors.middleware.js
/**
 * CORS Middleware
 * 
 * Handles CORS with proper credentials and security settings
 */
import { corsConfig } from '../config/server.config.js';

const isProduction = process.env.NODE_ENV === 'production';
const isDocker = process.env.IS_DOCKER === 'true';

// Allowed origins configuration
const getAllowedOrigins = () => {
  const origins = [
    'https://operator-pjcgr.ondigitalocean.app',
    'https://operator-io236.ondigitalocean.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:3420',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3420'
  ];

  // In development, allow any localhost origin
  if (!isProduction) {
    return [...new Set([...origins, 'http://localhost:*', 'http://127.0.0.1:*'])];
  }
  
  return origins;
};

const allowedOrigins = getAllowedOrigins();

// Check if origin is allowed
const isOriginAllowed = (origin, host) => {
  if (!origin) return false;
  
  // Always allow health check endpoint
  if (origin.endsWith('/api/health')) {
    return true;
  }
  
  // In production, allow any *.ondigitalocean.app subdomain
  if (isProduction) {
    return origin.endsWith('.ondigitalocean.app') || 
           allowedOrigins.includes(origin);
  }
  
  // In development, allow localhost and 127.0.0.1 with any port
  return allowedOrigins.some(allowed => {
    if (allowed.includes('*')) {
      const base = allowed.split(':')[0];
      return origin.startsWith(base);
    }
    return origin === allowed || origin.startsWith(`http://${host}`);
  });
};

export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  
  // Check if origin is allowed
  const allowed = isOriginAllowed(origin, host);
  
    // Set CORS headers
  if (allowed) {
    // For SSE, we need to set specific headers
    if (req.headers.accept === 'text/event-stream') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx
    }
    
    // Standard CORS headers
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', corsConfig.maxAge.toString());
    res.setHeader('Vary', 'Origin');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  } else if (isProduction) {
    // Only block in production, allow in development for easier testing
    return res.status(403).json({
      error: 'Not allowed by CORS',
      message: 'The origin is not allowed to access this resource',
      allowedOrigins: allowedOrigins.filter(o => o.includes('ondigitalocean.app')),
      yourOrigin: origin
    });
  }
  
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
};

export default corsMiddleware;