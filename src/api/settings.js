// src/api/settings.js
import { get, post, del } from '../utils/api-helpers.js';

/**
 * Gets the user settings from the API
 * @returns {Promise<Object>} The user settings
 */
export async function getSettings() {
  try {
    return await get('/settings');
  } catch (error) {
    console.error('Error fetching settings:', error);
    throw error;
  }
}

/**
 * Saves general settings like preferred engine and privacy mode
 * @param {Object} settings - The settings to save
 * @returns {Promise<Object>} Result of the operation
 */
export async function saveSettings(settings) {
  try {
    return await post('/settings', settings);
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
}

/**
 * Saves an API key to the user settings
 * @param {string} provider - The API provider (e.g., 'openai', 'qwen', 'google', 'uitars')
 * @param {string} key - The API key to save
 * @returns {Promise<Object>} Result of the operation
 */
export async function saveApiKey(provider, key) {
  try {
    // Ensure provider matches the list of valid providers on the server
    // These should align with ENGINE_KEY_MAPPING
    const validProviders = ['openai', 'qwen', 'google', 'uitars'];
    if (!validProviders.includes(provider)) {
      console.warn(`Warning: Potentially invalid provider '${provider}'. Valid options are: ${validProviders.join(', ')}`);
    }

    // This uses the backwards-compatible endpoint
    return await post('/api/settings/api-keys', {
      provider,
      key
    });
  } catch (error) {
    console.error('Error saving API key:', error);
    throw error;
  }
}

/**
 * Deletes an API key from the user settings
 * @param {string} provider - The API provider to delete the key for (e.g., 'openai', 'qwen', 'google', 'uitars')
 * @returns {Promise<Object>} Result of the operation
 */
export async function deleteApiKey(provider) {
  try {
    // Ensure provider matches the list of valid providers on the server
    const validProviders = ['openai', 'qwen', 'google', 'uitars'];
    if (!validProviders.includes(provider)) {
      console.warn(`Warning: Potentially invalid provider '${provider}'. Valid options are: ${validProviders.join(', ')}`);
    }
    
    return await del(`/api/settings/api-keys/${provider}`);
  } catch (error) {
    console.error('Error deleting API key:', error);
    throw error;
  }
}

/**
 * Gets an API key for a specific provider
 * @param {string} provider - The API provider (e.g., 'openai', 'qwen', 'google', 'uitars')
 * @returns {Promise<Object>} Result containing the API key if it exists
 */
export async function getApiKey(provider) {
  try {
    // Ensure provider matches the list of valid providers on the server
    const validProviders = ['openai', 'qwen', 'google', 'uitars'];
    if (!validProviders.includes(provider)) {
      console.warn(`Warning: Potentially invalid provider '${provider}'. Valid options are: ${validProviders.join(', ')}`);
    }
    
    return await get(`/api/settings/api-keys/${provider}`);
  } catch (error) {
    console.error('Error fetching API key:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Saves execution mode preference
 * @param {string} mode - The execution mode (yaml-planning, step-planning, action-planning)
 * @returns {Promise<Object>} Result of the operation
 */
export async function saveExecutionMode(mode) {
  try {
    const validModes = ['yaml-planning', 'step-planning', 'action-planning'];
    if (!validModes.includes(mode)) {
      console.warn(`Warning: Invalid execution mode '${mode}'. Valid options are: ${validModes.join(', ')}`);
    }
    
    return await post('/settings/execution-mode', { mode });
  } catch (error) {
    console.error('Error saving execution mode:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Saves model preferences for different task types
 * @param {Object} preferences - The model preferences to save, including chat and browser models
 * @returns {Promise<Object>} Result of the operation
 */
export async function saveLlmPreferences(preferences) {
  try {
    // Validate input to ensure we have the expected fields
    const validatedPreferences = {
      ...preferences
    };
    
    // Ensure we have the most important fields with fallbacks
    if (!validatedPreferences.chat) {
      validatedPreferences.chat = 'gpt-4o';
    }
    
    if (!validatedPreferences.browser) {
      validatedPreferences.browser = 'gpt-4o';
    }
    
    if (!validatedPreferences.preferredEngine) {
      validatedPreferences.preferredEngine = validatedPreferences.chat;
    }
    
    // Include maxSteps in the preferences if it exists
    if (validatedPreferences.maxSteps) {
      return await post('/settings', { 
        modelPreferences: validatedPreferences,
        maxSteps: parseInt(validatedPreferences.maxSteps, 10) 
      });
    }
    
    return await post('/settings/model-preferences', { modelPreferences: validatedPreferences });
  } catch (error) {
    console.error('Error saving LLM preferences:', error);
    throw error;
  }
}

// Note: The saveExecutionMode function is already defined above.
// This was a duplicate declaration that has been removed to fix errors.

/**
 * Saves preferred engine setting
 * @param {string} engineId - The engine ID to save as preferred
 * @returns {Promise<Object>} Result of the operation
 */
export async function saveEnginePreference(engineId) {
  try {
    return await post('/settings', {
      preferredEngine: engineId
    });
  } catch (error) {
    console.error('Error saving engine preference:', error);
    throw error;
  }
}

// End of settings API functions

// Additional utility functions below

/**
 * Gets the user settings from the API - alias for getSettings to maintain compatibility
 * @returns {Promise<Object>} The user settings
 */
export async function getUserSettings() {
  return getSettings();
}
