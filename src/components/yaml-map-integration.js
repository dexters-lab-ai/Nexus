/**
 * YAML Maps Integration
 * Connects the YAML Maps component with the application's event system
 */
// Import modules properly using ES module syntax
import YamlMapViewer from './YamlMapViewer.js';
import YamlMapsImport from './YamlMaps.js';
import { eventBus } from '../utils/events.js';
import api from '../utils/api.js';

// Set up YamlMaps with proper fallbacks
let YamlMaps = YamlMapsImport;

console.log('DEBUG [yaml-map-integration.js]: YamlMaps import result:', typeof YamlMaps);
console.log('DEBUG [yaml-map-integration.js]: YamlMapViewer import result:', typeof YamlMapViewer);

// Check if YamlMaps is available as a global object
if (typeof YamlMaps !== 'function' && typeof window.YamlMaps === 'function') {
  console.log('DEBUG: Using global YamlMaps constructor instead of import');
  // Use global if available
  YamlMaps = window.YamlMaps;
}

// Make sure we have a direct reference to YamlMaps in the window object
window.YamlMapsRef = YamlMaps;

// Create simple stub implementations to avoid errors
if (typeof YamlMaps !== 'function') {
  console.error('CRITICAL: YamlMaps not available as a function - creating stub');
  YamlMaps = function(options) {
    console.error('ERROR: Using YamlMaps stub implementation');
    this.container = options.container;
    this.fetchYamlMaps = function() { return Promise.resolve([]); };
    this.selectMap = function() { console.log('Stub selectMap called'); };
  };
}

// Global instance reference
let yamlMapsInstance = null;

/**
 * Initialize YAML Maps integration with application
 */
export function initYamlMapsIntegration() {
  console.log('Initializing YAML Maps integration...');
  
  // Set up event listener for the view-yaml-map event
  document.addEventListener('app-event', (event) => {
    const { type, data } = event.detail || {};
    
    if (type === 'view-yaml-map' && data && data.mapId) {
      showYamlMapViewer(data.mapId);
    }
  });
  
  // Also listen for direct event bus events (legacy support)
  if (window.eventBus) {
    window.eventBus.on('view-yaml-map', (data) => {
      if (data && data.mapId) {
        console.log('Received view-yaml-map event via eventBus:', data);
        showYamlMapViewer(data.mapId);
      }
    });
    console.log('Registered view-yaml-map event listener on eventBus');
  }
}

/**
 * Direct YAML Map Viewer - Simplified approach
 */
function showYamlMapViewer(mapId) {
  console.log(`DEBUG: Opening direct YAML map viewer for map: ${mapId}`);
  
  // Create overlay with blocking backdrop if it doesn't exist
  let yamlOverlay = document.getElementById('yaml-direct-overlay');
  if (!yamlOverlay) {
    yamlOverlay = document.createElement('div');
    yamlOverlay.id = 'yaml-direct-overlay';
    yamlOverlay.style.position = 'fixed';
    yamlOverlay.style.top = '0';
    yamlOverlay.style.left = '0';
    yamlOverlay.style.width = '100vw';
    yamlOverlay.style.height = '100vh';
    yamlOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    yamlOverlay.style.display = 'flex';
    yamlOverlay.style.justifyContent = 'center';
    yamlOverlay.style.alignItems = 'center';
    yamlOverlay.style.zIndex = '9999';
    document.body.appendChild(yamlOverlay);
    
    // Add click handler to close on backdrop click
    yamlOverlay.addEventListener('click', (e) => {
      if (e.target === yamlOverlay) {
        closeYamlViewer();
      }
    });
  } else {
    yamlOverlay.style.display = 'flex';
  }
  
  // Create a new container for this specific map
  let yamlContainer = document.createElement('div');
  yamlContainer.id = 'yaml-direct-viewer';
  yamlContainer.className = 'yaml-maps-modal active';
  
  // Style the container
  yamlContainer.style.width = '90%';
  yamlContainer.style.maxWidth = '1200px';
  yamlContainer.style.height = '80%';
  yamlContainer.style.maxHeight = '800px';
  yamlContainer.style.backgroundColor = 'var(--dark-light, #1a1f2e)';
  yamlContainer.style.borderRadius = '12px';
  yamlContainer.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.5)';
  yamlContainer.style.display = 'flex';
  yamlContainer.style.flexDirection = 'column';
  yamlContainer.style.padding = '20px';
  yamlContainer.style.color = 'white';
  yamlContainer.style.position = 'relative';
  yamlContainer.style.overflow = 'hidden';
  yamlContainer.onclick = (e) => e.stopPropagation();
  
  // Add a loading indicator
  yamlContainer.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h2 style="margin: 0;">YAML Map Viewer</h2>
      <button id="yaml-close-btn" style="background: transparent; border: none; color: white; font-size: 24px; cursor: pointer;">&times;</button>
    </div>
    <div id="yaml-map-content" style="flex: 1; overflow: auto; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 8px;">
      <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
        <div style="text-align: center;">
          <div style="margin-bottom: 20px;">Loading YAML Map...</div>
          <div style="width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.3); border-radius: 50%; border-top-color: white; animation: yaml-spin 1s linear infinite; margin: 0 auto;"></div>
        </div>
      </div>
    </div>
  `;
  
  // Add the animation
  const styleTag = document.createElement('style');
  styleTag.textContent = `
    @keyframes yaml-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleTag);
  
  // Add the container to the overlay
  yamlOverlay.appendChild(yamlContainer);
  
  // Add event handlers for buttons
  setTimeout(() => {
    // Close button handler
    const closeBtn = document.getElementById('yaml-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeYamlViewer);
    }
    
    // Setup copy command button
    const copyBtn = document.getElementById('copy-command-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const commandText = `run yaml-map ${mapId}`;
        navigator.clipboard.writeText(commandText).then(() => {
          // Provide visual feedback
          const originalText = copyBtn.innerHTML;
          copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
          copyBtn.style.background = 'rgba(0, 200, 83, 0.3)';
          copyBtn.style.borderColor = 'rgba(0, 200, 83, 0.5)';
          
          setTimeout(() => {
            copyBtn.innerHTML = originalText;
            copyBtn.style.background = 'rgba(30, 40, 60, 0.5)';
            copyBtn.style.borderColor = 'rgba(60, 80, 120, 0.3)';
          }, 2000);
        }).catch(err => {
          console.error('Failed to copy text: ', err);
          alert('Failed to copy to clipboard: ' + err);
        });
      });
    }
    
    // Setup attach to command center button
    const attachBtn = document.getElementById('attach-command-btn');
    if (attachBtn) {
      // Directly set onclick for maximum compatibility
      attachBtn.onclick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        console.log('YAML Map attach button clicked from modal!');
        // Find the command input
        const commandInput = document.querySelector('.command-input');
        if (commandInput) {
          try {
            // Store the YAML map ID
            commandInput.dataset.yamlMapId = mapId;
            
            // Visually indicate attachment
            commandInput.classList.add('yaml-attached');
            
            // Show indicator if not already there
            if (!document.querySelector('.yaml-attachment-indicator')) {
              const indicator = document.createElement('div');
              indicator.className = 'yaml-attachment-indicator';
              indicator.innerHTML = `
                <div class="yaml-indicator-content">
                  <i class="fas fa-file-code"></i>
                  <span>YAML Map Attached</span>
                  <button class="remove-yaml-btn"><i class="fas fa-times"></i></button>
                </div>
              `;
              
              // Style the indicator
              indicator.style.position = 'absolute';
              indicator.style.top = '-30px';
              indicator.style.left = '0';
              indicator.style.right = '0';
              indicator.style.padding = '5px 10px';
              indicator.style.background = 'rgba(0, 119, 255, 0.2)';
              indicator.style.borderRadius = '4px';
              indicator.style.color = 'var(--primary, #0077ff)';
              indicator.style.fontSize = '12px';
              indicator.style.display = 'flex';
              indicator.style.alignItems = 'center';
              indicator.style.justifyContent = 'center';
              
              // Style the content
              const content = indicator.querySelector('.yaml-indicator-content');
              if (content) {
                content.style.display = 'flex';
                content.style.alignItems = 'center';
                content.style.gap = '8px';
              }
              
              // Style the remove button
              const removeBtn = indicator.querySelector('.remove-yaml-btn');
              if (removeBtn) {
                removeBtn.style.background = 'transparent';
                removeBtn.style.border = 'none';
                removeBtn.style.color = 'var(--primary, #0077ff)';
                removeBtn.style.cursor = 'pointer';
                removeBtn.style.marginLeft = '8px';
                
                // Add event listener to remove attachment
                removeBtn.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  commandInput.dataset.yamlMapId = '';
                  commandInput.classList.remove('yaml-attached');
                  indicator.remove();
                  
                  // Re-enable the input
                  commandInput.disabled = false;
                  commandInput.placeholder = 'Enter a command...';
                });
              }
              
              // Add indicator to command container
              const commandContainer = commandInput.parentElement;
              if (commandContainer) {
                commandContainer.style.position = 'relative';
                commandContainer.appendChild(indicator);
              }
            }
            
            // Disable input and update placeholder
            commandInput.disabled = true;
            commandInput.placeholder = 'YAML Map attached. Click submit to execute.';
            
            // Show notification using multiple methods to ensure it works
            console.log('Attempting to notify about YAML map attachment...');
            
            // Method 1: Try direct imported eventBus (if available)
            try {
              if (typeof eventBus !== 'undefined') {
                console.log('Using imported eventBus for notification');
                eventBus.emit('notification', {
                  message: 'YAML Map attached to Command Center! Click submit to execute the workflow.',
                  type: 'success',
                  duration: 5000
                });
                eventBus.emit('yaml-map-attached', { mapId });
              }
            } catch (e) {
              console.warn('Error with imported eventBus:', e);
            }
            
            // Method 2: Use window.eventBus (most reliable)
            try {
              if (window.eventBus) {
                console.log('Using window.eventBus for notification');
                window.eventBus.emit('notification', {
                  message: 'YAML Map attached to Command Center! Click submit to execute the workflow.',
                  type: 'success',
                  duration: 5000
                });
                
                // Also emit the yaml-map-attached event for global handling
                window.eventBus.emit('yaml-map-attached', { mapId });
              }
            } catch (e) {
              console.warn('Error with window.eventBus:', e);
            }
            
            // Method 3: Use custom DOM event as fallback
            try {
              console.log('Using CustomEvent as notification fallback');
              const notifyEvent = new CustomEvent('app-notification', {
                detail: {
                  message: 'YAML Map attached to Command Center! Click submit to execute the workflow.',
                  type: 'success',
                  duration: 5000
                }
              });
              document.dispatchEvent(notifyEvent);
              
              const attachEvent = new CustomEvent('app-event', {
                detail: {
                  type: 'yaml-map-attached',
                  data: { mapId }
                }
              });
              document.dispatchEvent(attachEvent);
            } catch (e) {
              console.warn('Error with CustomEvent:', e);
            }
            
            // Method 4: Direct DOM notification as ultimate fallback
            try {
              const notificationContainer = document.querySelector('.notification-container') || document.createElement('div');
              if (!document.body.contains(notificationContainer)) {
                notificationContainer.className = 'notification-container';
                notificationContainer.style.position = 'fixed';
                notificationContainer.style.top = '20px';
                notificationContainer.style.right = '20px';
                notificationContainer.style.zIndex = '9999';
                document.body.appendChild(notificationContainer);
              }
              
              const notification = document.createElement('div');
              notification.className = 'notification notification-success notification-important';
              notification.innerHTML = `
                <i class="fas fa-check-circle"></i>
                <span>YAML Map attached to Command Center! Click submit to execute the workflow.</span>
              `;
              notification.style.padding = '12px 18px';
              notification.style.marginBottom = '10px';
              notification.style.background = 'rgba(0, 200, 83, 0.2)';
              notification.style.border = '1px solid rgba(0, 200, 83, 0.3)';
              notification.style.borderRadius = '4px';
              notification.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
              notification.style.display = 'flex';
              notification.style.alignItems = 'center';
              notification.style.gap = '10px';
              notification.style.fontSize = '14px';
              notification.style.color = '#00a841';
              
              notificationContainer.appendChild(notification);
              
              // Remove after duration
              setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateY(-10px)';
                notification.style.transition = 'all 0.3s ease';
                setTimeout(() => notification.remove(), 300);
              }, 5000);
            } catch (e) {
              console.warn('Error with DOM notification:', e);
            }
            
            // Add a slight delay before closing to ensure all the attachment logic completes
            setTimeout(() => {
              // Close the YAML viewer with an explicit call
              closeYamlViewer();
              console.log('YAML viewer closed after attachment.');
            }, 300);
            
          } catch (error) {
            console.error('Error attaching YAML map:', error);
            if (window.eventBus) {
              window.eventBus.emit('notification', {
                message: 'Failed to attach YAML map: ' + error.message,
                type: 'error',
                duration: 5000
              });
            }
          }
        } else {
          console.error('Command input not found');
          if (window.eventBus) {
            window.eventBus.emit('notification', {
              message: 'Command Center not found. Please make sure it is visible.',
              type: 'error',
              duration: 5000
            });
          }
        }
      };
    }
  }, 0);
  
  // Fetch the map data
  fetchMapData(mapId);
}

/**
 * Close the YAML viewer
 */
function closeYamlViewer() {
  console.log('DEBUG: Closing YAML viewer');
  const overlay = document.getElementById('yaml-direct-overlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
}

/**
 * Fetch YAML map data and display it
 */
async function fetchMapData(mapId) {
  console.log('DEBUG: Fetching YAML map data for ID:', mapId);
  const contentEl = document.getElementById('yaml-map-content');
  
  try {
    // Use the API client to fetch the YAML map
    const data = await api.yamlMaps.getById(mapId);
    console.log('DEBUG: YAML map data received:', data);
    
    if (data) {
      // The API client already handles the response structure, so we can use the data directly
      displayYamlMap(data, contentEl);
    } else {
      throw new Error('No data returned from API');
    }
  } catch (error) {
    console.error('ERROR: Failed to fetch YAML map:', error);
    // Show error
    if (contentEl) {
      contentEl.innerHTML = `
        <div style="text-align: center; color: #ff5555; margin-top: 30px;">
          <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 20px;"></i>
          <h3>Error Loading YAML Map</h3>
          <p>${error.message || 'An error occurred while trying to load the YAML map.'}</p>
        </div>
      `;
    }
  }
}

/**
 * Display the YAML map data in the viewer
 */
function displayYamlMap(yamlMap, container) {
  console.log('DEBUG: Displaying YAML map:', yamlMap);
  if (!container) return;
  
  // Format date
  const createdDate = new Date(yamlMap.createdAt).toLocaleString();
  
  // First clean up existing scrollbars if any
  const existingStyle = document.getElementById('yaml-viewer-styles');
  if (!existingStyle) {
    const styleTag = document.createElement('style');
    styleTag.id = 'yaml-viewer-styles';
    styleTag.textContent = `
      .yaml-map-detail {
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .yaml-map-detail-header {
        flex-shrink: 0;
      }
      .yaml-map-content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        margin-top: 20px;
      }
      .yaml-content-wrapper {
        flex: 1;
        position: relative;
        overflow: hidden;
      }
      .yaml-content-pre {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        overflow: auto;
        padding: 15px;
        background: rgba(0,0,0,0.3);
        border-radius: 6px;
        color: #b3d6ff;
        margin: 0;
        font-family: monospace;
        white-space: pre-wrap;
        line-height: 1.5;
        font-size: 14px;
      }
      .yaml-map-usage-instructions {
        flex-shrink: 0;
        margin-top: 20px;
        padding-top: 10px;
        border-top: 1px solid rgba(255,255,255,0.1);
      }
    `;
    document.head.appendChild(styleTag);
  }

  container.innerHTML = `
    <div class="yaml-map-detail">
      <div class="yaml-map-detail-header">
        <div class="yaml-map-detail-title">
          <h3 style="margin-top: 0; margin-bottom: 8px;">${yamlMap.name || 'Unnamed YAML Map'}</h3>
          <div class="yaml-map-detail-meta" style="font-size: 12px; color: #aaa;">
            Created: ${createdDate}
          </div>
        </div>
      </div>
      
      <div class="yaml-map-content">
        <h4 style="margin-bottom: 10px; margin-top: 0;">YAML Content:</h4>
        <div class="yaml-content-wrapper">
          <pre class="yaml-content-pre">${yamlMap.content || 'No content available'}</pre>
        </div>
      </div>
      
      <div class="yaml-map-usage-instructions">
        <h4 style="margin-bottom: 10px; margin-top: 0;">How to Use This YAML Map</h4>
        <p style="margin-bottom: 10px;">You can execute this YAML map using one of the following methods:</p>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <code style="padding: 8px 12px; background: rgba(0,0,0,0.2); border-radius: 4px;">run yaml-map ${yamlMap._id}</code>
          <button id="copy-command-btn" style="background: rgba(30, 40, 60, 0.5); border: 1px solid rgba(60, 80, 120, 0.3); color: white; padding: 5px 10px; border-radius: 4px; cursor: pointer;">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <button id="attach-command-btn" style="background: rgba(0, 119, 255, 0.2); border: 1px solid rgba(0, 119, 255, 0.3); color: #0077ff; padding: 5px 10px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
            <i class="fas fa-paperclip"></i> Attach to Command Center
          </button>
        </div>
      </div>
    </div>
  `;
}

// Auto-initialize when imported and DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initYamlMapsIntegration, 0);
  } else {
    document.addEventListener('DOMContentLoaded', initYamlMapsIntegration);
  }
}

export default { initYamlMapsIntegration, showYamlMapViewer };
