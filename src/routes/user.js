import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import User from '../models/User.js';

const router = express.Router();

// GET /api/user/me - Get current user's profile
router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user)
      .select('email name username')
      .lean();
      
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      user: {
        email: user.email,
        name: user.name || user.email.split('@')[0],
        username: user.username
      }
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch user profile' });
  }
});

export default router;
