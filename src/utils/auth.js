/**
 * Authentication state management for WebSocket connections
 */
import { WebSocketManager } from './WebSocketManager';
import { stores } from '../store';

// Track the current user ID and authentication state
let currentUserId = null;
let isUserAuthenticated = false;
let isInitialized = false;

/**
 * Initialize authentication state management
 * @param {Object} store - The Redux store
 */
export function initAuth(store) {
  if (isInitialized) {
    console.log('[Auth] Already initialized');
    return;
  }

  isInitialized = true;
  
  // Listen for store changes to detect authentication state changes
  let previousState = store.getState();
  
  store.subscribe(() => {
    const state = store.getState();
    
    // Check if auth state changed
    if (state.auth !== previousState.auth) {
      handleAuthStateChange(state.auth);
      previousState = state;
    }
  });
  
  // Initial check
  handleAuthStateChange(previousState.auth);
}

/**
 * Handle authentication state changes
 * @param {Object} authState - The auth state from Redux
 */
function handleAuthStateChange(authState) {
  const userId = authState?.user?._id || null;
  const isAuthenticated = !!authState?.isAuthenticated;
  
  // Skip if no change
  if (userId === currentUserId && isAuthenticated === isUserAuthenticated) {
    return;
  }
  
  console.log('[Auth] Authentication state changed:', { 
    userId, 
    isAuthenticated,
    previousUserId: currentUserId,
    wasAuthenticated: isUserAuthenticated
  });
  
  // Update local state
  const previousUserId = currentUserId;
  currentUserId = userId;
  isUserAuthenticated = isAuthenticated;
  
  // Update WebSocket authentication state
  updateWebSocketAuth(userId, isAuthenticated, previousUserId);
}

/**
 * Update WebSocket authentication state
 * @param {string} userId - The current user ID
 * @param {boolean} isAuthenticated - Whether the user is authenticated
 * @param {string} previousUserId - The previous user ID (if any)
 */
async function updateWebSocketAuth(userId, isAuthenticated, previousUserId) {
  try {
    // If we have a previous user ID and it's different from the new one,
    // we should disconnect the old connection first
    if (previousUserId && previousUserId !== userId) {
      console.log('[Auth] User ID changed, reinitializing WebSocket connection');
      await WebSocketManager.close();
    }
    
    // If we have a user ID, initialize or update the WebSocket connection
    if (userId) {
      // If we're authenticated, update the auth state
      if (isAuthenticated) {
        await WebSocketManager.updateAuthState(userId, true);
      } else {
        // For unauthenticated users with an ID, just initialize the connection
        await WebSocketManager.init(userId, false);
      }
    } else {
      // For guest users, use WebSocketManager's initialization
      await WebSocketManager.initialize({ isAuthenticated: false });
    }
    
    console.log('[Auth] WebSocket auth state updated:', { userId, isAuthenticated });
  } catch (error) {
    console.error('[Auth] Error updating WebSocket auth state:', error);
    
    // If we're authenticated and there was an error, try to reconnect
    if (isAuthenticated && userId) {
      console.log('[Auth] Attempting to reconnect WebSocket...');
      setTimeout(() => {
        updateWebSocketAuth(userId, isAuthenticated, previousUserId);
      }, 5000); // Retry after 5 seconds
    }
  }
}

/**
 * Get the current user ID
 * @returns {string|null} The current user ID or null if not authenticated
 */
export function getCurrentUserId() {
  return currentUserId;
}

/**
 * Check if the current user is authenticated
 * @returns {boolean} True if the user is authenticated
 */
export function isAuthenticated() {
  return isUserAuthenticated;
}

// Export for testing
export const __test__ = {
  _reset: () => {
    currentUserId = null;
    isUserAuthenticated = false;
    isInitialized = false;
  }
};
