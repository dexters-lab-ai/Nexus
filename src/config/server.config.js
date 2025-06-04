// Export CORS configuration for middleware
export const corsConfig = {
  origin: true, // Enable CORS for all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: true,
  exposedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  maxAge: 86400 // 24 hours
};

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
      // Disable MIME type sniffing for DigitalOcean compatibility
      noSniff: false,
      xssProtection: '1; mode=block',
      xFrameOptions: 'SAMEORIGIN',
      // Add custom headers for better compatibility
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=31536000', // Changed from 'DENY' for better compatibility
      hsts: {
        enable: process.env.NODE_ENV === 'production',
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }
  }
};