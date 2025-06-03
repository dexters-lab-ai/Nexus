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
  if (!reactRoot) return;
  
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
      userId = 'guest_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
      console.debug('Created guest userId:', userId);
    }

    // Store the ID in all relevant places
    localStorage.setItem('userId', userId);
    sessionStorage.setItem('userId', userId);
    
    // Update message store with the user ID
    updateMessageStoreUserId(userId);
    
    // Initialize WebSocket with the user ID
    const { WebSocketManager } = await import('../public/js/utils/WebSocketManager.js');
    WebSocketManager.init(userId);
    
    // Listen for authentication events
    eventBus.on('user-authenticated', (userData) => {
      if (userData?.id) {
        const newUserId = userData.id;
        // Update all storage locations
        localStorage.setItem('userId', newUserId);
        sessionStorage.setItem('userId', newUserId);
        // Update message store
        updateMessageStoreUserId(newUserId);
        // Reinitialize WebSocket if needed
        if (window.WebSocketManager) {
          window.WebSocketManager.init(newUserId);
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
