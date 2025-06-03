import config from '../config/server.config.js';

// src/middleware/cors.middleware.js
export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = config.cors.allowedOrigins || [];
  
  // Check if origin matches any allowed origin or subdomain
  const isAllowed = origin && (
    allowedOrigins.includes(origin) ||
    allowedOrigins.some(allowed => {
      if (allowed.startsWith('*.')) {
        const domain = allowed.substring(2);
        return origin.endsWith(domain);
      }
      return false;
    })
  );

  if (isAllowed) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', config.cors.methods.join(', '));
    res.header('Access-Control-Allow-Headers', config.cors.defaultHeaders.join(', '));
    res.header('Access-Control-Expose-Headers', config.cors.exposedHeaders.join(', '));
    res.header('Access-Control-Max-Age', config.cors.maxAge);
    
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
  } else if (origin) {
    console.warn(`Blocked request from disallowed origin: ${origin}`);
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  
  next();
};

export default corsMiddleware;