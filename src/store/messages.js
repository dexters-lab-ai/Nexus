/**
 * Enhanced Messages Store
 * Manages the message timeline with improved filtering and DOM synchronization
 */

import { createStore } from './index.js';

// Message types
const MESSAGE_TYPES = {
  CHAT: 'chat',
  COMMAND: 'command',
  SYSTEM: 'system',
  ERROR: 'error',
  THOUGHT: 'thought'
};

// Message roles
const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system'
};

// Create store with initial state
const messagesStore = createStore({
  timeline: [],
  filter: 'all',      // Current filter: 'all', 'chat', or 'command'
  loading: false,
  error: null,
  lastSyncTime: null, // Track when DOM was last synced
  pagination: {
    page: 1,
    limit: 30,
    totalItems: 0,
    totalPages: 0
  }
});

// Track whether we've initialized DOM sync
let domSyncInitialized = false;

// Helper functions for message operations
messagesStore.addMessage = function(message) {
  if (!message || !message.id) {
    throw new Error('Message must have an ID');
  }

  const state = messagesStore.getState();
  
  // Keep only last 100 messages
  const newTimeline = [...state.timeline.slice(-99), message];
  
  messagesStore.setState({
    timeline: newTimeline
  });
};

messagesStore.updateMessage = function(id, updates) {
  const state = messagesStore.getState();
  const message = state.timeline.find(msg => msg.id === id);
  
  if (!message) {
    console.warn(`Message with ID ${id} not found`);
    return;
  }

  const updatedMessage = { ...message, ...updates };
  const newTimeline = state.timeline.map(msg => 
    msg.id === id ? updatedMessage : msg
  );

  messagesStore.setState({
    timeline: newTimeline
  });
};

// Removed loadMore functionality since we're not using pagination anymore

// Prevent filter loops and duplicate operations
let isFilteringInProgress = false;
let lastAppliedFilter = null;
let filterDebounceTimer = null;

/**
 * Enhanced DOM filtering implementation
 * Synchronizes store filtering with DOM elements directly
 */
messagesStore.applyFilter = function(filterType) {
  // Early exits to prevent loops and redundant filtering
  if (isFilteringInProgress) return;
  if (!filterType) filterType = 'all';
  if (lastAppliedFilter === filterType) return;
  
  // Clear any previous timer
  if (filterDebounceTimer) clearTimeout(filterDebounceTimer);
  
  // Use debounce to prevent excessive filtering
  filterDebounceTimer = setTimeout(function() {
    // Lock to prevent recursive calls
    isFilteringInProgress = true;
    lastAppliedFilter = filterType;
    
    // Log once per actual filter operation
    console.log(`[MessageStore] Applying filter: ${filterType}`);
    
    // Update store if needed
    const currentState = messagesStore.getState();
    if (currentState.filter !== filterType) {
      messagesStore.setState({ filter: filterType });
    }
    
    // Get message elements
    const messageElements = document.querySelectorAll('.msg-item');
    if (!messageElements.length) {
      console.log('[MessageStore] No message elements found to filter');
      isFilteringInProgress = false;
      return;
    }
    
    // One-time log per filter operation
    console.log(`[MessageStore] Filtering ${messageElements.length} DOM elements`);
    
    // Load the message classifier utils using Promise syntax instead of await
    import('../utils/messageClassifier.js')
      .then(({ applyFilterToElements }) => {
        // Apply the filtering using the shared utility
        const { chatCount, commandCount, otherCount } = applyFilterToElements(messageElements, filterType);
        
        // Update all filter button UI
        const filterButtons = document.querySelectorAll('.timeline-filter-btn');
        filterButtons.forEach(btn => {
          if (btn.getAttribute('data-filter') === filterType) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        });
        
        // Log results and update state
        console.log(`[MessageStore] Filter results - Chat: ${chatCount}, Command: ${commandCount}, Other: ${otherCount}`);
        messagesStore.setState({ lastSyncTime: Date.now() });
        
        // Auto-scroll to the bottom to show latest messages after filtering
        setTimeout(() => {
          const container = document.querySelector('.message-timeline-container');
          if (container) {
            container.scrollTop = container.scrollHeight;
            console.log('[MessageStore] Auto-scrolled to bottom after filtering');
          }
        }, 50);
        
        // Unlock for future filter operations
        isFilteringInProgress = false;
      })
      .catch(error => {
        console.error('[MessageStore] Error using shared message classifier:', error);
        
        // Fall back to the original implementation
        legacyApplyFilter(messageElements, filterType);
      });
      
    // Early return since we're handling everything in the promise chain
    return;
    
  // Legacy fallback implementation for filtering
  function legacyApplyFilter(messageElements, filterType) {
    // Counters for stats
    let chatCount = 0, commandCount = 0, otherCount = 0;
    
    // Apply filtering to each element
    messageElements.forEach(el => {
      const classList = Array.from(el.classList);
      
      // Enhanced message classification
      const isChat = classList.includes('msg-chat') || 
                   classList.includes('msg-user') || 
                   el.querySelector('.msg-role i.fa-user') != null || 
                   (classList.includes('msg-assistant') && !classList.includes('msg-command')) ||
                   (!classList.includes('msg-command') && !classList.includes('msg-system') && 
                    !classList.includes('msg-error') && !classList.includes('msg-thought'));
                   
      const isCommand = classList.includes('msg-command') || 
                      el.querySelector('.msg-type.msg-command') != null;
      
      // Apply visibility based on filter
      if (filterType === 'all') {
        el.style.display = ''; // Show all messages
        
        // Track counts for debugging
        if (isChat) chatCount++;
        else if (isCommand) commandCount++;
        else otherCount++;
      } 
      else if (filterType === 'chat' && isChat) {
        el.style.display = ''; // Show only chat messages
        chatCount++;
      } 
      else if (filterType === 'command' && isCommand) {
        el.style.display = ''; // Show only command messages
        commandCount++;
      } 
      else {
        el.style.display = 'none'; // Hide everything else
      }
    });
    
    // Update all filter button UI
    const filterButtons = document.querySelectorAll('.timeline-filter-btn');
    filterButtons.forEach(btn => {
      if (btn.getAttribute('data-filter') === filterType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    
    // Log results and update state
    console.log(`[MessageStore] Legacy filter results - Chat: ${chatCount}, Command: ${commandCount}, Other: ${otherCount}`);
    messagesStore.setState({ lastSyncTime: Date.now() });
    
    // Auto-scroll to the bottom to show latest messages after filtering
    setTimeout(() => {
      const container = document.querySelector('.message-timeline-container');
      if (container) {
        container.scrollTop = container.scrollHeight;
        console.log('[MessageStore] Auto-scrolled to bottom after filtering');
      }
    }, 50);
    
    // Unlock for future filter operations
    isFilteringInProgress = false;
  }
  }, 100); // Longer debounce (100ms) to prevent loops
  
  // Return immediately while filter runs async
  return;
};

/**
 * Initialize DOM synchronization
 * Sets up event listeners to keep the UI in sync with store changes
 */
messagesStore.initDomSync = function() {
  if (domSyncInitialized) return;
  console.log('[MessageStore] Initializing DOM synchronization');
  
  // Set up click interceptor for all filter buttons
  document.addEventListener('click', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('timeline-filter-btn')) {
      const filterType = e.target.getAttribute('data-filter');
      console.log(`[MessageStore] Intercepted filter button click: ${filterType}`);
      messagesStore.applyFilter(filterType);
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);
  
  // Subscribe to store changes to update DOM accordingly
  messagesStore.subscribe(function(state) {
    if (state.filter && document.querySelectorAll('.msg-item').length > 0) {
      // Re-apply filter when store changes and we have messages in the DOM
      setTimeout(() => messagesStore.applyFilter(state.filter), 0);
    }
  });
  
  // Make globally available for components to use
  window.messagesStore = messagesStore;
  window.MESSAGE_TYPES = MESSAGE_TYPES;
  window.MESSAGE_ROLES = MESSAGE_ROLES;
  
  // Also expose directly on window for components to access
  window.applyMessageFilter = messagesStore.applyFilter;
  
  domSyncInitialized = true;
  console.log('[MessageStore] DOM synchronization initialized');
};

// Initialize DOM sync when document is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', messagesStore.initDomSync);
  } else {
    setTimeout(messagesStore.initDomSync, 0);
  }
}

// For backward compatibility with existing imports
window.messagesStore = messagesStore;
window.MESSAGE_TYPES = MESSAGE_TYPES;

messagesStore.cleanup = function() {
  const state = messagesStore.getState();
  const now = Date.now();
  const cutoff = now - (7 * 24 * 60 * 60 * 1000); // 7 days ago

  const newTimeline = state.timeline.filter(msg => 
    msg.timestamp > cutoff
  );

  messagesStore.setState({ 
    timeline: newTimeline
  });
};

messagesStore.createMessage = function(props) {
  if (!props || !props.role || !props.content) {
    throw new Error('Message must have role and content');
  }

  const { role, content, type = 'chat', id = `msg-${Date.now()}` } = props;
  return {
    id,
    role,
    type,
    content,
    timestamp: Date.now(),
    error: null,
    metadata: {}
  };
};

// Export the store and types
export { messagesStore, MESSAGE_TYPES };

// Export the combined object as default
export default {
  ...messagesStore,
  MESSAGE_TYPES
};
