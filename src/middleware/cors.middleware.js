// src/middleware/cors.middleware.js
/**
 * CORS Middleware
 * 
 * Handles CORS with proper credentials and security settings
 */
import { corsConfig } from '../config/server.config.js';

export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://operator-pjcgr.ondigitalocean.app',
    'http://localhost:3000',
    'http://localhost:3420', // Backend port for direct API access
    'http://localhost:5173'  // Vite dev server
  ];

  // Set the origin based on the request
  const requestOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  res.setHeader('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
  res.setHeader('Access-Control-Max-Age', corsConfig.maxAge.toString());
  
  // Additional security headers
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
};

export default corsMiddleware;