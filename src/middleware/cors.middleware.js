// src/middleware/cors.middleware.js
/**
 * CORS Middleware
 * 
 * Handles CORS with proper credentials and security settings
 */
import { corsConfig } from '../config/server.config.js';

export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  
  // Check if the origin is allowed
  const isAllowedOrigin = corsConfig.origin.includes(origin);
  
  // If origin is allowed, set it in the response
  if (isAllowedOrigin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Set other CORS headers
  res.header('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
  res.header('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
  res.header('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
  res.header('Access-Control-Max-Age', corsConfig.maxAge.toString());
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    // For preflight, we need to return 204 No Content with appropriate headers
    return res.status(204).end();
  }
  
  // Continue to the next middleware
  next();
};

export default corsMiddleware;