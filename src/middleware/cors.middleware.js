// src/middleware/cors.middleware.js
/**
 * CORS Middleware
 * 
 * Handles CORS with proper credentials and security settings
 */
import { corsConfig } from '../config/server.config.js';

// Define allowed origins based on environment
const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

// Base allowed origins for development
const developmentOrigins = [
  'http://localhost:3000',
  'http://localhost:3420', // Backend port for direct API access
  'http://localhost:5173'  // Vite dev server
];

export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin || '';
  
  // In production, allow any *.ondigitalocean.app subdomain
  if (isProduction && origin.endsWith('.ondigitalocean.app')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } 
  // In development, allow specific localhost origins
  else if (isDevelopment && developmentOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  // Set CORS headers
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