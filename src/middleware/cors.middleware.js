import config from '../config/server.config.js';

/**
 * Check if the origin is allowed based on environment and configuration
 * @param {string} origin - The origin to check
 * @returns {boolean} - Whether the origin is allowed
 */
const isOriginAllowed = (origin) => {
  if (!origin) return false;
  
  // In production, check against allowed domains
  if (process.env.NODE_ENV === 'production') {
    const allowedDomains = [
      'operator-344ej.ondigitalocean.app',
      // Add your custom domain here if needed
      // 'yourdomain.com'
    ];
    
    return allowedDomains.some(domain => {
      // Handle exact match
      if (origin === `https://${domain}` || origin === `http://${domain}`) {
        return true;
      }
      
      // Handle subdomains
      if (origin.endsWith(`.${domain}`)) {
        return true;
      }
      
      return false;
    });
  }
  
  // In development, allow all localhost origins
  return /^https?:\/\/localhost(:\d+)?$/.test(origin) || 
         /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);
};

/**
 * CORS middleware that handles cross-origin requests with credentials
 * and proper preflight handling
 */
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  const requestMethod = req.method;
  const requestHeaders = req.headers['access-control-request-headers'];
  
  res.header('Vary', 'Origin, Accept-Encoding');
  
  // Check if origin is allowed
  const allowed = isOriginAllowed(origin);
  
  // Set CORS headers for all responses
  if (allowed && origin) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Handle preflight requests
    if (requestMethod === 'OPTIONS') {
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours
      return res.status(204).end();
    }
  } else if (process.env.NODE_ENV !== 'production') {
    // In development, allow all origins for easier testing
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  
  // Log CORS requests in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`CORS ${requestMethod} request from ${origin || 'unknown origin'}, allowed: ${allowed}`);
    if (requestHeaders) {
      console.log('Request headers:', requestHeaders);
    }
  }

  // Handle preflight requests
  if (requestMethod === 'OPTIONS') {
    if (allowed) {
      // Set CORS headers for preflight
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Request-ID, X-CSRF-Token');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Max-Age', '86400'); // 24 hours
      res.header('Access-Control-Expose-Headers', 'Set-Cookie, Authorization, X-Request-ID');
      
      // Handle Cloudflare specific headers
      if (req.headers['cf-connecting-ip']) {
        res.header('X-Cloudflare-IP', req.headers['cf-connecting-ip']);
      }
      
      return res.status(204).end();
    }
    return res.status(403).json({ error: 'Not allowed by CORS' });
  }
  
  // Handle actual requests
  if (allowed) {
    // Allow credentials and specific headers
    // Set CORS headers for actual request
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Add security headers from config
    const securityHeaders = config.security?.headers || {};
    
    // Set security headers
    if (securityHeaders.xssProtection) {
      res.header('X-XSS-Protection', securityHeaders.xssProtection);
    }
    
    if (securityHeaders.noSniff) {
      res.header('X-Content-Type-Options', 'nosniff');
    }
    
    if (securityHeaders.xFrameOptions) {
      res.header('X-Frame-Options', securityHeaders.xFrameOptions);
    }
    
    // Set HSTS header if enabled
    if (securityHeaders.hsts?.enable) {
      let hstsValue = `max-age=${securityHeaders.hsts.maxAge || 31536000}`;
      if (securityHeaders.hsts.includeSubDomains) hstsValue += '; includeSubDomains';
      if (securityHeaders.hsts.preload) hstsValue += '; preload';
      res.header('Strict-Transport-Security', hstsValue);
    }
    
    // Set other security headers
    if (securityHeaders.downloadOptions) {
      res.header('X-Download-Options', securityHeaders.downloadOptions);
    }
    
    if (securityHeaders.permittedCrossDomainPolicies) {
      res.header('X-Permitted-Cross-Domain-Policies', securityHeaders.permittedCrossDomainPolicies);
    }
    
    if (securityHeaders.referrerPolicy) {
      res.header('Referrer-Policy', securityHeaders.referrerPolicy);
    }
    
    // Continue to the next middleware
    return next();
  }
  
  // Origin not allowed for non-preflight requests
  if (origin) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked request from disallowed origin: ${origin}`);
      console.warn('Allowed origins:', config.cors.allowedOrigins);
    }
    return res.status(403).json({ 
      error: 'Not allowed by CORS',
      allowedOrigins: config.cors.allowedOrigins,
      receivedOrigin: origin
    });
  }
  
  // No origin header, continue with the request (e.g., same-origin requests)
  next();
};

export default corsMiddleware;