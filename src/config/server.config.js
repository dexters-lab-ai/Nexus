// Export CORS configuration for middleware
export const corsConfig = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In production, allow any *.ondigitalocean.app subdomain
    if (process.env.NODE_ENV === 'production') {
      if (origin.endsWith('.ondigitalocean.app')) {
        return callback(null, true);
      }
    }
    
    // Allow development origins
    const allowedOrigins = [
      'https://operator-pjcgr.ondigitalocean.app',
      'https://operator-io236.ondigitalocean.app',
      'http://localhost:3000',
      'http://localhost:3420',
      'http://localhost:5173'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Accept', 
    'X-Requested-With',
    'Cache',
    'Pragma',
    'X-CSRF-Token',
    'X-Requested-With',
    'X-Request-ID'
  ],
  credentials: true,
  exposedHeaders: [
    'Content-Type', 
    'Authorization', 
    'Set-Cookie',
    'Content-Range',
    'X-Total-Count',
    'X-Request-ID'
  ],
  maxAge: 86400, // 24 hours
  preflightContinue: false,
  optionsSuccessStatus: 204
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