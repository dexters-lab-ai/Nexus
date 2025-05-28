/**
 * Middleware to fix CDN and cookie issues
 * - Removes problematic cookies for CDN resources
 * - Handles CORS for CDN resources
 * - Normalizes asset paths
 * - Fixes Cloudflare cookie issues
 */

export function cdnAndCookieFixer(req, res, next) {
  const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|wasm|glb|hdr|bin|json|mp3|wav|mp4|webm|webp|avif|apng|tiff|tif|bmp|cur|otf|eot|ttc|woff|woff2|fnt|gltf|glb|fbx|obj|mtl|stl|dae|3ds|3mf|amf|pcd|ply|wrl|x3d|hdr|exr|tga|ktx|basis|pvr|pkm|astc|dds|ktx2|pvr|pkm|astc|dds|ktx2|pvr|pkm|astc|dds|ktx2|pvr|pkm|astc|dds|ktx2)$/i.test(req.path);
  
  // For all static assets and API requests
  if (isStaticAsset) {
    // 1. Handle CORS headers first
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Expose-Headers', '*');
    }
    
    // 2. Remove problematic cookies from the request
    if (req.headers.cookie) {
      const cookies = req.headers.cookie.split(';').map(cookie => cookie.trim());
      const filteredCookies = cookies.filter(cookie => {
        const [name] = cookie.split('=').map(s => s.trim());
        // Keep only session-related cookies, remove all Cloudflare cookies
        return !name.startsWith('__cf') && !name.startsWith('_cf') && !name.startsWith('cf_');
      });
      
      if (filteredCookies.length === 0) {
        delete req.headers.cookie;
      } else {
        req.headers.cookie = filteredCookies.join('; ');
      }
    }
    
    // 3. Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Session-ID, *');
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
      return res.status(204).end();
    }
    
    // 4. Normalize asset paths
    if (req.path.includes('bruno_demo_temp')) {
      req.url = req.url.replace(/\/bruno_demo_temp[\/]?/, '/');
    }
    
    // 5. Prevent Cloudflare from setting cookies on static assets
    res.setHeader('Set-Cookie', [
      `__cf_bm=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=None`,
      `__cfruid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=None`,
      `_cfuvid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=None`
    ].join(', '));
    
    // 6. Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // 7. Cache control (1 year for assets)
    if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|wasm|glb|hdr)$/i)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
  
  next();
}
