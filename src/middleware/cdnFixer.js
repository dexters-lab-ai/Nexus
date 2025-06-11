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

    // 2. Remove problematic cookies
    if (req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').map((cookie) => cookie.trim());
      const filteredCookies = cookies.filter((cookie) => {
        const [name] = cookie.split('=').map((s) => s.trim());
        return !name.startsWith('__cf') && 
               !name.startsWith('_cf') && 
               !name.startsWith('cf_') && 
               !name.startsWith('sb-') && 
               name !== 'connect.sid';
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

    // 4. Normalize asset paths
    if (req.path.includes('bruno_demo_temp')) {
      const originalUrl = req.url;
      req.url = req.url.replace(/\/bruno_demo_temp[\/]?/, '/');
      log('debug', 'Normalized asset path', { requestId, originalUrl, normalizedUrl: req.url });
    }

    // 5. Prevent Cloudflare cookies
    const domain = req.headers.host || '';
    const isProduction = process.env.NODE_ENV === 'production';
    const baseDomain = isProduction ? domain.replace(/^[^.]*/, '').replace(':', '') : '';
    const domainSuffix = baseDomain ? `; Domain=${baseDomain}` : '';
    
    // Only set cookies if we have a valid domain in production
    if (!isProduction || baseDomain) {
      const cloudflareCookies = [
        `__cf_bm=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=None${domainSuffix}`,
        `__cfruid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=None${domainSuffix}`,
        `_cfuvid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=None${domainSuffix}`,
      ];
      res.setHeader('Set-Cookie', cloudflareCookies);
    }

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