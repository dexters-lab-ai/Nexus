// Export CORS configuration for middleware
export const corsConfig = {
  allowedOrigins: ['*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  defaultHeaders: ['Content-Type', 'Authorization', 'Accept'],
  exposedHeaders: [],
  maxAge: 86400 // 24 hours
};

// For backward compatibility
const ALLOWED_ORIGINS = corsConfig.allowedOrigins;
const UNIQUE_ORIGINS = corsConfig.allowedOrigins;

export default {
  cors: corsConfig,
  security: {
    cors: true, // Let Cloudflare handle CORS
    csrf: {
      enable: true,
      ignoreMethods: ['GET', 'HEAD', 'OPTIONS', 'TRACE'],
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // Changed from 'strict' for better compatibility
        domain: process.env.NODE_ENV === 'production' ? `.${process.env.APP_DOMAIN}` : undefined
      },
      sessionKey: 'csrfToken',
      headerName: 'X-CSRF-Token'
    },
    headers: {
      xssProtection: '1; mode=block',
      noSniff: true,
      xFrameOptions: 'SAMEORIGIN', // Changed from 'DENY' for better compatibility
      hsts: {
        enable: process.env.NODE_ENV === 'production',
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }
  }
};