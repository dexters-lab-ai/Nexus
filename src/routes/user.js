import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import User from '../models/User.js';

const router = express.Router();

// GET /api/user/available-engines - Get available LLM engines for the user
router.get('/available-engines', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Get user's preferred engine if set
    const preferredEngine = user.preferences?.preferredEngine || 'gpt-4o';
    
    // Get available engines based on user's API keys
    const availableEngines = [];
    const usingAnyDefaultKey = false; // Track if any default keys are being used
    
    // Check which API keys the user has configured
    if (user.apiKeys?.openai) {
      availableEngines.push('gpt-4o');
    }
    if (user.apiKeys?.qwen) {
      availableEngines.push('qwen-2.5-vl-72b');
    }
    if (user.apiKeys?.google) {
      availableEngines.push('gemini-2.5-pro');
    }
    if (user.apiKeys?.uitars) {
      availableEngines.push('ui-tars');
    }

    // If no engines are available, use GPT-4o as fallback
    if (availableEngines.length === 0) {
      availableEngines.push('gpt-4o');
    }

    res.json({
      success: true,
      availableEngines,
      preferredEngine,
      usingAnyDefaultKey
    });
  } catch (error) {
    console.error('Error fetching available engines:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch available engines',
      availableEngines: ['gpt-4o'], // Fallback
      preferredEngine: 'gpt-4o'
    });
  }
});


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
