// src/routes/auth.js
import express  from 'express';
import bcrypt   from 'bcrypt';
import crypto   from 'crypto';
import User     from '../models/User.js';

const router = express.Router();

// POST /register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (req.useMockAuth) {
      // Dev fallback: allow any registration and return mock user
      req.session.user = 'dev-user-id';
      return res.json({ success: true, userId: 'dev-user-id', mock: true });
    }
    // Validation logic
    if (await User.exists({ email })) throw new Error('Email already exists');
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashed });
    req.session.user = user._id;
    res.status(201).json({ success: true, userId: user._id.toString() });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// GET /api/validate-session - Validate current session
router.get('/validate-session', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ valid: false, error: 'No active session' });
    }
    
    // For guest sessions
    if (typeof req.session.user === 'string' && req.session.user.startsWith('guest_')) {
      return res.json({ valid: true, isGuest: true, userId: req.session.user });
    }
    
    // For authenticated users
    const user = await User.findById(req.session.user).select('-password');
    if (!user) {
      return res.status(401).json({ valid: false, error: 'User not found' });
    }
    
    res.json({ 
      valid: true, 
      user: {
        _id: user._id,
        email: user.email,
        isGuest: false
      }
    });
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ valid: false, error: 'Internal server error' });
  }
});

// GET /me - Get current user session info
router.get('/me', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.json({ authenticated: false });
    }

    // Handle guest sessions
    if (typeof req.session.user === 'string' && req.session.user.startsWith('guest_')) {
      return res.json({
        authenticated: true,
        user: {
          _id: req.session.user,
          isGuest: true,
          email: 'guest@example.com'
        },
        isGuest: true
      });
    }

    // Handle authenticated users
    const user = await User.findById(req.session.user).select('-password');
    if (!user) {
      return res.json({ authenticated: false });
    }

    res.json({
      authenticated: true,
      user: {
        _id: user._id,
        email: user.email,
        isGuest: false
      },
      isGuest: false
    });
  } catch (error) {
    console.error('Session validation error:', error);
    res.status(500).json({ error: 'Failed to validate session' });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  console.log('👉 Login request:', {
    headers: req.headers,
    body: req.body,
    sessionID: req.sessionID,
    cookies: req.headers.cookie,
  });
  
  const { email, password } = req.body;
  if (!email || !password) {
    console.log('🚨 Missing credentials:', { email, password });
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }
  
  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      console.log('🔍 User not found for email:', email);
      throw new Error('Invalid email or password');
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('🔒 Invalid password for user:', email);
      throw new Error('Invalid email or password');
    }

    // Regenerate session to prevent session fixation
    return new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err);
          return reject(new Error('Failed to create session'));
        }
        
        // Set user ID in session
        req.session.user = user._id;
        
        // Configure session cookie
        req.session.cookie.secure = process.env.NODE_ENV === 'production';
        req.session.cookie.sameSite = process.env.NODE_ENV === 'production' ? 'none' : 'lax';
        req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        req.session.cookie.domain = process.env.NODE_ENV === 'production' ? 
          (process.env.COOKIE_DOMAIN || '.ondigitalocean.app') : undefined;
          
        // Save the session
        req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            return reject(new Error('Failed to save session'));
          }
          
          // Generate a new token for the client
          const token = crypto.randomBytes(32).toString('hex');
          
          // Send success response with user data (excluding password)
          const userResponse = user.toObject();
          delete userResponse.password;
          
          console.log('✅ Login successful:', { 
            userId: user._id,
            email: user.email,
            sessionId: req.sessionID
          });
          
          res.json({
            success: true,
            user: {
              ...userResponse,
              isGuest: false
            },
            token,
            isGuest: false
          });
          
          resolve();
        });
      });
    }).catch(error => {
      console.error('Login error:', error);
      throw error; // This will be caught by the outer try-catch
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(400).json({ success: false, error: error.message || 'Login failed' });
  }
});

// GET /user
router.get('/user', async (req, res) => {
  if (req.useMockAuth) {
    if (!req.session.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated', mock: true });
    }
    return res.json({ success: true, user: { _id: 'dev-user-id', email: 'dev', mock: true } });
  }
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }
    const user = await User.findById(req.session.user).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch user info' });
  }
});

// Handle logout (both GET and POST)
const handleLogout = (req, res) => {
  // Clear the user session
  const sessionId = req.sessionID;
  const userId = req.session.user;
  
  // Destroy the session
  req.session.destroy(err => {
    if (err) {
      console.error('Session destruction error:', err);
      return res.status(500).json({ success: false, error: 'Failed to destroy session' });
    }
    
    // Clear the session cookie
    res.clearCookie('connect.sid', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      domain: process.env.NODE_ENV === 'production' ? 
        (process.env.COOKIE_DOMAIN || '.ondigitalocean.app') : undefined
    });
    
    console.log('✅ User logged out:', { userId, sessionId });
    
    // For API requests, return JSON
    if (req.xhr || req.get('Accept')?.includes('application/json')) {
      return res.json({ success: true, message: 'Logged out successfully' });
    }
    
    // For regular web requests, redirect to login
    res.redirect('/login.html');
  });
};

// Logout routes (support both GET and POST for backward compatibility)
router.get('/logout', handleLogout);
router.post('/logout', handleLogout);

// DELETE /api/auth/account
router.delete('/account', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  try {
    const userId = req.session.user;
    await User.deleteOne({ _id: userId });
    req.session.destroy(() => {
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  }
});

// --- PASSWORD RESET ---
// In-memory token store (for demo only)
const passwordResetTokens = {};

// POST /auth/request-reset
router.post('/request-reset', async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, error: 'No user with that email' });
    // Generate token
    const token = Math.random().toString(36).substr(2) + Date.now();
    passwordResetTokens[token] = { userId: user._id, expires: Date.now() + 3600_000 };
    // Log the reset link (replace with email logic in production)
    console.log(`[Password Reset] http://localhost:3000/reset-password?token=${token}`);
    res.json({ success: true, message: 'Password reset link sent (check server logs in dev).' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to process reset request' });
  }
});

// POST /auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  const entry = passwordResetTokens[token];
  if (!entry || entry.expires < Date.now()) {
    return res.status(400).json({ success: false, error: 'Invalid or expired token' });
  }
  try {
    const hashed = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(entry.userId, { password: hashed });
    delete passwordResetTokens[token];
    res.json({ success: true, message: 'Password has been reset.' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
});

export default router;