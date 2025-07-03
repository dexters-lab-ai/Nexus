// Export CORS configuration for middleware
export const corsConfig = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // In production, allow any *.ondigitalocean.app subdomain
    if (process.env.NODE_ENV === 'production') {
      if (origin.endsWith('.ondigitalocean.app') || origin.endsWith('.dexter-ai.io')) {
        return callback(null, true);
      }
    }
    
    // Allow development origins
    const allowedOrigins = [
      'https://operator-pjcgr.ondigitalocean.app',
      'https://operator.dexter-ai.io',
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
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Session-ID',
    'X-Request-ID',
    'X-Forwarded-For',
    'X-Forwarded-Proto',
    'X-Forwarded-Port',
    'Accept-Language',
    'Accept-Encoding',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: [
    'Content-Length',
    'Content-Type',
    'X-Request-ID',
    'X-Session-ID',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Set-Cookie',
    'ETag',
    'Last-Modified'
  ],
  credentials: true,
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Get cookie domain based on environment
const getCookieDomain = () => {
  if (process.env.COOKIE_DOMAIN) {
    return process.env.COOKIE_DOMAIN;
  }
  
  if (process.env.NODE_ENV === 'production') {
    return '.dexter-ai.io'; // Allow all subdomains
  }
  
  // In development, don't set domain to allow localhost cookies
  return undefined;
};

// Session Configuration
export const sessionConfig = {
  name: 'nexus.sid',
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: process.env.NODE_ENV === 'production', // Trust first proxy in production
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Requires HTTPS in production
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    domain: getCookieDomain(),
    path: '/',
    // Add these for additional security
    partitioned: process.env.NODE_ENV === 'production', // Enable Partitioned attribute for cross-site cookies
    priority: 'High' // Cookie priority
  },
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/nexus',
    collectionName: 'sessions',
    ttl: 7 * 24 * 60 * 60, // 7 days in seconds
    autoRemove: 'interval',
    autoRemoveInterval: 60 * 24, // Remove expired sessions every 24 hours
    touchAfter: 3600, // 1 hour - only update session if it's been modified
    stringify: false,
    mongoOptions: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      retryReads: true,
      maxPoolSize: 10,
      minPoolSize: 1,
      maxIdleTimeMS: 30000,
      waitQueueTimeoutMS: 10000,
      // Add these options for better MongoDB connection handling
      keepAlive: true,
      keepAliveInitialDelay: 300000, // 5 minutes
      // Add replica set if using MongoDB Atlas
      ...(process.env.MONGODB_REPLICA_SET && { replicaSet: process.env.MONGODB_REPLICA_SET })
    }
  })
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
        domain: process.env.NODE_ENV === 'production' ? '.dexter-ai.io' : undefined
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
  },
  session: sessionConfig
};