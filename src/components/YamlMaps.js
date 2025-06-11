/**
 * YamlMaps - Vanilla JS implementation
 * Main interface for managing YAML automation maps
 * Allows users to create, view, edit, and use YAML maps for automated tasks
 */

import YamlMapEditor from './YamlMapEditor.js';
import YamlMapViewer from './YamlMapViewer.js';

class YamlMaps {
  constructor(options = {}) {
    // Container element
    this.container = options.container || null;
    
    // Callbacks
    this.onAttachToInput = options.onAttachToInput || null;
    this.onClose = options.onClose || null;
    
    // State
    this.yamlMaps = [];
    this.selectedMapId = null;
    this.isLoading = false;
    this.error = null;
    this.infoSlideInterval = null;
    this.currentInfoSlide = 0;
    this.infoSlides = [
      {
        icon: 'lightbulb',
        title: 'What are YAML Maps?',
        content: 'YAML Maps let you create reusable automation sequences that the agent can run for you. Perfect for repetitive tasks!'
      },
      {
        icon: 'magic',
        title: 'Automate Common Tasks',
        content: 'Define a sequence of commands that simulate user interactions, extract data, or perform complex multi-step processes.'
      },
      {
        icon: 'clock',
        title: 'Save Time',
        content: 'Create once, run anytime. YAML Maps can be saved, shared, and executed with a single command or button click.'
      }
    ];
    
    // Initialize if container is provided
    if (this.container) {
      this.init();
    }
  }

  // Initialize the component
  init() {
    console.log('Initializing YamlMaps component');
    this.render();
    
    // Load CSS files
    this.loadStylesheets();
    
    // Delay fetch to give time for rendering
    setTimeout(() => {
      this.fetchYamlMaps();
      this.initEventListeners();
      this.startInfoRotator();
      
      // Debug info
      const rotator = this.container.querySelector('.yaml-info-rotator');
      const slides = this.container.querySelectorAll('.yaml-info-slide');
      console.log(`Rotator element exists: ${!!rotator}`);
      console.log(`Found ${slides.length} slides`);
      
      // Force first slide to be visible with inline style if needed
      const firstSlide = this.container.querySelector('.yaml-info-slide[data-index="0"]');
      if (firstSlide) {
        firstSlide.style.display = 'block';
        firstSlide.classList.add('active');
      }
    }, 300);
    
    return this;
  }

  // Render the component
  render() {
    if (!this.container) {
      console.error('No container found for YamlMaps component');
      return;
    }
    
    console.log('Rendering YamlMaps component');
    
    // Main container HTML with iOS 15-inspired glass morphism design
    this.container.innerHTML = `
      <div class="yaml-maps-container">
        <div class="yaml-maps-header">
          <h2>
            YAML Maps
            <div class="yaml-maps-help-tooltip">
              <div class="yaml-maps-help-icon">?</div>
              <div class="yaml-maps-tooltip-content">
                YAML Maps allow you to create, save, and execute automated sequences of actions.
                Use them to automate repetitive tasks or complex workflows.
              </div>
            </div>
          </h2>
        </div>
        
        <div class="yaml-info-rotator">
          <div class="yaml-info-slide active" data-index="0">
            <div class="yaml-info-title">
              <i class="fas fa-lightbulb"></i>
              What are YAML Maps?
            </div>
            <div class="yaml-info-content">
              YAML Maps let you create reusable automation sequences that the agent can run for you. Perfect for repetitive tasks!
            </div>
          </div>
          <div class="yaml-info-slide" data-index="1">
            <div class="yaml-info-title">
              <i class="fas fa-magic"></i>
              Automate Common Tasks
            </div>
            <div class="yaml-info-content">
              Define a sequence of commands that simulate user interactions, extract data, or perform complex multi-step processes.
            </div>
          </div>
          <div class="yaml-info-slide" data-index="2">
            <div class="yaml-info-title">
              <i class="fas fa-clock"></i>
              Save Time
            </div>
            <div class="yaml-info-content">
              Create once, run anytime. YAML Maps can be saved, shared, and executed with a single command or button click.
            </div>
          </div>
          <div class="yaml-info-navigation">
            <div class="yaml-info-dots">
              <div class="yaml-info-dot active" data-index="0"></div>
              <div class="yaml-info-dot" data-index="1"></div>
              <div class="yaml-info-dot" data-index="2"></div>
            </div>
            <div class="yaml-info-actions">
              <button class="yaml-info-btn prev-slide">
                <i class="fas fa-chevron-left"></i>
              </button>
              <button class="yaml-info-btn next-slide">
                <i class="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        </div>
        
        <div class="yaml-maps-actions">
          <div class="yaml-maps-search">
            <i class="fas fa-search"></i>
            <input 
              type="text" 
              placeholder="Search YAML maps..." 
              class="yaml-maps-search-input"
            />
          </div>
          <button class="btn-primary create-map-btn">
            <i class="fas fa-plus"></i>
            Create New
          </button>
          <button class="btn-secondary attach-to-input-btn">
            <i class="fas fa-link"></i>
            Attach to Input
          </button>
        </div>
        
        <div class="yaml-maps-content">
          <div class="yaml-maps-sidebar">
            <div class="yaml-maps-loading">
              <i class="fas fa-spinner fa-spin"></i>
              <span>Loading YAML Maps...</span>
            </div>
            
            <div class="yaml-maps-error" style="display: none;">
              <i class="fas fa-exclamation-triangle"></i>
              <span class="error-message"></span>
            </div>
            
            <div class="yaml-maps-empty" style="display: none;">
              <div class="yaml-maps-empty-icon">
                <i class="fas fa-code"></i>
              </div>
              <h3>No YAML Maps Found</h3>
              <p class="empty-message">
                You haven't created any YAML maps yet.
              </p>
              <button class="btn-primary create-map-btn">
                <i class="fas fa-plus"></i>
                Create Your First Map
              </button>
            </div>
            
            <div class="yaml-maps-list" style="display: none;"></div>
          </div>
          
          <!-- <div class="yaml-map-detail">
            <div class="yaml-maps-empty">
              <div class="yaml-maps-empty-icon">
                <i class="fas fa-code"></i>
              </div>
              <h3>Select a YAML Map</h3>
              <p>Choose a YAML map from the sidebar to view its details, or create a new one.</p>
            </div>
          </div> -->
        </div>
      </div>
    `;
  }

  // Initialize event listeners
  initEventListeners() {
    if (!this.container) {
      console.error('Cannot initialize event listeners: container is null');
      return;
    }
    
    console.log('Initializing YamlMaps event listeners');
    
    // Search input
    const searchInput = this.container.querySelector('.yaml-maps-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', this.handleSearchChange.bind(this));
      console.log('Search input listener added');
    } else {
      console.warn('Search input not found');
    }
    
    try {
      // Create new map button - within the YAML maps container
      const createBtns = this.container.querySelectorAll('.create-map-btn');
      createBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          console.log('Create map button clicked');
          this.openEditor();
        });
      });
      console.log(`Added click handlers to ${createBtns.length} create-map-btn elements`);
      
      // Also handle the button in the sidebar header
      const newMapBtn = document.querySelector('.yaml-new-map-btn');
      if (newMapBtn) {
        newMapBtn.addEventListener('click', () => {
          console.log('New map button clicked (sidebar header)');
          this.openEditor();
        });
        console.log('Added click handler to sidebar yaml-new-map-btn');
      } else {
        console.warn('Sidebar new map button not found');
      }
      
      // Info rotator navigation buttons
      const prevBtn = this.container.querySelector('.prev-slide');
      const nextBtn = this.container.querySelector('.next-slide');
      
      if (prevBtn) {
        prevBtn.addEventListener('click', this.prevInfoSlide.bind(this));
        console.log('Previous slide button listener added');
      }
      
      if (nextBtn) {
        nextBtn.addEventListener('click', this.nextInfoSlide.bind(this));
        console.log('Next slide button listener added');
      }
      
      // Info dots navigation
      const dots = this.container.querySelectorAll('.yaml-info-dot');
      dots.forEach(dot => {
        dot.addEventListener('click', () => {
          const index = parseInt(dot.dataset.index);
          this.goToInfoSlide(index);
        });
      });
      console.log(`Added click handlers to ${dots.length} info dots`);
      
      // Global events
      document.addEventListener('yaml-map-saved', this.handleSavedMap.bind(this));
      document.addEventListener('yaml-map-deleted', this.handleMapDeleted.bind(this));
      document.addEventListener('map-selected', this.handleMapSelected.bind(this));
      console.log('Global event listeners added');
    } catch (error) {
      console.error('Error setting up event listeners:', error);
    }
  }

  // Load CSS files with proper paths for both dev and production
  loadStylesheets() {
    const isProduction = process.env.NODE_ENV === 'production';
    const cssFiles = [
      {
        id: 'yaml-maps-styles',
        dev: '/src/styles/components/yaml-maps.css',
        prod: '/css/components/yaml-maps.css',
        name: 'yaml-maps'
      },
      {
        id: 'yaml-editor-fixes-styles',
        dev: '/src/styles/components/yaml-editor-fixes.css',
        prod: '/css/components/yaml-editor-fixes.css',
        name: 'yaml-editor-fixes'
      }
    ];
    
    if (!isProduction) {
      console.log('Loading YAML Maps stylesheets in development mode...');
    }
    
    cssFiles.forEach(({ id, dev, prod, name }) => {
      const href = isProduction ? prod : dev;
      
      if (!document.getElementById(id)) {
        try {
          const link = document.createElement('link');
          link.id = id;
          link.rel = 'stylesheet';
          link.type = 'text/css';
          link.href = href;
          
          // Add debug logging in development
          if (!isProduction) {
            link.onload = () => console.log(`[YamlMaps] Loaded stylesheet: ${name}`);
            link.onerror = () => console.error(`[YamlMaps] Failed to load stylesheet: ${name}`);
          }
          
          document.head.appendChild(link);
          
          if (!isProduction) {
            console.log(`Added stylesheet: ${name} (${href})`);
          }
        } catch (error) {
          console.error(`[YamlMaps] Failed to load stylesheet ${name}:`, error);
        }
      } else if (!isProduction) {
        console.log(`Stylesheet already loaded: ${name}`);
      }
    });
    
    /* Commented out inline critical CSS to fully test the external stylesheet
    const criticalStyles = `
      .yaml-maps-container { display: flex !important; flex-direction: column !important; height: 100% !important; }
      .yaml-info-rotator { display: block !important; visibility: visible !important; }
      .yaml-info-slide.active { display: block !important; }
      .yaml-new-map-btn, .create-map-btn { cursor: pointer !important; }
    `;
    
    const styleEl = document.createElement('style');
    styleEl.textContent = criticalStyles;
    document.head.appendChild(styleEl);
    console.log('Added critical inline styles');
    */
    console.log('Using external stylesheet only - inline styles disabled');
  }

  // Open the editor
  openEditor(mapId = null) {
    console.log(`Opening YAML editor for map: ${mapId || 'new'}`);
    try {
      // First try directly with the imported YamlMapEditor
      if (typeof YamlMapEditor !== 'undefined') {
        console.log('Using global YamlMapEditor.open()');
        const editor = YamlMapEditor.open(mapId);
        if (!editor) {
          throw new Error('Failed to initialize editor');
        }
        return true;
      } 
      
      // Fallback to alternative ways to find the YamlMapEditor
      if (typeof window !== 'undefined') {
        // Look for the component on window or in global scope
        const EditorComponent = 
          window.YamlMapEditor || 
          window._yamlMapEditorComponent ||
          YamlMapEditor;
          
        if (EditorComponent && typeof EditorComponent.open === 'function') {
          console.log('Using found YamlMapEditor component');
          const editor = EditorComponent.open(mapId);
          if (!editor) {
            throw new Error('Editor initialized but returned null');
          }
          return true;
        }
      }
      
      throw new Error('YamlMapEditor component not found');
    } catch (error) {
      console.error('Error opening YAML map editor:', error);
      alert(`Error: Could not open the YAML editor. ${error.message}\n\nPlease refresh the page and try again.`);
      return false;
    }
  }

  // Handle saved map (create or update)
  handleSavedMap(savedMap) {
    // Check if the map already exists in our list
    const existingIndex = this.yamlMaps.findIndex(map => map._id === savedMap._id);
    
    if (existingIndex !== -1) {
      // Update existing map
      this.yamlMaps[existingIndex] = savedMap;
    } else {
      // Add new map
      this.yamlMaps.unshift(savedMap);
    }
    
    // Update selected map if it's the same one
    if (this.selectedMapId && this.selectedMapId === savedMap._id) {
      this.selectedMapId = savedMap._id;
    }
    
    // Refresh the UI
    this.renderMapsList();
    this.renderSelectedMap();
  }

  // Fetch YAML maps from the server
  async fetchYamlMaps() {
    try {
      this.setIsLoading(true);
      this.setError(null);
      
      // Enhanced fetch request to ensure URLs are included
      const response = await fetch('/api/yaml-maps?includeUrls=true&includeMetadata=true', {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch YAML maps');
      }
      
      const data = await response.json();
      
      if (data.success) {
        this.yamlMaps = data.yamlMaps;
        this.renderMapsList();
      } else {
        throw new Error(data.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error fetching YAML maps:', error);
      this.setError(error.message);
    } finally {
      this.setIsLoading(false);
    }
  }

  // Handle search query change
  async handleSearchChange(e) {
    const query = e.target.value;
    this.searchQuery = query;
    console.log(`Searching YAML maps for: "${query}"`);
    
    if (query.trim() === '') {
      // If search is cleared, fetch all maps
      this.fetchYamlMaps();
      return;
    }
    
    try {
      this.setIsLoading(true);
      const response = await fetch(`/api/yaml-maps/search?q=${encodeURIComponent(query)}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Search failed');
      }
      
      const data = await response.json();
      
      if (data.success) {
        console.log(`Found ${data.yamlMaps.length} maps matching query "${query}"`);
        this.yamlMaps = data.yamlMaps;
        this.renderMapsList();
      } else {
        throw new Error(data.error || 'Search failed');
      }
    } catch (error) {
      console.error('Error searching YAML maps:', error);
      this.setError(`Search failed: ${error.message}`);
    } finally {
      this.setIsLoading(false);
    }
  }

  // Handle map deletion
  async handleDeleteMap(mapId) {
    if (!confirm('Are you sure you want to delete this YAML map? This action cannot be undone.')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/yaml-maps/${mapId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete YAML map');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Remove the deleted map from state
        this.yamlMaps = this.yamlMaps.filter(map => map._id !== mapId);
        
        // If the deleted map was selected, clear selection
        if (this.selectedMapId && this.selectedMapId === mapId) {
          this.selectedMapId = null;
        }
        
        // Refresh the UI
        this.renderMapsList();
        this.renderSelectedMap();
      } else {
        throw new Error(data.error || 'Failed to delete YAML map');
      }
    } catch (error) {
      console.error('Error deleting YAML map:', error);
      alert(`Error: ${error.message}`);
    }
  }

  // Handle map attachment to input
  handleAttachMap(mapId) {
    if (this.onAttachToInput && typeof this.onAttachToInput === 'function') {
      this.onAttachToInput(`/yaml ${mapId}`);
    }
    
    // Close the component after attaching if needed
    if (this.onClose && typeof this.onClose === 'function') {
      this.onClose();
    }
  }

  // Create a clone of a map
  async handleCloneMap(mapId) {
    try {
      // Get the original map
      const originalMap = this.yamlMaps.find(map => map._id === mapId);
      if (!originalMap) {
        throw new Error('Map not found');
      }
      
      // Create a new map based on the original
      const response = await fetch('/api/yaml-maps', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `${originalMap.name} (Clone)`,
          description: originalMap.description,
          tags: originalMap.tags,
          yaml: originalMap.yaml,
          isPublic: originalMap.isPublic
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to clone YAML map');
      }
      
      const data = await response.json();
      
      if (data.success && data.yamlMap) {
        // Add the new map to the list
        this.yamlMaps.unshift(data.yamlMap);
        
        // Select the new map
        this.selectedMapId = data.yamlMap._id;
        
        // Refresh the UI
        this.renderMapsList();
        this.renderSelectedMap();
      } else {
        throw new Error(data.error || 'Failed to clone YAML map');
      }
    } catch (error) {
      console.error('Error cloning YAML map:', error);
      alert(`Error: ${error.message}`);
    }
  }

  // Set loading state
  setIsLoading(isLoading) {
    this.isLoading = isLoading;
    this.renderLoadingState();
    console.log(`YAML Maps loading state: ${isLoading ? 'Loading' : 'Loaded'}`);
  }

  // Set error message
  setError(error) {
    this.error = error;
    this.renderError();
  }

  // Select a map
  selectMap(mapId) {
    console.log(`Selecting YAML map: ${mapId || 'none'}`);
    this.selectedMapId = mapId;
    
    // Update UI to reflect selection
    const mapItems = this.container.querySelectorAll('.yaml-map-item');
    mapItems.forEach(item => {
      if (mapId && item.dataset.id === mapId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
    
    // Fetch the latest map data if a map is selected
    if (mapId) {
      fetch(`/api/yaml-maps/${mapId}`, {
        credentials: 'include'
      })
      .then(response => response.json())
      .then(data => {
        if (data.success && data.yamlMap) {
          // Update the map in the list
          const index = this.yamlMaps.findIndex(m => m._id === mapId);
          if (index !== -1) {
            this.yamlMaps[index] = data.yamlMap;
          }
          // Dispatch an event for other components
          const event = new CustomEvent('map-selected', {
            detail: { mapId, map: data.yamlMap }
          });
          document.dispatchEvent(event);
        }
      })
      .catch(error => console.error('Error fetching map details:', error));
    }
    
    // Render the selected map view
    this.renderSelectedMap();
  }

  // Render loading state
  renderLoadingState() {
    if (!this.container) return;
    
    const loadingEl = this.container.querySelector('.yaml-maps-loading');
    const listEl = this.container.querySelector('.yaml-maps-list');
    const emptyEl = this.container.querySelector('.yaml-maps-empty');
    
    if (this.isLoading) {
      if (loadingEl) loadingEl.style.display = 'flex';
      if (listEl) listEl.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'none';
    } else {
      if (loadingEl) loadingEl.style.display = 'none';
      
      // Show either list or empty state
      if (this.yamlMaps.length === 0) {
        if (listEl) listEl.style.display = 'none';
        if (emptyEl) {
          emptyEl.style.display = 'block';
          const emptyMessage = emptyEl.querySelector('.empty-message');
          if (emptyMessage) {
            emptyMessage.textContent = this.searchQuery ? 
              `No maps matching "${this.searchQuery}" were found.` : 
              "You haven't created any YAML maps yet.";
          }
        }
      } else {
        if (listEl) listEl.style.display = 'flex';
        if (emptyEl) emptyEl.style.display = 'none';
      }
    }
  }

  // Render error message
  renderError() {
    if (!this.container) return;
    
    const errorEl = this.container.querySelector('.yaml-maps-error');
    const errorMessage = this.container.querySelector('.error-message');
    
    if (this.error) {
      if (errorEl) errorEl.style.display = 'flex';
      if (errorMessage) errorMessage.textContent = this.error;
    } else {
      if (errorEl) errorEl.style.display = 'none';
    }
  }

  // Render the list of maps
  renderMapsList() {
    if (!this.container) return;
    
    const listEl = this.container.querySelector('.yaml-maps-list');
    if (!listEl) return;
    
    if (this.yamlMaps.length === 0) {
      listEl.style.display = 'none';
      return;
    }
    
    listEl.innerHTML = '';
    
    this.yamlMaps.forEach(map => {
      const mapItem = document.createElement('div');
      mapItem.className = `yaml-map-item ${this.selectedMapId && this.selectedMapId === map._id ? 'active' : ''}`;
      mapItem.dataset.id = map._id;
      
      let description = '';
      if (map.description) {
        description = map.description.length > 80 
          ? map.description.substring(0, 80) + '...' 
          : map.description;
      }
      
      let tagsHtml = '';
      if (map.tags && map.tags.length > 0) {
        const displayTags = map.tags.slice(0, 3);
        const extraTags = map.tags.length > 3 ? map.tags.length - 3 : 0;
        
        tagsHtml = `
          <div class="yaml-map-tags">
            ${displayTags.map(tag => `
              <span class="yaml-map-tag">${tag}</span>
            `).join('')}
            ${extraTags > 0 ? `
              <span class="yaml-map-tag">+${extraTags}</span>
            ` : ''}
          </div>
        `;
      }
      
      // Create action buttons
      const actionButtons = `
        <div class="yaml-map-item-actions">
          <button class="yaml-map-action-btn attach-btn" title="Attach to Command Center">
            <i class="fas fa-paperclip"></i>
          </button>
          ${map.isOwner ? `
            <button class="yaml-map-action-btn edit-btn" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
          ` : ''}
        </div>
      `;
      
      mapItem.innerHTML = `
        <div class="yaml-map-item-content">
          <div class="yaml-map-name">${map.name}</div>
          ${description ? `
            <div class="yaml-map-description">${description}</div>
          ` : ''}
          ${map.url ? `
            <div class="yaml-map-url">
              <i class="fas fa-link"></i>
              <a href="${map.url}" target="_blank" rel="noopener noreferrer" title="${map.url}">
                ${map.url.length > 30 ? map.url.substring(0, 30) + '...' : map.url}
              </a>
            </div>
          ` : ''}
          ${tagsHtml}
          <div class="yaml-map-meta">
            ${map.usageCount !== undefined ? `
              <div class="yaml-map-usage">
                <i class="fas fa-play"></i>
                ${map.usageCount} ${map.usageCount === 1 ? 'use' : 'uses'}
              </div>
            ` : ''}
            <div class="yaml-map-date">
              ${new Date(map.updatedAt).toLocaleDateString()}
            </div>
          </div>
          ${map.isPublic ? `
            <div class="yaml-map-badge public">Public</div>
          ` : `
            <div class="yaml-map-badge private">Private</div>
          `}
          ${map.isOwner ? `
            <div class="yaml-map-badge owner">Owner</div>
          ` : ''}
        </div>
        ${actionButtons}
      `;
      
      // Add click handler for the main item (selects the map)
      mapItem.addEventListener('click', (e) => {
        // Don't trigger selection if clicking on action buttons
        if (!e.target.closest('.yaml-map-action-btn')) {
          this.selectMap(map._id);
        }
      });
      
      // Add click handlers for action buttons
      const attachBtn = mapItem.querySelector('.attach-btn');
      if (attachBtn) {
        attachBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleAttachMap(map._id);
        });
      }
      
      const editBtn = mapItem.querySelector('.edit-btn');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openEditor(map._id);
        });
      }
      
      listEl.appendChild(mapItem);
    });
    
    listEl.style.display = 'flex';
  }

  // Render the selected map
  renderSelectedMap() {
    if (!this.container) return;
    
    const detailEl = this.container.querySelector('.yaml-map-detail');
    if (!detailEl) return;
    
    if (!this.selectedMapId) {
      detailEl.innerHTML = `
        <div class="yaml-maps-empty">
          <div class="yaml-maps-empty-icon">
            <i class="fas fa-code"></i>
          </div>
          <h3>Select a YAML Map</h3>
          <p>Choose a YAML map from the sidebar to view its details, or create a new one.</p>
        </div>
      `;
      return;
    }
    
    // Find the selected map data
    const selectedMap = this.yamlMaps.find(map => map._id === this.selectedMapId);
    
    if (!selectedMap) {
      console.error(`Could not find YAML map with ID: ${this.selectedMapId}`);
      detailEl.innerHTML = `
        <div class="yaml-maps-empty">
          <div class="yaml-maps-empty-icon">
            <i class="fas fa-exclamation-circle"></i>
          </div>
          <h3>Map Not Found</h3>
          <p>The selected YAML map could not be found. It may have been deleted or you may not have permission to view it.</p>
        </div>
      `;
      return;
    }
    
    console.log('Rendering YAML map:', selectedMap);
    
    // Create a YamlMapViewer instance with the full yamlMap object
    const viewer = new YamlMapViewer({
      yamlMap: selectedMap, // Pass the full map object instead of just the ID
      yamlMapId: this.selectedMapId,
      onClose: () => this.selectMap(null),
      onEdit: () => this.openEditor(this.selectedMapId),
      onDelete: () => this.handleDeleteMap(this.selectedMapId),
      onAttach: () => this.handleAttachMap(this.selectedMapId),
      onClone: () => this.handleCloneMap(this.selectedMapId),
      isOwner: selectedMap.isOwner, // Pass the ownership status
      container: detailEl
    });
    
    viewer.render();
  }

  // Start info slide rotation
  startInfoRotator() {
    console.log('Starting info rotator...');
    this.stopInfoRotator(); // Clear any existing interval
    
    // Show the first slide
    this.goToInfoSlide(0);
    
    // Force slide visibility
    const rotator = this.container.querySelector('.yaml-info-rotator');
    if (rotator) {
      rotator.style.display = 'block';
      rotator.style.visibility = 'visible';
      rotator.style.opacity = '1';
      console.log('Force-enabled rotator visibility');
    } else {
      console.warn('Could not find rotator element');
    }
    
    // Start automatic rotation
    this.infoSlideInterval = setInterval(() => {
      this.nextInfoSlide();
    }, 5000); // Rotate every 5 seconds
    
    console.log('Info rotator started with 5 second intervals');
  }

  // Stop info slide rotation
  stopInfoRotator() {
    if (this.infoSlideInterval) {
      clearInterval(this.infoSlideInterval);
    }
  }

  // Go to specific info slide
  goToInfoSlide(index) {
    const slides = this.container.querySelectorAll('.yaml-info-slide');
    const dots = this.container.querySelectorAll('.yaml-info-dot');
    
    console.log(`Attempting to show slide ${index}, found ${slides.length} slides`);
    
    if (!slides.length) {
      console.warn('No slides found in container');
      return;
    }
    
    // Ensure index is within bounds
    if (index < 0) index = slides.length - 1;
    if (index >= slides.length) index = 0;
    
    // Update current slide
    this.currentInfoSlide = index;
    
    // First make sure all slides have proper display style
    slides.forEach((slide, i) => {
      // Set display none on all slides
      slide.style.display = 'none';
      slide.classList.remove('active');
      console.log(`Reset slide ${i} visibility`);
    });
    
    // Remove active class from all dots
    dots.forEach(dot => {
      dot.classList.remove('active');
    });
    
    // Show current slide and activate current dot
    if (slides[index]) {
      slides[index].style.display = 'block';
      slides[index].classList.add('active');
      console.log(`Showing slide ${index}: ${slides[index].querySelector('.yaml-info-title')?.textContent.trim()}`);
    }
    
    if (dots[index]) {
      dots[index].classList.add('active');
    }
  }

  nextInfoSlide() {
    const nextIndex = (this.currentInfoSlide + 1) % this.infoSlides.length;
    this.goToInfoSlide(nextIndex);
  }

  prevInfoSlide() {
    const prevIndex = (this.currentInfoSlide - 1 + this.infoSlides.length) % this.infoSlides.length;
    this.goToInfoSlide(prevIndex);
  }

  // Static method to initialize the component
  static init(container, options = {}) {
    console.log('Static initialization of YamlMaps component');
    
    if (!container) {
      console.error('No container provided for YamlMaps initialization');
      return null;
    }
    
    // Create and initialize a new instance
    try {
      const yamlMaps = new YamlMaps({
        container,
        ...options
      });
      
      // For debugging - add a global reference
      if (typeof window !== 'undefined') {
        window._yamlMapsInstance = yamlMaps;
      }
      
      return yamlMaps;
    } catch (error) {
      console.error('Error initializing YamlMaps component:', error);
      
      // Provide a visible error message in the container
      container.innerHTML = `
        <div class="yaml-error">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to initialize YAML maps: ${error.message}</p>
        </div>
      `;
      return null;
    }
  }
}

// Check if auto-initialization is prevented
const shouldInitialize = typeof window !== 'undefined' && !window._preventYamlMapsAutoInit;

// Make the class globally available but honor the prevention flag
if (typeof window !== 'undefined') {
  window.YamlMaps = YamlMaps;
  console.log(`YamlMaps made globally available. Auto-init ${shouldInitialize ? 'enabled' : 'disabled'}`);
}

// Export the class
export default YamlMaps;
