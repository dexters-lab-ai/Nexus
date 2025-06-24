/**
 * OPERATOR - Modern Application Entry Point
 * Now with all CSS imports managed by Vite
 */

// Core Styles - Using relative paths
import './styles/main.css';
import './styles/futuristic.css';

// API imports
import { getSettings } from './api/settings';

// Component styles
import './styles/components/command-center.css';
import './styles/components/components.css';
import './styles/components/futuristic.css';
import './styles/components/layouts.css';
import './styles/components/settings-modal.css';
import './styles/components/guide-overlay.css';
import './styles/components/profile-modal.css';
import './styles/components/history-overlay.css';
import './styles/components/user-menu.css';
import './styles/components/timeline-filters.css';
import './styles/components/timeline.css';

// Vendor CSS (must remain in HTML)
// <link rel="stylesheet" href="/vendors/fontawesome/all.min.css">

// App Initialization
import { eventBus } from './utils/events.js';
// Import WebSocketManager from utils directory
import WebSocketManager from './utils/WebSocketManager.js';
import { initializeModernUI } from './app-modern-integration.js';
import { stores } from './store/index.js';
import ErrorBoundary from './components/base/ErrorBoundary.jsx';
import { getAllHistory } from './api/history.js';
// Import settings API
import * as settingsApi from './api/settings.js';

// Maintain references to all initialized components
let appComponents = null;

// Initialize app when ready
const initializeApp = async () => {
  try {
    console.log('Initializing modern OPERATOR application...');
    
    // Show splash screen during initialization
    const splashScreen = document.getElementById('splash-screen');
    const loadingProgress = document.getElementById('loading-progress');
    
    if (splashScreen && loadingProgress) {
      updateLoadingProgress(10, loadingProgress);
    }
    
    // Initialize stores with data from API
    await initializeStores();
    updateLoadingProgress(40, loadingProgress);
    
    // WebSocket initialization is now handled in entry.js
    console.log('Skipping WebSocket initialization - already handled in entry.js');
    
    // Load required assets and styles
    await loadAssets();
    updateLoadingProgress(60, loadingProgress);
    
    // Initialize modern UI components
    await initializeComponents();
    updateLoadingProgress(90, loadingProgress);
    
    // Complete initialization
    finalizeInitialization();
    updateLoadingProgress(100, loadingProgress);

    // Hide room container when PWA launches
    const roomContainer = document.getElementById('room-experience-container');
    if (roomContainer) roomContainer.style.display = 'none';

    // Hide splash screen when app is fully ready
    eventBus.once('application-ready', () => {
      if (splashScreen) {
        splashScreen.style.opacity = '0';
        setTimeout(() => {
          splashScreen.style.display = 'none';
        }, 500);
      }
    });
    
    console.log('Application initialization complete!');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    showNotification('Failed to initialize application', 'error');
  }
}

// Initialize data stores
async function initializeStores() {
  try {
    console.log('Initializing data stores...');
    
    // Load user settings if available
    try {
      const settingsResponse = await getSettings();
      if (settingsResponse && settingsResponse.success) {
        // Update UI store with user settings
        stores.ui.setState({
          theme: settingsResponse.theme || 'dark',
          layoutPreset: settingsResponse.layoutPreset || 'default',
          sidebarCollapsed: settingsResponse.sidebarCollapsed || false
        });
      }
    } catch (error) {
      console.warn('Could not load settings, using defaults:', error);
      // Set defaults if settings can't be loaded
      stores.ui.setState({
        theme: 'dark',
        layoutPreset: 'default',
        sidebarCollapsed: false
      });
    }
    
    // Initialize history store with optimized loading
    try {
      console.time('history-load');
      // Use initial=true flag to optimize first load (smaller payload, skip count)
      const historyResponse = await getAllHistory({
        page: 1, 
        limit: 10, // Reduced limit for faster initial load
        initial: true // Signal to backend this is initial load
      });
      console.timeEnd('history-load');
      
      if (historyResponse && historyResponse.items) {
        stores.history.setState({
          items: historyResponse.items || [],
          // Don't store pagination data yet since we're using the optimized endpoint
          currentPage: historyResponse.currentPage || 1
        });
        
        // After UI is initialized, fetch complete history data in background
        setTimeout(() => {
          loadFullHistoryInBackground();
        }, 3000); // Wait 3 seconds after initial load
      }
    } catch (historyError) {
      console.warn('Could not load history:', historyError);
      // Set empty history as default
      stores.history.setState({
        items: []
      });
    }
    
    return true;
  } catch (error) {
    console.error('Failed to initialize stores:', error);
    return false;
  }
}

// Load complete history data in background after initial app load
async function loadFullHistoryInBackground() {
  try {
    console.log('Loading complete history data in background...');
    // Get full history with pagination data
    const fullHistoryResponse = await getAllHistory({
      page: 1,
      limit: 20,
      includeTotal: true // Get pagination info this time
    });
    
    if (fullHistoryResponse && fullHistoryResponse.items) {
      // Update history store with complete data
      stores.history.setState({
        items: fullHistoryResponse.items,
        currentPage: fullHistoryResponse.currentPage || 1,
        totalPages: fullHistoryResponse.totalPages || 1,
        totalItems: fullHistoryResponse.totalItems || 0,
        isLoaded: true
      });
      console.log('Background history load complete');
    }
  } catch (error) {
    console.warn('Failed to load complete history in background:', error);
  }
}

// Load required assets with better progress tracking
async function loadAssets() {
  console.log('Loading application assets...');
  // Define environment
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Emit event to signal asset loading has started
  const assetLoadStartEvent = new Event('loading-assets-start');
  document.dispatchEvent(assetLoadStartEvent);

  // CSS with fallback - handles both development and production paths
  const loadCSS = (path) => {
    return new Promise((resolve) => {
      const cssFile = path.split('/').pop();
      
      // In development, use Vite's built-in CSS handling
      // In production, use the built CSS files
      const href = isProduction 
        ? `/css/${cssFile}`
        : path.replace('/css/', '/src/styles/');
      
      // Skip if already loaded
      if (document.querySelector(`link[href*="${cssFile}"]`)) {
        if (!isProduction) {
          console.log(`[loadCSS] Stylesheet already loaded: ${cssFile}`);
        }
        return resolve();
      }

      // In development, let Vite handle CSS imports directly
      if (!isProduction) {
        import(/* @vite-ignore */ href)
          .then(() => {
            console.log(`[loadCSS] Loaded via Vite: ${cssFile}`);
            resolve();
          })
          .catch(err => {
            console.warn(`[loadCSS] Failed to load via Vite: ${cssFile}`, err);
            resolve(); // Don't block loading
          });
        return;
      }

      // Production: Load CSS via link tag
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => {
        console.warn(`[loadCSS] Failed to load: ${cssFile} from ${href}`);
        resolve(); // Don't block loading
      };
      document.head.appendChild(link);
    });
  };
  
  // Group assets by priority - use relative paths that work in both dev and prod
  const cssBasePath = isProduction ? '/css/' : '/src/styles/components/';
  const criticalAssets = [
    loadCSS(`${cssBasePath}variables.css`),
    loadCSS(`${cssBasePath}components.css`)
  ];
  
  // Non-critical assets that can be loaded later
  const lowPriorityAssets = [];
  
  // Update loading progress
  const loadingProgress = document.getElementById('loading-progress');
  if (loadingProgress) {
    let loaded = 0;
    const total = criticalAssets.length;
    criticalAssets.forEach(p => p.then(() => {
      loaded++;
      const percent = Math.round((loaded / total) * 100);
      loadingProgress.style.width = `${percent}%`;
      loadingProgress.setAttribute('aria-valuenow', percent);
    }));
  }

  try {
    // Wait for critical assets to load
    await Promise.all(criticalAssets);
    console.log('Critical assets loaded');
    
    // Load non-critical assets in background
    if (lowPriorityAssets.length > 0) {
      Promise.all(lowPriorityAssets).then(() => {
        console.log('Low priority assets loaded');
      });
    }
  } catch (error) {
    console.warn('Error loading assets:', error);
  }
}

// Initialize UI components using the integration module
async function initializeComponents() {
  try {
    console.log('Initializing modern UI components...');
    
    // Get options from storage if available
    const skipRoomExperience = localStorage.getItem('operator_skip_room') === 'true';
    const initialLayoutPreset = stores.ui.getState().layoutPreset || 'default';
    
    // Initialize the modern UI components
    const rootElement = document.getElementById('app-container') || document.body;
    appComponents = initializeModernUI({
      rootElement,
      skipRoomExperience,
      initialLayoutPreset
    });
    
    // Wrap root component with ErrorBoundary
    const errorBoundary = document.createElement('div');
    errorBoundary.innerHTML = `
      <ErrorBoundary>
        ${rootElement.innerHTML}
      </ErrorBoundary>
    `;
    rootElement.innerHTML = '';
    rootElement.appendChild(errorBoundary);
    
    // WebSocket is now initialized in entry.js
    // Listen for authentication events to reinitialize WebSocket
    eventBus.on('user-authenticated', (userData) => {
      if (userData?.id) {
        // Ensure WebSocketManager is available
        if (window.WebSocketManager) {
          window.WebSocketManager.init(userData.id);
        } else {
          console.warn('WebSocketManager not available during authentication');
        }
      }
    });
    
    // Wait for components to be ready
    return new Promise((resolve) => {
      // Listen for application-ready event
      eventBus.once('application-ready', () => {
        console.log('Modern UI components ready');
        resolve();
      });
      
      // Fallback in case event doesn't fire
      setTimeout(resolve, 2000);
    });
  } catch (error) {
    console.error('Failed to initialize components:', error);
  }
}

// Initialize components with safeguards
async function initComponents() {
  try {
    if (!this.components) {
      // Load user preferences
      const userPreferences = JSON.parse(localStorage.getItem('userPreferences') || '{}');
      
      // Get notification position from settings with validation
      const validPositions = ['top-right', 'top-left', 'bottom-right', 'bottom-left'];
      let notificationPosition = userPreferences?.accessibility?.notificationPosition || 'bottom-left';
      
      // Ensure the position is valid
      if (!validPositions.includes(notificationPosition)) {
        console.warn(`Invalid notification position '${notificationPosition}' found, defaulting to 'bottom-left'`);
        notificationPosition = 'bottom-left';
      }
      
      console.log('[DEBUG] Initializing notifications with position:', notificationPosition);
      
      this.components = {
        notifications: new Notifications({ 
          position: notificationPosition,
          settings: userPreferences // Pass the full settings object
        })
      };
      
      // Apply the position to any existing notification container
      const existingContainer = document.querySelector('.notifications-container');
      if (existingContainer) {
        validPositions.forEach(pos => existingContainer.classList.remove(`position-${pos}`));
        existingContainer.classList.add(`position-${notificationPosition}`);
      }
    }
  } catch (error) {
    console.error('Component init failed:', error);
  }
}

// Complete initialization
function finalizeInitialization() {
  console.log('Finalizing application initialization...');
  
  // Emit application-ready event
  console.log('Emitting application-ready event');
  eventBus.emit('application-ready');
  
  // Also dispatch as DOM event for components that listen directly
  document.dispatchEvent(new Event('application-ready'));
  
  // Show welcome overlay (temporarily always showing for testing)
  // In production, use: const shouldShow = localStorage.getItem('operator_welcome_shown') !== 'true';
  const shouldShow = true;
  
  if (shouldShow) {
    // Import and show welcome overlay
    import('./components/WelcomeOverlay.jsx').then(({ showWelcomeOverlay }) => {
      // Add a small delay to ensure everything is loaded
      setTimeout(() => {
        showWelcomeOverlay();
        // In production, uncomment this to mark as shown:
        // localStorage.setItem('operator_welcome_shown', 'true');
      }, 1000);
    });
  }
}

// Helper function to update loading progress
function updateLoadingProgress(percentage, progressElement) {
  if (!progressElement) return;
  
  progressElement.style.width = `${percentage}%`;
  progressElement.setAttribute('aria-valuenow', percentage);
}

// Show notification to user
function showNotification(message, type = 'info') {
  // Use the modern notification system if available
  if (appComponents && appComponents.notifications) {
    appComponents.notifications.addNotification({
      message,
      type
    });
    return;
  }
  
  // Fallback for when modern components aren't initialized
  console.log(`Notification (${type}): ${message}`);
  
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  
  // Add icon based on type
  let icon = 'fa-info-circle';
  
  switch (type) {
    case 'success':
      icon = 'fa-check-circle';
      break;
    case 'warning':
      icon = 'fa-exclamation-triangle';
      break;
    case 'error':
      icon = 'fa-times-circle';
      break;
  }
  
  notification.innerHTML = `
    <div class="notification-icon">
      <i class="fas ${icon}"></i>
    </div>
    <div class="notification-content">
      <div class="notification-message">${message}</div>
    </div>
    <button class="notification-close">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  // Add to container or create one if it doesn't exist
  let container = document.querySelector('.notifications-container');
  if (!container) {
    // Get the saved position or use default
    const userPreferences = JSON.parse(localStorage.getItem('userPreferences') || '{}');
    const notificationPosition = userPreferences?.accessibility?.notificationPosition || 'bottom-left';
    
    container = document.createElement('div');
    container.className = `notifications-container position-${notificationPosition}`;
    document.body.appendChild(container);
  }
  
  container.appendChild(notification);
  
  // Set up close button
  const closeButton = notification.querySelector('.notification-close');
  if (closeButton) {
    closeButton.addEventListener('click', () => {
      notification.classList.add('dismissing');
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    });
  }
  
  // Auto dismiss after 5 seconds
  setTimeout(() => {
    notification.classList.add('dismissing');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 5000);
}

// Export public API
export async function initApp() {
  return initializeApp();
}
export default {
  init: initializeApp,
  stores,
  eventBus,

  getComponents: () => appComponents
};
