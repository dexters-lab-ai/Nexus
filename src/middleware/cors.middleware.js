// src/middleware/cors.middleware.js
/**
 * CORS Middleware
 * 
 * This middleware allows all origins when using Cloudflare.
 * Security is handled at the Cloudflare level using:
 * - WAF Rules
 * - Rate Limiting
 * - Bot Fight Mode
 * - Security Headers
 */
import { corsConfig } from '../config/server.config.js';

export const corsMiddleware = (req, res, next) => {
  // Set CORS headers using configuration
  res.header('Access-Control-Allow-Origin', corsConfig.origin ? '*' : '*');
  res.header('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
  res.header('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
  res.header('Access-Control-Allow-Credentials', corsConfig.credentials.toString());
  res.header('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
  res.header('Access-Control-Max-Age', corsConfig.maxAge.toString());
  
  // Handle preflight requests more explicitly
  if (req.method === 'OPTIONS') {
    res.header('Content-Type', 'text/plain');
    return res.status(204).end();
  }
  
  next();
};

export default corsMiddleware;