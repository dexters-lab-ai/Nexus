// Entry script: orchestrates splash, 3D world, and loading of React app
import RoomEntryPoint from './3d/RoomEntryPoint.js';
import { eventBus } from './utils/events.js';

// DOM elements
const splash = document.getElementById('splash-screen');
const loadingProgress = document.getElementById('loading-progress');
const webglContainer = document.getElementById('webgl-container');
const reactRoot = document.getElementById('react-root');

// Mount 3D world
const worldEntry = RoomEntryPoint.mount(webglContainer, { containerId: 'room-entry' });

// Update splash progress
eventBus.on('room-loading-progress', ({ progress }) => {
  if (loadingProgress) {
    loadingProgress.style.width = `${progress}%`;
    loadingProgress.setAttribute('aria-valuenow', progress);
  }
  if (progress >= 100) {
    // Hide splash
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => { splash.style.display = 'none'; }, 500);
    }
    // Show 3D canvas
    webglContainer.style.zIndex = '1';
    // World’s built-in launch button will appear automatically
  }
});

// Helper function to update message store with user ID
const updateMessageStoreUserId = (userId) => {
  try {
    // Check if message store is available
    if (window.messageStore) {
      window.messageStore.setUserId(userId);
    } else if (window.stores?.messages) {
      window.stores.messages.setUserId(userId);
    } else {
      // If store isn't available yet, try again later
      setTimeout(() => updateMessageStoreUserId(userId), 100);
    }
  } catch (error) {
    console.warn('Failed to update message store with user ID:', error);
  }
};

// After world initialization, launch React app on event
eventBus.once('initialize-application', async () => {
  // First, check if we have a valid container
  const container = document.getElementById('app-container');
  if (!container) {
    console.error('Missing app-container element');
    return;
  }

  // Get the react root element
  const reactRoot = document.getElementById('react-root');
  if (!reactRoot) {
    console.error('Missing react-root element');
    return;
  }

  // Show the react root container
  reactRoot.style.display = 'block';

  try {
    // First, check all possible sources for user ID
    let userId = (
      // 1. Check localStorage first
      localStorage.getItem('userId') ||
      // 2. Check sessionStorage (for fresh logins)
      sessionStorage.getItem('userId') ||
      // 3. Try to fetch from /api/whoami
      await (async () => {
        try {
          const response = await fetch('/api/whoami');
          if (response.ok) {
            const data = await response.json();
            return data.userId || data.id; // Handle both formats
          }
        } catch (error) {
          console.warn('Could not fetch user ID from /api/whoami:', error);
        }
        return null;
      })()
    );

    // If still no userId, create a guest ID
    if (!userId) {
      try {
        // Create a more robust guest ID that's URL-safe
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 10000);
        userId = `guest_${timestamp}_${random}`.replace(/[^a-z0-9_-]/gi, '');
        console.debug('Created guest userId:', userId);
      } catch (error) {
        console.error('Error generating guest ID:', error);
        // Fallback to simple ID if generation fails
        userId = `guest_${Date.now()}`.replace(/[^a-z0-9_-]/gi, '');
      }
    }

    // Store the ID in all relevant places
    localStorage.setItem('userId', userId);
    sessionStorage.setItem('userId', userId);
    
    // Update message store with the user ID
    updateMessageStoreUserId(userId);
    
    // Initialize WebSocket with user context
    const isAuthenticated = !userId.startsWith('guest_');
    try {
      const { WebSocketManager } = await import('./utils/WebSocketManager.js');
      await WebSocketManager.initialize({
        userId,
        isAuthenticated
      });
      console.log('WebSocket initialized with user:', { userId, isAuthenticated });
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      // Continue with app initialization even if WebSocket fails
    }
    
    // Update auth store with the user ID
    if (window.stores?.auth) {
      window.stores.auth.setState({
        user: { _id: userId },
        isAuthenticated: false, // Will be updated after login
        initialized: true
      });
    }
    
    // Listen for logout events
    eventBus.on('user-logged-out', async () => {
      // Update WebSocket authentication state
      try {
        const { WebSocketManager } = await import('./utils/WebSocketManager.js');
        await WebSocketManager.updateAuthState(null, false);
        console.log('WebSocket authentication reset after logout');
      } catch (error) {
        console.error('Failed to update WebSocket authentication on logout:', error);
      }
    });
    
    // Listen for authentication events
    eventBus.on('user-authenticated', async (userData) => {
      if (userData?.id) {
        const newUserId = userData.id;
        
        // Update WebSocket authentication state
        try {
          const { WebSocketManager } = await import('./utils/WebSocketManager.js');
          await WebSocketManager.updateAuthState(newUserId, true);
          console.log('WebSocket authentication updated for user:', newUserId);
        } catch (error) {
          console.error('Failed to update WebSocket authentication:', error);
        }
        // Update all storage locations
        localStorage.setItem('userId', newUserId);
        sessionStorage.setItem('userId', newUserId);
        // Update message store
        updateMessageStoreUserId(newUserId);
        // Update auth store
        if (window.stores?.auth) {
          window.stores.auth.setState({
            user: userData,
            isAuthenticated: true,
            initialized: true
          });
        }
      }
    });
    
    // Initialize the app
    const { initApp } = await import('./app-modern.js');
    await initApp();
    
  } catch (error) {
    console.error('Error during app initialization:', error);
  }
});
