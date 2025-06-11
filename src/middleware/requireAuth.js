// src/middleware/requireAuth.js

/**
 * Middleware to ensure user is authenticated
 * Handles both API and web requests with appropriate responses
 */
export function requireAuth(req, res, next) {
  // Skip auth for public routes
  const publicRoutes = [
    '/api/auth/login', 
    '/api/auth/register', 
    '/login', 
    '/register',
    '/auth',
    '/auth/'
  ];

  if (publicRoutes.some(route => req.path.startsWith(route))) {
    return next();
  }

  // Check session
  if (!req.session.user) {
    // For API requests or AJAX calls
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Session expired. Please log in again.' 
      });
    }
    
    // For web requests, store the intended URL and redirect to login
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login.html');
  }

  // Refresh session on each request
  if (typeof req.session.touch === 'function') {
    req.session.touch();
  }

  // Add user to request for convenience
  req.user = { _id: req.session.user };
  
  next();
}