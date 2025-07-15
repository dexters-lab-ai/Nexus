import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import User from '../models/User.js';
import { checkEngineApiKey } from '../../server.js';

const router = express.Router();

// Map of engine names to their API key types
const ENGINE_KEY_MAPPING = {
  'gpt-4o': 'openai',
  'qwen-2.5-vl-72b': 'qwen',
  'gemini-2.5-pro': 'google',
  'ui-tars': 'uitars',
  'grok-1': 'xai'
};

// GET /api/user/available-engines - Get available LLM engines for the user
router.get('/available-engines', requireAuth, async (req, res) => {
  try {
    // Check both req.session.user and req.session.userId for compatibility
    const userId = req.session.user || req.session.userId;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // For first-time users without a user ID, provide default engines with system defaults
    if (!userId) {
      console.log('Available engines request for new user - providing defaults');
      const supportedEngines = Object.keys(ENGINE_KEY_MAPPING);
      
      // For new users, we'll assume all engines are available with system defaults
      const engineStatus = {};
      const availableEngines = supportedEngines;
      let usingAnyDefaultKey = true;
      
      // Populate engine status with default info
      supportedEngines.forEach(engine => {
        engineStatus[engine] = {
          available: true,
          usingDefault: true,
          keySource: 'system-default',
          keyType: ENGINE_KEY_MAPPING[engine]
        };
      });
      
      return res.json({ 
        success: true, 
        engineStatus,
        availableEngines,
        preferredEngine: 'gpt-4o',
        usingAnyDefaultKey
      });
    }
    
    // Use our standardized ENGINE_KEY_MAPPING for consistency
    const supportedEngines = Object.keys(ENGINE_KEY_MAPPING);
    
    // Create an array of promises for checking each engine
    const enginePromises = supportedEngines.map(engine => checkEngineApiKey(userId, engine));
    
    // Execute all promises in parallel with a timeout for safety
    const results = await Promise.allSettled(enginePromises);
    
    // Format the results
    const engineStatus = {};
    const availableEngines = [];
    let usingAnyDefaultKey = false;
    let usingAnyUserKey = false;
    
    // Process the results, handling any rejected promises
    results.forEach((result, index) => {
      const engine = supportedEngines[index];
      
      if (result.status === 'fulfilled') {
        const engineResult = result.value;
        engineStatus[engine] = {
          available: engineResult.hasKey,
          usingDefault: engineResult.usingDefault,
          keySource: engineResult.keySource,
          keyType: engineResult.keyType
        };
        
        if (engineResult.hasKey) {
          availableEngines.push(engine);
          
          // Track key sources for notifications
          if (engineResult.usingDefault) {
            usingAnyDefaultKey = true;
          } else if (engineResult.keySource === 'user') {
            usingAnyUserKey = true;
          }
        }
      } else {
        // Handle rejected promise (engine check failed)
        console.warn(`Engine check failed for ${engine}:`, result.reason);
        engineStatus[engine] = {
          available: false,
          error: true,
          keySource: 'error',
          keyType: ENGINE_KEY_MAPPING[engine] || 'unknown'
        };
      }
    });
    
    // Get user's preferred engine
    const preferredEngine = user.preferredEngine || 'gpt-4o';
    
    // Ensure at least one engine is available (fallback to GPT-4o if none)
    if (availableEngines.length === 0) {
      availableEngines.push('gpt-4o');
      engineStatus['gpt-4o'] = {
        available: true,
        usingDefault: true,
        keySource: 'fallback',
        keyType: 'openai'
      };
    }
    
    // Prepare notification if using default keys
    let notification = null;
    if (usingAnyDefaultKey) {
      notification = {
        title: 'Using System API Keys',
        message: 'You are using system default API keys. For unlimited usage, add your own API keys in Settings.',
        type: 'info',
        duration: 8000
      };
    } else if (usingAnyUserKey) {
      notification = {
        title: 'Using Your API Keys',
        message: 'Successfully using your own API keys - no usage limits apply.',
        type: 'success',
        duration: 5000
      };
    }
    
    return res.json({
      success: true,
      engineStatus,
      availableEngines,
      preferredEngine,
      usingAnyDefaultKey,
      notification
    });
  } catch (error) {
    console.error('Error in /available-engines:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch available engines',
      availableEngines: ['gpt-4o'],
      preferredEngine: 'gpt-4o',
      usingAnyDefaultKey: true,
      engineStatus: {
        'gpt-4o': { 
          available: true, 
          usingDefault: true, 
          keySource: 'fallback',
          keyType: 'openai'
        }
      },
      notification: {
        title: 'Error',
        message: 'Failed to load engine information. Using fallback settings.',
        type: 'error',
        duration: 5000
      }
    });
  }
});

// POST /api/user/set-engine - Set user's preferred LLM engine
router.post('/set-engine', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user || req.session.userId;
    const { engineId } = req.body;
    
    if (!userId) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }
    
    if (!engineId) {
      return res.status(400).json({ 
        success: false, 
        error: 'engineId is required',
        code: 'MISSING_ENGINE_ID'
      });
    }
    
    // Validate engine against our supported engines
    if (!Object.keys(ENGINE_KEY_MAPPING).includes(engineId)) {
      return res.status(400).json({ 
        success: false, 
        error: `Invalid engine. Supported engines: ${Object.keys(ENGINE_KEY_MAPPING).join(', ')}`,
        code: 'INVALID_ENGINE',
        supportedEngines: Object.keys(ENGINE_KEY_MAPPING)
      });
    }
    
    // Get the expected key type for this engine
    const keyType = ENGINE_KEY_MAPPING[engineId];
    
    // Check if the engine is available for this user
    const keyInfo = await checkEngineApiKey(userId, engineId);
    
    // Update user's preferred engine in database
    await User.findByIdAndUpdate(userId, { preferredEngine: engineId });
    
    // Update session
    req.session.preferredEngine = engineId;
    
    // Prepare response
    const response = {
      success: true,
      message: `Engine set to ${getEngineDisplayName(engineId)}`,
      engineId,
      keyType,
      usingDefaultKey: keyInfo.usingDefault
    };
    
    // Add warning if using default key
    if (keyInfo.usingDefault) {
      response.warning = `Using system default key for ${getEngineDisplayName(engineId)}. Add your own key in settings for better rate limits.`;
    }
    
    return res.json(response);
    
  } catch (error) {
    console.error('Error setting engine:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Failed to update engine preference',
      code: 'SERVER_ERROR'
    });
  }
});

// Helper function to get display name for an engine
function getEngineDisplayName(engineId) {
  const displayNames = {
    'gpt-4o': 'GPT-4',
    'qwen-2.5-vl-72b': 'Qwen 2.5',
    'gemini-2.5-pro': 'Gemini 2.5',
    'ui-tars': 'UI Tars',
    'grok-1': 'Grok-1'
  };
  return displayNames[engineId] || engineId;
}

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
