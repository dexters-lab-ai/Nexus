import config from '../config/server.config.js';

// Helper function to check if origin is allowed
const isOriginAllowed = (origin) => {
  if (!origin) return false;
  
  // Check for exact match, subdomain match, or wildcard
  return config.cors.allowedOrigins.some(allowedOrigin => {
    // Handle wildcard
    if (allowedOrigin === '*') return true;
    
    // Handle wildcard subdomains (e.g., '*.example.com')
    if (allowedOrigin.startsWith('*.')) {
      const domain = allowedOrigin.substring(2);
      return origin.endsWith(domain) || 
             origin === `http://${domain}` || 
             origin === `https://${domain}`;
    }
    
    // Handle exact match
    return origin === allowedOrigin;
  });
};

// Get allowed headers from config or use defaults
const getAllowedHeaders = (requestedHeaders) => {
  if (requestedHeaders) return requestedHeaders;
  return config.cors.defaultHeaders.join(',');
};

/**
 * CORS middleware that handles cross-origin requests with credentials
 * and proper preflight handling
 */
export const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  const requestMethod = req.method;
  const requestHeaders = req.headers['access-control-request-headers'];
  
  // Always set Vary header to prevent caching of CORS responses
  res.header('Vary', 'Origin');
  
  // Check if origin is allowed
  const allowed = isOriginAllowed(origin);
  
  // Log CORS requests in development
  if (process.env.NODE_ENV !== 'production') {
    console.log(`CORS request from ${origin || 'unknown origin'}, allowed: ${allowed}`);
  }
  
  // Handle preflight requests
  if (requestMethod === 'OPTIONS') {
    if (allowed) {
      // Set CORS headers for preflight
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      
      // Set preflight cache time from config or default to 10 minutes
      res.header('Access-Control-Max-Age', config.cors.maxAge || 600);
      
      // Set allowed methods from config or use defaults
      res.header('Access-Control-Allow-Methods', config.cors.methods.join(', '));
      
      // Set allowed headers
      res.header('Access-Control-Allow-Headers', getAllowedHeaders(requestHeaders));
      
      // Set exposed headers if configured
      if (config.cors.exposedHeaders && config.cors.exposedHeaders.length > 0) {
        res.header('Access-Control-Expose-Headers', config.cors.exposedHeaders.join(','));
      }
      
      // End the preflight request
      return res.status(204).end();
    }
    
    // Origin not allowed
    return res.status(403).json({ 
      error: 'Not allowed by CORS',
      allowedOrigins: config.cors.allowedOrigins,
      receivedOrigin: origin || 'none'
    });
  }
  
  // Handle actual requests (non-OPTIONS)
  if (allowed) {
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