// src/middleware/requireAuth.js

export function requireAuth(req, res, next) {
  /*
  console.log('requireAuth:', {
    path: req.path,
    sessionId: req.sessionID,
    user: req.session.user,
    cookies: req.headers.cookie,
  });
  */
  if (!req.session.user) {
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ success: false, error: 'Not logged in' });
    }
    return res.redirect('/login.html');
  }
  next();
}