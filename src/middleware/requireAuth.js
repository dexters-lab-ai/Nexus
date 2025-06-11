// src/middleware/requireAuth.js

import User from '../models/User.js';

/**
 * Middleware to check if user is authenticated
 * Attaches user object to req.user for both guest and authenticated users
 */
export async function requireAuth(req, res, next) {
  try {
    // Debug logging
    if (process.env.NODE_ENV !== 'production') {
      console.log('requireAuth:', {
        path: req.path,
        method: req.method,
        sessionId: req.sessionID,
        sessionUser: req.session.user,
        hasAuthHeader: !!req.headers.authorization,
        isApiRequest: req.path.startsWith('/api/')
      });
    }

    // If no user in session, create a guest session
    if (!req.session.user) {
      req.session.user = `guest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      req.session.save();
      console.log('Created new guest session:', req.session.user);
    }

    // Get user from database or create guest user
    const user = await User.findByIdOrString(req.session.user);
    
    // Attach user to request object
    req.user = user;
    
    // For API routes, check if authentication is required
    if (req.path.startsWith('/api/') && !req.path.startsWith('/api/auth/')) {
      // If it's a guest trying to access protected API, return 401
      if (user.isGuest && !isPublicApiRoute(req.path)) {
        return res.status(401).json({ 
          success: false, 
          error: 'Authentication required',
          isGuest: true
        });
      }
    }
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (req.path.startsWith('/api/')) {
      return res.status(500).json({ 
        success: false, 
        error: 'Authentication service error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    // For non-API routes, redirect to login
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' || 
        req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ success: false, error: 'Not logged in' });
    }
    return res.redirect('/login');
  }
}

/**
 * Check if the API route is public (doesn't require authentication)
 */
function isPublicApiRoute(path) {
  const publicRoutes = [
    '/api/health',
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/guest',
    '/api/config',
    '/api/version'
  ];
  
  return publicRoutes.some(route => path.startsWith(route));
}

/**
 * Middleware that requires an authenticated (non-guest) user
 */
export async function requireAuthenticatedUser(req, res, next) {
  if (!req.user || req.user.isGuest) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required',
        isGuest: !!req.user?.isGuest
      });
    }
    return res.redirect('/login');
  }
  next();
}