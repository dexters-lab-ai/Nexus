// Export CORS configuration for middleware
export const corsConfig = {
  origin: true, // Will be overridden by the middleware
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  credentials: true,
  exposedHeaders: ['Content-Type', 'Authorization', 'Set-Cookie'],
  maxAge: 86400 // 24 hours
};

export default {
  cors: corsConfig,
  security: {
    cors: true,
    csrf: {
      enable: true,
      ignoreMethods: ['GET', 'HEAD', 'OPTIONS', 'TRACE'],
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        domain: process.env.NODE_ENV === 'production' ? '.ondigitalocean.app' : undefined
      },
      sessionKey: 'csrfToken',
      headerName: 'X-CSRF-Token'
    },
    headers: {
      noSniff: false,
      xssProtection: '1; mode=block',
      xFrameOptions: 'SAMEORIGIN',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      hsts: {
        enable: process.env.NODE_ENV === 'production',
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }
  }
};