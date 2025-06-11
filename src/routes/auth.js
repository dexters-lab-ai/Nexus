// src/routes/auth.js
import express from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Apply rate limiting to auth routes
router.use('/login', authLimiter);
router.use('/register', authLimiter);
router.use('/request-reset', authLimiter);

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

// POST /login
router.post('/login', async (req, res) => {
  // Debug logging
  const debug = process.env.NODE_ENV !== 'production';
  
  if (debug) {
    console.log('🔐 Login attempt:', { 
      email: req.body.email ? 'provided' : 'missing',
      hasPassword: !!req.body.password,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  }

  const { email, password } = req.body;
  
  // Input validation
  if (!email || !password) {
    const error = 'Email and password are required';
    debug && console.log('❌ Login validation failed:', error);
    return res.status(400).json({ 
      success: false, 
      error 
    });
  }
  
  try {
    // Find user by email (case-insensitive)
    const user = await User.findOne({ 
      email: { $regex: new RegExp(`^${email}$`, 'i') } 
    }).select('+password').lean();
    
    // User not found
    if (!user) {
      const error = 'Invalid email or password';
      debug && console.log(`🔍 User not found: ${email}`);
      return res.status(401).json({ 
        success: false, 
        error 
      });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      debug && console.log(`🔒 Invalid password for user: ${email}`);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid email or password' 
      });
    }
    
    // Regenerate session to prevent session fixation
    req.session.regenerate(async (err) => {
      if (err) {
        console.error('❌ Session regeneration error:', err);
        return res.status(500).json({ 
          success: false, 
          error: 'Login failed. Please try again.' 
        });
      }

      // Store user ID in session
      req.session.user = user._id;
      
      // Explicitly save session before responding
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('❌ Session save error:', saveErr);
          return res.status(500).json({ 
            success: false, 
            error: 'Failed to create session' 
          });
        }

        debug && console.log(`✅ Successful login for user: ${user._id}`);
        
        // Return success response with user data (excluding password)
        const { password: _, ...userData } = user;
        res.json({ 
          success: true, 
          user: userData,
          sessionId: req.sessionID
        });
      });
    });
  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'An error occurred during login' 
    });
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

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('Logout error:', err);
    res.redirect('/login.html');
  });
});

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