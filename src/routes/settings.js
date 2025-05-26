// src/routes/settings.js
import express from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();

// GET /settings - Retrieve user's current settings
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user)
      .select('email preferredEngine apiKeys privacyMode modelPreferences executionMode maxSteps')
      .lean();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    // Map from DB schema keys to frontend provider keys
    const schemaToProviderMap = {
      gpt4o: 'openai',
      qwen: 'qwen',
      gemini: 'google',
      uitars: 'uitars'
    };
    
    // Determine which API keys are set
    const apiKeysStatus = {};
    if (user.apiKeys) {
      // Loop through all possible schema keys
      Object.keys(schemaToProviderMap).forEach(schemaKey => {
        // Map to the frontend provider key
        const providerKey = schemaToProviderMap[schemaKey];
        // Check if the API key is set
        const isSet = user.apiKeys[schemaKey] && user.apiKeys[schemaKey].length > 0;
        // Set the status using the frontend provider key
        apiKeysStatus[providerKey] = isSet;
        
        // Debug logging
        console.log(`[API Key Status] Schema key ${schemaKey} -> Provider ${providerKey}: ${isSet ? 'Set' : 'Not set'}`);
      });
    }
    
    // For legacy compatibility
    if (user.openaiApiKey && user.openaiApiKey.length > 0 && !apiKeysStatus.openai) {
      apiKeysStatus.openai = true;
      console.log('[API Key Status] Using legacy openaiApiKey');
    }

    res.json({
      success: true,
      settings: {
        email: user.email,
        preferredEngine: user.preferredEngine || 'gpt-4o-mini',
        apiKeys: apiKeysStatus,
        privacyMode: user.privacyMode || false,
        modelPreferences: user.modelPreferences || {
          default: 'gpt-4o-mini',
          code: 'gpt-4o',
          content: 'gpt-4o-mini',
          research: 'midscene-pro'
        },
        maxSteps: user.maxSteps || 10
      },
    });
  } catch (error) {
    console.error('Settings retrieval error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /settings - Update user's settings (model preferences, privacy mode, execution mode)
router.post('/', requireAuth, async (req, res) => {
  try {
    const { preferredEngine, privacyMode, modelPreferences, executionMode, maxSteps, action } = req.body;
    
    // Special case for handling API keys through this endpoint (for backward compatibility)
    if (action === 'saveApiKey') {
      return await saveApiKey(req, res);
    }

    const updateData = {};
    if (preferredEngine) updateData.preferredEngine = preferredEngine;
    if (typeof privacyMode === 'boolean') updateData.privacyMode = privacyMode;
    if (modelPreferences) updateData.modelPreferences = modelPreferences;
    if (executionMode && ['step-planning', 'action-planning'].includes(executionMode)) {
      updateData.executionMode = executionMode;
    }
    if (maxSteps && !isNaN(maxSteps) && maxSteps >= 1 && maxSteps <= 50) {
      updateData.maxSteps = parseInt(maxSteps, 10);
    }

    const user = await User.findByIdAndUpdate(
      req.session.user,
      { $set: updateData },
      { new: true, select: 'preferredEngine privacyMode modelPreferences executionMode' }
    );

    res.json({ success: true, settings: user });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /settings/model-preferences - Special endpoint for updating just the model preferences
router.post('/model-preferences', requireAuth, async (req, res) => {
  try {
    const { modelPreferences } = req.body;
    
    if (!modelPreferences) {
      return res.status(400).json({ success: false, error: 'Model preferences are required' });
    }
    
    // Format may differ between frontend and backend, handle both formats
    const updateData = { modelPreferences };
    
    // If a general preferredEngine is included, update that too
    if (modelPreferences.preferredEngine) {
      updateData.preferredEngine = modelPreferences.preferredEngine;
    }
    
    // Log what's being updated to help with debugging
    console.log(`[Settings] Updating model preferences for user ${req.session.user}:`, modelPreferences);
    
    const user = await User.findByIdAndUpdate(
      req.session.user,
      { $set: updateData },
      { new: true, select: 'preferredEngine modelPreferences' }
    );

    res.json({ 
      success: true, 
      settings: {
        preferredEngine: user.preferredEngine,
        modelPreferences: user.modelPreferences
      }
    });
  } catch (error) {
    console.error('Model preferences update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to handle API key saving
async function saveApiKey(req, res) {
  const { provider, key } = req.body;
  if (!provider || !key) {
    return res.status(400).json({ success: false, error: 'Provider and key required' });
  }
  
  // Validate the provider is one we support (based on ENGINE_KEY_MAPPING)
  const validProviders = ['openai', 'qwen', 'google', 'uitars'];
  if (!validProviders.includes(provider)) {
    return res.status(400).json({ success: false, error: 'Unsupported provider' });
  }
  
  try {
    // Build the update based on our new schema
    const updateField = {};
    updateField[`apiKeys.${provider}`] = key;
    
    await User.updateOne(
      { _id: req.session.user },
      { $set: updateField }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('API key addition error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// POST /settings/api-keys - Add a new API key
router.post('/api-keys', requireAuth, async (req, res) => {
  const { provider, key } = req.body;
  const providerMap = {
    openai: 'gpt4o',
    qwen: 'qwen',
    google: 'gemini',
    uitars: 'uitars'
  };
  const schemaKey = providerMap[provider];
  if (!schemaKey) {
    return res.status(400).json({ success: false, error: 'Unsupported provider' });
  }
  if (!key) {
    return res.status(400).json({ success: false, error: 'API key required' });
  }
  try {
    const updateField = {};
    updateField[`apiKeys.${schemaKey}`] = key;
    await User.updateOne(
      { _id: req.session.user },
      { $set: updateField }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('API key addition error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /settings/api-keys/:provider - Retrieve the actual API key for a provider
router.get('/api-keys/:provider', requireAuth, async (req, res) => {
  const { provider } = req.params;
  const providerMap = {
    openai: 'gpt4o',
    qwen: 'qwen',
    google: 'gemini',
    uitars: 'uitars'
  };
  const schemaKey = providerMap[provider];
  if (!schemaKey) {
    return res.status(400).json({ success: false, error: 'Unsupported provider' });
  }
  try {
    const user = await User.findById(req.session.user).select(`apiKeys.${schemaKey}`).lean();
    console.log(`[API Key Debug] User for ${provider} (${schemaKey}):`, user);
    const value = user && user.apiKeys && user.apiKeys[schemaKey];
    console.log(`[API Key Debug] Value for ${provider} (${schemaKey}):`, value);
    if (!value) {
      return res.json({ success: false, error: 'API key not found' });
    }
    res.json({ success: true, apiKey: value });
  } catch (error) {
    console.error('API key fetch error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /settings/api-keys/:provider - Remove an API key
router.delete('/api-keys/:provider', requireAuth, async (req, res) => {
  const { provider } = req.params;
  
  // Validate the provider is one we support
  const validProviders = ['openai', 'qwen', 'google', 'uitars'];
  if (!validProviders.includes(provider)) {
    return res.status(400).json({ success: false, error: 'Unsupported provider' });
  }
  
  // Map frontend provider to database schema key
  const providerMap = {
    openai: 'gpt4o',
    qwen: 'qwen',
    google: 'gemini',
    uitars: 'uitars'
  };
  const schemaKey = providerMap[provider];
  
  console.log(`[API Key Delete] Mapping provider ${provider} to schema key ${schemaKey}`);
  
  try {
    // Set the field to empty string (don't use $unset as it removes the field)
    const updateField = {};
    updateField[`apiKeys.${schemaKey}`] = '';
    
    await User.updateOne(
      { _id: req.session.user },
      { $set: updateField }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('API key removal error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /settings/model-preferences - Update model preferences
router.post('/model-preferences', requireAuth, async (req, res) => {
  try {
    const { modelPreferences } = req.body;
    if (!modelPreferences) {
      return res.status(400).json({ success: false, error: 'Model preferences required' });
    }
    
    await User.updateOne(
      { _id: req.session.user },
      { $set: { modelPreferences } }
    );
    
    res.json({ success: true });
  } catch (error) {
    console.error('Model preferences update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /settings/password - Change user's password
router.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Both passwords required' });
  }

  try {
    const user = await User.findById(req.session.user);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ success: false, error: 'Invalid current password' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Password update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
