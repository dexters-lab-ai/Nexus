// src/routes/auth.js
import express from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';

const router = express.Router();

// POST /register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Development mock auth fallback
    if (req.useMockAuth) {
      req.session.user = 'dev-user-id';
      return res.json({ success: true, userId: 'dev-user-id', mock: true });
    }

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Check if user already exists
    if (await User.exists({ email })) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    // Create new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ 
      email, 
      password: hashedPassword 
    });

    // Regenerate session to prevent session fixation
    req.session.regenerate(async (err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.status(500).json({ success: false, error: 'Session error' });
      }
      
      // Set user ID in session
      req.session.user = user._id.toString();
      
      // Save session
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ success: false, error: 'Session error' });
        }
        
        // Return success response with user data (excluding sensitive info)
        const userResponse = user.toObject();
        delete userResponse.password;
        
        res.status(201).json({ 
          success: true, 
          user: userResponse 
        });
      });
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Registration failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// POST /login
router.post('/login', async (req, res) => {
  // Debug logging
  if (process.env.NODE_ENV !== 'production') {
    console.log('Login request:', {
      path: req.path,
      method: req.method,
      sessionId: req.sessionID,
      hasSessionUser: !!req.session.user,
      hasAuthHeader: !!req.headers.authorization
    });
  }
  
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email and password are required' 
    });
  }
  
  try {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      console.log('Login failed: User not found for email:', email);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      console.log('Login failed: Invalid password for user:', email);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid credentials' 
      });
    }
    
    // Regenerate session to prevent session fixation
    req.session.regenerate(async (err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.status(500).json({ success: false, error: 'Session error' });
      }
      
      // Set user ID in session
      req.session.user = user._id.toString();
      
      // Save session
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ success: false, error: 'Session error' });
        }
        
        // Prepare user response (exclude sensitive data)
        const userResponse = user.toObject();
        delete userResponse.password;
        
        console.log('Successful login:', { 
          userId: user._id, 
          email: user.email,
          sessionId: req.sessionID 
        });
        
        // Return success response
        res.json({ 
          success: true, 
          user: userResponse
        });
      });
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Login failed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Test endpoint to verify session and CORS
router.get('/test-session', (req, res) => {
  try {
    // Return session information
    res.json({
      success: true,
      sessionId: req.sessionID,
      userId: req.session.user,
      isGuest: req.session.user && req.session.user.startsWith('guest_'),
      headers: req.headers,
      cookies: req.cookies,
      secure: req.secure,
      hostname: req.hostname,
      ip: req.ip
    });
  } catch (err) {
    console.error('Test session error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to test session',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET /user - Get current user info
router.get('/user', async (req, res) => {
  try {
    // Development mock auth fallback
    if (req.useMockAuth) {
      if (!req.session.user) {
        return res.status(401).json({ 
          success: false, 
          error: 'Not authenticated', 
          mock: true 
        });
      }
      return res.json({ 
        success: true, 
        user: { 
          _id: 'dev-user-id', 
          email: 'dev', 
          mock: true 
        } 
      });
    }

    // If no user in session, return 401
    if (!req.session.user) {
      return res.status(401).json({ 
        success: false, 
        error: 'Not authenticated' 
      });
    }

    // Get user from database or create guest user
    const user = await User.findByIdOrString(req.session.user);
    
    // Prepare user response (exclude sensitive data)
    const userResponse = {
      _id: user._id,
      email: user.email,
      isGuest: user.isGuest || false,
      modelPreferences: user.modelPreferences || {
        default: 'gpt-4o',
        code: 'gpt-4o',
        content: 'gpt-4o',
        research: 'gpt-4o'
      },
      preferredEngine: user.preferredEngine || 'gpt-4o',
      executionMode: user.executionMode || 'step-planning',
      maxSteps: user.maxSteps || 10,
      privacyMode: user.privacyMode || false,
      customUrls: user.customUrls || []
    };
    
    res.json({ 
      success: true, 
      user: userResponse 
    });
    
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch user info',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// GET /logout - Log out the current user
router.get('/logout', (req, res) => {
  // Only destroy the session if it exists
  if (!req.session) {
    return res.redirect('/login');
  }
  
  // Destroy the session
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      // Even if there's an error, we still want to clear the session cookie
      res.clearCookie('nexus.sid', {
        path: '/',
        domain: process.env.NODE_ENV === 'production' ? 
          (process.env.COOKIE_DOMAIN || '.ondigitalocean.app') : undefined,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
      });
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    
    // Clear the session cookie
    res.clearCookie('nexus.sid', {
      path: '/',
      domain: process.env.NODE_ENV === 'production' ? 
        (process.env.COOKIE_DOMAIN || '.ondigitalocean.app') : undefined,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });
    
    // Redirect to login page or return success response for API calls
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' || 
        req.headers.accept?.includes('application/json')) {
      return res.json({ success: true });
    }
    
    res.redirect('/login');
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