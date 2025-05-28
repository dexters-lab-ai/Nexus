/**
 * Room Entry Point Component
 * Provides the entry experience with 3D room and computer navigation
 */

import * as THREE from 'three';
import { eventBus } from '../utils/events.js';
import { stores } from '../store/index.js';
import RoomExperience from './RoomExperienceClass.js';
import { loader as wormholeLoader } from '../components/WormholeLoader.js';

/**
 * Create a room entry point component
 * @param {Object} props - Component properties
 * @returns {HTMLElement} Entry point container
 */
export function RoomEntryPoint(props = {}) {
  console.log('[DEBUG-ROOM] [TRACE] Entered RoomEntryPoint', props);
  const {
    containerId = 'room-entry',
    modelPath = '/models/room.glb'
  } = props;

  // State
  let roomExperience = null;
  let isAppLaunched = false;
  
  // Create container element
  const container = document.createElement('div');
  container.className = 'room-entry-container';
  container.style.position = 'relative';
  container.style.width = '100vw';
  container.style.height = '100vh';
  if (containerId) container.id = containerId;
  
  // Create canvas container
  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'room-canvas-container';
  canvasContainer.style.width = '100%';
  canvasContainer.style.height = '100%';
  canvasContainer.style.position = 'absolute';
  canvasContainer.style.top = '0';
  canvasContainer.style.left = '0';
  canvasContainer.style.zIndex = '1000';
  container.appendChild(canvasContainer);
  
  // Create application container
  const appContainer = document.createElement('div');
  appContainer.className = 'app-container';
  appContainer.style.display = 'none';
  container.appendChild(appContainer);
  
  class RoomEntryPointClass {
    constructor() {
      this.container = container;
      this.eventBus = eventBus;
      this.initialize = this.initialize.bind(this);
    }
    
    async initialize() {
      console.log('[DEBUG-ROOM] [TRACE] Entered RoomEntryPoint.initialize');
      console.group('[RoomEntry] Initialization');
      console.log('[RoomEntryPoint] Initializing 3D room experience');
      
      if (!container || !container.appendChild) {
        console.error('Invalid container element:', container);
        console.groupEnd();
        return;
      }
      
      try {
        const savedState = localStorage.getItem('operator_room_state');
        const initialState = savedState ? JSON.parse(savedState) : null;
        console.log('[RoomEntryPoint] Loaded saved state:', initialState);
        console.log('Creating RoomExperience');
        // Prevent re-initialization if app already launched
        if (isAppLaunched) {
          console.log('[RoomEntryPoint] App already launched, initialization aborted.');
          return;
        }
        roomExperience = new RoomExperience({
          container: canvasContainer,
          modelPath,
          initialState,
        });
        
        console.log('[RoomEntryPoint] RoomExperience instance created');
        
        // Track asset load progress
        const manager = roomExperience.loadingManager;
        manager.onProgress = (url, itemsLoaded, itemsTotal) => {
          const p = Math.floor((itemsLoaded / itemsTotal) * 100);
          // Update splash screen progress bar
          const splashBar = document.getElementById('loading-progress');
          if (splashBar) {
            splashBar.style.width = `${p}%`;
            splashBar.setAttribute('aria-valuenow', p);
          }
          // Update splash screen text with asset name & percent
          const loadingText = document.getElementById('loading-text');
          if (loadingText) {
            const name = url.split('/').pop();
            loadingText.textContent = `${name} (${p}%)`;
          }
          eventBus.emit('room-loading-progress', { progress: p, step: url });
        };
        // All assets loaded: push splash to 100% and complete
        manager.onLoad = () => {
          eventBus.emit('room-loading-progress', { progress: 100, step: 'Complete' });
          eventBus.emit('room-loading-complete');
        };
        manager.onError = (url) => {
          eventBus.emit('room-error', new Error(`Failed to load: ${url}`));
        };
        
        console.log('[RoomEntryPoint] Starting RoomExperience.initialize');
        await roomExperience.initialize();
        console.log('[RoomEntryPoint] Room initialization complete');
      } catch (error) {
        console.error('Initialization failed:', error);
        eventBus.emit('room-error', error);
        throw error;
      } finally {
        console.groupEnd();
      }
    }
  }
  
  const roomEntryPoint = new RoomEntryPointClass();
  
  /**
   * Setup event listeners for room experience
   */
  function setupEventListeners() {
    // Launch application
    eventBus.on('launch-application', () => {
      launchApplication();
    });
    
    // Exit application (from App back button)
    eventBus.on('exit-application', () => {
      // Defensive: ensure app container is cleaned up
      if (appContainer) {
        appContainer.style.opacity = '0';
        setTimeout(() => {
          appContainer.style.display = 'none';
          appContainer.style.opacity = '1';
          // Show 3D container
          canvasContainer.style.display = 'block';
          // Re-initialize room if needed
          if (!roomExperience) {
            roomEntryPoint.initialize();
          }
          // Clean up any stray app-root
          const strayAppRoot = document.getElementById('app-root');
          if (strayAppRoot && strayAppRoot.parentElement) {
            strayAppRoot.parentElement.removeChild(strayAppRoot);
          }
        }, 400);
      }
      isAppLaunched = false;
      stores.ui.setState({ applicationLaunched: false });
    });
  }
  
  /**
   * Launch the OPERATOR application by transitioning from 3D room
   */
  function launchApplication() {
    if (isAppLaunched) {
      console.log('[APP] Application already launched');
      return;
    }
    
    // Hide 3D canvas container when launching app
    canvasContainer.style.display = 'none';
    console.log('[APP] Launching main application');
    
    // Show wormhole loading animation
    wormholeLoader.show();
    
    // Clean up room experience
    if (roomExperience) {
      console.log('[APP] Cleaning up room experience');
      roomExperience.dispose();
    }
    
    // Emit application launched event
    eventBus.emit('application-launched');
    isAppLaunched = true;
    
    console.log('[APP] Application launched successfully');
    
    // Show app container
    appContainer.style.display = 'block';
    
    // Setup DOM observer to detect when app is fully rendered
    setupAppRenderObserver(appContainer);
    
    // Trigger app initialization
    eventBus.emit('initialize-application');
    
    // Update state
    stores.ui.setState({ applicationLaunched: true });
  }
  
  /**
   * Setup multiple detection mechanisms to ensure the app is rendered and the loader is removed
   * @param {HTMLElement} container - The container to observe
   */
  function setupAppRenderObserver(container) {
    // Define a threshold of elements that indicates the app is rendered
    const minElementThreshold = 10;
    let loaderHidden = false;
    
    // Function to safely hide the loader
    // This is a fallback only - primary hiding now controlled by init-modern-operator event
    const hideLoader = (reason) => {
      if (loaderHidden) return; // Prevent multiple hide attempts
      
      loaderHidden = true;
      console.log(`[APP] Room transition complete. Wormhole control transferring to modern UI: ${reason}`);
      
      // Clean up observers
      if (observer && observer.disconnect) {
        observer.disconnect();
      }
    };
    
    // Strategy 1: MutationObserver for element count
    const observer = new MutationObserver((mutations) => {
      // Check if app container has enough child elements to consider it rendered
      const elementCount = container.querySelectorAll('*').length;
      console.log(`[APP] Detected ${elementCount} elements in app container`);
      
      if (elementCount > minElementThreshold) {
        hideLoader('element threshold reached');
      }
      
      // Also check for specific key components that indicate the app is ready
      const commandCenter = container.querySelector('.command-center');
      const messageTimeline = container.querySelector('#message-timeline');
      
      if (commandCenter && messageTimeline) {
        hideLoader('key components detected');
      }
    });
    
    // Start observing DOM changes
    observer.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: false
    });
    
    // Strategy 2: Check for visible content periodically
    const visibilityInterval = setInterval(() => {
      const hasVisibleContent = container.offsetHeight > 50 && container.offsetWidth > 50;
      const hasStyles = window.getComputedStyle(container).opacity > 0;
      
      if (hasVisibleContent && hasStyles) {
        hideLoader('visible content detected');
        clearInterval(visibilityInterval);
      }
    }, 100);
    
    // Strategy 3: Listen for app-specific events
    const appReadyHandler = () => {
      hideLoader('app-ready event received');
      eventBus.off('app-ready', appReadyHandler);
    };
    eventBus.on('app-ready', appReadyHandler);
    
    // Strategy 4: Primary fallback - increased timeout to allow UI initialization (15 seconds)
    // This gives more time for the main init-modern-operator event to trigger normally
    setTimeout(() => {
      hideLoader('primary fallback timeout (15s)');
      clearInterval(visibilityInterval);
    }, 15000);
    
    // Strategy 5: Absolute failsafe - guaranteed timeout (20 seconds)
    // This is the last resort if all other strategies fail
    setTimeout(() => {
      if (!loaderHidden) {
        console.warn('[APP] Emergency failsafe activated: Forcing wormhole loader removal');
        wormholeLoader.forceHide();
        
        // Wait a brief moment then absolutely ensure it's gone through DOM removal
        setTimeout(() => {
          // Last resort: directly modify the DOM if the loader still exists
          const loaderElement = document.getElementById('wormhole-loader');
          if (loaderElement && loaderElement.parentNode) {
            console.error('[APP] CRITICAL: Emergency DOM cleanup of wormhole loader');
            loaderElement.parentNode.removeChild(loaderElement);
          }
        }, 500);
        
        // Clean up any remaining observers and intervals
        clearInterval(visibilityInterval);
        if (observer && observer.disconnect) {
          observer.disconnect();
        }
      }
    }, 20000);
  }
  
  /**
   * Exit the application and return to the 3D room
   */
  function exitApplication() {
    if (!isAppLaunched) return;
    
    isAppLaunched = false;
    
    // Hide app container
    appContainer.style.opacity = '0';
    
    setTimeout(() => {
      appContainer.style.display = 'none';
      appContainer.style.opacity = '1';
      
      // Show 3D container
      canvasContainer.style.display = 'block';
      
      // Re-initialize room if needed
      if (!roomExperience) {
        roomEntryPoint.initialize();
      }
    }, 1000);
    
    // Update state
    stores.ui.setState({ applicationLaunched: false });
  }
  
  /**
   * Mount the application content
   * @param {HTMLElement} appContent - Application content to display
   */
  function mountApplication(appContent) {
    // Clear app container
    appContainer.innerHTML = '';
    
    // Add app content
    if (appContent instanceof HTMLElement) {
      appContainer.appendChild(appContent);
    } else if (typeof appContent === 'string') {
      appContainer.innerHTML = appContent;
    }
  }
  
  // Public methods
  container.initialize = roomEntryPoint.initialize;
  container.launchApplication = launchApplication;
  container.exitApplication = exitApplication;
  container.mountApplication = mountApplication;
  
  // Cleanup method
  container.destroy = () => {
    // Dispose of three.js resources
    if (roomExperience) {
      roomExperience.dispose();
    }
    
    // Remove event listeners
    document.removeEventListener('keydown', null);
  };

  setupEventListeners();
  
  // Launch on ESC key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      eventBus.emit('launch-application');
    }
  });
  
  return container;
}

/**
 * Mount room entry point to a parent element
 * @param {HTMLElement} parent - Parent element
 * @param {Object} props - Entry point properties
 * @returns {HTMLElement} The mounted entry point
 */
RoomEntryPoint.mount = (parent, props = {}) => {
  const entryPoint = RoomEntryPoint(props);
  
  if (parent) {
    // Clear parent contents
    parent.innerHTML = '';
    parent.appendChild(entryPoint);
  } else {
    // Mount to body if no parent specified
    document.body.appendChild(entryPoint);
  }
  
  // Initialize after mounting
  entryPoint.initialize();
  
  return entryPoint;
};

export default RoomEntryPoint;