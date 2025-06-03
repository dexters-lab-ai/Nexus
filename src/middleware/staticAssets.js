// src/middleware/staticAssets.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import configureMime from './mimeConfig.js';

/**
 * Set security headers for static files
 * @param {Object} res - Response object
 * @param {string} filePath - Path to the file being served
 */
/**
 * Set security and caching headers for static files
 * @param {Object} res - Response object
 * @param {string} filePath - Path to the file being served
 */
const setStaticFileHeaders = (res, filePath) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  
  // Set CORS headers for all static assets
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Cache control for different file types
  const cacheControl = {
    default: 'public, max-age=31536000, immutable',
    html: 'no-store, no-cache, must-revalidate, proxy-revalidate',
    api: 'no-cache, no-store, must-revalidate',
    media: 'public, max-age=86400, immutable' // 24 hours for media files
  };

  // Set appropriate cache headers based on file type
  if (filePath.match(/\.(js|css|woff|woff2|ttf|eot|wasm)$/i)) {
    // Long cache for versioned assets
    res.setHeader('Cache-Control', cacheControl.default);
  } else if (filePath.match(/\.(png|jpg|jpeg|gif|ico|svg|webp|avif|glb|hdr|mp4|webm|mp3|wav|ogg)$/i)) {
    // Media files with shorter cache
    res.setHeader('Cache-Control', cacheControl.media);
  } else if (filePath.match(/\.(html|htm)$/i)) {
    // No cache for HTML files
    res.setHeader('Cache-Control', cacheControl.html);
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  } else {
    // Default cache for other files
    res.setHeader('Cache-Control', 'public, max-age=600');
  }
  
  // Set X-Content-Type-Options to prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Set Content-Security-Policy for additional security
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://api.openai.com wss://*",
    "frame-src 'self' https://www.youtube.com",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', csp);
};

/**
 * Configure and serve static assets with proper security headers and caching
 * @param {Object} app - Express app instance
 */
export { setStaticFileHeaders };

export default function serveStaticAssets(app) {
  // Configure MIME types
  configureMime();
  express.static.mime.define({ 'text/css': ['css'] });

  // Common static options
  const staticOptions = {
    index: false,
    setHeaders: setStaticFileHeaders,
    dotfiles: 'ignore',
    etag: true,
    lastModified: true,
    maxAge: '1y',
    mimeTypes: {
      'application/javascript': ['js', 'mjs'],
      'text/css': ['css']
    }
  };

  // ===== REPORT & RUN DIRECTORIES =====
  // Serve reports and run directories first (before other static files)
  app.use('/nexus_run', express.static(global.NEXUS_PATHS?.RUN_DIR || 'nexus_run', staticOptions));

  // ===== CORE ASSETS =====
  // Main static directories
  const isDev = process.env.NODE_ENV === 'development';
  // Common static directories for both dev and prod
  const staticDirs = [
    // Serve from dist in production, src in development
    {
      path: isDev ? path.join(process.cwd(), 'src') : path.join(process.cwd(), 'dist'),
      route: '/',
      options: {
        ...staticOptions,
        setHeaders: (res, path) => {
          // Set proper content type based on file extension
          if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
          } else if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
          }
          // Allow CORS for all static assets
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        }
      }
    },
    // Public directory
    { 
      path: path.join(process.cwd(), 'public'), 
      route: '/public',
      options: staticOptions 
    },
    // Assets directory
    { 
      path: path.join(process.cwd(), 'public', 'assets'), 
      route: '/assets',
      options: staticOptions 
    },
    // Models directory
    { 
      path: path.join(process.cwd(), 'public', 'models'), 
      route: '/models',
      options: staticOptions 
    },
    // Bruno demo assets - only in production (handled by copy-assets.js)
    ...(isDev 
      ? [] 
      : [{
          path: path.join(process.cwd(), 'bruno_demo_temp', 'static'),
          route: '/bruno_demo_temp/static',
          options: staticOptions
        }]
    ),
    { path: path.join(process.cwd(), 'node_modules'), route: '/node_modules' },
    // Serve Font Awesome webfonts from node_modules
    {
      path: path.join(process.cwd(), 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts'),
      route: '/webfonts',
      options: {
        ...staticOptions,
        setHeaders: (res, filePath) => {
          setStaticFileHeaders(res, filePath);
          if (filePath.endsWith('.ttf')) {
            res.setHeader('Content-Type', 'font/ttf');
          } else if (filePath.endsWith('.woff')) {
            res.setHeader('Content-Type', 'font/woff');
          } else if (filePath.endsWith('.woff2')) {
            res.setHeader('Content-Type', 'font/woff2');
          } else if (filePath.endsWith('.eot')) {
            res.setHeader('Content-Type', 'application/vnd.ms-fontobject');
          } else if (filePath.endsWith('.svg')) {
            res.setHeader('Content-Type', 'image/svg+xml');
          }
        },
      },
    },
    // Also serve webfonts from public/webfonts for any CSS that expects them there
    {
      path: path.join(process.cwd(), 'public', 'webfonts'),
      route: '/webfonts',
      options: {
        ...staticOptions,
        setHeaders: (res, filePath) => {
          setStaticFileHeaders(res, filePath);
          if (filePath.endsWith('.ttf')) {
            res.setHeader('Content-Type', 'font/ttf');
          } else if (filePath.endsWith('.woff')) {
            res.setHeader('Content-Type', 'font/woff');
          } else if (filePath.endsWith('.woff2')) {
            res.setHeader('Content-Type', 'font/woff2');
          } else if (filePath.endsWith('.eot')) {
            res.setHeader('Content-Type', 'application/vnd.ms-fontobject');
          } else if (filePath.endsWith('.svg')) {
            res.setHeader('Content-Type', 'image/svg+xml');
          }
        },
      },
    },
    // Bruno demo assets - development
    {
      path: path.join(process.cwd(), 'bruno_demo_temp', 'static'),
      route: '/bruno_demo_temp/static',
      options: staticOptions
    },
    { path: path.join(process.cwd(), 'public', 'vendors'), route: '/vendors' },
    { path: path.join(process.cwd(), 'public', 'lib'), route: '/lib' },
    { path: path.join(process.cwd(), 'src', 'styles'), route: '/styles' },
    {
      path: path.join(process.cwd(), 'src', '3d'),
      route: '/js/3d',
      options: {
        ...staticOptions,
        setHeaders: (res, filePath) => {
          setStaticFileHeaders(res, filePath);
          if (filePath.endsWith('.glb')) {
            res.setHeader('Content-Type', 'model/gltf-binary');
          }
        },
      },
    },
  ];

  // Apply static file serving for each directory
  staticDirs.forEach(({ path: dirPath, route, options = staticOptions }) => {
    if (fs.existsSync(dirPath)) {
      app.use(route, express.static(dirPath, options));
    } else {
      console.warn(`Static directory not found: ${dirPath}`);
    }
  });

  // Special handling for CSS files with proper MIME type
  app.use(
    '/css',
    express.static(path.join(process.cwd(), 'public/css'), {
      ...staticOptions,
      setHeaders: (res) => {
        res.setHeader('Content-Type', 'text/css');
        setStaticFileHeaders(res, 'style.css');
      },
    })
  );

  // Redirect /midscene_run to /nexus_run for backward compatibility
  app.use('/midscene_run', (req, res) => {
    res.redirect(301, `/nexus_run${req.path}`);
  });

  console.log('Static assets configured');
}