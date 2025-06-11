// Export CORS configuration for middleware
export const corsConfig = {
  origin: [
    'https://operator-nexus-knmr8.ondigitalocean.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'Content-Range', 'X-Total-Count'],
  maxAge: 600 // 10 minutes
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