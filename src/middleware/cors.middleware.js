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
  const origin = req.headers.origin || '*';
  
  // Set CORS headers from config
  res.header('Access-Control-Allow-Origin', corsConfig.allowedOrigins[0] === '*' ? origin : corsConfig.allowedOrigins.join(', '));
  res.header('Access-Control-Allow-Credentials', corsConfig.credentials.toString());
  res.header('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
  res.header('Access-Control-Allow-Headers', corsConfig.defaultHeaders.join(', '));
  res.header('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
  res.header('Access-Control-Max-Age', corsConfig.maxAge.toString());
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
};

export default corsMiddleware;