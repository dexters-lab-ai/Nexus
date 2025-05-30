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
const setStaticFileHeaders = (res, filePath) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Cache control for different file types
  const cacheControl = {
    'default': 'public, max-age=31536000, immutable',
    'html': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'api': 'no-cache, no-store, must-revalidate'
  };
  
  if (filePath.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|wasm|glb|hdr|webp|avif)$/i)) {
    res.setHeader('Cache-Control', cacheControl.default);
  } else if (filePath.match(/\.(html|htm)$/i)) {
    res.setHeader('Cache-Control', cacheControl.html);
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
};

/**
 * Configure and serve static assets with proper security headers and caching
 * @param {Object} app - Express app instance
 */
// Export the setStaticFileHeaders function for use in other files
export { setStaticFileHeaders };

export default function serveStaticAssets(app) {
  // Configure MIME types
  configureMime();
  express.static.mime.define({'text/css': ['css']});

  // Common static options
  const staticOptions = {
    index: false,
    setHeaders: setStaticFileHeaders,
    fallthrough: false,
    dotfiles: 'ignore',
    etag: true,
    lastModified: true,
    maxAge: '1y'
  };

  // ===== REPORT & RUN DIRECTORIES =====
  // Serve reports and run directories first (before other static files)
  app.use('/nexus_run', express.static(global.NEXUS_PATHS?.RUN_DIR || 'nexus_run', staticOptions));
  
  // ===== CORE ASSETS =====
  // Main static directories
  const staticDirs = [
    { path: path.join(process.cwd(), 'dist'), route: '/' },
    { path: path.join(process.cwd(), 'public'), route: '/public' },
    { path: path.join(process.cwd(), 'public', 'assets'), route: '/assets' },
    { path: path.join(process.cwd(), 'public', 'models'), route: '/models' },
    { path: path.join(process.cwd(), 'node_modules'), route: '/node_modules' },
    { 
      path: path.join(process.cwd(), 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts'), 
      route: '/webfonts' 
    },
    { path: path.join(process.cwd(), 'bruno_demo_temp', 'static'), route: '/bruno_demo_temp/static' },
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
        }
      }
    }
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
      }
    })
  );

  // Redirect /midscene_run to /nexus_run for backward compatibility
  app.use('/midscene_run', (req, res) => {
    res.redirect(301, `/nexus_run${req.path}`);
  });

  console.log('Static assets configured');
}
