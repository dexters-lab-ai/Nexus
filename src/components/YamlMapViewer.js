/**
 * YamlMapViewer - Vanilla JS implementation
 * Displays details of a YAML map and provides actions for using, editing, and deleting
 */

class YamlMapViewer {
  constructor(options) {
    this.yamlMap = options.yamlMap || null;
    this.onClose = options.onClose || null;
    this.onEdit = options.onEdit || null;
    this.onDelete = options.onDelete || null;
    this.onAttach = options.onAttach || null;
    this.onClone = options.onClone || null;
    this.isOwner = options.isOwner || false;
    this.container = options.container || null;
    this.isFullscreen = false;
    this.isExecuting = false;
    
    // Store instance globally for direct access
    window._yamlMapViewerInstance = this;
    console.log('[DEBUG] Stored YamlMapViewer instance globally as window._yamlMapViewerInstance');
    console.log('[DEBUG] YamlMapViewer.js constructor called', this);
  }

  // Format the YAML for display with syntax highlighting
  formatYaml(yamlContent) {
    if (!yamlContent) return '';
    
    return yamlContent
      .replace(/tasks:/g, '<span style="color: #61affe;">tasks:</span>')
      .replace(/name:/g, '<span style="color: #f8ac30;">name:</span>')
      .replace(/flow:/g, '<span style="color: #49cc90;">flow:</span>')
      .replace(/- ai:/g, '<span style="color: #e83e8c;">- ai:</span>')
      .replace(/- aiQuery:/g, '<span style="color: #e83e8c;">- aiQuery:</span>')
      .replace(/- sleep:/g, '<span style="color: #9012fe;">- sleep:</span>');
  }

  // Handle using the YAML map
  async handleUseMap() {
    this.setIsExecuting(true);
    
    try {
      // Track usage
      await fetch(`/api/yaml-maps/${this.yamlMap._id}/use`, {
        method: 'POST',
        credentials: 'include'
      });
      
      // Attach to input for execution
      if (this.onAttach) this.onAttach();
      
      // Close the viewer
      if (this.onClose) this.onClose();
    } catch (error) {
      console.error('Error using YAML map:', error);
      alert(`Error: ${error.message}`);
    } finally {
      this.setIsExecuting(false);
    }
  }

  // Set executing state
  setIsExecuting(isExecuting) {
    this.isExecuting = isExecuting;
    this.renderExecutingState();
  }

  // Toggle fullscreen view
  toggleFullscreen() {
    this.isFullscreen = !this.isFullscreen;
    this.renderFullscreenState();
  }

  // Render executing state
  renderExecutingState() {
    if (!this.container) return;
    
    const runBtn = this.container.querySelector('.run-btn');
    if (!runBtn) return;
    
    if (this.isExecuting) {
      runBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Executing...';
      runBtn.disabled = true;
    } else {
      runBtn.innerHTML = '<i class="fas fa-play"></i> Run';
      runBtn.disabled = false;
    }
  }

  // Render fullscreen state
  renderFullscreenState() {
    if (!this.container) return;
    
    const detailEl = this.container.querySelector('.yaml-map-detail');
    if (!detailEl) return;
    
    const fullscreenBtn = this.container.querySelector('.fullscreen-btn');
    if (!fullscreenBtn) return;
    
    if (this.isFullscreen) {
      detailEl.classList.add('fullscreen');
      fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i>';
      fullscreenBtn.title = 'Exit fullscreen';
    } else {
      detailEl.classList.remove('fullscreen');
      fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i>';
      fullscreenBtn.title = 'Fullscreen';
    }
  }

  // Render the viewer
  render() {
    if (!this.container || !this.yamlMap) return;
    
    this.container.innerHTML = `
      <div class="yaml-map-detail ${this.isFullscreen ? 'fullscreen' : ''}">
        <div class="yaml-map-detail-header">
          <div class="yaml-map-detail-title">
            <h3>${this.yamlMap.name}</h3>
            <div class="yaml-map-detail-meta">
              <span>
                Updated: ${new Date(this.yamlMap.updatedAt).toLocaleDateString()} | 
                ${this.yamlMap.isPublic ? ' Public' : ' Private'} |
                ${this.yamlMap.usageCount !== undefined ? ` Used ${this.yamlMap.usageCount} times` : ''}
              </span>
            </div>
            <div class="yaml-map-usage-instructions">
              <h4><i class="fas fa-info-circle"></i> How to Use This Map</h4>
              <p>To use this YAML Map in a command, type the following in the command input:</p>
              <code>/yaml ${this.yamlMap._id}</code>
              <div class="attach-command-center-btn">
                <button class="btn-outline command-center-btn">
                  <i class="fas fa-terminal"></i> Attach to Command Center
                </button>
              </div>
            </div>
          </div>
          <div class="yaml-map-actions">
            <button 
              class="btn-primary run-btn"
              ${this.isExecuting ? 'disabled' : ''}
            >
              ${this.isExecuting ? 
                '<i class="fas fa-spinner fa-spin"></i> Executing...' : 
                '<i class="fas fa-play"></i> Run'
              }
            </button>
            
            <button class="btn-outline attach-btn command-center-btn" id="yaml-map-attach-btn">
              <i class="fas fa-paperclip"></i>
              Attach to Command Center
            </button>
            
            ${this.isOwner ? `
              <button class="btn-secondary edit-btn">
                <i class="fas fa-edit"></i>
                Edit
              </button>
            ` : ''}
            
            <button class="btn-secondary clone-btn">
              <i class="fas fa-copy"></i>
              Clone
            </button>
            
            ${this.isOwner ? `
              <button class="btn-danger delete-btn">
                <i class="fas fa-trash"></i>
                Delete
              </button>
            ` : ''}
          </div>
        </div>
        
        ${this.yamlMap.description ? `
          <div class="yaml-map-detail-description">
            ${this.yamlMap.description}
          </div>
        ` : ''}
        
        ${this.yamlMap.url ? `
          <div class="yaml-map-detail-url">
            <div class="url-label"><i class="fas fa-link"></i> Target URL:</div>
            <div class="url-value">
              <a href="${this.yamlMap.url}" target="_blank" rel="noopener noreferrer">
                ${this.yamlMap.url}
                <i class="fas fa-external-link-alt"></i>
              </a>
            </div>
          </div>
        ` : ''}
        
        ${this.yamlMap.tags && this.yamlMap.tags.length > 0 ? `
          <div class="yaml-map-tags" style="margin-bottom: 20px;">
            ${this.yamlMap.tags.map(tag => `
              <span class="yaml-map-tag">${tag}</span>
            `).join('')}
          </div>
        ` : ''}
        
        <div class="yaml-map-detail-content">
          <div class="yaml-map-code">
            <div class="yaml-map-code-header">
              <span>YAML Content</span>
              ${this.yamlMap.url ? `
                <div class="yaml-map-content-url">
                  <i class="fas fa-link"></i>
                  <a href="${this.yamlMap.url}" target="_blank" rel="noopener noreferrer">${this.yamlMap.url}</a>
                </div>
              ` : ''}
              <div>
                <button 
                  class="btn-icon fullscreen-btn"
                  title="${this.isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}"
                >
                  <i class="fas fa-${this.isFullscreen ? 'compress' : 'expand'}"></i>
                </button>
                <button 
                  class="btn-icon copy-btn"
                  title="Copy to clipboard"
                >
                  <i class="fas fa-copy"></i>
                </button>
              </div>
            </div>
            ${this.yamlMap.url ? `
            <div class="yaml-map-content-url-banner">
              <i class="fas fa-link"></i> URL: <a href="${this.yamlMap.url}" target="_blank" rel="noopener noreferrer">${this.yamlMap.url}</a>
            </div>
          ` : ''}
          <pre>
            <code>${this.formatYaml(this.yamlMap.yaml)}</code>
          </pre>
          </div>
        </div>
        
        <div class="yaml-map-guide">
          <h4>How to Use This YAML Map</h4>
          <ol>
            <li>Click <strong>Run</strong> to execute this YAML map directly</li>
            <li>Click <strong>Attach to Input</strong> to reference this map in your chat input</li>
            <li>Reference in chat by typing: <code>/yaml ${this.yamlMap._id}</code></li>
          </ol>
          <p>
            <a 
              href="https://dexters-ai-lab.gitbook.io/dexters-ai-lab/getting-started/publish-your-docs-1" 
              target="_blank" 
              rel="noreferrer"
            >
              Learn more about YAML automation →
            </a>
          </p>
        </div>
      </div>
    `;
    
    this.addEventListeners();
  }

  // Handle attachment to command center
  handleAttachToCommandCenter() {
    alert('Attaching YAML map to Command Center...');
    console.log('[DEBUG-ATTACH] ========== STARTING YAML ATTACHMENT PROCESS =========');
    console.log('[DEBUG-ATTACH] YamlMapViewer.handleAttachToCommandCenter() called');
    
    if (!this.yamlMap) {
      console.error('[DEBUG-ATTACH] ERROR: this.yamlMap is null or undefined');
      alert('Error: No YAML map to attach');
      return;
    }
    
    console.log('[DEBUG-ATTACH] YAML Map data:', JSON.stringify(this.yamlMap, null, 2));
    const mapId = this.yamlMap._id;
    console.log('[DEBUG-ATTACH] Using mapId:', mapId);
    
    try {
      // Find the command input directly - exactly like Sidebar.jsx does
      console.log('[DEBUG-ATTACH] Searching for command input with selector: #command-input, .command-input');
      const allInputs = document.querySelectorAll('input');
      console.log('[DEBUG-ATTACH] All input elements on page:', allInputs.length);
      allInputs.forEach((input, i) => {
        console.log(`[DEBUG-ATTACH] Input #${i}:`, input.id, input.className, input.type);
      });
      
      const commandInput = document.querySelector('#command-input, .command-input');
      console.log('[DEBUG-ATTACH] Command input found?', !!commandInput);
      
      if (commandInput) {
        console.log('[DEBUG-ATTACH] Command input details:', {
          id: commandInput.id,
          className: commandInput.className,
          type: commandInput.type,
          visible: commandInput.offsetParent !== null
        });
        
        // Mark the input as having a YAML map attached
        console.log('[DEBUG-ATTACH] Setting dataset.yamlMapId to:', mapId);
        commandInput.dataset.yamlMapId = mapId;
        console.log('[DEBUG-ATTACH] Adding yaml-attached class');
        commandInput.classList.add('yaml-attached');
        
        // Create an indicator element to show the attachment
        console.log('[DEBUG-ATTACH] Creating indicator element');
        const indicator = document.createElement('div');
        indicator.className = 'yaml-map-indicator';
        indicator.innerHTML = `
          <div class="yaml-indicator-content">
            <i class="fas fa-file-code"></i>
            <span>YAML: ${this.yamlMap.name}</span>
            <button class="remove-yaml-btn" title="Remove YAML Map">
              <i class="fas fa-times"></i>
            </button>
          </div>
        `;
        
        // Style the indicator
        console.log('[DEBUG-ATTACH] Styling indicator element');
        indicator.style.cssText = `
          position: absolute;
          top: -30px;
          left: 0;
          right: 0;
          padding: 4px 8px;
          background: rgba(0, 119, 255, 0.2);
          border-radius: 4px;
          color: var(--primary, #0077ff);
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        `;
        
        // Style the indicator content
        const content = indicator.querySelector('.yaml-indicator-content');
        content.style.cssText = `
          display: flex;
          align-items: center;
          gap: 8px;
        `;
        
        // Style the remove button
        const removeBtn = indicator.querySelector('.remove-yaml-btn');
        removeBtn.style.cssText = `
          background: transparent;
          border: none;
          color: var(--primary, #0077ff);
          cursor: pointer;
          margin-left: 8px;
        `;
        
        // Add event listener to remove button
        console.log('[DEBUG-ATTACH] Adding event listener to remove button');
        removeBtn.addEventListener('click', (e) => {
          console.log('[DEBUG-ATTACH] Remove button clicked');
          e.preventDefault();
          e.stopPropagation();
          commandInput.dataset.yamlMapId = '';
          commandInput.classList.remove('yaml-attached');
          indicator.remove();
          
          // Re-enable the input
          commandInput.disabled = false;
          commandInput.placeholder = 'Enter a command...';
        });
        
        // Add the indicator to the command input container
        console.log('[DEBUG-ATTACH] Finding command input container');
        const commandContainer = commandInput.parentElement;
        if (commandContainer) {
          console.log('[DEBUG-ATTACH] Command container found:', commandContainer.tagName, commandContainer.className);
          commandContainer.style.position = 'relative';
          console.log('[DEBUG-ATTACH] Appending indicator to command container');
          commandContainer.appendChild(indicator);
        } else {
          console.error('[DEBUG-ATTACH] ERROR: Command input has no parent element');
        }
        
        // Disable the input and update placeholder
        console.log('[DEBUG-ATTACH] Disabling command input and updating placeholder');
        commandInput.disabled = true;
        commandInput.placeholder = 'YAML Map attached. Click submit to execute.';
        
        // Track usage
        console.log('[DEBUG-ATTACH] Tracking YAML map usage via API');
        fetch(`/api/yaml-maps/${mapId}/use`, {
          method: 'POST',
          credentials: 'include'
        }).then(response => {
          console.log('[DEBUG-ATTACH] Usage tracking response:', response.status);
        }).catch(err => {
          console.error('[DEBUG-ATTACH] Error tracking YAML map usage:', err);
        });
        
        // Show notification using different methods
        console.log('[DEBUG-ATTACH] Attempting to show notification');
        if (typeof showNotification === 'function') {
          console.log('[DEBUG-ATTACH] Using showNotification function');
          showNotification('YAML Map attached to Command Center! Click submit to execute the YAML workflow.', 'success', 5000);
        } else {
          console.log('[DEBUG-ATTACH] showNotification not available, using custom notification');
          // Create a custom notification
          const notification = document.createElement('div');
          notification.className = 'notification notification-success';
          notification.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>YAML Map attached to Command Center!</span>
          `;
          notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: rgba(40, 167, 69, 0.9);
            color: white;
            padding: 10px 20px;
            border-radius: 4px;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.3s ease;
          `;
          document.body.appendChild(notification);
          
          // Show and then fade out
          setTimeout(() => {
            notification.style.opacity = '1';
            setTimeout(() => {
              notification.style.opacity = '0';
              setTimeout(() => {
                if (notification.parentNode) {
                  notification.parentNode.removeChild(notification);
                }
              }, 500);
            }, 4000);
          }, 10);
        }
        
        // Emit events for system integration
        console.log('[DEBUG-ATTACH] Attempting to emit events');
        try {
          console.log('[DEBUG-ATTACH] Checking for eventBus availability');
          if (window.eventBus) {
            console.log('[DEBUG-ATTACH] Found window.eventBus, emitting events');
            window.eventBus.emit('yaml-map-attached', { mapId });
            window.eventBus.emit('notification', {
              message: 'YAML Map attached to Command Center! Click submit to execute the workflow.',
              type: 'success',
              duration: 5000
            });
            console.log('[DEBUG-ATTACH] Events emitted via window.eventBus');
          } else {
            console.log('[DEBUG-ATTACH] No eventBus found, using CustomEvent');
            const event = new CustomEvent('app-event', {
              detail: {
                type: 'yaml-map-attached',
                data: { mapId }
              }
            });
            document.dispatchEvent(event);
            console.log('[DEBUG-ATTACH] Event emitted via CustomEvent');
          }
        } catch (error) {
          console.error('[DEBUG-ATTACH] Error emitting events:', error);
        }
      } else {
        console.error('[DEBUG-ATTACH] ERROR: Command input not found');
        // Try to find the Command Center to diagnose why we can't find the input
        const commandCenter = document.querySelector('#command-center, .command-center');
        console.log('[DEBUG-ATTACH] Command center element found?', !!commandCenter);
        if (commandCenter) {
          console.log('[DEBUG-ATTACH] Command center details:', commandCenter.id, commandCenter.className);
        }
        
        alert('Command Center input not found. Please make sure the Command Center is visible.');
      }
    } catch (error) {
      console.error('[DEBUG-ATTACH] CRITICAL ERROR attaching YAML map:', error);
      alert('Failed to attach YAML map: ' + error.message);
    }
    
    // Close the viewer
    console.log('[DEBUG-ATTACH] Closing YAML map viewer');
    if (this.onClose) {
      this.onClose();
    } else {
      console.warn('[DEBUG-ATTACH] No onClose callback available');
    }
    console.log('[DEBUG-ATTACH] ========== YAML ATTACHMENT PROCESS COMPLETE =========');
  }
  
  // Add event listeners
  addEventListeners() {
    console.log('[DEBUG] YamlMapViewer.addEventListeners() called');
    if (!this.container) {
      console.error('[DEBUG] No container found for event listeners');
      return;
    }
    console.log('[DEBUG] Container found:', this.container);
    
    // Run button
    const runBtn = this.container.querySelector('.run-btn');
    if (runBtn) {
      console.log('[DEBUG] Run button found');
      runBtn.addEventListener('click', () => this.handleUseMap());
    } else {
      console.warn('[DEBUG] Run button not found');
    }
    
    // Attach handler only to the main Attach to Command Center button
    const attachBtn = this.container.querySelector('#yaml-map-attach-btn');
    if (attachBtn) {
      console.log('[DEBUG] Found Attach to Command Center button:', attachBtn.outerHTML);
      const clickHandler = (e) => {
        console.log('[DEBUG] Attach to Command Center button clicked!', e.target);
        e.preventDefault();
        e.stopPropagation();
        this.handleAttachToCommandCenter();
      };
      attachBtn.setAttribute('data-yaml-attach-handler', 'true');
      attachBtn.style.pointerEvents = 'auto';
      attachBtn.style.cursor = 'pointer';
      attachBtn.addEventListener('click', clickHandler);
      if (window.getComputedStyle(attachBtn).display === 'none') {
        console.warn('[DEBUG] Attach button is hidden by CSS:', attachBtn);
      }
    } else {
      console.warn('[DEBUG] Attach to Command Center button not found!');
    }
    // Log all clickable elements for troubleshooting
    const allButtons = this.container.querySelectorAll('button');
    console.log('[DEBUG] All buttons in container:', allButtons.length, Array.from(allButtons).map(b => ({ class: b.className, text: b.textContent.trim() })));
    
    // Edit button
    const editBtn = this.container.querySelector('.edit-btn');
    if (editBtn && this.onEdit) {
      console.log('[DEBUG] Edit button found, adding event listener');
      editBtn.addEventListener('click', () => this.onEdit());
    } else {
      console.warn('[DEBUG] Edit button not found or no onEdit handler');
    }
    
    // Clone button
    const cloneBtn = this.container.querySelector('.clone-btn');
    if (cloneBtn && this.onClone) {
      console.log('[DEBUG] Clone button found, adding event listener');
      cloneBtn.addEventListener('click', () => this.onClone());
    }
    
    // Delete button
    const deleteBtn = this.container.querySelector('.delete-btn');
    if (deleteBtn && this.onDelete) {
      console.log('[DEBUG] Delete button found, adding event listener');
      deleteBtn.addEventListener('click', () => this.onDelete());
    }
    
    // Fullscreen button
    const fullscreenBtn = this.container.querySelector('.fullscreen-btn');
    if (fullscreenBtn) {
      console.log('[DEBUG] Fullscreen button found, adding event listener');
      fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    }
    
    // Copy button
    const copyBtn = this.container.querySelector('.copy-btn');
    if (copyBtn && this.yamlMap) {
      console.log('[DEBUG] Copy button found, adding event listener');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(this.yamlMap.yaml);
        alert('YAML content copied to clipboard');
      });
    }
  }
}

export default YamlMapViewer;
