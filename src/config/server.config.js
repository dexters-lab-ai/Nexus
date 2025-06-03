/**
 * Server Configuration
 * 
 * This configuration allows all origins when using Cloudflare.
 * Security is handled at the Cloudflare level using:
 * - WAF Rules
 * - Rate Limiting
 * - Bot Fight Mode
 * - Security Headers
 */

// CORS Configuration
export const corsConfig = {
  // Allow all origins - security is handled by Cloudflare
  allowedOrigins: ['*'],
  
  // Default CORS headers
  defaultHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-CSRF-Token'
  ],
  
  // Allowed HTTP methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  
  // Exposed headers
  exposedHeaders: ['Content-Length', 'Content-Type', 'Authorization'],
  
  // Max age for preflight requests (24 hours)
  maxAge: 86400,
  
  // Allow credentials
  credentials: true
};

// For backward compatibility
const ALLOWED_ORIGINS = corsConfig.allowedOrigins;
const UNIQUE_ORIGINS = corsConfig.allowedOrigins;
const PRODUCTION_DOMAIN = process.env.APP_DOMAIN;

export default {
  cors: {
    allowedOrigins: UNIQUE_ORIGINS,
    // Default CORS headers
    defaultHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-CSRF-Token'
    ],
    // Default CORS methods
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // Whether to allow credentials (cookies, authorization headers, etc.)
    credentials: true,
    // Max age for preflight requests (in seconds)
    maxAge: 600, // 10 minutes
    // Expose headers to the client
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar']
  },
  session: {
    name: 'nexus.sid',
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    proxy: process.env.NODE_ENV === 'production',
    rolling: true,
    cookie: {
      // Set secure cookies in production
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      // Allow cross-site cookies in production with proper security
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      // Set domain for production
      domain: process.env.NODE_ENV === 'production' ? `.${PRODUCTION_DOMAIN}` : undefined,
      path: '/',
      // Add additional security headers
      priority: 'high',
      // Enable secure cookies in production
      secure: process.env.NODE_ENV === 'production',
      // Add secure proxy for production
      proxy: process.env.NODE_ENV === 'production',
      // Add secure proxy trust for production
      trustProxy: process.env.NODE_ENV === 'production'
    },
    // Session store configuration
    store: {
      // Add any session store configuration here
      // For example, for connect-mongo:
      // mongoUrl: process.env.MONGO_URI,
      // ttl: 24 * 60 * 60, // 1 day
      // autoRemove: 'native',
      // autoRemoveInterval: 10 // In minutes
    }
  },
  // Security headers
  security: {
    // Enable CORS for all routes
    cors: false,
    // Enable CSRF protection
    csrf: {
      enable: true,
      // Ignore these methods
      ignoreMethods: ['GET', 'HEAD', 'OPTIONS', 'TRACE'],
      // Cookie options
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        domain: process.env.NODE_ENV === 'production' ? `.${PRODUCTION_DOMAIN}` : undefined
      },
      // Session key for CSRF token
      sessionKey: 'csrfToken',
      // Header name for CSRF token
      headerName: 'X-CSRF-Token'
    },
    // Security headers
    headers: {
      // Enable XSS protection
      xssProtection: '1; mode=block',
      // Prevent MIME type sniffing
      noSniff: true,
      // Prevent clickjacking
      xFrameOptions: 'DENY',
      // Enable HSTS in production
      hsts: {
        enable: process.env.NODE_ENV === 'production',
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true
      },
      // Enable X-Content-Type-Options
      noSniff: true,
      // Enable X-Download-Options
      downloadOptions: 'noopen',
      // Enable X-Permitted-Cross-Domain-Policies
      permittedCrossDomainPolicies: 'none',
      // Enable Referrer-Policy
      referrerPolicy: 'same-origin',
      // Enable Feature-Policy
      featurePolicy: {
        features: {
          camera: ["'none'"],
          microphone: ["'none'"],
          geolocation: ["'none'"]
        }
      }
    }
  },
  // Server configuration
  server: {
    // Server port
    port: process.env.PORT || 3000,
    // Server host
    host: process.env.HOST || '0.0.0.0',
    // Trust proxy headers
    trustProxy: process.env.NODE_ENV === 'production',
    // Enable compression
    compression: true,
    // Body parser options
    bodyParser: {
      enable: true,
      // Limit for JSON body
      jsonLimit: '10mb',
      // Limit for URL-encoded body
      urlencodedLimit: '10mb',
      // Enable URL-encoded extended syntax
      extended: true,
      // Enable parsing of arrays and objects
      parameterLimit: 10000
    },
    // Static file serving options
    static: {
      // Enable or disable serving static files
      enable: true,
      // Directory to serve static files from
      directory: 'public',
      // Enable or disable directory listing
      directoryListing: false,
      // Enable or disable setting ETag header
      etag: true,
      // Enable or disable setting Last-Modified header
      lastModified: true,
      // Set max-age for cache control
      maxAge: 86400000 // 1 day in milliseconds
    }
  }
};