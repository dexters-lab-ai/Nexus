import React from 'react';
import { StrictMode } from 'react';
import Button from './base/Button.jsx';
import { eventBus } from '../utils/events.js';
import { stores } from '../store/index.js';
import YamlMapEditor from './YamlMapEditor.js';

// Prevent auto-execution of YamlMaps.js
let preventYamlMapsAutoInit = true;
if (typeof window !== 'undefined') {
  window._preventYamlMapsAutoInit = true;
}

// Load our new CSS - modern sidebar and intermediate results integration
// This is done via JS to keep encapsulation and avoid modifying main HTML files
const loadModernSidebar = () => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Define all stylesheets with their production and development paths
  const stylesheets = [
    {
      id: 'modern-sidebar-css',
      dev: '/src/styles/components/sidebar-modern.css',
      prod: '/css/components/sidebar-modern.css',
      name: 'sidebar-modern'
    },
    {
      id: 'yaml-maps-css',
      dev: '/src/styles/components/yaml-maps.css',
      prod: '/css/components/yaml-maps.css',
      name: 'yaml-maps'
    },
    {
      id: 'yaml-maps-fixes-css',
      dev: '/src/styles/components/yaml-maps-fixes.css',
      prod: '/css/components/yaml-maps-fixes.css',
      name: 'yaml-maps-fixes'
    }
  ];
  
  // Load each stylesheet if not already loaded
  stylesheets.forEach(({ id, dev, prod, name }) => {
    if (!document.getElementById(id)) {
      const href = isProduction ? prod : dev;
      const linkEl = document.createElement('link');
      linkEl.rel = 'stylesheet';
      linkEl.href = href;
      linkEl.id = id;
      
      // Add debug logging in development
      if (!isProduction) {
        linkEl.onload = () => console.log(`[Sidebar] Loaded stylesheet: ${name}`);
        linkEl.onerror = () => console.error(`[Sidebar] Failed to load stylesheet: ${name}`);
      }
      
      document.head.appendChild(linkEl);
    }
  });
  
  if (!isProduction) {
    console.log('CSS files loaded for modern sidebar and YAML maps');
  }
};

// Load modern styles
loadModernSidebar();

// Nav item helper
function createNavItem(item, nav) {
  const navItem = document.createElement('div');
  navItem.className = 'sidebar-nav-item';
  const btn = Button({
    text: item.text,
    icon: item.icon,
    variant: Button.VARIANTS.TEXT,
    className: 'sidebar-nav-btn',
    onClick: () => {
      if (item.onClick) item.onClick();
      else if (item.action) eventBus.emit(item.action, item);
    }
  });
  navItem.appendChild(btn);
  nav.appendChild(navItem);
}

export default function Sidebar(props = {}) {
  const {
    width = '300px',
    minWidth = '80px',
    collapsed = false,
    containerId = 'sidebar',
    items = []
  } = props;
  let isCollapsed = (typeof localStorage !== 'undefined' && localStorage.getItem('sidebarDefault'))
    ? localStorage.getItem('sidebarDefault') === 'collapsed'
    : collapsed;

  // Default active section for tabs
  let activeSection = 'liveMaps';

  // Create container
  const container = document.createElement('div');
  container.className = `sidebar${isCollapsed ? ' collapsed' : ''}`;
  container.style.width = isCollapsed ? minWidth : width;
  if (containerId) container.id = containerId;
  
  // Add pagination styles
  if (!document.getElementById('yaml-pagination-styles')) {
    const paginationStyles = document.createElement('style');
    paginationStyles.id = 'yaml-pagination-styles';
    paginationStyles.textContent = `
      .yaml-maps-pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: 1rem;
        padding: 0.5rem 0;
        gap: 10px;
      }
      .yaml-maps-pagination button {
        background: var(--color-primary-transparent, rgba(114, 137, 218, 0.2));
        color: var(--color-primary, #7289da);
        border: 1px solid var(--color-primary, #7289da);
        border-radius: 4px;
        padding: 5px 10px;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .yaml-maps-pagination button:hover:not(:disabled) {
        background: var(--color-primary, #7289da);
        color: white;
      }
      .yaml-maps-pagination button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .yaml-maps-pagination .pagination-info {
        font-size: 14px;
        color: var(--color-text-secondary, #99aab5);
      }
    `;
    document.head.appendChild(paginationStyles);
  }

  // Modern header with toggle button
  const header = document.createElement('div');
  header.className = 'sidebar-header';
  
  const toggleButton = Button({
    icon: isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left',
    variant: Button.VARIANTS.ICON_ONLY,
    className: 'sidebar-toggle',
    onClick: toggleCollapse,
    title: isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'
  });
  
  header.appendChild(toggleButton);
  container.appendChild(header);

  // Header content: tabs implementation with simplified names
  const headerContent = document.createElement('div');
  headerContent.className = 'sidebar-header-content';
  const tabs = { liveMaps: 'Live', yamlMaps: 'YAML' };
  const sectionMenu = document.createElement('div');
  sectionMenu.className = 'sidebar-header-menu';
  const tabButtons = {};
  Object.entries(tabs).forEach(([key, label]) => {
    const btn = Button({
      text: label,
      icon: key === 'liveMaps' ? 'fa-globe' : 'fa-code',
      variant: Button.VARIANTS.TEXT,
      className: 'sidebar-menu-btn' + (key === activeSection ? ' active' : ''),
      onClick: () => setSection(key)
    });
    sectionMenu.appendChild(btn);
    tabButtons[key] = btn;
  });
  headerContent.appendChild(sectionMenu);

  // Dynamic content area
  const content = document.createElement('div');
  content.className = 'sidebar-content';
  
  // Add section initialization after element creation
  setTimeout(() => {
    // Auto-load the initial active section to ensure maps are fetched
    setSection(activeSection);
  }, 100); // Small delay to ensure DOM is ready

  // Enhanced Footer with SDK promotion
  const footer = document.createElement('div');
  footer.className = 'sidebar-footer';
  
  // Add data attribute to track footer height for positioning
  document.documentElement.style.setProperty('--sidebar-footer-height', `${footer.offsetHeight || 80}px`);
  
  // SDK Promotion section with enhanced tooltip
  const sdkPromotion = document.createElement('div');
  sdkPromotion.className = 'sdk-promotion';
  
  // Create tooltip element
  const tooltip = document.createElement('div');
  tooltip.className = 'sdk-tooltip';
  tooltip.innerHTML = `
    <div class="sdk-tooltip-content">
      <h3>Nexus SDK</h3>
      <p>Build browser automation agents with the latest version of our O.P.E.R.A.T.O.R Nexus SDK by clicking this widget. The installer will takeover.</p>
      
      <h4>Installation Options</h4>
      <div class="sdk-option">
        <code>npm install @coming-soon/sdk</code>
        <p>Install the complete fullstack O.P.E.R.A.T.O.R app to your computer</p>
      </div>
      <div class="sdk-option">
        <code>npm install @coming-soon/sdk-server</code>
        <p>Install the server only, run it on port 3420, and build your own UI</p>
      </div>
      
      <h4>Key Features</h4>
      <ul class="sdk-features">
        <li><i class="fas fa-check-circle"></i> Complete fullstack agent with server + UI</li>
        <li><i class="fas fa-check-circle"></i> View and modify the latest automation code</li>
        <li><i class="fas fa-check-circle"></i> Self-hosted solution for maximum security</li>
        <li><i class="fas fa-check-circle"></i> Optimized for local execution with minimal resource usage</li>
      </ul>
      
      <div class="sdk-note">
        <i class="fas fa-info-circle"></i>
        <span>Running the Agent locally means you're self-hosting and responsible for uptime. This provides the most secure way to use browser automation.</span>
      </div>
    </div>
  `;
  
  // Show/hide tooltip on hover
  sdkPromotion.addEventListener('mouseenter', () => {
    tooltip.style.display = 'block';
  });
  
  sdkPromotion.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
  });
  
  // Click handler for installation
  sdkPromotion.addEventListener('click', (e) => {
    e.stopPropagation();
    showNotification('Preparing Nexus SDK installation...', 'info');
    // TODO: Add actual installation logic when SDK is ready
  });
  
  const sdkIcon = document.createElement('div');
  sdkIcon.className = 'sdk-icon';
  sdkIcon.innerHTML = '<i class="fas fa-box"></i>';
  
  const sdkInfo = document.createElement('div');
  sdkInfo.className = 'sdk-info';
  
  const sdkTitle = document.createElement('div');
  sdkTitle.className = 'sdk-title';
  // Get version from package.json
  const packageVersion = window.appConfig?.version || '1.3.9';
  sdkTitle.innerHTML = `Nexus SDK <span class="coming-soon-badge">v${packageVersion}</span>`;
  
  const sdkDescription = document.createElement('div');
  sdkDescription.className = 'sdk-description';
  sdkDescription.textContent = 'Build custom agents and integrations';
  
  // Add tooltip to promotion
  sdkPromotion.appendChild(tooltip);
  
  sdkInfo.appendChild(sdkTitle);
  sdkInfo.appendChild(sdkDescription);
  
  sdkPromotion.appendChild(sdkIcon);
  sdkPromotion.appendChild(sdkInfo);
  
  // Footer nav for documentation
  const footerNav = document.createElement('nav');
  footerNav.className = 'sidebar-nav';
  // Only include Documentation in footer, replace Extensions with SDK above
  items.filter(item => ['Documentation'].includes(item.text))
       .forEach(item => createNavItem(item, footerNav));
       
  footer.appendChild(sdkPromotion);
  footer.appendChild(footerNav);

  // Wrapper for headerContent, content, intermediate results and footer
  const wrapper = document.createElement('div');
  wrapper.className = 'sidebar-wrapper';
  wrapper.appendChild(headerContent);
  wrapper.appendChild(content);

  // Intermediate Results Container - Enhanced iOS 15 Glass Morphism Style
  // We create the container but leave it empty - content will be managed by CommandCenter
  // This is an architectural improvement that allows independent management of results
  const intermediateContainer = document.createElement('div');
  intermediateContainer.id = 'intermediate-results-container';
  intermediateContainer.className = 'intermediate-results';
  
  // Listen for task events to show/hide the results container
  eventBus.on('taskStart', () => {
    intermediateContainer.classList.add('active');
  });
  
  eventBus.on('taskComplete', () => {
    // Keep visible for a few seconds after completion for user review
    setTimeout(() => {
      // Only hide if there isn't another active task
      // Fix: Use getState() instead of directly accessing state property
      const activeTasks = (stores.tasks.getState().active || []).filter(task => !task.completed && !task.error);
      if (activeTasks.length === 0) {
        intermediateContainer.classList.remove('active');
      }
    }, 5000); // 5 seconds delay before hiding
  });
  
  eventBus.on('taskError', () => {
    // Similar behavior on error
    setTimeout(() => {
      // Fix: Use getState() instead of directly accessing state property
      const activeTasks = (stores.tasks.getState().active || []).filter(task => !task.completed && !task.error);
      if (activeTasks.length === 0) {
        intermediateContainer.classList.remove('active');
      }
    }, 5000);
  });
  
  // Allow manual toggling of task results
  toggleButton.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    intermediateContainer.classList.toggle('active');
  });
  wrapper.appendChild(intermediateContainer);

  wrapper.appendChild(footer);
  container.appendChild(wrapper);

  // Section change handler
  function setSection(section) {
    // Always reload section, even if already active
    activeSection = section;
    Object.entries(tabButtons).forEach(([k, btn]) => {
      btn.classList.toggle('active', k === section);
    });
    content.classList.add('loading');
    
    // Clear existing content
    content.innerHTML = '';
    
    setTimeout(() => {
      if (section === 'yamlMaps') {
        try {
          // Create a direct container for the YamlMaps component
          const yamlMapsContainer = document.createElement('div');
          yamlMapsContainer.className = 'yaml-maps-sidebar-container';
          yamlMapsContainer.style.height = '100%';
          yamlMapsContainer.style.display = 'flex';
          yamlMapsContainer.style.flexDirection = 'column';
          
          // Create header with title and new map button
          const header = document.createElement('div');
          header.className = 'yaml-maps-header';
          header.innerHTML = `
            <h3><span class="terminal-prefix">&gt;_</span> YAML Maps</h3>
            <button class="circular-btn yaml-new-map-btn" aria-label="Create new YAML map">
              <i class="fas fa-plus"></i>
            </button>
          `;
          yamlMapsContainer.appendChild(header);
          
          // Create a dedicated section that will contain the YamlMaps component
          const yamlSection = document.createElement('div');
          yamlSection.id = 'yaml-maps-section';
          yamlSection.className = 'yaml-maps-content';
          yamlSection.style.flex = '1';
          yamlSection.style.overflow = 'auto';
          yamlSection.style.height = 'calc(100% - 60px)';
          yamlSection.setAttribute('data-component', 'yaml-maps');
          yamlMapsContainer.appendChild(yamlSection);
          
          // Add the container to the sidebar content
          content.appendChild(yamlMapsContainer);
          
          // Add click handler for the new map button
          loadYamlMaps();
        } catch (error) {
          console.error('Error setting up YAML Maps section:', error);
          content.innerHTML = `
            <div class="sidebar-error">
              <i class="fas fa-exclamation-triangle"></i>
              <p>Failed to load YAML Maps section: ${error.message}</p>
              <button onclick="location.reload()">Reload</button>
            </div>
          `;
        }
      } else if (section === 'liveMaps') {
        try {
          // Prevent duplicate section initialization
          if (content.querySelector('#live-maps-section')) {
            console.log('Live Maps section already exists, skipping recreation');
            return;
          }
          // Create a container for the Live Maps tab
          const liveMapsContainer = document.createElement('div');
          liveMapsContainer.className = 'yaml-maps-sidebar-container';
          liveMapsContainer.style.height = '100%';
          liveMapsContainer.style.display = 'flex';
          liveMapsContainer.style.flexDirection = 'column';
          
          // Create header for Live Maps
          const header = document.createElement('div');
          header.className = 'yaml-maps-header';
          header.innerHTML = `
            <h3><span class="terminal-prefix">&gt;_</span> Community Maps</h3>
          `;
          liveMapsContainer.appendChild(header);
          
          // Create content section for Live Maps
          const liveMapsContent = document.createElement('div');
          liveMapsContent.id = 'live-maps-section';
          liveMapsContent.className = 'yaml-maps-content';
          liveMapsContent.style.flex = '1';
          liveMapsContent.style.overflow = 'auto';
          liveMapsContent.style.height = 'calc(100% - 60px)';
          
          // Add the same rotator component as in YAML Maps
          liveMapsContent.innerHTML = `
            <div class="yaml-info-rotator" style="display: block !important; visibility: visible !important; opacity: 1 !important;">
              <div class="yaml-info-slide active" data-index="0" style="display: block !important;">
                <div class="yaml-info-title">
                  <i class="fas fa-globe"></i>
                  Community Maps
                </div>
                <div class="yaml-info-content">
                  Discover YAML maps created by the community. Browse, search, and use maps shared by others.
                </div>
              </div>
              <div class="yaml-info-slide" data-index="1">
                <div class="yaml-info-title">
                  <i class="fas fa-download"></i>
                  Use Any Map
                </div>
                <div class="yaml-info-content">
                  Find a map you like? Simply click to view details and attach it to your input for immediate use.
                </div>
              </div>
              <div class="yaml-info-slide" data-index="2">
                <div class="yaml-info-title">
                  <i class="fas fa-share-alt"></i>
                  Share Your Creations
                </div>
                <div class="yaml-info-content">
                  Make your maps public to share them with the community. Help others automate their tasks!
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
                <input type="text" placeholder="Search community maps..." class="live-maps-search-input">
              </div>
            </div>
            
            <div class="yaml-maps-sidebar">
              <div class="yaml-maps-loading" style="display: flex;">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Loading Community Maps...</span>
              </div>
              
              <div class="yaml-maps-error" style="display: none;">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Error loading maps</span>
              </div>
              
              <div class="yaml-maps-empty" style="display: none;">
                <div class="yaml-maps-empty-icon">
                  <i class="fas fa-globe"></i>
                </div>
                <h3>No Community Maps Found</h3>
                <p>There are no public maps available at the moment.</p>
              </div>
              
              <div class="yaml-maps-list" style="display: none;"></div>
            </div>
            
            <!-- <div class="yaml-map-detail">
              <div class="yaml-maps-empty">
                <div class="yaml-maps-empty-icon">
                  <i class="fas fa-map"></i>
                </div>
                <h3>Select a Map</h3>
                <p>Choose a community map from the sidebar to view its details.</p>
              </div>
            </div> -->
          `;
          
          liveMapsContainer.appendChild(liveMapsContent);
          content.appendChild(liveMapsContainer);
          
          // Initialize the rotator for Live Maps
          initializeRotator(liveMapsContent);
          
          // Initialize search functionality
          initializeSearch(liveMapsContent);
          
          // Fetch community maps (public maps)
          fetchCommunityMaps(liveMapsContent);
        } catch (error) {
          console.error('Error setting up Live Maps section:', error);
          content.innerHTML = `
            <div class="sidebar-error">
              <i class="fas fa-exclamation-triangle"></i>
              <p>Failed to load Live Maps section: ${error.message}</p>
              <button onclick="location.reload()">Reload</button>
            </div>
          `;
        }
      } else if (section === 'myMaps') {
        // My Maps functionality is now merged with YAML Maps
        console.log('My Maps tab is being redirected to YAML Maps');
        setSection('yamlMaps');
      } else {
        // Default content for other tabs
        content.innerHTML = `<p>Content for ${tabs[section]}</p>`;
      }
      content.classList.remove('loading');
    }, 200);
  }
  
  // Initialize default section
  setSection(activeSection);

  // Helper function to initialize the info rotator
  function initializeRotator(container) {
    const prevBtn = container.querySelector('.prev-slide');
    const nextBtn = container.querySelector('.next-slide');
    const infoDots = container.querySelectorAll('.yaml-info-dot');
    const slides = container.querySelectorAll('.yaml-info-slide');
    let currentSlide = 0;
    
    function goToSlide(index) {
      // Ensure index is within bounds
      if (index < 0) index = slides.length - 1;
      if (index >= slides.length) index = 0;
      
      // Update currentSlide
      currentSlide = index;
      
      // Update slide visibility
      slides.forEach((slide, i) => {
        slide.style.display = i === currentSlide ? 'block' : 'none';
        slide.classList.toggle('active', i === currentSlide);
      });
      
      // Update dots
      infoDots.forEach((dot, i) => {
        dot.classList.toggle('active', i === currentSlide);
      });
    }
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        goToSlide(currentSlide - 1);
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        goToSlide(currentSlide + 1);
      });
    }
    
    infoDots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        goToSlide(i);
      });
    });
    
    // Auto rotation
    let rotationInterval = setInterval(() => {
      goToSlide(currentSlide + 1);
    }, 6000);
    
    // Stop rotation on interaction
    container.querySelector('.yaml-info-rotator').addEventListener('mouseenter', () => {
      clearInterval(rotationInterval);
    });
    
    container.querySelector('.yaml-info-rotator').addEventListener('mouseleave', () => {
      rotationInterval = setInterval(() => {
        goToSlide(currentSlide + 1);
      }, 6000);
    });
  }
  
  // Helper function to initialize search functionality
  function initializeSearch(container) {
    const searchInput = container.querySelector('.live-maps-search-input');
    if (!searchInput) return;
    
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const query = e.target.value.trim();
        fetchCommunityMaps(container, query);
      }, 300); // Debounce search for better performance
    });
  }
  
  // Function to get API base URL (same pattern as other components)
  const getApiBaseUrl = () => {
    if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL;
    } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return `http://${window.location.hostname}:3420`;
    }
    return window.location.origin;
  };

  // Helper function to fetch community maps (public maps from all users)
  function fetchCommunityMaps(container, searchQuery = '', page = 1, pageSize = 12) {
    const loadingEl = container.querySelector('.yaml-maps-loading');
    const errorEl = container.querySelector('.yaml-maps-error');
    const emptyEl = container.querySelector('.yaml-maps-empty');
    const listEl = container.querySelector('.yaml-maps-list');
    const paginationEl = container.querySelector('.yaml-maps-pagination') || createPaginationElement(container);
    
    if (!loadingEl || !errorEl || !emptyEl || !listEl) {
      console.error('[YAML Maps] Missing required DOM elements for search display:', {
        container, loadingEl, errorEl, emptyEl, listEl
      });
      return;
    }
    
    // Show loading state
    loadingEl.style.display = 'flex';
    errorEl.style.display = 'none';
    emptyEl.style.display = 'none';
    listEl.style.display = 'none';
    paginationEl.style.display = 'none';
    
    // Update empty state message based on search query
    if (searchQuery) {
      const emptyTitle = emptyEl.querySelector('h3');
      const emptyText = emptyEl.querySelector('p');
      if (emptyTitle && emptyText) {
        emptyTitle.textContent = 'No Results Found';
        emptyText.textContent = `No maps matching "${searchQuery}" were found. Try another search term.`;
      }
    } else {
      const emptyTitle = emptyEl.querySelector('h3');
      const emptyText = emptyEl.querySelector('p');
      if (emptyTitle && emptyText) {
        emptyTitle.textContent = 'No Community Maps Found';
        emptyText.textContent = 'There are no public maps available at the moment.';
      }
    }
    
    // Build the query URL with proper encoding
    const apiBase = getApiBaseUrl();
    let url = `${apiBase}/api/yaml-maps?public=true`;
    if (searchQuery) {
      url += `&q=${encodeURIComponent(searchQuery)}`;
    }
    
    // Add pagination parameters
    url += `&page=${page}&limit=${pageSize}`;
    
    console.log(`[YAML Maps] Fetching community maps with URL: ${url}`);
    
    // Fetch community maps with proper CORS headers
    fetch(`${url}&_=${Date.now()}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Error fetching community maps: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        loadingEl.style.display = 'none';
        // Update log to show the correct structure - yamlMaps not maps
        console.log(`[YAML Maps] Received ${data?.yamlMaps?.length || 0} maps for query: "${searchQuery}"`, data);
        
        // Check the correct property - yamlMaps not maps
        if (!data || !data.yamlMaps || data.yamlMaps.length === 0) {
          emptyEl.style.display = 'flex';
          return;
        }
        
        // Render the maps
        listEl.innerHTML = '';
        listEl.style.display = 'grid';
        
        // Loop through yamlMaps not maps
        data.yamlMaps.forEach(map => {
          try {
            const card = createMapCard(map, true);
            listEl.appendChild(card);
          } catch (cardError) {
            console.error(`[YAML Maps] Error creating card for map:`, map, cardError);
          }
        });
        
        // Update pagination if total count is available
        if (data.totalCount !== undefined) {
          updatePagination(paginationEl, {
            currentPage: page,
            totalItems: data.totalCount,
            pageSize: pageSize,
            onPageChange: (newPage) => {
              fetchCommunityMaps(container, searchQuery, newPage, pageSize);
            }
          });
          
          if (data.totalCount > pageSize) {
            paginationEl.style.display = 'flex';
          }
        }
      })
      .catch(error => {
        console.error('[YAML Maps] Error fetching community maps:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'flex';
        errorEl.querySelector('span').textContent = `Error loading maps: ${error.message}`;
      });
  }
  
  // Create pagination element for YAML maps list
  function createPaginationElement(container) {
    const yamlMapsSidebar = container.querySelector('.yaml-maps-sidebar');
    
    if (!yamlMapsSidebar) {
      console.error('[YAML Maps] Cannot create pagination - sidebar element not found');
      return document.createElement('div'); // Return dummy element to avoid errors
    }
    
    const paginationEl = document.createElement('div');
    paginationEl.className = 'yaml-maps-pagination';
    paginationEl.innerHTML = `
      <button class="pagination-prev" disabled>
        <i class="fas fa-chevron-left"></i>
      </button>
      <span class="pagination-info">Page <span class="current-page">1</span> of <span class="total-pages">1</span></span>
      <button class="pagination-next" disabled>
        <i class="fas fa-chevron-right"></i>
      </button>
    `;
    
    yamlMapsSidebar.appendChild(paginationEl);
    return paginationEl;
  }
  
  // Update pagination controls based on current state
  function updatePagination(paginationEl, options) {
    const { currentPage, totalItems, pageSize, onPageChange } = options;
    const totalPages = Math.ceil(totalItems / pageSize);
    
    const prevBtn = paginationEl.querySelector('.pagination-prev');
    const nextBtn = paginationEl.querySelector('.pagination-next');
    const currentPageEl = paginationEl.querySelector('.current-page');
    const totalPagesEl = paginationEl.querySelector('.total-pages');
    
    // Update page numbers
    currentPageEl.textContent = currentPage;
    totalPagesEl.textContent = totalPages;
    
    // Update button states
    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
    
    // Remove existing event listeners to prevent duplicates
    const newPrevBtn = prevBtn.cloneNode(true);
    const newNextBtn = nextBtn.cloneNode(true);
    
    prevBtn.parentNode.replaceChild(newPrevBtn, prevBtn);
    nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
    
    // Add event listeners
    newPrevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        onPageChange(currentPage - 1);
      }
    });
    
    newNextBtn.addEventListener('click', () => {
      if (currentPage < totalPages) {
        onPageChange(currentPage + 1);
      }
    });
  }
  
  // Helper function to create a map card
  function createMapCard(map, isPublic) {
    const card = document.createElement('div');
    card.classList.add('yaml-map-card');
    
    // Format the date string properly
    const dateObj = new Date(map.updatedAt || map.createdAt);
    const dateString = dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    
    card.innerHTML = `
      <div class="yaml-map-card-content" style="flex: 1;">
        <div class="yaml-map-card-header">
          <h4>${map.name}</h4>
          ${isPublic ? `<div class="yaml-map-author">by ${map.author || (map.isOwner ? 'You' : 'Anonymous')}</div>` : ''}
        </div>
        <div class="yaml-map-card-description">
          ${map.description || 'No description'}
        </div>
        <div class="yaml-map-card-footer">
          <div class="yaml-map-date">
            <i class="fas fa-calendar-alt"></i> ${dateString}
          </div>
          ${map.tags && map.tags.length ? `
            <div class="yaml-map-tags">
              ${map.tags.slice(0, 2).map(tag => `<span class="yaml-map-tag">${tag}</span>`).join('')}
              ${map.tags.length > 2 ? `<span class="yaml-map-tag-more">+${map.tags.length - 2}</span>` : ''}
            </div>
          ` : ''}
        </div>
      </div>
      <div class="yaml-map-actions" style="display: flex; flex-direction: column; gap: 8px; margin-left: 10px;">
        <button class="yaml-attach-btn" title="Attach to Command Center" style="background: rgba(0, 119, 255, 0.1); border: 1px solid rgba(0, 119, 255, 0.3); color: var(--primary, #0077ff); width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <i class="fas fa-paperclip"></i>
        </button>
        <button class="yaml-edit-btn" title="Edit YAML Map" style="background: rgba(0, 229, 255, 0.1); border: 1px solid rgba(0, 229, 255, 0.3); color: var(--secondary, #00e5ff); width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
          <i class="fas fa-edit"></i>
        </button>
      </div>
    `;
    
    // Add click handler for the card content (not the buttons)
    const contentPart = card.querySelector('.yaml-map-card-content');
    if (contentPart) {
      contentPart.style.cursor = 'pointer';
      contentPart.addEventListener('click', () => {
        showMapDetails(map, isPublic);
      });
    }
    
    // Add click handler for the attach button
    const attachButton = card.querySelector('.yaml-attach-btn');
    if (attachButton) {
      // Store a reference to the map for this button
      attachButton.dataset.mapId = map._id;
      attachButton.dataset.mapName = map.name || 'Unnamed Map';
      
      attachButton.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Get the map ID from the button's dataset
        const mapId = this.dataset.mapId;
        const mapName = this.dataset.mapName;
        
        // Provide visual feedback on the button itself
        const originalBackground = this.style.background;
        const originalBorder = this.style.borderColor;
        
        // Change button style to indicate action
        this.style.background = 'rgba(0, 200, 83, 0.2)';
        this.style.borderColor = 'rgba(0, 200, 83, 0.5)';
        this.innerHTML = '<i class="fas fa-check"></i>';
        
        // Show a flash notification
        showNotification(`Attaching YAML Map: ${mapName}`, 'info', 2000);
        
        // Use the unified, simplified approach from the YAML Viewer implementation
        console.log('[DEBUG] Attaching YAML map from card, mapId:', mapId);
        
        // Use the same selector (#unified-input) that works for the YAML Viewer
        const commandInput = document.querySelector('#unified-input');
        console.log('[DEBUG] Looking for command input with #unified-input selector:', commandInput);
        
        if (commandInput) {
          console.log('[DEBUG] Command input found, attaching YAML map');
          
          try {
            // Format the command according to the working implementation
            commandInput.value = `/yaml ${mapId}`;
            console.log('[DEBUG] Set command input value to:', commandInput.value);
            
            // Focus the input
            commandInput.focus();
            console.log('[DEBUG] Focused the command input');
            
            // Fire an input event to notify the command input was updated
            commandInput.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('[DEBUG] Dispatched input event');
            
            // Show enhanced feedback notification
            showNotification(`YAML Map attached: ${mapName}`, 'success', 3000);
            console.log('[DEBUG] Showed notification');
            
            // Additional: Emit the event for other components that might be listening
            if (typeof eventBus !== 'undefined' || window.eventBus) {
              const bus = eventBus || window.eventBus;
              bus.emit('yaml-map-attached', { mapId });
              console.log('[DEBUG] Emitted yaml-map-attached event');
            }
          } catch (error) {
            console.error('[DEBUG] Error attaching YAML map:', error);
            showNotification('Failed to attach YAML map: ' + error.message, 'error', 5000);
          }
        } else {
          // Fallback attempt: try other selectors
          const alternativeInputs = [
            document.querySelector('.command-input'),
            document.getElementById('command-input'),
            document.querySelector('input[type="text"][placeholder*="command"]'),
            ...Array.from(document.querySelectorAll('input[type="text"]'))
          ].filter(Boolean);
          
          console.log('[DEBUG] Command input not found with #unified-input. Alternatives found:', alternativeInputs.length);
          
          if (alternativeInputs.length > 0) {
            // Try the first alternative input
            const altInput = alternativeInputs[0];
            console.log('[DEBUG] Trying alternative input:', altInput);
            
            altInput.value = `/yaml ${mapId}`;
            altInput.focus();
            altInput.dispatchEvent(new Event('input', { bubbles: true }));
            
            showNotification(`YAML Map attached: ${mapName}`, 'success', 3000);
          } else {
            console.error('[DEBUG] No suitable command input found');
            showNotification('Command input not found. Please make sure the Command Center is visible.', 'error', 5000);
          }
        }
        
        // Reset button style after a moment
        setTimeout(() => {
          const btn = document.querySelector(`.yaml-attach-btn[data-map-id="${mapId}"]`);
          if (btn) {
            btn.style.background = originalBackground;
            btn.style.borderColor = originalBorder;
            btn.innerHTML = '<i class="fas fa-paperclip"></i>';
          }
        }, 1500);
      });
    }
    
    // Add click handler for the edit button
    const editButton = card.querySelector('.yaml-edit-btn');
    if (editButton) {
      editButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openYamlEditor(map._id);
      });
    }
    
    return card;
  }
  
  // Helper function to show map details
  function showMapDetails(map, isPublic = false) {
    const detailContainer = document.querySelector('.yaml-map-detail');
    if (!detailContainer) return;
    
    detailContainer.innerHTML = `
      <div class="yaml-map-detail-header">
        <h3>${map.name}</h3>
        ${isPublic ? `<div class="yaml-map-author">by ${map.author || 'Anonymous'}</div>` : ''}
      </div>
      
      <div class="yaml-map-detail-description">
        ${map.description || 'No description provided.'}
      </div>
      
      ${map.tags && map.tags.length ? `
        <div class="yaml-map-detail-tags">
          ${map.tags.map(tag => `<span class="yaml-map-tag">${tag}</span>`).join('')}
        </div>
      ` : ''}
      
      <div class="yaml-map-detail-content">
        <h4>YAML Content</h4>
        <pre class="yaml-map-code">${map.yaml || ''}</pre>
      </div>
      
      <div class="yaml-map-detail-actions">
        <button class="btn-secondary copy-yaml-btn">
          <i class="fas fa-copy"></i> Copy YAML
        </button>
        ${isPublic ? `
          <button class="btn-primary use-yaml-btn">
            <i class="fas fa-play"></i> Use This Map
          </button>
        ` : ''}
      </div>
    `;
    
    // Add click handler for copy button
    const copyBtn = detailContainer.querySelector('.copy-yaml-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const yamlContent = map.yaml || '';
        navigator.clipboard.writeText(yamlContent)
          .then(() => {
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
              copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy YAML';
            }, 2000);
          })
          .catch(err => {
            console.error('Failed to copy:', err);
            copyBtn.innerHTML = '<i class="fas fa-times"></i> Failed to copy';
            setTimeout(() => {
              copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy YAML';
            }, 2000);
          });
      });
    }
    
    // Add click handler for use button
    const useBtn = detailContainer.querySelector('.use-yaml-btn');
    if (useBtn) {
      useBtn.addEventListener('click', () => {
        // Emit an event to use this map in the agent input
        window.dispatchEvent(new CustomEvent('use-yaml-map', {
          detail: { yaml: map.yaml, name: map.name }
        }));
        
        useBtn.innerHTML = '<i class="fas fa-check"></i> Added to Input!';
        setTimeout(() => {
          useBtn.innerHTML = '<i class="fas fa-play"></i> Use This Map';
        }, 2000);
      });
    }
  }

  // Initialize YAML Maps vanilla JS component
  function loadYamlMaps() {
    const yamlSection = document.getElementById('yaml-maps-section');
    if (!yamlSection) {
      console.error('Could not find YAML maps section');
      return;
    }
    
    console.log('Found YAML maps section:', yamlSection);
    
    // Find and wire up the New Map button in the header
    const headerNewMapBtn = document.querySelector('.yaml-new-map-btn');
    if (headerNewMapBtn) {
      console.log('Found header New Map button, attaching click handler');
      headerNewMapBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Header New Map button clicked');
        openYamlEditor();
      });
    }
    
    // Clear existing content
    yamlSection.innerHTML = '';
    
    // Force load CSS first to ensure styling works
    ensureYamlCSSLoaded();
    
    // Add a simple loading indicator
    yamlSection.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <i class="fas fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 10px;"></i>
        <p>Loading YAML Maps...</p>
      </div>
    `;
    
    // Short delay to ensure DOM is ready
    setTimeout(() => {
      try {
        // Ensure style is visible (force display)
        yamlSection.style.display = 'block';
        
        console.log('Mounting YamlMaps directly in element');
        
        // Clear the loading indicator
        yamlSection.innerHTML = '';
        
        // Create the YamlMaps HTML structure directly
        yamlSection.innerHTML = `
          <div class="yaml-maps-container">
            <div class="yaml-info-rotator" style="display: block !important; visibility: visible !important; opacity: 1 !important;">
              <div class="yaml-info-slide active" data-index="0" style="display: block !important;">
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
                <input type="text" placeholder="Search YAML maps..." class="yaml-maps-search-input">
              </div>
              <!-- Removed redundant 'Create New' button -->
            </div>
            
            <div class="yaml-maps-content">
              <div class="yaml-maps-sidebar">
                <div class="yaml-maps-loading" style="display: flex;">
                  <i class="fas fa-spinner fa-spin"></i>
                  <span>Loading YAML Maps...</span>
                </div>
                
                <div class="yaml-maps-error" style="display: none;">
                  <i class="fas fa-exclamation-triangle"></i>
                  <span>Error loading maps</span>
                </div>
                
                <div class="yaml-maps-empty" style="display: none;">
                  <div class="yaml-maps-empty-icon">
                    <i class="fas fa-file-code"></i>
                  </div>
                  <h3>No YAML Maps Found</h3>
                  <p>You haven't created any YAML maps yet.</p>
                  <button class="create-first-map-btn">
                    <i class="fas fa-plus"></i> Create Your First Map
                  </button>
                </div>
                
                <div class="yaml-maps-list" style="display: none;"></div>
              </div>
            </div>
          </div>
        `;
        
        // Now attach event handlers to the buttons
        const createButtons = yamlSection.querySelectorAll('.create-map-btn, .create-first-map-btn');
        createButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            console.log('Create map button clicked');
            openYamlEditor();
          });
        });
        
        // Add rotator navigation handlers
        const prevBtn = yamlSection.querySelector('.prev-slide');
        const nextBtn = yamlSection.querySelector('.next-slide');
        const infoDots = yamlSection.querySelectorAll('.yaml-info-dot');
        let currentSlide = 0;
        
        if (prevBtn) {
          prevBtn.addEventListener('click', () => {
            goToSlide(currentSlide - 1);
          });
        }
        
        if (nextBtn) {
          nextBtn.addEventListener('click', () => {
            goToSlide(currentSlide + 1);
          });
        }
        
        infoDots.forEach(dot => {
          dot.addEventListener('click', () => {
            goToSlide(parseInt(dot.dataset.index));
          });
        });
        
        function goToSlide(index) {
          const slides = yamlSection.querySelectorAll('.yaml-info-slide');
          if (!slides.length) return;
          
          // Wrap around slide index
          if (index < 0) index = slides.length - 1;
          if (index >= slides.length) index = 0;
          
          currentSlide = index;
          
          // Update slides
          slides.forEach((slide, i) => {
            slide.style.display = i === index ? 'block' : 'none';
            slide.classList.toggle('active', i === index);
          });
          
          // Update dots
          infoDots.forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
          });
        }
        
        // Start auto-rotation
        const rotatorInterval = setInterval(() => {
          goToSlide(currentSlide + 1);
        }, 5000);
        
        // Fetch YAML maps
        fetch('/api/yaml-maps', {
          method: 'GET',
          credentials: 'include'
        })
          .then(response => {
            if (!response.ok) {
              throw new Error(`Failed to load YAML maps: ${response.status}`);
            }
            return response.json();
          })
          .then(data => {
            if (data.success) {
              const loadingEl = yamlSection.querySelector('.yaml-maps-loading');
              const emptyEl = yamlSection.querySelector('.yaml-maps-empty');
              const listEl = yamlSection.querySelector('.yaml-maps-list');
              
              if (loadingEl) loadingEl.style.display = 'none';
              
              if (data.yamlMaps && data.yamlMaps.length > 0) {
                if (emptyEl) emptyEl.style.display = 'none';
                if (listEl) {
                  listEl.style.display = 'block';
                  
                  // Render the list of maps
                  data.yamlMaps.forEach(map => {
                    const item = document.createElement('div');
                    item.className = 'yaml-map-item';
                    item.dataset.id = map._id;
                    
                    item.innerHTML = `
                      <div class="yaml-map-content" style="flex: 1; overflow: hidden;"> 
                        <div class="yaml-map-name">${map.name || 'Unnamed Map'}</div>
                        <div class="yaml-map-description">${map.description || 'No description'}</div>
                        <div class="yaml-map-meta">
                          <span class="yaml-map-date">
                            <i class="fas fa-clock"></i>
                            ${new Date(map.updatedAt || map.createdAt).toLocaleDateString()}
                          </span>
                          ${map.tags && map.tags.length ? `
                            <span class="yaml-map-tags">
                              <i class="fas fa-tags"></i>
                              ${map.tags.join(', ')}
                            </span>
                          ` : ''}
                        </div>
                      </div>
                      <div class="yaml-map-actions" style="display: flex; flex-direction: column; gap: 8px; margin-left: 10px;">
                        <button class="yaml-attach-btn" title="Attach to Command Center" style="background: rgba(0, 119, 255, 0.1); border: 1px solid rgba(0, 119, 255, 0.3); color: var(--primary, #0077ff); width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                          <i class="fas fa-paperclip"></i>
                        </button>
                        <button class="yaml-edit-btn" title="Edit YAML Map" style="background: rgba(0, 229, 255, 0.1); border: 1px solid rgba(0, 229, 255, 0.3); color: var(--secondary, #00e5ff); width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                          <i class="fas fa-edit"></i>
                        </button>
                      </div>
                    `;
                    
                    // Add flex display to the item for better layout
                    item.style.display = 'flex';
                    item.style.alignItems = 'center';
                    item.style.justifyContent = 'space-between';
                    
                    // Add click handler to view the map (only for the content part)
                    const contentPart = item.querySelector('.yaml-map-content');
                    if (contentPart) {
                      contentPart.style.cursor = 'pointer';
                      contentPart.addEventListener('click', () => {
                        viewYamlMap(map._id);
                      });
                    }
                    
                    // Add click handler for the attach button
                    const attachButton = item.querySelector('.yaml-attach-btn');
                    if (attachButton) {
                      // Store a reference to the map for this button
                      attachButton.dataset.mapId = map._id;
                      attachButton.dataset.mapName = map.name || 'Unnamed Map';
                      
                      attachButton.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Get the map ID from the button's dataset
                        const mapId = this.dataset.mapId;
                        const mapName = this.dataset.mapName;
                        
                        // Provide visual feedback on the button itself
                        const originalBackground = this.style.background;
                        const originalBorder = this.style.borderColor;
                        
                        // Change button style to indicate action
                        this.style.background = 'rgba(0, 200, 83, 0.2)';
                        this.style.borderColor = 'rgba(0, 200, 83, 0.5)';
                        this.innerHTML = '<i class="fas fa-check"></i>';
                        
                        // Show a flash notification
                        showNotification(`Attaching YAML Map: ${mapName}`, 'info', 2000);
                        
                        // Use the unified, simplified approach from the YAML Viewer implementation
                        console.log('[DEBUG] Attaching YAML map from sidebar list, mapId:', mapId);
                        
                        // Use the same selector (#unified-input) that works for the YAML Viewer
                        const commandInput = document.querySelector('#unified-input');
                        console.log('[DEBUG] Looking for command input with #unified-input selector:', commandInput);
                        
                        if (commandInput) {
                          console.log('[DEBUG] Command input found, attaching YAML map');
                          
                          try {
                            // Format the command according to the working implementation
                            commandInput.value = `/yaml ${mapId}`;
                            console.log('[DEBUG] Set command input value to:', commandInput.value);
                            
                            // Focus the input
                            commandInput.focus();
                            console.log('[DEBUG] Focused the command input');
                            
                            // Fire an input event to notify the command input was updated
                            commandInput.dispatchEvent(new Event('input', { bubbles: true }));
                            console.log('[DEBUG] Dispatched input event');
                            
                            // Show enhanced feedback notification
                            showNotification(`YAML Map attached: ${mapName}`, 'success', 3000);
                            console.log('[DEBUG] Showed notification');
                            
                            // Additional: Emit the event for other components that might be listening
                            if (typeof eventBus !== 'undefined' || window.eventBus) {
                              const bus = eventBus || window.eventBus;
                              bus.emit('yaml-map-attached', { mapId });
                              console.log('[DEBUG] Emitted yaml-map-attached event');
                            }
                          } catch (error) {
                            console.error('[DEBUG] Error attaching YAML map:', error);
                            showNotification('Failed to attach YAML map: ' + error.message, 'error', 5000);
                          }
                        } else {
                          // Fallback attempt: try other selectors
                          const alternativeInputs = [
                            document.querySelector('.command-input'),
                            document.getElementById('command-input'),
                            document.querySelector('input[type="text"][placeholder*="command"]'),
                            ...Array.from(document.querySelectorAll('input[type="text"]'))
                          ].filter(Boolean);
                          
                          console.log('[DEBUG] Command input not found with #unified-input. Alternatives found:', alternativeInputs.length);
                          
                          if (alternativeInputs.length > 0) {
                            // Try the first alternative input
                            const altInput = alternativeInputs[0];
                            console.log('[DEBUG] Trying alternative input:', altInput);
                            
                            altInput.value = `/yaml ${mapId}`;
                            altInput.focus();
                            altInput.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            showNotification(`YAML Map attached: ${mapName}`, 'success', 3000);
                          } else {
                            console.error('[DEBUG] No suitable command input found');
                            showNotification('Command input not found. Please make sure the Command Center is visible.', 'error', 5000);
                          }
                        }
                        
                        // Reset button style after a moment
                        setTimeout(() => {
                          const btn = document.querySelector(`.yaml-attach-btn[data-map-id="${mapId}"]`);
                          if (btn) {
                            btn.style.background = originalBackground;
                            btn.style.borderColor = originalBorder;
                            btn.innerHTML = '<i class="fas fa-paperclip"></i>';
                          }
                        }, 1500);
                      });
                    }
                    
                    // Add click handler for the edit button
                    const editButton = item.querySelector('.yaml-edit-btn');
                    if (editButton) {
                      editButton.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        openYamlEditor(map._id);
                      });
                    }
                    
                    listEl.appendChild(item);
                  });
                }
              } else {
                if (emptyEl) emptyEl.style.display = 'flex';
                if (listEl) listEl.style.display = 'none';
              }
            } else {
              throw new Error(data.error || 'Failed to load YAML maps');
            }
          })
          .catch(error => {
            console.error('Error loading YAML maps:', error);
            const loadingEl = yamlSection.querySelector('.yaml-maps-loading');
            const errorEl = yamlSection.querySelector('.yaml-maps-error');
            const errorMsg = yamlSection.querySelector('.error-message');
            
            if (loadingEl) loadingEl.style.display = 'none';
            if (errorEl) errorEl.style.display = 'flex';
            if (errorMsg) errorMsg.textContent = error.message;
          });
          
        console.log('YAML Maps section initialized successfully');
      } catch (error) {
        console.error('Error initializing YAML Maps section:', error);
        yamlSection.innerHTML = `
          <div style="padding: 20px; color: #ff4d4d; text-align: center;">
            <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 15px;"></i>
            <h3>Error Loading YAML Maps</h3>
            <p>${error.message}</p>
            <button onclick="location.reload()" style="
              background: rgba(78, 111, 255, 0.8);
              color: white;
              border: none;
              padding: 8px 15px;
              border-radius: 6px;
              margin-top: 15px;
              cursor: pointer;
            ">Reload Page</button>
          </div>
        `;
      }
    }, 100);
  }

  // Ensure YAML CSS is loaded
  function ensureYamlCSSLoaded() {
    // Only load the fixes CSS file since the base file was deleted
    const cssPath = '/src/styles/components/yaml-maps-fixes.css';
    
    const id = 'yaml-maps-fixes-css';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssPath;
      link.id = id;
      link.type = 'text/css';
      document.head.appendChild(link);
      console.log(`Loaded CSS file: ${cssPath}`);
    }
    
    // Add only minimal critical inline CSS for visibility
    // This is just enough to ensure things are visible while the CSS loads
    const criticalStyles = document.createElement('style');
    criticalStyles.textContent = `
      .yaml-maps-container { display: flex !important; }
      .yaml-info-rotator { display: block !important; }
      .yaml-info-slide.active { display: block !important; }
    `;
    document.head.appendChild(criticalStyles);
  }
  
  // Attach YAML map to command input
  function attachYamlMapToInput(mapId) {
    console.log('[DEBUG] attachYamlMapToInput called with mapId:', mapId);
    
    // Use the same selector as the working implementation
    const commandInput = document.querySelector('#unified-input');
    console.log('[DEBUG] Looking for command input with #unified-input selector:', commandInput);
    
    if (commandInput) {
      console.log('[DEBUG] Command input found, attaching YAML map');
      
      try {
        // Format the command to use the YAML map
        commandInput.value = `/yaml ${mapId}`;
        console.log('[DEBUG] Set command input value to:', commandInput.value);
        
        // Focus the input
        commandInput.focus();
        console.log('[DEBUG] Focused the command input');
        
        // Fire an input event to notify the command input was updated
        commandInput.dispatchEvent(new Event('input', { bubbles: true }));
        console.log('[DEBUG] Dispatched input event');
        
        // Show enhanced feedback notification
        showNotification('YAML Map attached to input', 'success', 3000);
        console.log('[DEBUG] Showed notification');
        
        // Additional: Emit the event for other components that might be listening
        if (typeof eventBus !== 'undefined') {
          eventBus.emit('yaml-map-attached', { mapId });
          console.log('[DEBUG] Emitted yaml-map-attached event');
        }
      } catch (error) {
        console.error('[DEBUG] Error attaching YAML map:', error);
        showNotification('Failed to attach YAML map: ' + error.message, 'error', 5000);
      }
    } else {
      // Fallback attempt: try other selectors
      const alternativeInputs = [
        document.querySelector('.command-input'),
        document.getElementById('command-input'),
        document.querySelector('input[type="text"][placeholder*="command"]'),
        ...Array.from(document.querySelectorAll('input[type="text"]'))
      ].filter(Boolean);
      
      console.log('[DEBUG] Command input not found with #unified-input. Alternatives found:', alternativeInputs.length);
      
      if (alternativeInputs.length > 0) {
        // Try the first alternative input
        const altInput = alternativeInputs[0];
        console.log('[DEBUG] Trying alternative input:', altInput);
        
        altInput.value = `/yaml ${mapId}`;
        altInput.focus();
        altInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        showNotification('YAML Map attached to input', 'success', 3000);
      } else {
        console.error('[DEBUG] No suitable command input found');
        showNotification('Command input not found. Please make sure the Command Center is visible.', 'error', 5000);
      }
    }
  }
  
  // Delete YAML map
  function deleteYamlMap(mapId) {
    if (!confirm('Are you sure you want to delete this YAML map? This action cannot be undone.')) {
      return;
    }
    
    fetch(`/api/yaml-maps/${mapId}`, {
      method: 'DELETE',
      credentials: 'include'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to delete YAML map: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          showNotification('YAML map deleted successfully');
          loadYamlMaps(); // Reload the list
        } else {
          throw new Error(data.error || 'Failed to delete YAML map');
        }
      })
      .catch(error => {
        console.error('Error deleting YAML map:', error);
        showNotification(`Error: ${error.message}`, 'error');
      });
  }
  
  // Clone YAML map
  function cloneYamlMap(mapId) {
    fetch(`/api/yaml-maps/${mapId}/clone`, {
      method: 'POST',
      credentials: 'include'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to clone YAML map: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          showNotification('YAML map cloned successfully');
          loadYamlMaps(); // Reload the list
        } else {
          throw new Error(data.error || 'Failed to clone YAML map');
        }
      })
      .catch(error => {
        console.error('Error cloning YAML map:', error);
        showNotification(`Error: ${error.message}`, 'error');
      });
  }
  
  // Open YAML map editor (create new or edit existing)
  function openYamlEditor(mapIdOrEvent) {
    let mapId = null;
    
    if (typeof mapIdOrEvent === 'string') {
      mapId = mapIdOrEvent;
    }
    
    console.log('Opening YAML editor with mapId:', mapId);
    
    try {
      // Use our imported YamlMapEditor component
      if (typeof YamlMapEditor !== 'undefined') {
        console.log('YamlMapEditor is defined, calling open()');
        YamlMapEditor.open(mapId);
      } else {
        console.error('YamlMapEditor is undefined!');
        // Alternative approach: try to find the YamlMaps instance
        if (window._yamlMapsInstance) {
          console.log('Using window._yamlMapsInstance.openEditor');
          window._yamlMapsInstance.openEditor(mapId);
        } else {
          throw new Error('YamlMapEditor component not available');
        }
      }
    } catch (error) {
      console.error('Failed to open YAML editor:', error);
      alert('Could not open the YAML editor. Please refresh the page and try again.');
    }
  }
  
  // View YAML map details - direct implementation
  function viewYamlMap(mapId) {
    console.log('Direct YAML map view function called for map:', mapId);
    
    // First emit the event for compatibility with other components
    eventBus.emit('view-yaml-map', { mapId });
    
    // Direct implementation - create and show a modal with the YAML map
    const yamlOverlayId = 'yaml-direct-overlay';
    const yamlViewerId = 'yaml-direct-viewer';
    
    // Remove any existing viewers to prevent duplicates
    const existingOverlay = document.getElementById(yamlOverlayId);
    if (existingOverlay) {
      document.body.removeChild(existingOverlay);
    }
    
    // Create the overlay
    const overlay = document.createElement('div');
    overlay.id = yamlOverlayId;
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '9999';
    
    // Create the viewer container
    const viewer = document.createElement('div');
    viewer.id = yamlViewerId;
    viewer.className = 'yaml-maps-modal active';
    
    // Style the container
    viewer.style.width = '90%';
    viewer.style.maxWidth = '1200px';
    viewer.style.height = '80%';
    viewer.style.maxHeight = '800px';
    viewer.style.backgroundColor = 'var(--dark-light, #1a1f2e)';
    viewer.style.borderRadius = '12px';
    viewer.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.5)';
    viewer.style.display = 'flex';
    viewer.style.flexDirection = 'column';
    viewer.style.padding = '20px';
    viewer.style.color = 'white';
    viewer.style.position = 'relative';
    viewer.style.overflow = 'hidden';
    
    // Add initial loading content
    viewer.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; color: var(--primary, #0077ff);">YAML Map Viewer</h2>
        <button id="yaml-close-btn" class="modal-close-btn" style="background: rgba(30, 40, 60, 0.7); border: 1px solid rgba(60, 80, 120, 0.5); color: white; font-size: 16px; cursor: pointer; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s ease;">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div id="yaml-content-area" style="flex: 1; overflow: auto; padding: 20px; background: rgba(10, 15, 25, 0.4); border-radius: 8px; border: 1px solid rgba(60, 80, 120, 0.2);">
        <div style="display: flex; justify-content: center; align-items: center; height: 100%;">
          <div style="text-align: center;">
            <div style="margin-bottom: 20px; color: var(--text-dim, #8ca0c1);">Loading YAML Map...</div>
            <div style="width: 40px; height: 40px; border: 4px solid rgba(0, 119, 255, 0.2); border-radius: 50%; border-top-color: var(--primary, #0077ff); animation: yaml-spin 1s linear infinite; margin: 0 auto;"></div>
          </div>
        </div>
      </div>
    `;
    
    // Add animation style
    const styleElement = document.createElement('style');
    styleElement.textContent = `
      @keyframes yaml-spin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleElement);
    
    // Add the viewer to the overlay
    overlay.appendChild(viewer);
    
    // Add the overlay to the body
    document.body.appendChild(overlay);
    
    // Add event listeners
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
      }
    });
    
    // Add close button handler
    setTimeout(() => {
      const closeBtn = document.getElementById('yaml-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          document.body.removeChild(overlay);
        });
      }
    }, 0);
    
    // Utility function to copy text to clipboard
    const copyToClipboard = (text, button) => {
      navigator.clipboard.writeText(text).then(() => {
        // Change button text temporarily to indicate success
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-check"></i> Copied!';
        button.style.background = 'rgba(0, 200, 83, 0.3)';
        button.style.borderColor = 'rgba(0, 200, 83, 0.5)';
        
        setTimeout(() => {
          button.innerHTML = originalText;
          button.style.background = 'rgba(30, 40, 60, 0.5)';
          button.style.borderColor = 'rgba(60, 80, 120, 0.3)';
        }, 2000);
      }).catch(err => {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy to clipboard: ' + err);
      });
    };
    
    // Function to attach YAML map to command center - simplified to match working implementation
    const attachToCommandCenter = (mapId) => {
      console.log('[DEBUG] attachToCommandCenter called with mapId:', mapId);
      
      // Use the same selector as the working attachYamlMapToInput function
      const commandInput = document.querySelector('#unified-input');
      console.log('[DEBUG] Looking for command input with #unified-input selector:', commandInput);
      
      if (commandInput) {
        console.log('[DEBUG] Command input found, attaching YAML map');
        
        try {
          // Format the command according to the working implementation
          commandInput.value = `/yaml ${mapId}`;
          console.log('[DEBUG] Set command input value to:', commandInput.value);
          
          // Focus the input
          commandInput.focus();
          console.log('[DEBUG] Focused the command input');
          
          // Fire an input event to notify the command input was updated
          commandInput.dispatchEvent(new Event('input', { bubbles: true }));
          console.log('[DEBUG] Dispatched input event');
          
          // Show feedback notification
          showNotification('YAML Map attached to input', 'success', 3000);
          console.log('[DEBUG] Showed notification');
          
          // Close the YAML viewer if it exists
          console.log('[DEBUG] Checking if overlay exists:', overlay);
          if (overlay && document.body.contains(overlay)) {
            document.body.removeChild(overlay);
            console.log('[DEBUG] Removed overlay from document body');
          }
          
          // Additional: Emit the event for other components that might be listening
          if (typeof eventBus !== 'undefined') {
            eventBus.emit('yaml-map-attached', { mapId });
            console.log('[DEBUG] Emitted yaml-map-attached event');
          }
        } catch (error) {
          console.error('[DEBUG] Error attaching YAML map:', error);
          showNotification('Failed to attach YAML map: ' + error.message, 'error', 5000);
        }
      } else {
        // Fallback attempt: try other selectors
        const alternativeInputs = [
          document.querySelector('.command-input'),
          document.getElementById('command-input'),
          document.querySelector('input[type="text"][placeholder*="command"]'),
          ...Array.from(document.querySelectorAll('input[type="text"]'))
        ].filter(Boolean);
        
        console.log('[DEBUG] Command input not found with #unified-input. Alternatives found:', alternativeInputs.length);
        
        if (alternativeInputs.length > 0) {
          // Try the first alternative input
          const altInput = alternativeInputs[0];
          console.log('[DEBUG] Trying alternative input:', altInput);
          
          altInput.value = `/yaml ${mapId}`;
          altInput.focus();
          altInput.dispatchEvent(new Event('input', { bubbles: true }));
          
          showNotification('YAML Map attached to input', 'success', 3000);
          
          // Close the overlay
          if (overlay && document.body.contains(overlay)) {
            document.body.removeChild(overlay);
          }
        } else {
          console.error('[DEBUG] No suitable command input found');
          showNotification('Command input not found. Please make sure the Command Center is visible.', 'error', 5000);
        }
      }
    };
    
    // Fetch the YAML map data
    fetch(`/api/yaml-maps/${mapId}`, {
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })
    .then(response => response.json())
    .then(data => {
      console.log('YAML map data received:', data);
      const contentArea = document.getElementById('yaml-content-area');
      
      // Store the map data for button event handlers
      const yamlMapData = data.yamlMap;
      
      if (data.success && data.yamlMap) {
        // Check if YAML content exists and handle missing content properly
        if (!data.yamlMap.content || data.yamlMap.content.trim() === '') {
          console.log('YAML content missing, attempting to fetch directly...');
          
          // Try multiple approaches to fetch the content - some APIs use different endpoints
          // First try to get content from the main endpoint - most reliable
          fetch(`/api/yaml-maps/${mapId}?includeContent=true`, {
            credentials: 'include',
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache'
            }
          })
          .then(response => response.json())
          .then(fullData => {
            if (fullData.success && fullData.yamlMap && fullData.yamlMap.content) {
              console.log('Successfully fetched YAML content from main endpoint');
              data.yamlMap.content = fullData.yamlMap.content;
              renderYamlContent();
              return true; // Signal we got the content successfully
            }
            return false; // Content not found in main response
          })
          .catch(() => false) // Continue with fallback if this fails
          .then(contentFound => {
            // If we couldn't get content from main endpoint, try the direct content endpoint
            if (!contentFound) {
              return fetch(`/api/yaml-maps/${mapId}/content`, {
                credentials: 'include',
                headers: {
                  'Accept': 'application/json, text/plain',
                  'Cache-Control': 'no-cache'
                }
              })
              .then(response => {
                if (!response.ok) {
                  // If the /content endpoint fails, try another common pattern
                  throw new Error('Content endpoint not available');
                }
                
                // Check response type to determine how to parse
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                  return response.json().then(jsonData => {
                    // Extract content from JSON response
                    return jsonData.content || jsonData.yamlContent || JSON.stringify(jsonData, null, 2);
                  });
                } else {
                  // Direct text content
                  return response.text();
                }
              })
              .catch(() => {
                // If direct content fetch fails, try one more fallback to the raw endpoint
                return fetch(`/api/yaml-maps/${mapId}/raw`, {
                  credentials: 'include'
                })
                .then(response => response.text())
                .catch(err => {
                  console.error('All content fetch attempts failed:', err);
                  return 'No content available - please check the YAML map configuration';
                });
              })
              .then(yamlContent => {
                if (yamlContent && yamlContent !== 'No content available') {
                  console.log('Successfully fetched YAML content from fallback endpoint');
                  data.yamlMap.content = yamlContent;
                } else {
                  console.warn('Could not retrieve YAML content from any endpoint');
                  data.yamlMap.content = 'No content available. The YAML map content could not be retrieved.';
                }
                renderYamlContent();
              });
            }
          });
        } else {
          console.log('YAML content found in initial response');
          renderYamlContent();
        }
        
        function renderYamlContent() {
          // Format created date
          const createdDate = new Date(data.yamlMap.createdAt).toLocaleString();
          
          // Display the map data
          contentArea.innerHTML = `
          <div class="yaml-map-detail">
            <div class="yaml-map-detail-header">
              <div class="yaml-map-detail-title">
                <h3>${data.yamlMap.name || 'Unnamed YAML Map'}</h3>
                <div class="yaml-map-detail-meta">
                  Created: ${createdDate}
                </div>
                ${data.yamlMap.url ? `
                <div class="yaml-map-detail-url" style="margin-top: 10px; display: flex; align-items: center;">
                  <i class="fas fa-link" style="color: var(--secondary, #00e5ff); margin-right: 6px;"></i>
                  <a href="${data.yamlMap.url}" target="_blank" rel="noopener noreferrer" style="color: var(--primary, #0077ff); text-decoration: underline; word-break: break-all;">
                    ${data.yamlMap.url}
                  </a>
                </div>
                ` : ''}                
              </div>
              <div class="yaml-map-actions" style="margin-left: auto;">
                <button id="attach-yaml-btn" class="yaml-action-btn command-center-btn" style="background: linear-gradient(to bottom, rgba(0, 119, 255, 0.2), rgba(0, 119, 255, 0.1)); border: 1px solid rgba(0, 119, 255, 0.3); border-radius: 4px; color: var(--primary, #0077ff); padding: 6px 12px; margin-left: 8px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s ease;">
                  <i class="fas fa-paperclip"></i> Attach to Command Center
                </button>
              </div>
            </div>
            
            <div class="yaml-map-content" style="margin-top: 20px;">
              <h4 style="margin-bottom: 10px; color: var(--secondary, #00e5ff);">YAML Content:</h4>
              <pre style="padding: 15px; background: rgba(10, 20, 35, 0.5); border-radius: 6px; overflow: auto; color: #b3d6ff; border: 1px solid rgba(60, 80, 120, 0.3);">${data.yamlMap.content || 'No content available'}</pre>
            </div>
            
            <div class="yaml-map-usage-instructions" style="margin-top: 30px;">
              <h4 style="color: var(--secondary, #00e5ff);">How to Use This YAML Map</h4>
              <p>You can execute this YAML map using one of the following methods:</p>
              
              <div style="margin-top: 15px;">
                <h5 style="font-size: 14px; margin-bottom: 8px;">Method 1: Using Command Center (Recommended)</h5>
                <div style="background: rgba(0, 119, 255, 0.1); border: 1px solid rgba(0, 119, 255, 0.2); border-radius: 4px; padding: 10px; display: flex; align-items: center; justify-content: space-between;">
                  <code style="color: var(--primary, #0077ff);">run yaml-map ${data.yamlMap._id}</code>
                  <button id="copy-cmd-btn" class="copy-btn" style="background: rgba(30, 40, 60, 0.5); border: 1px solid rgba(60, 80, 120, 0.3); color: white; font-size: 12px; padding: 4px 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <i class="fas fa-copy"></i> Copy
                  </button>
                </div>
                <p style="margin-top: 8px; font-size: 13px; color: var(--text-dim, #8ca0c1);">Enter this command in the Command Center to execute this YAML map.</p>
              </div>
              
              <div style="margin-top: 15px;">
                <h5 style="font-size: 14px; margin-bottom: 8px;">Method 2: Using Node.js API</h5>
                <div style="background: rgba(0, 119, 255, 0.1); border: 1px solid rgba(0, 119, 255, 0.2); border-radius: 4px; padding: 10px; display: flex; align-items: center; justify-content: space-between;">
                  <code style="color: var(--primary, #0077ff);">const result = await nexus.runYamlMap('${data.yamlMap._id}');</code>
                  <button id="copy-node-btn" class="copy-btn" style="background: rgba(30, 40, 60, 0.5); border: 1px solid rgba(60, 80, 120, 0.3); color: white; font-size: 12px; padding: 4px 8px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <i class="fas fa-copy"></i> Copy
                  </button>
                </div>
                <p style="margin-top: 8px; font-size: 13px; color: var(--text-dim, #8ca0c1);">Use this code in your Node.js application to execute the YAML map programmatically.</p>
              </div>
              
              <div style="margin-top: 15px;">
                <h5 style="font-size: 14px; margin-bottom: 8px;">Attach to Command Center</h5>
                <p>Click the "Attach to Command Center" button above to attach this YAML map to the Command Center input. This will allow you to execute the map directly without typing the command.</p>
              </div>
            </div>
          </div>
        `;
        
        // Add event listeners for the copy and attach buttons after content is loaded
        setTimeout(() => {
          // Copy Command button
          const copyCmdBtn = document.getElementById('copy-cmd-btn');
          if (copyCmdBtn) {
            copyCmdBtn.addEventListener('click', () => {
              copyToClipboard(`run yaml-map ${data.yamlMap._id}`, copyCmdBtn);
            });
          }
          
          // Copy Node.js code button
          const copyNodeBtn = document.getElementById('copy-node-btn');
          if (copyNodeBtn) {
            copyNodeBtn.addEventListener('click', () => {
              copyToClipboard(`const result = await nexus.runYamlMap('${data.yamlMap._id}');`, copyNodeBtn);
            });
          }
          
          // Attach to Command Center button
          const attachBtn = document.getElementById('attach-yaml-btn');
          if (attachBtn) {
            console.log('[DEBUG] Attach to Command Center button found:', attachBtn);
            attachBtn.addEventListener('click', () => {
              console.log('[DEBUG] Attach to Command Center button clicked!');
              attachToCommandCenter(data.yamlMap._id);
            });
            console.log('[DEBUG] Event listener attached to Attach to Command Center button');
          } else {
            console.warn('[DEBUG] Attach to Command Center button NOT found after modal render!');
          }
        }, 100);
        }
      } else {
        // Show error
        contentArea.innerHTML = `
          <div style="text-align: center; color: #ff5555; margin-top: 30px;">
            <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 20px;"></i>
            <h3>Error Loading YAML Map</h3>
            <p>${data.message || 'Could not load the requested YAML map.'}</p>
          </div>
        `;
      }
    })
    .catch(error => {
      console.error('Failed to fetch YAML map:', error);
      const contentArea = document.getElementById('yaml-content-area');
      
      if (contentArea) {
        contentArea.innerHTML = `
          <div style="text-align: center; color: #ff5555; margin-top: 30px;">
            <i class="fas fa-exclamation-circle" style="font-size: 48px; margin-bottom: 20px;"></i>
            <h3>Error Loading YAML Map</h3>
            <p>An error occurred while trying to load the YAML map.</p>
          </div>
        `;
      }
    });
  }
  
  // Show notification with optional custom duration
  function showNotification(message, type = 'success', duration = 3000) {
    // Get or create the notifications container
    let container = document.querySelector('.notifications-container');
    if (!container) {
      // Get the saved position or use default
      const userPreferences = JSON.parse(localStorage.getItem('userPreferences') || '{}');
      const notificationPosition = userPreferences?.accessibility?.notificationPosition || 'bottom-left';
      
      container = document.createElement('div');
      container.className = `notifications-container position-${notificationPosition}`;
      document.body.appendChild(container);
    }
    
    // Remove any existing notification with the same message to avoid duplicates
    const existingNotifications = container.querySelectorAll('.notification');
    existingNotifications.forEach(notif => {
      if (notif.textContent.trim() === message.trim()) {
        notif.remove();
      }
    });
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    // Additional styling for YAML-related notifications
    if (message.includes('YAML')) {
      notification.classList.add('notification-important');
    }
    
    notification.innerHTML = `
      <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : type === 'info' ? 'fa-info-circle' : 'fa-bell'}"></i>
      <span>${message}</span>
    `;
    
    // Add to container
    container.appendChild(notification);
    
    // Add visible class after a small delay for animation
    setTimeout(() => {
      notification.classList.add('visible');
    }, 10);
    
    // Auto-remove after specified delay
    setTimeout(() => {
      notification.classList.remove('visible');
      setTimeout(() => notification.remove(), 400);
    }, duration);
  }

  // Enhanced toggle collapse behavior with animation
  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    
    // Update container class
    container.classList.toggle('collapsed', isCollapsed);
    
    // Update toggle button icon
    const iconEl = toggleButton.querySelector('i');
    if (iconEl) {
      // Flip the icon direction to match the sidebar state
      iconEl.className = `fas ${isCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'}`;
    }
    
    // Update localStorage preference
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sidebarDefault', isCollapsed ? 'collapsed' : 'expanded');
    }
    
    // Update toggle button tooltip
    toggleButton.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    
    // Update store state
    stores.ui.setState({ sidebarCollapsed: isCollapsed });
    
    // Emit event for other components
    eventBus.emit('sidebar-toggled', { collapsed: isCollapsed });
  }

  return container;
}