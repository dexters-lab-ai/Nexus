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
    'http://localhost:5173' // Vite dev server
  ];

  // Set the origin based on the request
  const requestOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  // Set CORS headers
  res.header('Access-Control-Allow-Origin', requestOrigin);
  res.header('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
  res.header('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
  res.header('Access-Control-Max-Age', corsConfig.maxAge.toString());
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
};

export default corsMiddleware;