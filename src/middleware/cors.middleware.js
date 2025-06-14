// src/middleware/cors.middleware.js
/**
 * CORS Middleware
 * 
 * Handles CORS with proper credentials and security settings
 */
import { corsConfig } from '../config/server.config.js';

const isProduction = process.env.NODE_ENV === 'production';
const isDocker = process.env.IS_DOCKER === 'true';

const allowedOrigins = [
  'https://operator-pjcgr.ondigitalocean.app',
  'https://operator-io236.ondigitalocean.app',
  'http://localhost:3000',
  'http://localhost:3420',
  'http://localhost:5173'
];

export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  
  // In production, allow any *.ondigitalocean.app subdomain
  const isAllowedOrigin = isProduction 
    ? origin.endsWith('.ondigitalocean.app') || allowedOrigins.includes(origin)
    : allowedOrigins.includes(origin) || (origin && origin.startsWith(`http://${host}`));
  
  if (isAllowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', corsConfig.maxAge.toString());
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  } else if (isProduction) {
    return res.status(403).json({
      error: 'Not allowed by CORS',
      message: 'The origin is not allowed to access this resource',
      allowedOrigins: allowedOrigins.filter(o => o.includes('ondigitalocean.app'))
    });
  }
  
  // Additional security headers
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  next();
};

export default corsMiddleware;