/**
 * Middleware to fix CDN and cookie issues
 * - Removes problematic cookies for CDN resources
 * - Handles CORS for CDN resources
 * - Normalizes asset paths
 * - Fixes Cloudflare cookie issues
 */

// Logging helper function
const log = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  const logData = Object.keys(data).length ? `\n${JSON.stringify(data, null, 2)}` : '';
  console.log(`[${timestamp}] [CDN-FIXER] [${level.toUpperCase()}] ${message}${logData}`);
};

export function cdnAndCookieFixer(req, res, next) {
  const startTime = Date.now();
  const requestId = Math.random().toString(36).substring(2, 10);

  log('debug', `Incoming request`, {
    requestId,
    method: req.method,
    path: req.path,
    url: req.originalUrl,
    hasCookies: !!req.headers.cookie,
    origin: req.headers.origin,
  });

  const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|wasm|glb|hdr|bin|json|mp3|wav|mp4|webm|webp|avif|apng|tiff|tif|bmp|cur|otf|eot|ttc|woff|woff2|fnt|gltf|glb|fbx|obj|mtl|stl|dae|3ds|3mf|amf|pcd|ply|wrl|x3d|hdr|exr|tga|ktx|basis|pvr|pkm|astc|dds|ktx2)$/i.test(
    req.path
  );

  if (isStaticAsset) {
    log('info', `Processing static asset`, {
      requestId,
      path: req.path,
      method: req.method,
      isStaticAsset: true,
    });

    // 1. Handle CORS headers
    const origin = req.headers.origin;
    if (origin) {
      log('debug', `Setting CORS headers`, { requestId, origin });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', '*');
    }

    // 2. Remove problematic cookies for static assets only
    // Don't modify cookies for API requests to preserve sessions
    if (req.headers.cookie && !req.path.startsWith('/api/')) {
      const cookies = req.headers.cookie.split(';').map((cookie) => cookie.trim());
      const filteredCookies = cookies.filter((cookie) => {
        const [name] = cookie.split('=').map((s) => s.trim());
        return !name.startsWith('__cf') && 
               !name.startsWith('_cf') && 
               !name.startsWith('cf_') && 
               !name.startsWith('sb-'); 
               // Keep connect.sid for all requests
      });

      if (filteredCookies.length === 0) {
        delete req.headers.cookie;
      } else {
        req.headers.cookie = filteredCookies.join('; ');
      }
    }

    // 3. Handle preflight requests
    if (req.method === 'OPTIONS') {
      log('info', 'Handling OPTIONS preflight request', { requestId });
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Session-ID, *'
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      return res.status(204).end();
    }

    // Removed bruno_demo_temp path normalization to prevent duplicate paths

    // 5. Prevent Cloudflare cookies
    const cloudflareCookies = [
      `__cf_bm=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=None`,
      `__cfruid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=None`,
      `_cfuvid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=None`,
    ];
    res.setHeader('Set-Cookie', cloudflareCookies.join(', '));

    // 6. Add security headers
    const securityHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
    };
    Object.entries(securityHeaders).forEach(([key, value]) => res.setHeader(key, value));

    // 7. Cache control
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|wasm|glb|hdr)$/i)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }

  // Log completion
  const processingTime = Date.now() - startTime;
  res.setHeader('X-CDN-Processed', 'true');
  res.setHeader('X-Request-ID', requestId);
  log('info', `Request processed`, {
    requestId,
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    processingTime: `${processingTime}ms`,
    isStaticAsset,
    headers: { 'x-cdn-processed': 'true', 'x-request-id': requestId },
  });

  next();
}