/**
 * Middleware to fix CDN and cookie issues
 * - Removes problematic cookies for CDN resources
 * - Handles CORS for CDN resources
 * - Normalizes asset paths
 */

export function cdnAndCookieFixer(req, res, next) {
  // Skip if this is a static file request
  if (req.path.match(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/)) {
    // Remove problematic cookies for CDN resources
    if (req.headers.cookie) {
      const cookies = req.headers.cookie.split(';');
      const filteredCookies = cookies.filter(cookie => {
        const [name] = cookie.split('=').map(s => s.trim());
        return !['__cf_bm', '__cfruid', '_cfuvid'].includes(name);
      });
      
      if (filteredCookies.length === 0) {
        delete req.headers.cookie;
      } else {
        req.headers.cookie = filteredCookies.join('; ');
      }
    }
    
    // Set CORS headers for static assets
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    
    // Normalize asset paths
    if (req.path.startsWith('/bruno_demo_temp/')) {
      const newPath = req.path.replace(/^\/bruno_demo_temp\/static\//, '/');
      req.url = newPath;
    }
  }
  
  next();
}
