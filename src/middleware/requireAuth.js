// src/middleware/requireAuth.js

import User from '../models/User.js';

export const requireAuth = async (req, res, next) => {
  try {
    if (!req.session.user) {
      if (req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }
      return res.redirect('/login.html');
    }
    
    // This will work for both guest and authenticated users
    const user = await User.findByIdOrString(req.session.user);
    
    // Attach user to request for downstream middleware
    req.user = user;
    
    // If it's a guest user and the route requires authentication, deny access
    if (user.isGuest) {
      if (req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ success: false, error: 'Guest access not allowed' });
      }
      return res.redirect('/login.html');
    }
    
    next();
  } catch (err) {
    console.error('Auth error:', err);
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, error: 'Authentication error' });
    }
    return res.redirect('/login.html');
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    if (req.session.user) {
      // This will work for both guest and authenticated users
      req.user = await User.findByIdOrString(req.session.user);
    } else {
      // Create a guest user for unauthenticated requests
      req.user = {
        _id: `guest_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        isGuest: true,
        email: 'guest@example.com'
      };
    }
    next();
  } catch (err) {
    console.error('Auth error:', err);
    // For optional auth, we can continue even if there's an error
    next();
  }
};