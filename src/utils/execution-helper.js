/**
 * Execution Mode Helper
 * Determines the correct execution approach based on user preferences,
 * model selection, and command content.
 */

// Execution mode constants
export const EXECUTION_MODES = {
  YAML_PLANNING: 'yaml-planning',
  STEP_PLANNING: 'step-planning',
  ACTION_PLANNING: 'action-planning'
};

// Provider constants for easier future-proofing
export const PROVIDERS = {
  OPENAI: 'openai',    // GPT-4o
  QWEN: 'qwen',        // Qwen models
  GOOGLE: 'google',    // Gemini models
  UITARS: 'uitars'     // UI-TARS model
};

/**
 * Determines which execution mode to use based on the given parameters
 * and business rules.
 * 
 * Rules:
 * 1. If command contains YAML, YAML_PLANNING is used regardless of settings
 * 2. If model is UI-TARS, ACTION_PLANNING is used regardless of settings
 * 3. Otherwise, use user preference or default to STEP_PLANNING
 * 
 * @param {string} provider - The provider ID (openai, qwen, google, uitars)
 * @param {string} command - The command text to process
 * @param {string} userPreference - User's saved execution mode preference
 * @returns {string} - The execution mode to use
 */
export function determineExecutionMode(provider, command, userPreference = EXECUTION_MODES.STEP_PLANNING) {
  // Check if command contains YAML (simple check for --- markers)
  const containsYaml = command.includes('---') && (
    command.includes('task:') || 
    command.includes('steps:') || 
    command.includes('action:')
  );
  
  if (containsYaml) {
    console.log('YAML detected in command, using YAML planning mode');
    return EXECUTION_MODES.YAML_PLANNING;
  }
  
  // Check if using UI-TARS
  if (provider === PROVIDERS.UITARS) {
    console.log('UI-TARS provider detected, using Action Planning mode');
    return EXECUTION_MODES.ACTION_PLANNING;
  }
  
  // Otherwise use user preference
  console.log(`Using user preferred execution mode: ${userPreference}`);
  return userPreference;
}

/**
 * Example server-side handler for command processing
 * @param {Object} req - Request object
 * @param {Object} user - User object with preferences
 * @param {string} command - Command text
 * @param {string} provider - Provider ID
 * @returns {Object} - Processing instructions
 */
export function processCommand(req, user, command, provider) {
  // Get user's execution mode preference (default to step planning)
  const userPreference = user.settings?.executionMode || EXECUTION_MODES.STEP_PLANNING;
  
  // Determine actual execution mode to use
  const executionMode = determineExecutionMode(provider, command, userPreference);
  
  // Log for debugging
  console.log(`Command processing: Provider=${provider}, User preference=${userPreference}, Selected mode=${executionMode}`);
  
  // Return processing instructions
  return {
    executionMode,
    // Add other processing parameters as needed
    yaml: executionMode === EXECUTION_MODES.YAML_PLANNING,
    stepByStep: executionMode === EXECUTION_MODES.STEP_PLANNING,
    automated: executionMode === EXECUTION_MODES.ACTION_PLANNING
  };
}

export default {
  EXECUTION_MODES,
  PROVIDERS,
  determineExecutionMode,
  processCommand
};
