/**
 * Server Ready Check
 * 
 * This script checks if the backend server is ready before allowing
 * the application to fully load. It prevents the frustrating experience
 * of seeing the page attempt to load and then crash or reload repeatedly
 * when the server isn't ready yet.
 */

(function() {
  // Only run this in development mode
  if (window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1')) {
    return;
  }

  const MAX_RETRIES = 30;
  const RETRY_DELAY = 1000; // 1 second
  let retryCount = 0;
  let loadingOverlay = null;
  
  // Block all script execution until server is ready
  window.serverIsReady = false;
  
  // Prevent any assets from loading until server is ready
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    // Create the element normally
    const element = originalCreateElement.call(document, tagName);
    
    // If it's a script tag, modify its behavior to wait for server ready state
    if (tagName.toLowerCase() === 'script' && !window.serverIsReady) {
      const originalSetAttribute = element.setAttribute;
      element.setAttribute = function(name, value) {
        // If it's the src attribute and we're not ready, hold the execution
        if (name === 'src' && !window.serverIsReady && !value.includes('server-ready-check.js')) {
          console.log('🔄 Delaying script loading until server is ready:', value);
          // Store the src for later
          element._pendingSrc = value;
          // Return the element without setting the src
          return element;
        }
        return originalSetAttribute.call(this, name, value);
      };
    }
    return element;
  };
  
  // Intercept all fetch requests
  const originalFetch = window.fetch;
  window.fetch = function(resource, options) {
    // Allow health check fetches to pass through
    if (resource === '/api/health') {
      return originalFetch.apply(this, arguments);
    }
    
    // Block other fetches until server is ready
    if (!window.serverIsReady) {
      console.log('🔄 Blocking fetch until server is ready:', resource);
      return new Promise((resolve, reject) => {
        // Store the fetch request to retry later
        window.pendingFetches = window.pendingFetches || [];
        window.pendingFetches.push(() => {
          // Once server is ready, actual fetch will be executed
          originalFetch.call(window, resource, options)
            .then(resolve)
            .catch(reject);
        });
      });
    }
    
    // If server is ready, allow fetch to proceed normally
    return originalFetch.apply(this, arguments);
  };
  
  // Function to unlock all pending scripts and fetches once server is ready
  function unlockPendingScripts() {
    console.log('🚀 Server is ready, unlocking all pending scripts and fetches');
    
    // Find all script elements with pending src
    const scripts = document.querySelectorAll('script');
    scripts.forEach(script => {
      if (script._pendingSrc) {
        console.log('⚡ Loading previously blocked script:', script._pendingSrc);
        script.src = script._pendingSrc;
        delete script._pendingSrc;
      }
    });
    
    // Process all pending fetch requests
    if (window.pendingFetches && window.pendingFetches.length > 0) {
      console.log(`⚡ Processing ${window.pendingFetches.length} pending fetch requests`);
      window.pendingFetches.forEach(fetchFn => {
        try {
          fetchFn();
        } catch (error) {
          console.error('Error executing pending fetch:', error);
        }
      });
      window.pendingFetches = [];
    }
    
    // Restore original functions
    setTimeout(() => {
      if (originalCreateElement) document.createElement = originalCreateElement;
      if (originalFetch) window.fetch = originalFetch;
      console.log('✅ DOM APIs restored to normal operation');
    }, 1000);
  }

  // Create and show the loading overlay
  function showLoadingOverlay() {
    if (loadingOverlay) return;

    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'server-loading-overlay';
    loadingOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: #121212;
      color: white;
      z-index: 100000; /* Extremely high z-index to ensure it's above everything */
      display: flex;
      justify-content: center;
      align-items: center;
      font-family: Arial, sans-serif;
      opacity: 1;
      transition: opacity 0.4s ease-out;
      pointer-events: auto; /* Ensure it captures all clicks */
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      text-align: center;
      max-width: 400px;
      padding: 20px;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Starting Server...';
    title.style.cssText = `
      margin-bottom: 15px;
      font-size: 24px;
      font-weight: 600;
    `;

    const spinner = document.createElement('div');
    spinner.style.cssText = `
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top: 3px solid white;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      margin: 0 auto 20px auto;
      animation: spin 1s linear infinite;
    `;

    // Add animation for the spinner
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;

    const message = document.createElement('p');
    message.id = 'server-loading-message';
    message.textContent = 'Waiting for the backend server to start...';
    message.style.cssText = `
      margin-bottom: 15px;
      line-height: 1.5;
      font-size: 16px;
    `;

    const subMessage = document.createElement('p');
    subMessage.id = 'server-loading-submessage';
    subMessage.textContent = 'This may take a few moments on first startup';
    subMessage.style.cssText = `
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
    `;

    const retryCounter = document.createElement('p');
    retryCounter.id = 'server-retry-counter';
    retryCounter.textContent = `Checking server... (Retry 1/${MAX_RETRIES})`;
    retryCounter.style.cssText = `
      margin-top: 20px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
    `;

    content.appendChild(title);
    content.appendChild(spinner);
    content.appendChild(message);
    content.appendChild(subMessage);
    content.appendChild(retryCounter);
    
    loadingOverlay.appendChild(content);
    document.head.appendChild(style);
    document.body.appendChild(loadingOverlay);
  }

  // Remove the loading overlay with improved cleanup
  function hideLoadingOverlay() {
    // Find the overlay by ID in case the reference was lost
    const overlay = loadingOverlay || document.getElementById('server-loading-overlay');
    
    if (overlay && overlay.parentNode) {
      // First fade it out gracefully
      overlay.style.opacity = '0';
      
      // Then remove it from the DOM after the transition
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        
        // Also check for any orphaned overlays by ID as a fallback
        const orphanedOverlay = document.getElementById('server-loading-overlay');
        if (orphanedOverlay) {
          console.warn('Found orphaned server overlay, removing it');
          if (orphanedOverlay.parentNode) {
            orphanedOverlay.parentNode.removeChild(orphanedOverlay);
          }
        }
        
        // Clean up reference
        loadingOverlay = null;
      }, 500);
    }
  }

  // Update the loading message
  function updateLoadingMessage(message, subMessage) {
    const messageEl = document.getElementById('server-loading-message');
    const subMessageEl = document.getElementById('server-loading-submessage');
    const retryCounterEl = document.getElementById('server-retry-counter');
    
    if (messageEl && message) {
      messageEl.textContent = message;
    }
    
    if (subMessageEl && subMessage) {
      subMessageEl.textContent = subMessage;
    }
    
    if (retryCounterEl) {
      retryCounterEl.textContent = `Checking server... (Retry ${retryCount + 1}/${MAX_RETRIES})`;
    }
  }

  // Check if the server is ready
  function checkServerReady() {
    return fetch('/api/health')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server responded with status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        return data.serverReady === true;
      })
      .catch(error => {
        console.log('Server not ready yet:', error.message);
        return false;
      });
  }

  // Main function to poll the server until it's ready
  function waitForServer() {
    // Only show the overlay once the document has loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', showLoadingOverlay);
    } else {
      showLoadingOverlay();
    }
    
    // Set up a failsafe cleanup in case something goes wrong
    const failsafeTimeout = setTimeout(() => {
      console.warn('Failsafe cleanup: Removing server overlay after 60 seconds');
      forceCleanupOverlay();
    }, 60000); // 60 seconds max

    function pollServer() {
      retryCount++;
      updateLoadingMessage(null, null); // Just update the retry counter
      
      checkServerReady()
        .then(isReady => {
          if (isReady) {
            // Server is ready!
            updateLoadingMessage('Server is ready!', 'Loading application...');
            
            // Clear the failsafe timeout since we're handling it properly
            clearTimeout(failsafeTimeout);
            
            // First, mark the server as ready to unblock scripts
            window.serverIsReady = true;
            
            // Execute the unlock immediately but delay the overlay removal slightly
            unlockPendingScripts();
            
            // Dispatch an event that the application can listen for
            window.dispatchEvent(new Event('serverReady'));
            
            // Hide the overlay with slight delay
            setTimeout(() => {
              hideLoadingOverlay();
              
              // Double-check that the overlay is gone after hiding
              setTimeout(forceCleanupOverlay, 1000);
            }, 500);
          } else if (retryCount < MAX_RETRIES) {
            // Try again after delay
            setTimeout(pollServer, RETRY_DELAY);
          } else {
            // Max retries reached
            updateLoadingMessage(
              'Server not responding',
              'The backend server is taking too long to start. You may need to restart the application.'
            );
            
            // Add a button to force continue anyway
            const retryCounterEl = document.getElementById('server-retry-counter');
            if (retryCounterEl) {
              const continueButton = document.createElement('button');
              continueButton.textContent = 'Continue Anyway';
              continueButton.style.cssText = `
                padding: 8px 16px;
                margin-top: 15px;
                background: #2a3b8f;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
              `;
              continueButton.onclick = forceCleanupOverlay;
              retryCounterEl.parentNode.insertBefore(continueButton, retryCounterEl.nextSibling);
            }
          }
        });
    }
    
    // Force cleanup function for when all else fails
    function forceCleanupOverlay() {
      console.warn('Forcing cleanup of server loading overlay');
      
      // Allow the application to continue loading regardless
      window.serverIsReady = true;
      
      // Unlock all pending scripts
      unlockPendingScripts();
      
      // Find and remove the overlay directly
      const overlay = document.getElementById('server-loading-overlay');
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      
      // Clean up reference
      loadingOverlay = null;
      
      // Dispatch an event that the application can listen for
      window.dispatchEvent(new Event('serverReady'));
    }

    // Start polling
    pollServer();
  }

  // Start the process
  waitForServer();
})();
