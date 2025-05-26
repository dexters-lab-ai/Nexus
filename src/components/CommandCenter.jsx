/**
 * Command Center Component
 * Centralized input area for chat messages and commands
 */

import { eventBus } from '../utils/events.js';
import { uiStore, messagesStore, tasksStore } from '../store/index.js';
import { cancelTask, createTask } from '../api/tasks.js';
import Button from './base/Button.jsx';
import Dropdown from './base/Dropdown.jsx';
import api from '../utils/api.js';
import NeuralFlow from '../utils/NeuralFlow.js';

// Tab types
export const TAB_TYPES = {
  NLI: 'nli',
  ACTIVE_TASKS: 'active-tasks',
  MANUAL: 'manual',
  REPETITIVE: 'repetitive',
  SCHEDULED: 'scheduled'
};

// Buffer for assembling complete function call arguments per task
const functionCallBuffers = {};

/**
 * Create a command center component
 * @param {Object} props - Component properties
 * @returns {HTMLElement} Command center container
 */
export function CommandCenter(props = {}) {
  const {
    containerId = 'command-center',
    initialTab = TAB_TYPES.NLI
  } = props;

  // Map of per-task NeuralFlow visualization instances
  const neuralFlows = {};
  
  // Map to track which tasks are initiated from NLI (chat) for special handling
  const taskNliMapping = {};

  // CRITICAL: No more separate neural canvas section!
  // Following old code - all thought bubbles go directly in the message timeline
  // This gets rid of the problem where canvas is rendered outside the message timeline
  const getNeuralFlowContainer = () => {
    // The ONLY container we should use is the message timeline container
    return document.querySelector('.message-timeline-container');
  };
  
  // Map to track which tasks already have a neural flow canvas
  // This prevents duplicate canvases for the same task
  const taskCanvasMapping = {};
  
  // Create component container
  const container = document.createElement('div');
  container.className = 'command-center';
  if (containerId) container.id = containerId;
  
  // No global styles - all styles applied inline

  // Create card container
  const card = document.createElement('div');
  card.className = 'command-center-card';
  card.id = 'task-input-card';

  // Initialize messages store with loading state
  messagesStore.setState({ timeline: [], isLoading: true });
  
  /**
   * Load message history directly from DB - no temporary storage
   * Ensures only the most recent messages appear in the chat timeline
   * @param {Set} preserveTaskIds - Optional set of task IDs to preserve during refresh
   */
  async function loadMessageHistory(preserveTaskIds = new Set()) {
    try {
      messagesStore.setState({ isLoading: true });
      console.log('[DEBUG] Loading latest message history from DB...');
      
      // Save existing thought bubbles before refresh
      const existingBubbles = new Map();
      if (preserveTaskIds.size > 0) {
        document.querySelectorAll('.thought-bubble[data-task-id]').forEach(bubble => {
          const taskId = bubble.getAttribute('data-task-id');
          if (preserveTaskIds.has(taskId)) {
            existingBubbles.set(taskId, bubble.cloneNode(true));
          }
        });
      }
      
      // Use current timestamp to ensure we only get recent messages (last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      const timestamp = oneDayAgo.toISOString();
      
      // Direct fetch from DB with time filter and proper sorting
      const response = await fetch(`/api/messages/history?limit=20&since=${timestamp}&sort=desc`);
      
      if (!response.ok) {
        throw new Error(`DB fetch failed: ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('[DEBUG] DB fetch result:', data);
      
      // Clear any cached messages from memory and use only DB results
      sessionStorage.removeItem('messageCache');
      localStorage.removeItem('messageHistory');
      
      // Get messages array from response
      const messagesArray = data.items || data.messages || [];
      
      if (Array.isArray(messagesArray) && messagesArray.length > 0) {
        // Filter valid messages and ensure freshness (newer than yesterday)
        const yesterday = Date.now() - (24 * 60 * 60 * 1000);
        const validMessages = messagesArray.filter(msg => 
          msg && typeof msg === 'object' && 
          msg.role && msg.content && msg.timestamp &&
          new Date(msg.timestamp).getTime() > yesterday
        );
        
        console.log(`[DEBUG] Found ${validMessages.length} valid recent messages out of ${messagesArray.length} total`);
        
        // Sort with newest messages at the bottom
        const sortedMessages = [...validMessages].sort((a, b) => {
          return new Date(a.timestamp) - new Date(b.timestamp);
        });
        
        // Clean replacement of timeline
        messagesStore.setState({ 
          timeline: sortedMessages,
          isLoading: false 
        });
        
        // Restore preserved task bubbles
        setTimeout(() => {
          const timeline = document.querySelector('.message-timeline-container');
          if (!timeline) return;
          
          // Add back preserved bubbles
          preserveTaskIds.forEach(taskId => {
            // First remove any duplicates
            const existingElements = timeline.querySelectorAll(`.thought-bubble[data-task-id="${taskId}"]`);
            existingElements.forEach(el => el.remove());
            
            // Then add the preserved bubble
            if (existingBubbles.has(taskId)) {
              timeline.appendChild(existingBubbles.get(taskId));
            }
          });
          
          // Robust scroll to bottom
          scrollToLatestMessage(true);
        }, 100);
      } else {
        console.warn('[DEBUG] No messages found in DB fetch');
        messagesStore.setState({ isLoading: false });
      }
    } catch (error) {
      console.error('Error loading message history:', error);
      messagesStore.setState({ isLoading: false });
      
      // Show notification to user only on initial load failures
      eventBus.emit('notification', {
        message: 'Failed to load message history. Please refresh to try again.',
        type: 'error',
        duration: 5000
      });
    }
  }
  
  /**
   * Helper function to scroll the message container to the bottom
   */
  /**
   * Robust function to scroll message container to bottom
   * Uses multiple selectors and redundancy to ensure we find the right container
   */
  function scrollToLatestMessage(immediate = false) {
    // Try multiple selector patterns to find the container (from most to least specific)
    const container = 
      document.querySelector('#command-center .message-timeline-container') || 
      document.querySelector('.message-timeline-container') ||
      document.querySelector('.message-timeline') ||
      document.querySelector('.content-wrapper .message-timeline');
    
    if (!container) {
      console.warn('[DEBUG] Message timeline container not found yet, will retry later');
      return false; // Return false to indicate scroll didn't happen
    }
    
    try {
      // Get the last message element for a more focused scroll
      const lastMessage = container.querySelector('.thought-bubble:last-child, .message-item:last-child');
      
      // Single-pass scrolling with all methods
      // First strategy: Direct scrollTop assignment
      container.scrollTop = container.scrollHeight;
      
      // Second strategy: ScrollIntoView for the last message
      if (lastMessage) {
        lastMessage.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth', block: 'end' });
      }
      
      // Third strategy: Use scrollTo API 
      container.scrollTo({
        top: container.scrollHeight,
        behavior: immediate ? 'auto' : 'smooth'
      });
      
      return true; // Return true to indicate scroll was successful
    } catch (err) {
      console.warn('[DEBUG] Error during scroll:', err.message);
      return false;
    }
  }
  
  // Set up observer to watch for changes to the message container
  // This ensures we auto-scroll when new messages are added
  setTimeout(() => {
    const timelineContainer = document.querySelector('.message-timeline-container');
    if (timelineContainer) {
      const observer = new MutationObserver(mutations => {
        // Look for additions that are actual message elements
        const relevantMutations = mutations.some(mutation => {
          return Array.from(mutation.addedNodes).some(node => 
            node.nodeType === 1 && 
            (node.classList.contains('thought-bubble') || 
             node.classList.contains('bubble-card') ||
             node.classList.contains('message'))
          );
        });
        
        if (relevantMutations) {
          scrollToLatestMessage();
        }
      });
      
      // Observe for new children and changes to existing children
      observer.observe(timelineContainer, { 
        childList: true, 
        subtree: true,
        attributes: true, 
        attributeFilter: ['class', 'style'] 
      });
      
      // Scroll on initial setup
      scrollToLatestMessage(true);
    }
  }, 300);  // Short delay to ensure DOM is ready
  
  // Active task IDs to preserve during refreshes
  const activeTaskIds = new Set();
  
  // Load message history when component initializes
  window.addEventListener('DOMContentLoaded', () => {
    loadMessageHistory();
  });
  
  // Progressive scroll attempts to catch the timeline when it becomes available
  // Uses a smarter retry pattern with exponential backoff
  let scrollSuccess = false;
  const scrollAttempts = [100, 300, 600, 1000, 2000, 4000];
  
  // Create sequential attempts that only run if previous attempts failed
  scrollAttempts.forEach((delay, index) => {
    setTimeout(() => {
      if (!scrollSuccess) {
        // Only try if we haven't succeeded yet
        const result = scrollToLatestMessage(true);
        if (result) {
          scrollSuccess = true;
          console.log(`[DEBUG] Scroll succeeded on attempt ${index + 1}`);
        } else if (index === scrollAttempts.length - 1) {
          console.warn('[DEBUG] All scroll attempts completed, some may have failed');
        }
      }
    }, delay);
  });
  
  // Use IntersectionObserver for an efficient way to detect when
  // the timeline is actually visible before attempting to scroll
  const contentObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Timeline is now visible in viewport, scroll to bottom
          const success = scrollToLatestMessage(true);
          if (success) {
            console.log('[DEBUG] Scroll triggered by intersection observer');
          }
        }
      });
    }, {threshold: 0.1}
  );
  
  // Try to observe multiple potential timeline selectors
  setTimeout(() => {
    // Try multiple selectors to find the timeline
    const selectors = [
      '#command-center .message-timeline-container',
      '.message-timeline-container',
      '.message-timeline',
      '.content-wrapper .message-timeline'
    ];
    
    let observedElement = false;
    
    // Try each selector
    selectors.forEach(selector => {
      if (!observedElement) {
        const timeline = document.querySelector(selector);
        if (timeline) {
          contentObserver.observe(timeline);
          console.log(`[DEBUG] Timeline observer attached to: ${selector}`);
          observedElement = true;
          
          // Force an initial scroll once we find the element
          scrollToLatestMessage(true);
        }
      }
    });
    
    if (!observedElement) {
      console.warn('[DEBUG] Could not find timeline to observe. Will retry.');
      // Try again later if we couldn't find it
      setTimeout(() => {
        const timeline = document.querySelector('.message-timeline-container');
        if (timeline) {
          contentObserver.observe(timeline);
          scrollToLatestMessage(true);
        }
      }, 1000);
    }
  }, 500);
  
  // Single resize handler with debounce to avoid duplicate handlers
  window.addEventListener('resize', debounce(() => scrollToLatestMessage(true), 200));
  
  // Helper function to limit resize event frequency
  function debounce(func, wait) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }
  
  // Add a MutationObserver to detect when new content is added to the timeline
  setTimeout(() => {
    const timeline = document.querySelector('.message-timeline-container');
    if (timeline) {
      // Only watch for childList changes (new messages added)
      const observer = new MutationObserver(() => scrollToLatestMessage());
      observer.observe(timeline, { childList: true });
    }
  }, 300);
  
  // DISABLED: Periodic message timeline refresh - causing disappearing tasks
  // The initial load will be sufficient, and new messages will be added via WebSocket
  // We won't refresh the timeline automatically to prevent disrupting active tasks
  
  // Keeping this code commented for reference:
  /*
  setInterval(() => {
    // Before refreshing, store active task IDs
    document.querySelectorAll('.thought-bubble[data-task-id]').forEach(bubble => {
      const taskId = bubble.getAttribute('data-task-id');
      if (taskId) activeTaskIds.add(taskId);
    });
    
    // Pass the active task IDs to the load function to preserve them
    loadMessageHistory(activeTaskIds);
  }, 60000); // Refresh every minute
  */
  
  // Add cleanup function
  const originalDestroy = container.destroy;
  container.destroy = () => {
    // No need to clear message refresh interval since it's disabled
    // Just ensure websocket is cleaned up
    if (ws) {
      try {
        ws.close(1000);
      } catch (e) {
        console.warn('Error closing websocket:', e);
      }
      ws = null;
    }
    
    if (typeof originalDestroy === 'function') {
      originalDestroy();
    }
  };

  // Create card title
  const cardTitle = document.createElement('h3');
  cardTitle.className = 'card-title';
  cardTitle.innerHTML = '<i class="fas fa-terminal"></i> Command Center';
  
  // Add tooltip
  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip';
  tooltip.innerHTML = `
    <span class="guide-dot">?</span>
    <span class="tooltip-text">Enter natural language commands below or use the other tabs for fixed input modes.</span>
  `;
  cardTitle.appendChild(tooltip);
  
  card.appendChild(cardTitle);

  // Create tab buttons
  const tabButtons = document.createElement('div');
  tabButtons.className = 'tab-buttons';
  tabButtons.id = 'task-type-tabs';

  // Define tabs
  const tabs = [
    { id: TAB_TYPES.NLI, label: 'Chat', icon: 'fa-comments' },
    { id: TAB_TYPES.MANUAL, label: 'General Task', icon: 'fa-tasks' },
    { id: TAB_TYPES.REPETITIVE, label: 'Repetitive', icon: 'fa-sync' },
    { id: TAB_TYPES.SCHEDULED, label: 'Scheduled', icon: 'fa-calendar' }
  ];

  // Current active tab
  let activeTab = initialTab;

  // WebSocket State
  let ws = null;
  let wsConnected = false;
  let connecting = false;
  let reconnectAttempts = 0;
  let userId = null; // Will be fetched

  // WebSocket Constants
  const WS_URL = `ws://${window.location.host}/ws`;
  const RETRY_DELAY = 5000; // 5 seconds

  // --- User ID Management Helper with /api/whoami sync and force sync on load ---
  async function syncUserIdWithBackend() {
    try {
      const resp = await fetch('/api/whoami');
      const data = await resp.json();
      if (data.userId) {
        localStorage.setItem('userId', data.userId);
        sessionStorage.setItem('userId', data.userId);
        console.debug('[DEBUG] syncUserIdWithBackend: Synced userId from /api/whoami:', data.userId);
        initWebSocket(data.userId);
        return data.userId;
      }
    } catch (err) {
      console.warn('[DEBUG] syncUserIdWithBackend: Failed to sync with /api/whoami', err);
    }
    // fallback to old logic
    return getOrSyncUserId();
  }

  // --- On app load: force userId sync before anything else ---
  (async () => {
    const userId = await syncUserIdWithBackend();
    console.debug('[DEBUG] App load: userId after sync', userId);
    // WebSocket is initialized in syncUserIdWithBackend, no need to init twice
  })();

  // --- User ID Management Helper with /api/whoami sync ---
  async function getOrSyncUserId() {
    let userId = localStorage.getItem('userId');
    if (userId) {
      console.debug('[DEBUG] getOrSyncUserId: Found userId in localStorage:', userId);
      return userId;
    }
    // Try to get from sessionStorage (if backend writes it)
    userId = sessionStorage.getItem('userId');
    if (userId) {
      localStorage.setItem('userId', userId);
      console.debug('[DEBUG] getOrSyncUserId: Synced userId from sessionStorage:', userId);
      return userId;
    }
    // Try to sync with backend via /api/whoami
    try {
      const resp = await fetch('/api/whoami');
      const data = await resp.json();
      if (data.userId) {
        userId = data.userId;
        localStorage.setItem('userId', userId);
        sessionStorage.setItem('userId', userId);
        console.debug('[DEBUG] getOrSyncUserId: Synced userId from /api/whoami:', userId);
        return userId;
      }
    } catch (err) {
      console.warn('[DEBUG] getOrSyncUserId: Failed to sync with /api/whoami', err);
    }
    // If not found, create a guest userId
    userId = 'guest_' + Date.now() + '_' + Math.floor(Math.random()*100000);
    localStorage.setItem('userId', userId);
    sessionStorage.setItem('userId', userId);
    console.debug('[DEBUG] getOrSyncUserId: Created guest userId:', userId);
    return userId;
  }

  // --- WebSocket Functions (adapted from UnifiedCommandSection) ---
  const initWebSocket = (currentUserId) => {
    // Skip if already connected or in-flight
    if (connecting || (ws && ws.readyState === WebSocket.OPEN)) {
      console.debug('[DEBUG] CommandCenter: already connected or connecting – skipping init.');
      return;
    }
    connecting = true;
    console.log('[DEBUG] CommandCenter: initWebSocket called with userId:', currentUserId);
    if (!currentUserId) {
      console.error('WebSocket: Cannot initialize without userId.');
      return; // Don't attempt if no userId
    }
    userId = currentUserId; // Store userId for potential reconnects

    // Close existing connection if any before creating a new one
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      console.log('WebSocket: Closing existing connection before reconnecting.');
      ws.close(1000, 'Reinitializing connection');
    }

    const wsUrl = `${WS_URL}?userId=${encodeURIComponent(userId)}`;
    console.log(`[DEBUG] CommandCenter: Attempting WebSocket connection to: ${wsUrl}`);
    try {
      ws = new WebSocket(wsUrl);
      console.log('[DEBUG] CommandCenter: WebSocket object created.');
    } catch (e) {
      connecting = false;
      console.error('[DEBUG] CommandCenter: Error creating WebSocket object:', e);
      return; // Stop if creation fails
    }

    ws.onopen = () => {
      console.log(`[DEBUG] CommandCenter: WebSocket ONOPEN event for userId=${userId}`);
      connecting = false;
      wsConnected = true;
      reconnectAttempts = 0; // Reset attempts on successful connection

      // Optional: Send any queued messages if needed
      // flushUnsentMessages(userId);
    };

    ws.onmessage = (event) => {
      try {
        // Validate event and data
        if (!event || !event.data) {
          console.error('[WebSocket] Invalid event data:', event);
          return;
        }

        // Parse message safely
        const message = JSON.parse(event.data);
        console.log('WebSocket: Received message:', message);
        
        // Declare event handled flag at proper scope
        let eventHandled = false;

        // Process task steps from WebSocket events
        if (message.event === 'functionCallPartial') {
          // Silenced individual partial logs per user request
          functionCallBuffers[message.taskId] = (functionCallBuffers[message.taskId] || '') + message.partialArgs;
          let args;
          try { 
            args = JSON.parse(functionCallBuffers[message.taskId]); 
          } catch { 
            return; 
          }
          delete functionCallBuffers[message.taskId];
          
          // This handler ONLY handles canvas visualization, not message timeline updates
          const timelineEl = document.querySelector('.message-timeline-container');
          if (timelineEl) {
            // Look for existing THOUGHT bubble for this task with the CORRECT CLASSES
            // CRITICAL: Use the exact classes that MessageTimeline.jsx creates
            const thoughtBubble = document.querySelector(`.msg-item.msg-thought[data-task-id="${message.taskId}"]`) ||
                               document.querySelector(`.msg-item.msg-thought[data-message-id="thought-${message.taskId}"]`);
            
            // Find or create the neural canvas bubble (separate from the message bubble)
            let canvasBubble = timelineEl.querySelector(`.thought-bubble[data-task-id="${message.taskId}"]`);
            
            if (!canvasBubble) {
              // Create new canvas bubble if none exists
              console.log(`[DEBUG] Creating new canvas bubble for task ${message.taskId}`);
              canvasBubble = document.createElement('div');
              canvasBubble.className = 'thought-bubble creative-bubble typing-bubble';
              canvasBubble.setAttribute('data-task-id', message.taskId);
              canvasBubble.setAttribute('data-message-id', `neural-${message.taskId}`);
              canvasBubble.setAttribute('data-created', new Date().toISOString());
              
              // Insert after the thought bubble if it exists, otherwise at the end of timeline
              if (thoughtBubble) {
                thoughtBubble.insertAdjacentElement('afterend', canvasBubble);
              } else {
                timelineEl.appendChild(canvasBubble);
              }
              
              // CRITICAL: First ensure the bubble is ready for the NeuralFlow
              canvasBubble.innerHTML = '';
              canvasBubble.style.backgroundColor = 'rgba(20, 30, 60, 0.4)';
              canvasBubble.style.border = '1px solid rgba(100, 130, 255, 0.4)';
              canvasBubble.style.borderRadius = '8px';
              canvasBubble.style.padding = '10px';
              canvasBubble.style.margin = '10px 0';
              
              // Create a title element for the canvas
              const titleEl = document.createElement('div');
              titleEl.className = 'thought-title';
              titleEl.innerHTML = `<em>Neural Canvas:</em> Task ${message.taskId.substring(0, 8)}...`;
              titleEl.style.fontWeight = 'bold';
              titleEl.style.marginBottom = '10px';
              canvasBubble.appendChild(titleEl);
              
              // Create a container for the neural flow
              const flowContainer = document.createElement('div');
              flowContainer.className = 'neural-flow-container';
              flowContainer.style.width = '100%';
              flowContainer.style.height = 'calc(100% - 30px)';
              canvasBubble.appendChild(flowContainer);
              
              // Create the neural flow here explicitly
              try {
                console.log(`[DEBUG] Creating neural flow for task ${message.taskId}`);
                neuralFlows[message.taskId] = new NeuralFlow(flowContainer);
                console.log(`[DEBUG] Successfully created neural flow for task ${message.taskId}`);
              } catch (e) {
                console.error(`[ERROR] Failed to create NeuralFlow for task ${message.taskId}:`, e);
                flowContainer.innerHTML = '<div style="color:red;">Error initializing neural canvas</div>';
              }
            } else {
              // Make sure typing-bubble class is applied if missing
              if (!canvasBubble.classList.contains('typing-bubble')) {
                canvasBubble.classList.add('typing-bubble');
              }
            }
            
            // Get existing step count for sizing
            const existingSteps = tasksStore.getStepLogs(message.taskId) || [];
            const stepCount = existingSteps.length;
            
            // Set step count attribute for tracking
            canvasBubble.setAttribute('data-step-count', stepCount.toString());
            
            // Remove any existing size classes first
            canvasBubble.classList.remove('size-small', 'size-medium', 'size-large', 'size-xlarge');
            
            // Set appropriate size based on step count with 350px increments
            if (stepCount <= 3) {
              canvasBubble.classList.add('size-small');
              canvasBubble.style.height = '350px';
            } else if (stepCount <= 7) {
              canvasBubble.classList.add('size-medium');
              canvasBubble.style.height = '600px';
            } else if (stepCount <= 12) {
              canvasBubble.classList.add('size-large');
              canvasBubble.style.height = '800px';
            } else {
              canvasBubble.classList.add('size-xlarge');
              canvasBubble.style.height = '1000px';
            }
            
            // Make sure the canvas is properly initialized
            canvasBubble.style.width = '100%';
            canvasBubble.style.position = 'relative';
            canvasBubble.style.display = 'block';
            canvasBubble.style.zIndex = '1';
            
            // Force bubble to be unconstrained by parent container
            canvasBubble.style.maxHeight = 'none';
            canvasBubble.style.overflow = 'hidden';
            
            // Explicitly remove any parent container constraints
            const parent = canvasBubble.parentElement;
            if (parent) {
              parent.style.minHeight = canvasBubble.style.height;
              parent.style.height = 'auto';
            }
            
            console.log(`[CANVAS RESIZE] Task ${message.taskId}, Steps: ${stepCount}, Height: ${canvasBubble.style.height}`);
            
            // Check if we already have the content elements
            let titleEl = canvasBubble.querySelector('.thought-title');
            let preEl = canvasBubble.querySelector('.typing-content');
            
            // If content doesn't exist yet, create the structure
            if (!titleEl || !preEl) {
              // Clear only if we need to create new elements
              canvasBubble.innerHTML = '';
              
              // Add the thought title and typing content container
              canvasBubble.innerHTML = `<div class="thought-title"><em>Function:</em> ${message.functionName}</div><pre class="typing-content thought-text"></pre>`;
              
              // Get references to the newly created elements
              titleEl = canvasBubble.querySelector('.thought-title');
              preEl = canvasBubble.querySelector('.typing-content');
            } else {
              // Just update the title if it already exists
              titleEl.innerHTML = `<em>Function:</em> ${message.functionName}`;
            }
            
            // Set up the typing animation effect for the function call arguments
            const text = JSON.stringify(args, null, 2);
            let i = 0; 
            const ti = setInterval(() => { 
              preEl.textContent += text.charAt(i++); 
              canvasBubble.scrollTop = canvasBubble.scrollHeight; 
              if (i >= text.length) clearInterval(ti); 
            }, 20);
            
            try {
              // Ensure bubble is in thinking state for visualization
              canvasBubble.classList.add('typing-bubble', 'typing', 'thinking');
              
              // Create or update the neural flow visualization
              if (!neuralFlows[message.taskId]) {
                console.log(`Creating new NeuralFlow for task ${message.taskId}`);
                neuralFlows[message.taskId] = new NeuralFlow(canvasBubble);
              }
              
              // Find the flow container for adding nodes
              const flowContainer = canvasBubble.querySelector('.neural-flow-container') || canvasBubble;
              
              // Create a clean, formatted node text
              let nodeText = message.functionName;
              let parsedArgs = null;
              
              try {
                // Try to parse arguments to display nicely
                parsedArgs = JSON.parse(message.partialArgs);
                const formattedArgs = JSON.stringify(parsedArgs, null, 0).substring(0, 60);
                nodeText = `${message.functionName}(${formattedArgs}${formattedArgs.length > 60 ? '...' : ''})`;
              } catch (e) {
                // If can't parse, use simple truncation
                nodeText = `${message.functionName}(${message.partialArgs.substring(0, 50)}${message.partialArgs.length > 50 ? '...' : ''})`;
              }
              
              // Add the node to the visualization
              try {
                if (typeof neuralFlows[message.taskId]?.addNode === 'function') {
                  console.log(`[DEBUG] Adding node to neural flow: ${nodeText}`);
                  neuralFlows[message.taskId].addNode(nodeText);
                } else {
                  // Recreate the neural flow if it's corrupted
                  console.warn(`NeuralFlow for task ${message.taskId} is invalid, recreating...`);
                  neuralFlows[message.taskId] = new NeuralFlow(flowContainer);
                  neuralFlows[message.taskId].addNode(nodeText);
                }
              } catch (nodeError) {
                console.error(`[ERROR] Failed to add node to neural flow: ${nodeError}`);
                // Add a simple fallback visualization of the node
                const fallbackNode = document.createElement('div');
                fallbackNode.className = 'neural-node-fallback';
                fallbackNode.textContent = nodeText;
                fallbackNode.style.margin = '5px';
                fallbackNode.style.padding = '8px';
                fallbackNode.style.backgroundColor = 'rgba(70, 90, 160, 0.4)';
                fallbackNode.style.borderRadius = '4px';
                flowContainer.appendChild(fallbackNode);
              }
            } catch (error) {
              console.error(`Error updating canvas visualization for ${message.taskId}:`, error);
            }
          }
          
          // Store the function call in task steps - this is for record-keeping
          tasksStore.addStepLog(message.taskId, {
            type: 'functionCall',
            functionName: message.functionName,
            args: args, 
            timestamp: new Date().toISOString()
          });
          
          renderStepLogs(message.taskId);
          return;
        }

        // Handle taskComplete events from WebSocket
        if (message.event === 'taskComplete') {
          console.log('[DEBUG] taskComplete WebSocket event received, routing to handler');
          // Call the same handler that SSE events use
          handleTaskComplete(message);
          return; // Stop processing this message
        }

        // Handle NLI response events (when assistant responses are shown)
        if (message.event === 'nliResponsePersisted') {
          console.log('[DEBUG] nliResponsePersisted event received - transitioning any active thought messages');
          
          // Find all thought messages and update their appearance
          document.querySelectorAll('.msg-thought-item').forEach(thoughtMessage => {
            console.log('[DEBUG] Transforming thought message:', thoughtMessage);
            
            // Remove inline styles that make the message look like it's thinking
            thoughtMessage.style.opacity = '1';
            thoughtMessage.style.fontStyle = 'normal';
            
            // Add a class to indicate it's complete
            thoughtMessage.classList.add('thought-complete');
            
            // Find the message type label and update it
            const msgTypeEl = thoughtMessage.querySelector('.msg-type.msg-thought');
            if (msgTypeEl) {
              msgTypeEl.textContent = 'Thought';
              msgTypeEl.classList.add('complete');
            }
          });
        }
        
        // Handle thought complete events for commands
        // Handle incremental thought updates (streaming thoughts to original thought bubble)
        if (message.event === 'thoughtUpdate') {
          console.log('[Event] thoughtUpdate', message);
          // Use exactly the attribute names from the logs
          const tid = message.taskId; // Logs show this exact attribute name
          const thought = message.thought; // Logs show this exact attribute name
          
          if (!tid || !thought) {
            console.warn('thoughtUpdate message missing taskId or thought content:', message);
            return;
          }
          
          // Look for an active thought stream in our new collection
          // This supports multiple parallel thought streams
          if (window.activeThoughtStreams && window.activeThoughtStreams[tid]) {
            const stream = window.activeThoughtStreams[tid];
            
            // CRITICAL FIX: Instead of appending to the buffer, replace it with the newest content
            // This ensures we only display the most recent step info in a minimal way
            stream.buffer = thought;
            stream.lastUpdated = Date.now();
            
            // Extract just the step information
            const stepMatch = stream.buffer.match(/Executing\s+step\s+\d+:\s*(.+)/i) || 
                             stream.buffer.match(/Step\s+\d+[^\n]*/i);
            
            // If we don't have a step match, don't render anything to prevent duplicates
            if (!stepMatch) {
              stream.element.innerHTML = '';
              return;
            }
            
            let displayContent = stepMatch[0];
            
            // Clean up the display content
            displayContent = displayContent
              .replace(/^Executing\s+step\s+\d+:?\s*/i, '') // Remove 'Executing step X:' prefix
              .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove markdown bold
              .replace(/\*([^*]+)\*/g, '$1') // Remove markdown italic
              .trim();
            
            // Get the step number
            const stepNumberMatch = stream.buffer.match(/\d+/);
            const stepNumber = stepNumberMatch ? stepNumberMatch[0] : '?';
            
            // Update the content with clean step info
            if (stream.element) {
              // Clear any existing content first to prevent duplicates
              stream.element.innerHTML = '';
              
              // Create a single clean step display
              const stepDiv = document.createElement('div');
              stepDiv.className = 'step-message';
              stepDiv.style.cssText = 'font-size: 0.9em; padding: 4px 0;';
              
              stepDiv.innerHTML = `
                <div class="step-header" style="display: flex; align-items: center;">
                  <div class="step-number-badge" style="background: linear-gradient(135deg, var(--theme-primary-color), var(--theme-secondary-color)); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 8px; font-size: 0.8rem;">
                    ${stepNumber}
                  </div>
                  <div class="step-title" style="font-weight: 500; font-size: 0.9rem; color: #ffffff;">
                    ${displayContent}
                  </div>
                </div>
              `;
              
              stream.element.appendChild(stepDiv);
              
              // Auto-scroll to bottom
              stream.element.scrollTop = stream.element.scrollHeight;
              
              // Make sure the container is visible
              const container = stream.element.closest('.msg-item');
              if (container) {
                container.style.display = 'block';
                container.style.opacity = '1';
              }
            }
            
            console.log(`[thoughtUpdate] Updated thought stream for task ${tid}`);
          } else {
            console.warn(`[thoughtUpdate] No active thought stream found for task ${tid}`);
            
            // Try to find or create a container
            try {
              // Check if we need to create a new container
              const isNli = sessionStorage.getItem(`nli-task-${tid}`) === 'true';
              const { container, contentDiv } = createThoughtContainer(tid, isNli);
              
              const messageTimeline = document.querySelector('.message-timeline-container');
              if (messageTimeline) {
                // Add to timeline
                messageTimeline.appendChild(container);
                
                // Initialize the stream
                if (!window.activeThoughtStreams) window.activeThoughtStreams = {};
                window.activeThoughtStreams[tid] = {
                  element: contentDiv,
                  buffer: thought, // Start with this thought
                  taskId: tid,
                  isNli: isNli,
                  lastUpdated: Date.now()
                };
                
                // Extract just the step information for the initial thought
                const stepMatch = thought.match(/Executing\s+step\s+\d+:\s*(.+)/i) || 
                                 thought.match(/Step\s+\d+[^\n]*/i);
                
                // If we don't have a step match, don't render anything to prevent duplicates
                if (!stepMatch) {
                  contentDiv.innerHTML = '';
                  return;
                }
                
                let displayContent = stepMatch[0];
                
                // Clean up the display content
                displayContent = displayContent
                  .replace(/^Executing\s+step\s+\d+:?\s*/i, '') // Remove 'Executing step X:' prefix
                  .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove markdown bold
                  .replace(/\*([^*]+)\*/g, '$1') // Remove markdown italic
                  .trim();
                
                // Get the step number
                const stepNumberMatch = thought.match(/\d+/);
                const stepNumber = stepNumberMatch ? stepNumberMatch[0] : '?';
                
                // Clear any existing content first to prevent duplicates
                contentDiv.innerHTML = '';
                
                // Create a single clean step display
                const stepDiv = document.createElement('div');
                stepDiv.className = 'step-message';
                stepDiv.style.cssText = 'font-size: 0.9em; padding: 4px 0;';
                
                stepDiv.innerHTML = `
                  <div class="step-header" style="display: flex; align-items: center;">
                    <div class="step-number-badge" style="background: linear-gradient(135deg, var(--theme-primary-color), var(--theme-secondary-color)); color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 8px; font-size: 0.8rem;">
                      ${stepNumber}
                    </div>
                    <div class="step-title" style="font-weight: 500; font-size: 0.9rem; color: #ffffff;">
                      ${displayContent}
                    </div>
                  </div>
                `;
                
                contentDiv.appendChild(stepDiv);
                
                console.log(`[thoughtUpdate] Created new thought stream for task ${tid}`);
              }
            } catch (err) {
              console.error('[thoughtUpdate] Error creating thought container:', err);
            }
          }
          
          // Stop event propagation - we're handling this thought update in the correct container now
          eventHandled = true;
          return;
        }
        
        if (message.event === 'thoughtComplete') {
          console.debug('[DEBUG] WS thoughtComplete:', message.task_id);
          const tid = message.task_id || message.taskId;
          const thoughtContent = message.text || message.thought || message.content || message.thoughtContent || message.message;
          
          // Check if we have an active thought stream for this task
          const hasActiveStream = window.activeThoughtStreams && window.activeThoughtStreams[tid];
          
          // Flag to determine if this is an NLI task
          const isNliTask = sessionStorage.getItem(`nli-task-${tid}`) === 'true' || 
                         (hasActiveStream && window.activeThoughtStreams[tid].isNli);
          
          // Store in message history as system message
          if (thoughtContent && tid) {
            // Generate a more unique ID with timestamp and random string
            const generateId = () => {
              return `thought-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            };
            
            const historyItem = {
              id: generateId(),
              role: 'assistant', 
              type: 'thought',
              content: thoughtContent,
              task_id: tid,
              timestamp: Date.now()
            };
            try {
              messagesStore.addMessage(historyItem);
            } catch (err) {
              console.error('Error adding message to history:', err);
            }
          }
          
          // CRITICAL: First use our active thought streams rather than searching DOM
          let thoughtElement = null;
          let thoughtContainer = null;
          
          // Check if we have an active stream first - this is our preferred approach
          if (hasActiveStream) {
            const stream = window.activeThoughtStreams[tid];
            thoughtElement = stream.element;
            thoughtContainer = thoughtElement.closest('.msg-item');
            console.log('[thoughtComplete] Found active thought stream to update for task:', tid);
          } else {
            // Fallback: search in DOM as a last resort
            console.log('[thoughtComplete] No active stream found, searching DOM for task:', tid);
            
            // First try using data attributes
            thoughtContainer = document.querySelector(`.msg-thought-item[data-task-id="${tid}"]`) ||
                           document.querySelector(`.msg-thought[data-task-id="${tid}"]:not(.task-complete-card)`) ||
                           document.querySelector(`[data-message-id="thought-${tid}"]`);
            
            if (!thoughtContainer && isNliTask) {
              // For NLI tasks with no container, do a more aggressive search
              const allCards = document.querySelectorAll('.msg-item');
              for (const card of allCards) {
                if (card.textContent.includes('THINKING...')) {
                  thoughtContainer = card;
                  // Claim this card if found
                  card.setAttribute('data-task-id', tid);
                  card.setAttribute('data-message-id', `thought-${tid}`);
                  break;
                }
              }
            }
            
            // Find the content element if we found a container
            if (thoughtContainer) {
              thoughtElement = thoughtContainer.querySelector('.msg-content');
              if (!thoughtElement) {
                thoughtElement = document.createElement('div');
                thoughtElement.className = 'msg-content';
                thoughtElement.style.maxHeight = '200px';
                thoughtElement.style.overflowY = 'auto';
                thoughtContainer.appendChild(thoughtElement);
              }
            }
          }
          
          // CRITICAL: Skip task completion cards
          if (thoughtContainer && thoughtContainer.classList.contains('task-complete-card')) {
            console.log('[thoughtComplete] Skipping task-complete-card');
            thoughtContainer = null;
            thoughtElement = null;
          }
          
          // For NLI tasks, NEVER create a new container during thoughtComplete - it causes unwanted movement
          // Only create new containers for direct tasks or if explicitly required
          if (!thoughtContainer || !thoughtElement) {
            // Check if this is an NLI task
            const isNliTaskComplete = [
              // Check for explicit NLI flag
              isNliTask === true,
              // Check session storage
              sessionStorage.getItem(`nli-task-${tid}`) === 'true',
              // Check task ID pattern
              tid && (tid.includes('nli') || tid.includes('assistant')),
            ].some(check => check === true);
            
            if (!isNliTaskComplete) {
              // ONLY for direct tasks, create a new container
              console.log('[thoughtComplete] Creating new thought container for completed thought (direct task)');
              const { container, contentDiv } = createThoughtContainer(tid, false);
              thoughtContainer = container;
              thoughtElement = contentDiv;
              
              // Add to timeline - critical to use message-timeline-container, not message-timeline
              const messageTimeline = document.querySelector('.message-timeline-container');
              if (messageTimeline) {
                messageTimeline.appendChild(container);
              }
            } else {
              // For NLI tasks, log but don't create or reposition anything
              console.log('[thoughtComplete] NLI task container not found, but skipping creation to prevent movement');
              
              // Safety measure to prevent further processing that could cause transitions
              return;
            }
          }
          
          if (thoughtContainer && thoughtElement) {
            // Update the existing thought message with the completion content
            console.log('[thoughtComplete] Updating thought container for task:', tid);
            
            // CRITICAL: For NLI tasks, replace streaming buffer with final thought
            if (thoughtContent) {
              // Format the thought content nicely
              const formattedText = thoughtContent
                .replace(/\n\n/g, '<br><br>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([^*]+)\*/g, '<em>$1</em>');
              
              // Clear the streaming buffer for this task as we now have the final content
              if (window.activeThoughtStreams && window.activeThoughtStreams[tid]) {
                window.activeThoughtStreams[tid].buffer = formattedText;
              }
              sessionStorage.removeItem(`nli-task-buffer-${tid}`);
              
              // Set the complete content directly (don't append)
              thoughtElement.innerHTML = formattedText;
              
              // Ensure content area is properly styled
              thoughtElement.style.maxHeight = '200px';
              thoughtElement.style.overflowY = 'auto';
              thoughtElement.style.scrollBehavior = 'smooth';
              thoughtElement.style.paddingRight = '5px';
            }
            
            // Determine if this is an NLI task through comprehensive checks
            const msgId = thoughtContainer.getAttribute('data-message-id') || '';
            const taskAttrib = thoughtContainer.getAttribute('data-task-id') || '';
            
            // Comprehensive NLI task detection
            const isNliTask = [
                // Check message ID pattern which indicates NLI
                msgId.includes('thought-'),
                // Check for streaming attributes
                taskAttrib.includes('-streaming'),
                // Check if this is in NLI task mapping
                window.taskNliMapping && window.taskNliMapping[tid] === true,
                // Check session storage
                sessionStorage.getItem(`nli-task-${tid}`) === 'true',
                // Check for streaming class
                thoughtContainer.classList.contains('msg-thought-item'),
                // Check for NLI specific indicators in the task ID
                tid && (tid.includes('nli') || tid.includes('assistant'))
            ].some(check => check === true);
            
            console.log(`[thoughtComplete] Task ${tid} NLI detection result: ${isNliTask}`);
            
            // Update visual indicators differently based on task type
            const typeDiv = thoughtContainer.querySelector('.msg-type');
            if (typeDiv) {
              if (isNliTask) {
                // FOR NLI TASKS: DO NOT MODIFY THE TEXT OR ADD CLASSES
                console.log(`[thoughtComplete] Preserving NLI thought text for task ${tid}`);
                // We leave the text as is - no changes at all
              } else {
                // Only for non-NLI tasks, use standard completion styling
                typeDiv.textContent = 'Complete';
                typeDiv.classList.add('complete', 'thought-complete');
                typeDiv.classList.remove('typing', 'typing-bubble', 'thinking');
              }
            }
            
            // Different styling for NLI vs regular tasks
            if (isNliTask) {
              console.log(`[thoughtComplete] Preserving NLI container styling for task ${tid}`);
              // FOR NLI TASKS: DO NOT ADD ANY COMPLETION CLASSES
              // Only remove transitioning class to prevent animations
              thoughtContainer.classList.remove('transitioning');
              
              // Ensure it's visible but don't change styling
              thoughtContainer.style.opacity = '1';
              thoughtContainer.style.display = 'block';
            } else {
              // For regular tasks, add the standard completion classes
              thoughtContainer.classList.add('thought-complete', 'complete');
              thoughtContainer.classList.remove('typing', 'typing-bubble', 'thinking');
            }
            
            // Ensure container is fully visible
            thoughtContainer.style.opacity = '1';
            thoughtContainer.style.display = 'block';
            thoughtContainer.style.fontStyle = 'normal';
            
            // Clean up activeThoughtStreams reference
            if (window.activeThoughtStreams && window.activeThoughtStreams[tid]) {
              delete window.activeThoughtStreams[tid];
            }
            
            // Add to task steps store
            tasksStore.addStepLog(tid, {
              type: 'thought',
              content: thoughtContent,
              timestamp: new Date().toISOString()
            });
            
            // CRITICAL: Create or update task completion message
            // But ONLY for non-NLI tasks - skip for NLI tasks completely
            const messageTimeline = document.querySelector('.message-timeline-container');
            if (messageTimeline && thoughtContent && !isNliTask) {
              console.log(`[thoughtComplete] Creating task completion message for NON-NLI task ${tid}`);
              
              // First check if we already have a completion card for this task
              let completionMsg = document.querySelector(`.task-complete-card[data-task-id="${tid}"]`);
              
              if (!completionMsg) {
                // Create a fresh completion message
                completionMsg = document.createElement('div');
                completionMsg.className = 'msg-item msg-assistant task-complete-card';
                completionMsg.setAttribute('data-task-id', tid);
                completionMsg.setAttribute('data-message-id', `completion-${tid}`);
                
                // Style the completion card appropriately
                completionMsg.style.display = 'block';
                completionMsg.style.opacity = '1';
                completionMsg.style.width = '100%';
                completionMsg.style.margin = '10px 0';
                completionMsg.style.padding = '10px';
                completionMsg.style.borderRadius = '8px';
                completionMsg.style.backgroundColor = 'rgba(20, 30, 60, 0.6)';
                
                // Add to timeline
                messageTimeline.appendChild(completionMsg);
                console.log(`[thoughtComplete] Added new completion card for task ${tid}`);
              } else {
                console.log(`[thoughtComplete] Found existing completion card for task ${tid}`);
              }
              
              // Process thought content for the completion card
              let processedContent = thoughtContent || 'Task completed successfully';
              
              // Replace URLs with formatted links
              const urlRegex = /(https?:\/\/[^\s]+)/g;
              processedContent = processedContent.replace(urlRegex, (url) => {
                // Extract domain for display text
                let displayText = 'live url';
                try {
                  const urlObj = new URL(url);
                  displayText = urlObj.hostname.replace('www.', '');
                } catch (e) {
                  console.log('Error parsing URL:', e);
                }
                
                // Return formatted link with gradient color
                return `<a href="${url}" target="_blank" class="gradient-link" 
                  style="background-image: linear-gradient(90deg, #9c27b0, #3f51b5); 
                  -webkit-background-clip: text; background-clip: text; 
                  color: transparent; font-weight: bold; text-decoration: underline;">
                  ${displayText}</a>`;
              });
              
              // Set inner HTML content for the completion message
              completionMsg.innerHTML = `
                <div class="task-result-header">
                  <span class="task-complete-label">Task Complete</span>
                </div>
                <div class="task-result-content">
                  ${processedContent}
                </div>
              `;
              
              // Position the completion card for BOTH NLI and direct tasks
              // But handle them slightly differently
              if (thoughtContainer && thoughtContainer.parentNode) {
                // Position the card after the thought container
                if (thoughtContainer.nextSibling !== completionMsg) {
                  if (thoughtContainer.nextSibling) {
                    thoughtContainer.parentNode.insertBefore(completionMsg, thoughtContainer.nextSibling);
                  } else {
                    thoughtContainer.parentNode.appendChild(completionMsg);
                  }
                }
              }
              
              // Make the completion message visible for BOTH task types
              completionMsg.style.display = 'block';
              
              // But for NLI tasks, show a simpler card to avoid duplication
              if (isNliTask) {
                console.log(`[thoughtComplete] Detected NLI task: ${tid}, showing simplified completion card`);
                
                // For NLI tasks, show a minimal completion card without duplicating content
                completionMsg.innerHTML = `
                  <div class="task-result-header">
                    <span class="task-complete-label">Task Complete</span>
                  </div>
                  <div class="task-result-content" style="display: none;">
                    ${processedContent}
                  </div>
                `;
                
                // Also update our tracking to remember this is an NLI task
                sessionStorage.setItem(`nli-task-${tid}`, 'true');
                if (window.taskNliMapping && !window.taskNliMapping[tid]) {
                  window.taskNliMapping[tid] = true;
                }
              }
              
              // Scroll to the bottom of the message timeline
              messageTimeline.scrollTop = messageTimeline.scrollHeight;
              
              // Small delay to ensure DOM is updated, only scroll to completion message for non-NLI tasks
              setTimeout(() => {
                if (!isNliTask && completionMsg && completionMsg.parentNode) {
                  // For regular tasks, scroll to the completion message
                  completionMsg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                } else if (isNliTask) {
                  // For NLI tasks, scroll to the thought container instead
                  console.log(`[thoughtComplete] Ensuring NLI thought container for ${tid} remains visible`);
                  
                  // Try to find the streaming container first
                  const thoughtStreaming = document.querySelector(`.msg-item[data-task-id="${tid}-streaming"]`);
                  if (thoughtStreaming) {
                    thoughtStreaming.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  } else if (thoughtContainer) {
                    // Fall back to the original thought container
                    thoughtContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }
                }
              }, 100);
              
              // Only mark non-NLI thought bubbles as completed
              if (thoughtContainer && !isNliTask) {
                // For standard tasks, mark as complete
                thoughtContainer.classList.add('thought-complete', 'complete');
                thoughtContainer.classList.remove('typing', 'typing-bubble', 'thinking');
              } else if (thoughtContainer) {
                console.log(`[thoughtComplete] Preserving NLI thought container styling for ${taskId}`);
                // For NLI tasks, only remove the transitioning class but keep everything else
                thoughtContainer.classList.remove('transitioning');
                
                // Ensure the container remains fully visible
                thoughtContainer.style.opacity = '1';
                thoughtContainer.style.display = 'block';
                thoughtContainer.style.fontStyle = 'normal';
              }
            }
          } else if (!thoughtContainer || !thoughtElement) {
            // Log warning but don't create new cards
            console.warn('[thoughtComplete] No THINKING card found to update!');
          }
          
          // CRITICAL: Update neural flow canvas visualization
          const canvasBubble = document.querySelector(`.thought-bubble[data-task-id="${tid}"]`);
          if (canvasBubble) {
            console.log('[thoughtComplete] Updating canvas bubble:', canvasBubble);
            canvasBubble.classList.remove('typing-bubble', 'typing', 'thinking');
            canvasBubble.classList.add('complete', 'thought-complete');
            
            // Ensure neural flow is updated
            if (neuralFlows[tid]) {
              try {
                if (typeof neuralFlows[tid].addNode === 'function') {
                  neuralFlows[tid].addNode(thoughtContent || 'Thought complete');
                  // Don't call complete() since it might not exist
                }
              } catch (err) {
                console.error(`[thoughtComplete] Error updating neural flow:`, err);
              }
            }
          } else {
            // Create neural flow canvas if it doesn't exist
            try {
              const container = document.querySelector('.neural-flow-container');
              if (container) {
                // Create bubble if needed
                const newBubble = document.createElement('div');
                newBubble.className = 'thought-bubble complete thought-complete';
                newBubble.setAttribute('data-task-id', tid);
                container.appendChild(newBubble);
                
                // Initialize neural flow
                neuralFlows[tid] = new NeuralFlow(newBubble);
                neuralFlows[tid].addNode(thoughtContent || 'Thought complete');
                // Don't call complete() since it likely doesn't exist in NeuralFlow class
              }
            } catch (err) {
              console.error(`[thoughtComplete] Error creating neural flow:`, err);
            }
          }
          
          // Mark event as handled
          eventHandled = true;
          return;
        }
        
        if (message.event === 'planLog') {
          // Silenced detailed logging per user request
          // Extract step number if available
          let stepNumber = null;
          let stepAction = message.message;
          
          // Try to extract step number from messages like "Executing step 4: action - click..."
          const stepMatch = message.message.match(/step\s+(\d+):\s*(.+)/i);
          if (stepMatch) {
            stepNumber = parseInt(stepMatch[1]);
            stepAction = stepMatch[2];
          }
          
          // Add to task steps in store
          const tid = message.taskId || message.task_id;
          if (!tid) {
            console.warn('planLog message missing taskId:', message);
            return;
          }
          
          // Add logs to task steps store
          tasksStore.addStepLog(tid, {
            type: 'planLog',
            message: message.message,
            stepNumber: stepNumber,
            action: stepAction,
            timestamp: new Date().toISOString()
          });
          
          // CRITICAL: First check if this is an NLI route task - these use specific THINKING cards
          // Access store state directly to fix getTask error
          const taskState = tasksStore.getState();
          const taskData = taskState.active.find(t => t._id === tid) || {};
          const isNliTask = taskData.route === 'nli' || 
                          sessionStorage.getItem(`nli-task-${tid}`) === 'true';
          
          // CORRECTED TARGETING: Looking for thought bubbles created by MessageTimeline.jsx
          // Use MULTIPLE options to find the thought bubble, prioritizing task ID matches
          let thoughtMsg = document.querySelector(`.msg-item.msg-thought[data-task-id="${tid}"]`);
          
          // If not found with task-id, try message-id
          if (!thoughtMsg) {
            thoughtMsg = document.querySelector(`[data-message-id="thought-${tid}"]`);
          }
          
          // If still not found, look for ANY thought bubble with THINKING text
          // This applies when the task starts and a message exists but hasn't been tagged yet
          if (!thoughtMsg) {
            const allThoughtItems = document.querySelectorAll('.msg-item.msg-thought');
            for (const item of allThoughtItems) {
              // Look for items that have a THINKING text and aren't already claimed
              const typeEl = item.querySelector('.msg-type.msg-thought');
              if (typeEl && 
                  (typeEl.textContent.includes('THINKING') || typeEl.textContent.includes('Thinking')) && 
                  (!item.hasAttribute('data-task-id') || item.getAttribute('data-task-id') === '')) {
                thoughtMsg = item;
                break;
              }
            }
          }
          
          // If we found a thought bubble, make sure it's properly tagged for consistency
          if (thoughtMsg) {
            // Ensure the card has all required IDs for consistency
            if (!thoughtMsg.hasAttribute('data-task-id')) {
              thoughtMsg.setAttribute('data-task-id', tid);
              console.log(`[planLog] Tagged thought bubble with task ID: ${tid}`);
            }
            
            if (!thoughtMsg.hasAttribute('data-message-id')) {
              thoughtMsg.setAttribute('data-message-id', `thought-${tid}`);
              console.log(`[planLog] Tagged thought bubble with message ID: thought-${tid}`);
            }
          } else {
            console.warn(`[planLog] Could not find any THINKING card to update for task ${tid}`);
            // Create a thought bubble for this task if it doesn't exist yet
            // This ensures we have somewhere to display the planLog messages
            thoughtMsg = createOrUpdateThoughtBubble(tid, message);
            console.log(`[planLog] Created new thought bubble for task ${tid}`);
          }
          
          // CRITICAL: Skip any task completion cards
          if (thoughtMsg && thoughtMsg.classList.contains('task-complete-card')) {
            console.log('[planLog] Skipping task-complete-card element:', thoughtMsg);
            thoughtMsg = null;
          }
          
          // Proceed with updating if we have a container
          if (thoughtMsg) {
            // Update the existing thought message with the plan log
            console.log(`[planLog] Updating existing thought message for task ${tid}`);
          } else {
            // No thought bubble found, log the error
            console.warn(`[planLog] Could not find any THINKING card to update for task ${tid}`);
          }  
            
          // Proceed with updating if we have a container
          if (thoughtMsg) {
            
            // CRITICAL: Stream thoughts into the existing card's .msg-content element
            // This must precisely target the div.msg-content that exists in the THINKING bubble structure
            let contentDiv = thoughtMsg.querySelector('.msg-content');
            
            // Confirm we have the right container - it should be a direct child of the thought bubble
            // This ensures we're targeting exactly the right element as in your HTML structure
            if (!contentDiv || !thoughtMsg.contains(contentDiv) || contentDiv.parentElement !== thoughtMsg) {
              // Log the issue for debugging
              console.log('[planLog] Fixing msg-content container targeting');
              
              // Find any existing .msg-content to avoid duplication
              const existingContents = thoughtMsg.querySelectorAll('.msg-content');
              existingContents.forEach(el => el.remove());
              
              // Create the content div with the right structure - must match MessageTimeline.jsx
              contentDiv = document.createElement('div');
              contentDiv.className = 'msg-content';
              thoughtMsg.appendChild(contentDiv);
            }
            
            // IMPROVED: Skip final summary messages for step logging
            // Check if this message looks like a final summary
            const isFinalSummary = (
              message.message.includes('Successfully') && message.message.length > 100 ||
              message.message.includes('Task completed') ||
              message.message.includes('Plan summary') ||
              message.message.includes('extracted') && message.message.includes('price') ||
              message.message.includes('Browsing session complete')
            );
            
            // Skip logging the summary in step log card (it will appear in task completion cards)
            if (isFinalSummary) {
              console.log(`[planLog] Skipping final summary in step log for task ${tid}`);
              // Store this as a final thought for task completion cards
              sessionStorage.setItem(`task-final-thought-${tid}`, message.message);
              return; // Skip further processing
            }
            
            // UNIVERSAL STREAMING APPROACH: Stream thought content consistently for all task types
            // Check for step number for BOTH task types (NLI & direct)
            // If a step is detected, use structured format for better readability
            if (stepNumber && stepAction && !stepAction.includes('Task completed') && !stepAction.includes('Plan summary')) {
              // Keep track of the current step across multiple log entries
              const currentStep = parseInt(stepNumber, 10);
              const previousStep = parseInt(sessionStorage.getItem(`task-current-step-${tid}`), 10) || 0;
              
              // If we've moved to a new step, clear the log and buffer for better readability
              if (currentStep !== previousStep && currentStep > previousStep) {
                // Store the new step
                sessionStorage.setItem(`task-current-step-${tid}`, currentStep.toString());
                
                // Reset the buffer - CRITICAL FIX: Only store current message in buffer
                sessionStorage.setItem(`task-buffer-${tid}`, message.message + '\n');
                
                // Clear existing content for clean presentation
                contentDiv.innerHTML = '';
                console.log(`[planLog] Cleared log for new step ${currentStep} (task: ${tid})`);
                
                // Add step header with modern styling
                const stepHeader = document.createElement('div');
                stepHeader.className = 'step-header';
                stepHeader.innerHTML = `
                  <div class="step-number-badge">${currentStep}</div>
                  <div class="step-title">${stepAction}</div>
                `;
                stepHeader.style.cssText = `
                  display: flex;
                  align-items: center;
                  margin-bottom: 8px;
                  padding: 4px 0;
                  border-bottom: 1px solid rgba(var(--theme-border-color-rgb), 0.15);
                  animation: fadeIn 0.3s ease-in-out;
                `;
                
                const stepBadge = stepHeader.querySelector('.step-number-badge');
                if (stepBadge) {
                  stepBadge.style.cssText = `
                    background: linear-gradient(135deg, var(--theme-primary-color), var(--theme-secondary-color));
                    color: white;
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    margin-right: 8px;
                    font-size: 0.8rem;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                  `;
                }
                
                const stepTitle = stepHeader.querySelector('.step-title');
                if (stepTitle) {
                  stepTitle.style.cssText = `
                    font-weight: 500;
                    font-size: 0.9rem;
                    color: var(--theme-text-color);
                  `;
                }
                
                contentDiv.appendChild(stepHeader);
              } else {
                // We're on the same step, update the buffer
                const taskBuffer = sessionStorage.getItem(`task-buffer-${tid}`) || '';
                const updatedBuffer = taskBuffer + message.message + '\n';
                sessionStorage.setItem(`task-buffer-${tid}`, updatedBuffer);
              }
              
              // Clear any existing log content to prevent duplicates
              const existingLogs = contentDiv.querySelectorAll('.step-log-content');
              existingLogs.forEach(el => el.remove());
              
              // Add progress indicator for continuous feedback
              if (message.message.includes('progress') && message.message.includes('%')) {
                const progressMatch = message.message.match(/(\d+)%/);
                if (progressMatch && progressMatch[1]) {
                  const progressValue = parseInt(progressMatch[1], 10);
                  
                  // Create or update progress bar
                  let progressBar = contentDiv.querySelector('.task-progress-bar');
                  if (!progressBar) {
                    const progressContainer = document.createElement('div');
                    progressContainer.className = 'task-progress-container';
                    progressContainer.style.cssText = `
                      width: 100%;
                      height: 4px;
                      background-color: rgba(var(--theme-border-color-rgb), 0.2);
                      border-radius: 2px;
                      margin: 8px 0 12px 0;
                      overflow: hidden;
                    `;
                    
                    progressBar = document.createElement('div');
                    progressBar.className = 'task-progress-bar';
                    progressBar.style.cssText = `
                      height: 100%;
                      width: 0%;
                      background: linear-gradient(90deg, var(--theme-primary-color), var(--theme-secondary-color));
                      border-radius: 2px;
                      transition: width 0.8s cubic-bezier(0.16, 1, 0.3, 1);
                    `;
                    
                    progressContainer.appendChild(progressBar);
                    contentDiv.appendChild(progressContainer);
                  }
                  
                  // Animate progress change
                  setTimeout(() => {
                    progressBar.style.width = `${progressValue}%`;
                  }, 100);
                }
              }
            } else {
              // If no step detected and this is a direct task, continue with unstructured display
              const newPlanLog = document.createElement('div');
              newPlanLog.className = 'plan-log-entry';
              
              // Process the stepAction to format URLs nicely
              let formattedAction = stepAction;
              
              // Detect and format URLs in the content
              const urlRegex = /(https?:\/\/[^\s]+)/g;
              formattedAction = formattedAction.replace(urlRegex, (url) => {
                // Extract domain for display text
                let displayText = 'live url';
                try {
                  const urlObj = new URL(url);
                  displayText = urlObj.hostname.replace('www.', '');
                } catch (e) {
                  console.log('Error parsing URL:', e);
                }
                
                // Return formatted link with gradient color
                return `<a href="${url}" target="_blank" class="gradient-link" style="background-image: linear-gradient(90deg, #9c27b0, #3f51b5); -webkit-background-clip: text; background-clip: text; color: transparent; font-weight: bold; text-decoration: underline;">${displayText}</a>`;
              });
              
              // Set the log entry content with styled step number and formatted action
              newPlanLog.innerHTML = `
                <span class="log-step" style="font-size: 0.85rem; font-weight: 500; opacity: 0.9;">
                  ${stepNumber ? `Step ${stepNumber}: ` : ''}
                </span>
                <span style="font-size: 0.8rem; opacity: 0.85;">
                  ${formattedAction}
                </span>
              `;
              
              // Add to the container with a subtle animation
              newPlanLog.style.opacity = '0';
              contentDiv.appendChild(newPlanLog);
              
              // Get the content span that will have the typing effect
              const contentSpan = newPlanLog.querySelector('span:last-child');
              if (contentSpan) {
                // Save the full text for typing effect
                const fullText = contentSpan.innerHTML;
                // Empty it first
                contentSpan.innerHTML = '';
                
                // Apply typing effect if not too long (skip for very long texts)
                if (formattedAction.length < 200) {
                  // Fade in the entry first
                  setTimeout(() => {
                    newPlanLog.style.transition = 'opacity 0.3s';
                    newPlanLog.style.opacity = '1';
                    
                    // Then start typing effect
                    let typeIndex = 0;
                    const typeSpeed = 10; // milliseconds per character
                    
                    const typeWriter = () => {
                      if (typeIndex < fullText.length) {
                        // Append one character at a time, handling HTML tags
                        if (fullText[typeIndex] === '<') {
                          // Find the closing > of this tag
                          const closingIndex = fullText.indexOf('>', typeIndex);
                          if (closingIndex > -1) {
                            // Append the entire tag at once
                            contentSpan.innerHTML += fullText.substring(typeIndex, closingIndex + 1);
                            typeIndex = closingIndex + 1;
                          } else {
                            contentSpan.innerHTML += fullText[typeIndex++];
                          }
                        } else {
                          contentSpan.innerHTML += fullText[typeIndex++];
                        }
                        setTimeout(typeWriter, typeSpeed);
                      }
                    };
                    
                    // Start typing effect
                    typeWriter();
                  }, 10);
                } else {
                  // For longer content, just fade in without typing effect
                  contentSpan.innerHTML = fullText;
                  setTimeout(() => {
                    newPlanLog.style.transition = 'opacity 0.3s';
                    newPlanLog.style.opacity = '1';
                  }, 10);
                }
              } else {
                // Fallback if span not found
                setTimeout(() => {
                  newPlanLog.style.transition = 'opacity 0.3s';
                  newPlanLog.style.opacity = '1';
                }, 10);
              }
              
              // Auto-scroll to show new entry
              thoughtMsg.scrollTop = thoughtMsg.scrollHeight;
            }
            
            // Add custom CSS animation styles if not already added
            if (!document.getElementById('task-log-animations')) {
              const styleEl = document.createElement('style');
              styleEl.id = 'task-log-animations';
              styleEl.textContent = `
                @keyframes fadeIn {
                  from { opacity: 0; }
                  to { opacity: 1; }
                }
                @keyframes slideIn {
                  from { opacity: 0; transform: translateY(10px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                @keyframes pulse {
                  0% { box-shadow: 0 0 0 0 rgba(var(--theme-primary-color-rgb), 0.4); }
                  70% { box-shadow: 0 0 0 6px rgba(var(--theme-primary-color-rgb), 0); }
                  100% { box-shadow: 0 0 0 0 rgba(var(--theme-primary-color-rgb), 0); }
                }
                .plan-log-entry {
                  margin-bottom: 6px;
                  padding: 4px 0;
                  font-size: 0.8rem;
                  line-height: 1.4;
                  animation: slideIn 0.3s ease-out;
                  transition: background-color 0.2s;
                }
                .plan-log-entry:hover {
                  background-color: rgba(var(--theme-bg-color-rgb), 0.5);
                }
                .step-number-badge {
                  animation: pulse 2s infinite;
                }
              `;
              document.head.appendChild(styleEl);
            }
            
            // Auto-scroll to show new entry
            setTimeout(() => {
              contentDiv.scrollTop = contentDiv.scrollHeight;
            }, 100);
            
            // Additional neural flow handling for NLI tasks
            if (isNliTask) {
              // Find or create neural flow container and update for NLI task
              try {
                // First find the neural flow container
                const neuralFlowContainer = document.querySelector('.neural-flow-container');
                if (!neuralFlowContainer) {
                  // Create the container if it doesn't exist
                  const canvasSection = document.querySelector('.neural-canvas-section') || document.body;
                  const newContainer = document.createElement('div');
                  newContainer.className = 'neural-flow-container';
                  canvasSection.appendChild(newContainer);
                }
                
                // Now look for an existing neural flow bubble
                const container = document.querySelector('.neural-flow-container');
                let canvasBubble = container.querySelector(`.thought-bubble[data-task-id="${tid}"]`);
                
                // Create new bubble if it doesn't exist
                if (!canvasBubble) {
                  canvasBubble = document.createElement('div');
                  canvasBubble.className = 'thought-bubble thinking typing-bubble';
                  canvasBubble.setAttribute('data-task-id', tid);
                  // Add to the neural flow container, not the message timeline
                  container.appendChild(canvasBubble);
                }
                
                // Initialize or update the neural flow
                if (!neuralFlows[tid]) {
                  neuralFlows[tid] = new NeuralFlow(canvasBubble);
                }
                
                // Make sure bubble is in thinking state
                canvasBubble.classList.add('typing-bubble', 'typing', 'thinking');
                
                // Add node to the neural flow
                if (typeof neuralFlows[tid].addNode === 'function') {
                  neuralFlows[tid].addNode(message.message);
                }
              } catch (err) {
                console.error(`[planLog] Error updating neural flow for NLI task ${tid}:`, err);
              }
            } else {
              // Non-NLI tasks - use standard neural flow approach without creating duplicate bubbles
              try {
                const container = document.querySelector('.neural-flow-container');
                if (container) {
                  // For neural flow container, we don't need to create typing bubbles inside it
                  // Just create or update the neural flow instance directly on the container
                  if (!neuralFlows[tid]) {
                    neuralFlows[tid] = new NeuralFlow(container);
                  }
                  neuralFlows[tid].addNode(message.message);
                }
              } catch (err) {
                console.error(`Error creating neural flow for standard task ${tid}:`, err);
              }
            }
            
            // Scroll to the updated message
            setTimeout(() => scrollToLatestMessage(true), 100);
            
            // Mark event as handled
            eventHandled = true;
            return;
          } else {
            // DO NOT create new cards - just log a warning
            console.warn(`[planLog] Could not find any THINKING card to update for task ${tid}`);
          }
          
          // IMPORTANT: Set event as handled to prevent default canvas manipulation
          eventHandled = true;
          return;
        }

        // Handle streaming messages
        if (message.type === 'chat_response_stream' || message.type === 'ai_thought_stream') {
          console.log('[WebSocket] Received streaming message:', message);
          
          // Validate message structure
          if (!message || typeof message !== 'object') {
            console.error('[WebSocket] Invalid message format:', message);
            return;
          }
          
          // Extract clean content from streaming message
          const content = message.content?.trim();
          
          // Skip empty or malformed messages
          if (!content || typeof content !== 'string') {
            console.log('[WebSocket] Skipping empty or malformed content:', message);
            return;
          }

          // Get or create the thought container
          let thoughtContainer = document.querySelector(`.thought-bubble[data-task-id="${message.task_id}"]`);
          if (!thoughtContainer) {
            thoughtContainer = document.createElement('div');
            thoughtContainer.className = 'thought-bubble creative-bubble';
            thoughtContainer.setAttribute('data-task-id', message.task_id);
            thoughtContainer.style.animation = 'fadeIn 0.3s';
            
            // Add loading state
            thoughtContainer.classList.add('loading');
            
            // Find the message timeline and append
            const timeline = document.querySelector('.message-timeline-container');
            if (timeline) {
              timeline.appendChild(thoughtContainer); // Add bubble to timeline container
            }
          }

          const thoughtBuffers = {};
          thoughtBuffers[message.task_id] = (thoughtBuffers[message.task_id] || '') + content;
          if (!message.completed) return;
          const fullContent = thoughtBuffers[message.task_id];
          delete thoughtBuffers[message.task_id];
          thoughtContainer.textContent = fullContent;

          // Emit completion event
          eventBus.emit('thought_completed', {
            taskId: message.task_id,
            content: fullContent,
            url: message.url
          });
        }

        // Handle API key missing events specifically
        if (message.event === 'apiKeyMissing') {
          console.log('[DEBUG] API Key missing for engine:', message.engine);
          eventBus.emit('notification', {
            title: 'API Key Required',
            message: message.message || `No API key found for ${message.engine}. Please add your API key in Settings.`,
            type: 'warning',
            duration: 6000,
            action: message.guideLink ? {
              text: 'Open Settings',
              callback: () => eventBus.emit('settings-modal-requested', { section: 'api-keys' })
            } : null
          });
        }
        
        // Handle other message types
        if (message.event) {
          eventBus.emit(message.event, message);
        }
      } catch (error) {
        console.error('WebSocket message handling error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('[DEBUG] CommandCenter: WebSocket ONERROR event:', error);
      connecting = false;
      // The 'close' event handler will manage reconnection logic.
    };

    ws.onclose = (event) => {
      console.log(`[DEBUG] CommandCenter: WebSocket ONCLOSE event. Code: ${event.code}, Reason: '${event.reason}'. Clean close: ${event.wasClean}`);
      wsConnected = false;
      connecting = false;
      ws = null; // Null out on close

      // Avoid reconnecting on manual close (1000) or going away (1001) triggered by destroy()
      if (event.code !== 1000 && event.code !== 1001) {
        reconnectAttempts++;
        // Exponential backoff with cap
        const delay = RETRY_DELAY * Math.pow(2, Math.min(reconnectAttempts - 1, 4)); 
        console.log(`WebSocket: Attempting reconnect #${reconnectAttempts} in ${delay / 1000}s...`);
        setTimeout(() => initWebSocket(userId), delay); // Use stored userId
      } else {
          console.log("WebSocket: Closed cleanly or intentionally, no reconnect attempt.");
      }
    };
  };
  // --- End WebSocket Functions ---

  // Create tab buttons
  tabs.forEach(tab => {
    const button = document.createElement('button');
    button.className = `tab-btn ${tab.id === activeTab ? 'active' : ''}`;
    button.dataset.taskType = tab.id;
    button.id = `${tab.id}-tab`;
    
    // Add icon or label
    if (tab.icon) button.innerHTML = `<i class="fas ${tab.icon}"></i> ${tab.label}`;
    else button.textContent = tab.label;
    button.addEventListener('click', () => {
      activeTab = tab.id;
      tabButtons.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.taskType === activeTab));
      showActiveSection(activeTab);
      uiStore.setState({ activeTab });
    });
    tabButtons.appendChild(button);
  });
  card.appendChild(tabButtons);

  // Create task sections container
  const taskSections = document.createElement('div');
  taskSections.id = 'task-sections';

  // Section switcher helper
  function showActiveSection(tab) {
    taskSections.querySelectorAll('.task-section').forEach(sec => sec.classList.remove('active'));
    if (tab === TAB_TYPES.NLI) {
      document.getElementById('unified-input-section').classList.add('active');
    } else {
      const sec = document.getElementById(`${tab}-section`);
      if (sec) sec.classList.add('active');
    }
  }

  // --- End WebSocket Functions ---

  // Create sections for each tab
  
  // 1. NLI (Chat) Section
  const nliSection = document.createElement('div');
  nliSection.className = 'task-section';
  nliSection.id = 'unified-input-section';
  if (activeTab === TAB_TYPES.NLI) nliSection.classList.add('active');
  
  const nliForm = document.createElement('form');
  nliForm.id = 'unified-input-form';
  nliForm.autocomplete = 'off';
  
  const inputBar = document.createElement('div');
  inputBar.className = 'unified-input-bar';
  
  const textarea = document.createElement('textarea');
  textarea.id = 'unified-input';
  textarea.className = 'unified-input-textarea';
  textarea.rows = 2;
  textarea.placeholder = 'Type your message, command, or task...';
  textarea.required = true;
  
  // LLM Engine dropdown with API integration
  const engineDropdownContainer = document.createElement('div');
  engineDropdownContainer.className = 'engine-dropdown-container';
  
  // Define supported LLM engines with their icons
  const engineIcons = { 
    'gpt-4o': 'fa-brain', 
    'qwen-2.5-vl-72b': 'fa-lightbulb', 
    'gemini-2.5-pro': 'fa-comments', 
    'ui-tars': 'fa-robot' 
  };
  
  // Display names for engines
  const engineDisplayNames = {
    'gpt-4o': 'GPT-4o',
    'qwen-2.5-vl-72b': 'Qwen-VL',
    'gemini-2.5-pro': 'Gemini',
    'ui-tars': 'UI-TARS'
  };
  
  // Default to GPT-4o
  let selectedEngine = 'gpt-4o';
  let availableEngines = ['gpt-4o'];
  
  // Create trigger button
  const engineTrigger = document.createElement('button');
  engineTrigger.type = 'button';
  engineTrigger.className = 'engine-dropdown-trigger';
  engineTrigger.innerHTML = `<i class="fas ${engineIcons[selectedEngine]}"></i> <span class="engine-label">${engineDisplayNames[selectedEngine]}</span> <i class="fas fa-chevron-down dropdown-chevron"></i>`;
  engineDropdownContainer.appendChild(engineTrigger);
  
  // Function to fetch available engines from API with retry logic
  const fetchAvailableEngines = async (retryCount = 0, maxRetries = 3) => {
    // Set default engines in case of failure
    if (retryCount === 0) {
      // Initialize with defaults for resilience
      availableEngines = Object.keys(engineIcons);
      // Default to GPT-4o as fallback
      selectedEngine = 'gpt-4o';
      
      // Update the dropdown trigger with default
      const iconEl = engineTrigger.querySelector('i:first-child');
      const labelEl = engineTrigger.querySelector('.engine-label');
      
      if (iconEl && labelEl) {
        iconEl.className = `fas ${engineIcons[selectedEngine]}`;
        labelEl.textContent = engineDisplayNames[selectedEngine];
      }
      
      // Update dropdown with defaults
      updateEngineDropdown();
    }
    
    try {
      console.log(`Fetching available engines (attempt ${retryCount + 1}/${maxRetries + 1})`);
      
      // Add credentials and timeout to the fetch call
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout
      
      const response = await fetch('/api/user/available-engines', {
        credentials: 'include', // Include credentials for auth
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.warn(`Failed to fetch engine availability: ${response.status} ${response.statusText}`);
        throw new Error(`HTTP error ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success) {
        availableEngines = data.availableEngines;
        
        // Ensure we have at least one engine available
        if (!availableEngines || availableEngines.length === 0) {
          console.warn('No engines available, using defaults');
          availableEngines = Object.keys(engineIcons);
        }
        
        // Update selected engine if present in the response
        if (data.preferredEngine && engineIcons[data.preferredEngine]) {
          selectedEngine = data.preferredEngine;
          
          // Update the dropdown trigger
          const iconEl = engineTrigger.querySelector('i:first-child');
          const labelEl = engineTrigger.querySelector('.engine-label');
          
          if (iconEl && labelEl) {
            iconEl.className = `fas ${engineIcons[selectedEngine]}`;
            labelEl.textContent = engineDisplayNames[selectedEngine];
          }
        }
        
        // Rebuild dropdown items with availability information
        updateEngineDropdown();
        
        // ALWAYS show notification about API keys
        setTimeout(() => {
          if (data.notification) {
            // Use server-provided notification if available
            showNotification(data.notification);
          } else if (data.usingAnyDefaultKey) {
            // Fallback to standard system API keys message
            showNotification({
              title: 'Using System API Keys',
              message: 'You are using system default API keys. For unlimited usage, add your own API keys in Settings.',
              type: 'info',
              duration: 8000
            });
          } else if (availableEngines && availableEngines.length > 0) {
            // If we have available engines but no notification yet, show user keys message
            showNotification({
              title: 'Using Your API Keys',
              message: 'Successfully using your own API keys - no usage limits apply.',
              type: 'success',
              duration: 5000
            });
          }
        }, 2000);
        
        console.log('Successfully fetched engine availability');
        return true;
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Error fetching engine availability:', error);
      
      // Implement retry logic
      if (retryCount < maxRetries) {
        console.log(`Retrying engine fetch (${retryCount + 1}/${maxRetries})...`);
        // Exponential backoff: 1s, 2s, 4s, etc.
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchAvailableEngines(retryCount + 1, maxRetries);
      }
      
      // Final failure - ensure we have some default engines
      console.warn('Failed to fetch engines after retries, using defaults');
      return false;
    }
  };
  
  // Function to set the selected engine
  const setEngine = async (engineId) => {
    // Check if engine is available
    if (!availableEngines.includes(engineId)) {
      showNotification({
        title: 'API Key Required',
        message: `Please configure an API key for ${engineDisplayNames[engineId]} in Settings.`,
        type: 'warning',
        buttons: [
          {
            text: 'Configure',
            onClick: () => {
              // Open settings modal to API keys tab
              const event = new CustomEvent('open-settings', {
                detail: { tab: 'llm-engines' }
              });
              window.dispatchEvent(event);
            }
          }
        ]
      });
      return;
    }
    
    try {
      const response = await fetch('/api/user/set-engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engineId })
      });
      
      const result = await response.json();
      
      if (result.success) {
        selectedEngine = engineId;
        
        // Update the dropdown trigger
        const iconEl = engineTrigger.querySelector('i:first-child');
        const labelEl = engineTrigger.querySelector('.engine-label');
        
        if (iconEl && labelEl) {
          iconEl.className = `fas ${engineIcons[engineId]}`;
          labelEl.textContent = engineDisplayNames[engineId];
        }
        
        // Emit event for engine change
        eventBus.emit('engineChange', { engine: engineId });
        
        // Show success notification
        showNotification({
          title: 'Engine Changed',
          message: `Now using ${engineDisplayNames[engineId]} for tasks`,
          type: 'success'
        });
      } else {
        throw new Error(result.error || 'Failed to set engine');
      }
    } catch (error) {
      console.error('Error changing engine:', error);
      
      // Show error notification
      showNotification({
        title: 'Engine Change Failed',
        message: error.message,
        type: 'error'
      });
    }
  };
  
  // Function to update the engine dropdown items
  const updateEngineDropdown = () => {
    // Remove existing dropdown if any
    const existingDropdown = engineDropdownContainer.querySelector('#engine-dropdown');
    if (existingDropdown) {
      engineDropdownContainer.removeChild(existingDropdown);
    }
    
    // Create the dropdown with engine options
    const engineDropdown = Dropdown({
      trigger: engineTrigger,
      items: Object.keys(engineIcons).map(engineId => ({
        text: engineDisplayNames[engineId],
        icon: engineIcons[engineId],
        disabled: engineId !== 'gemini' && !availableEngines.includes(engineId), // Always enable Gemini
        onClick: () => setEngine(engineId)
      })),
      className: 'engine-dropdown',
      id: 'engine-dropdown',
      position: 'bottom-left',
      width: 150
    });
    
    engineDropdownContainer.appendChild(engineDropdown);
  };
  
  // Function to show notifications
  const showNotification = (notification) => {
    if (typeof notification === 'object') {
      eventBus.emit('notification', notification);
    }
  };
  
  // Fetch available engines on initialization
  fetchAvailableEngines();
  
  // Create the initial dropdown
  updateEngineDropdown();
  
  // Send button
  const sendBtn = document.createElement('button');
  sendBtn.type = 'submit'; // Restored to 'submit' for proper form handling with Enter key
  sendBtn.className = 'btn btn-unified-send';
  sendBtn.id = 'unified-send-btn';
  sendBtn.title = 'Send';
  sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
  
  // allow Enter key (without Shift) in textarea to submit form
  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });
  
  inputBar.appendChild(textarea);
  
  const inputControls = document.createElement('div');
  inputControls.className = 'input-controls';
  inputControls.appendChild(engineDropdownContainer);
  inputControls.appendChild(sendBtn);
  inputBar.appendChild(inputControls);
  
  nliForm.appendChild(inputBar);
  
  // Helper to detect YAML map references in the prompt
  const extractYamlMapId = (prompt) => {
    if (!prompt) return null;
    // Match pattern /yaml <mapId> or /yaml:<mapId>
    const yamlMapRegex = /\/yaml\s+([a-zA-Z0-9]+)|\/yaml:([a-zA-Z0-9]+)/;
    const match = prompt.match(yamlMapRegex);
    return match ? (match[1] || match[2]) : null;
  };
  
  // Add YAML map info container
  const yamlMapInfoContainer = document.createElement('div');
  yamlMapInfoContainer.className = 'yaml-map-info';
  yamlMapInfoContainer.style.display = 'none';
  inputBar.insertBefore(yamlMapInfoContainer, inputControls);
  
  // Update YAML map info when textarea changes
  textarea.addEventListener('input', async () => {
    const content = textarea.value.trim();
    const yamlMapId = extractYamlMapId(content);
    
    if (yamlMapId) {
      // Show YAML map info
      yamlMapInfoContainer.style.display = 'flex';
      yamlMapInfoContainer.innerHTML = `
        <i class="fas fa-code"></i>
        <span>YAML Map: <strong>${yamlMapId}</strong></span>
        <button type="button" class="btn-icon yaml-map-info-clear">
          <i class="fas fa-times"></i>
        </button>
      `;
      
      // Try to fetch YAML map details
      try {
        const response = await fetch(`/api/yaml-maps/${yamlMapId}`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.yamlMap) {
            // Update with map name
            yamlMapInfoContainer.innerHTML = `
              <i class="fas fa-code"></i>
              <span>YAML Map: <strong>${data.yamlMap.name}</strong></span>
              <button type="button" class="btn-icon yaml-map-info-clear">
                <i class="fas fa-times"></i>
              </button>
            `;
          }
        }
      } catch (error) {
        console.error('Error fetching YAML map details:', error);
      }
      
      // Add event listener to clear button
      const clearBtn = yamlMapInfoContainer.querySelector('.yaml-map-info-clear');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          textarea.value = textarea.value.replace(/\/yaml\s+[a-zA-Z0-9]+|\/yaml:[a-zA-Z0-9]+/g, '').trim();
          yamlMapInfoContainer.style.display = 'none';
          textarea.focus();
        });
      }
    } else {
      // Hide YAML map info
      yamlMapInfoContainer.style.display = 'none';
    }
  });
  
  // Listen for yaml-map-attached event from Sidebar
  if (window.eventBus) {
    window.eventBus.on('yaml-map-attached', ({ mapId }) => {
      console.debug('[DEBUG] CommandCenter received yaml-map-attached event:', mapId);
      
      // Update textarea to show it's attached
      if (textarea) {
        // If textarea is empty, add placeholder text showing a YAML map is attached
        if (!textarea.value.trim()) {
          textarea.placeholder = `YAML Map attached. Click send to execute.`;
        }
        
        // Add a visual indicator to the textarea
        textarea.classList.add('yaml-attached');
        
        // Show YAML map info
        yamlMapInfoContainer.style.display = 'flex';
        yamlMapInfoContainer.innerHTML = `
          <i class="fas fa-code"></i>
          <span>YAML Map attached: <strong>${mapId}</strong></span>
          <button type="button" class="btn-icon yaml-map-info-clear">
            <i class="fas fa-times"></i>
          </button>
        `;
        
        // Add event listener to clear button
        const clearBtn = yamlMapInfoContainer.querySelector('.yaml-map-info-clear');
        if (clearBtn) {
          clearBtn.addEventListener('click', () => {
            resetYamlAttachment();
          });
        }
        
        // Try to fetch YAML map details to show the name
        fetch(`/api/yaml-maps/${mapId}`, {
          credentials: 'include'
        })
        .then(response => response.json())
        .then(data => {
          if (data.success && data.yamlMap) {
            // Update with map name
            const mapName = data.yamlMap.name || mapId;
            yamlMapInfoContainer.querySelector('span').innerHTML = 
              `YAML Map attached: <strong>${mapName}</strong>`;
          }
        })
        .catch(error => {
          console.error('Error fetching YAML map details:', error);
        });
      }
    });
  }
  
  // Function to reset YAML attachment state
  const resetYamlAttachment = () => {
    if (textarea) {
      // Remove data attribute
      delete textarea.dataset.yamlMapId;
      
      // Reset textarea state
      textarea.classList.remove('yaml-attached');
      textarea.placeholder = 'Ask a question or type a command...';
      textarea.disabled = false;
      
      // Hide YAML map info
      yamlMapInfoContainer.style.display = 'none';
    }
  };
  
  nliForm.addEventListener('submit', async e => {
    e.preventDefault();
    const content = textarea.value.trim();
    
    // Check for the attached YAML map from data attribute (set by Sidebar)
    const attachedYamlMapId = textarea.dataset.yamlMapId;
    let finalContent = content;
    let yamlMapId = null;
    
    // First check for YAML map ID in the input text itself
    yamlMapId = extractYamlMapId(content);
    
    // If not found in text, check for attached YAML map
    if (!yamlMapId && attachedYamlMapId) {
      yamlMapId = attachedYamlMapId;
      console.debug('[DEBUG] Using attached YAML map:', yamlMapId);
      
      // If the input is empty, provide a default execution message
      if (!content) {
        finalContent = `Execute YAML map: ${yamlMapId}`;
      }
    }
    
    // Don't proceed if we still have empty content
    if (!finalContent) return;
    
    console.debug('[DEBUG] CommandCenter: sending message', finalContent);
    
    // Show notification for YAML map execution
    if (yamlMapId) {
      console.debug('[DEBUG] Processing YAML map execution:', yamlMapId);
      eventBus.emit('notification', {
        title: 'YAML Map Processing',
        message: `Executing YAML map: ${yamlMapId}`,
        type: 'info',
        duration: 5000
      });
    }
    
    // Build SSE URL with YAML map ID if available
    let sseUrl = `/api/nli?prompt=${encodeURIComponent(finalContent)}`;
    if (yamlMapId) {
      sseUrl += `&yamlMapId=${encodeURIComponent(yamlMapId)}`;
    }
    
    console.debug('[DEBUG] SSE connecting for chat prompt:', finalContent);
    console.debug('[DEBUG] SSE endpoint URL:', sseUrl);
    const { timeline } = messagesStore.getState();
    // Add user message locally
    const userMsg = { id: `user-${Date.now()}`, role: 'user', type: 'chat', content, timestamp: new Date().toISOString() };
    // Initialize thought bubble placeholder
    const thoughtId = `thought-${Date.now()}`;
    const thoughtMsg = { id: thoughtId, role: 'assistant', type: 'thought', content: '', timestamp: null };
    messagesStore.setState({ timeline: [...timeline, userMsg, thoughtMsg] });
    textarea.value = '';
    
    // Reset YAML map attachment if there was one attached
    if (yamlMapId && textarea.dataset.yamlMapId) {
      console.debug('[DEBUG] Clearing YAML map attachment after submission');
      resetYamlAttachment();
    }

    // Stream thought updates via SSE
    const es = new EventSource(sseUrl);
    es.onopen = () => console.debug('[DEBUG] SSE connection opened');
    es.onerror = err => console.error('[DEBUG] SSE error', err);
    es.onmessage = e => {
      const raw = e.data;
      console.debug('[DEBUG] SSE raw event data:', raw);
      try {
        const data = JSON.parse(raw);
        console.debug('[DEBUG] Parsed SSE event:', data);
        switch (data.event) {
          case 'taskStart':
            console.debug('[DEBUG] taskStart:', data.payload);
            tasksStore.addStream(data.payload.taskId, es);
            handleTaskStart(data.payload);
            break;
          case 'stepProgress':
            console.debug('[DEBUG] stepProgress:', data);
            // Implementation of handleStepProgress function
            // Standardize SSE event format to include item property expected by TaskBar
            {
              // Check if this task has already completed
              const tasks = tasksStore.getState().active;
              const existingTask = tasks.find(t => t._id === data.taskId);
              
              // Close connection if task is already completed
              if (existingTask && existingTask.status === 'completed') {
                console.log('[CommandCenter] Closing SSE connection - task already completed');
                es.close();
                return;
              }
              
              // Normalize the event data to include the item property
              const normalizedData = {
                ...data,
                item: {
                  type: 'progress',
                  extractedInfo: `Progress: ${data.progress}%`,
                  timestamp: new Date().toISOString(),
                  progress: data.progress,
                  content: data.result ? JSON.stringify(data.result) : ''
                }
              };
              
              // Update task in store with progress
              tasksStore.updateTask(data.taskId, {
                progress: data.progress || 0
              });
              
              // Add to intermediates with proper structure
              tasksStore.addIntermediate(data.taskId, normalizedData.item);
              
              // Emit standardized event for TaskBar and other components
              eventBus.emit('stepProgress', normalizedData);
              
              // Close connection if we've reached 100% progress
              if (data.progress >= 100) {
                setTimeout(() => {
                  if (es && es.readyState !== 2) { // 2 is CLOSED
                    es.close();
                  }
                }, 100);
              }
            }
            break;
          case 'taskComplete':
            console.debug('[DEBUG] taskComplete:', data);
            // Close connection only after handling the event
            handleTaskComplete(data);
            es.close();
            break;
          case 'taskError':
            console.debug('[DEBUG] taskError:', data);
            // Close connection only after handling the error
            handleTaskError(data);
            es.close();
            break;
          case 'thoughtUpdate':
            console.debug('[DEBUG] Appending thoughtUpdate chunk');
            {
              const { timeline: current } = messagesStore.getState();
              messagesStore.setState({ timeline: current.map(msg => msg.id === thoughtId ? { ...msg, content: msg.content + data.text } : msg) });
            }
            break;
          case 'functionCallPartial':
            // console.debug('[DEBUG] functionCallPartial:', data.functionName, data.partialArgs);
            functionCallBuffers[data.taskId] = (functionCallBuffers[data.taskId] || '') + data.partialArgs;
            let args;
            try { args = JSON.parse(functionCallBuffers[data.taskId]); } catch { return; }
            delete functionCallBuffers[data.taskId];
            tasksStore.addStepLog(data.taskId, { type: 'functionCall', functionName: data.functionName, args, timestamp: new Date().toISOString() });
            renderStepLogs(data.taskId);
            const timelineEl = document.querySelector('.message-timeline-container');
            if (timelineEl) {
              let bubble = timelineEl.querySelector(`.thought-bubble[data-task-id="${data.taskId}"]`);
              if (!bubble) {
                bubble = document.createElement('div');
                bubble.className = 'thought-bubble creative-bubble typing-bubble';
                bubble.setAttribute('data-task-id', data.taskId);
                timelineEl.appendChild(bubble);
              }
              bubble.innerHTML = `<div><em>Function:</em> ${data.functionName}</div><pre class="typing-content"></pre>`;
              const pre = bubble.querySelector('.typing-content'); const text = JSON.stringify(args, null, 2);
              let i = 0; const ti = setInterval(() => { pre.textContent += text.charAt(i++); bubble.scrollTop = bubble.scrollHeight; if (i >= text.length) clearInterval(ti); }, 20);
            }
            return;
          case 'thoughtComplete':
            console.debug('[DEBUG] SSE thoughtComplete received');
            es.close();
            // Finalize bubble: mark as chat complete
            const { timeline: curr } = messagesStore.getState();
            messagesStore.setState({ timeline: curr.map(msg =>
              msg.id === thoughtId
                ? { ...msg, type: 'chat', timestamp: new Date().toISOString() }
                : msg
            ) });
            break;
          default:
            console.debug('[DEBUG] SSE event:', data.event, data.text || '');
            // Handle other message types
            if (data.event) {
              eventBus.emit(data.event, data);
            }
        }
      } catch (err) {
        console.error('SSE parsing error:', err);
      }
    };
  });
  
  nliSection.appendChild(nliForm);
  taskSections.appendChild(nliSection);
  
  // 2. Active Tasks Section
  // Removed
  
  // Add other sections (manual, repetitive, scheduled)
  // For brevity, we're not implementing these fully now
  const otherSections = [
    { id: 'manual-section', type: TAB_TYPES.MANUAL },
    { id: 'repetitive-section', type: TAB_TYPES.REPETITIVE },
    { id: 'scheduled-section', type: TAB_TYPES.SCHEDULED }
  ];
  
  otherSections.forEach(section => {
    const sectionEl = document.createElement('div');
    sectionEl.className = 'task-section';
    sectionEl.id = section.id;
    if (activeTab === section.type) sectionEl.classList.add('active');
    
    // Placeholder content for now
    sectionEl.innerHTML = `
      <div class="placeholder-content">
        <p>This section will be implemented in the next iteration.</p>
      </div>
    `;
    
    taskSections.appendChild(sectionEl);
  });
  
  card.appendChild(taskSections);
  container.appendChild(card);

  // Active tasks polling removed; TaskBar handles active tasks UI.

  // Create thought container for a task
  const createThoughtContainer = (taskId, isNli = false) => {
    // Create container
    const container = document.createElement('div');
    container.className = `msg-item msg-assistant msg-thought msg-thought-item ${isNli ? 'nli-task' : ''}`;
    container.setAttribute('data-task-id', taskId);
    container.setAttribute('data-message-id', `thought-${taskId}`);
    
    // Apply container styles
    container.style.cssText = `
      opacity: 1;
      font-style: normal;
      font-weight: 400;
      font-size: 0.9em;
      display: block;
      margin: -1.5rem 0 0 0;
      position: relative;
      z-index: 2;
      border-top-left-radius: 0;
    `;
    
    // Create type indicator (hidden)
    const typeDiv = document.createElement('div');
    typeDiv.className = 'msg-type';
    typeDiv.textContent = isNli ? 'THINKING...' : 'Thinking...';
    typeDiv.style.cssText = `
      display: none;
    `;
    
    // Create content area with better visibility
    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.style.cssText = `
      max-height: 200px;
      overflow-y: auto;
      padding-right: 5px;
      scroll-behavior: smooth;
      color: #ffffff;
      opacity: 1;
      font-weight: 400;
    `;
    
    // Assemble
    container.appendChild(typeDiv);
    container.appendChild(contentDiv);
    
    return { container, typeDiv, contentDiv };
  };
  
  // Function to handle task cancellation
  const handleTaskCancel = async (taskId) => {
    try {
      const userId = await getOrSyncUserId();
      console.debug('[DEBUG] handleTaskCancel: Using userId', userId);
      const response = await fetch(`/api/tasks/${taskId}/cancel`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'User cancelled', userId })
      });

      if (!response.ok) throw new Error('Failed to cancel task');
      
      const data = await response.json();
      
      if (data.success) {
        // Update local state immediately
        tasksStore.cancelTask(taskId);
        eventBus.emit('notification', { 
          message: 'Task cancelled', 
          type: 'success',
          duration: 3000
        });
      } else {
        throw new Error(data.error || 'Failed to cancel task');
      }
    } catch (error) {
      console.error('Task cancellation failed:', error);
      eventBus.emit('notification', { 
        message: error.message || 'Failed to cancel task',
        type: 'error',
        duration: 5000
      });
    }
  };
  
  const handleIntermediateResult = (payload) => {
    console.group('[CLIENT] Handling intermediateResult');
    console.log('Raw event data:', payload);
    
    if (!payload?.taskId) {
      console.error('Invalid payload - missing taskId');
      return;
    }
    
    // Only add results that have a screenshot
    if (!payload.result?.screenshot) {
      console.log('[DEBUG] Skipping intermediate result - no screenshot:', payload.result);
      return;
    }
    
    console.log('Current intermediateResults:', 
      tasksStore.getIntermediateResults(payload.taskId));
      
    tasksStore.addIntermediate(payload.taskId, {
      ...payload.result,
      _debugReceivedAt: new Date().toISOString()
    });

    console.log('[DEBUG] Store after update:', {
      intermediates: tasksStore.getIntermediateResults(payload.taskId),
      allTasks: tasksStore.getState().intermediateResults
    });
      
    renderIntermediateResults(payload.taskId);
    console.groupEnd();
  };

  const handleStepProgress = (payload) => {
    // Update task progress and result
    tasksStore.updateTask(payload.taskId, {
      status: 'processing',
      progress: payload.progress,
      result: payload.result,
      error: payload.error || null
    });
  };
  
  // Track when tasks are initiated through chat - this enhances task-chat integration
  const handleChatTaskStart = (event) => {
    console.log('eventBus received chatTaskStart:', event);
    if (event && event.taskId) {
      // Mark this task as initiated from chat for special handling when it completes
      sessionStorage.setItem(`chatInitiatedTask-${event.taskId}`, 'true');
      console.log(`[CommandCenter] Marked task ${event.taskId} as initiated from chat`);
      
      // Also mark this task as NLI-initiated
      taskNliMapping[event.taskId] = true;
    }
  };
  
  // Register event listener for chat-initiated tasks
  eventBus.on('chatTaskStart', handleChatTaskStart);
  
  // Helper function to create or update thought bubbles for tasks
  const createOrUpdateThoughtBubble = (taskId, content) => {
    if (!taskId) {
      console.error('[createOrUpdateThoughtBubble] Invalid taskId provided');
      return;
    }
    
    // Check if this task is from NLI
    const isNliTask = taskNliMapping[taskId] || false;
    console.log(`[createOrUpdateThoughtBubble] Creating/updating bubble for task ${taskId}, isNLI: ${isNliTask}`);
    
    // For direct (non-NLI) tasks, we'll only create a neural flow canvas
    // No standard thought bubble message will be created - as requested
    if (!isNliTask) {
      // Only create the neural flow visualization, no thought bubble
      createNeuralFlowCanvas(taskId, content, isNliTask);
      return null;
    }
    
    // For NLI tasks, continue with standard thought bubbles
    // First check if a thought bubble already exists
    let thoughtMsg = document.querySelector(`.msg-thought-item[data-task-id="${taskId}"]`) ||
                    document.querySelector(`.msg-thought[data-task-id="${taskId}"]:not(.task-complete-card)`) ||
                    document.querySelector(`[data-message-id="thought-${taskId}"]`);
    
    // If we found an existing bubble, just update it but don't show it yet
    if (thoughtMsg) {
      console.log(`[createOrUpdateThoughtBubble] Found existing thought bubble for task ${taskId}`);
      // Ensure it has proper attributes
      thoughtMsg.setAttribute('data-task-id', taskId);
      thoughtMsg.setAttribute('data-message-id', `thought-${taskId}`);
      thoughtMsg.id = `thought-bubble-${taskId}`; // Add unique ID for targeting
      
      // Hide the thought bubble until task completion
      if (thoughtMsg.style.display !== 'none') {
        thoughtMsg.style.display = 'none';
      }
      
      // Also create/update neural flow
      createNeuralFlowCanvas(taskId, content, isNliTask);
      return thoughtMsg;
    }
    const messageTimeline = document.querySelector('.message-timeline-container');
    if (!messageTimeline) {
      console.error('[createNeuralFlowCanvas] Message timeline container not found!');
      thoughtMsg.appendChild(typeDiv);
      
      // Create content div with fixed height and scrollable content
      const contentDiv = document.createElement('div');
      contentDiv.className = 'msg-content';
      
      // Add styling for fixed size and scrollable content
      contentDiv.style.maxHeight = '50px'; // Fixed height
      contentDiv.style.overflowY = 'auto'; // Scrollable
      contentDiv.style.scrollBehavior = 'smooth'; // Smooth scrolling
      contentDiv.style.paddingRight = '5px'; // Space for scrollbar
      
      if (content) {
        // contentDiv.innerHTML = `<div class="plan-log-entry"><span class="log-step">Task: </span>${content}</div>`;
      }
      thoughtMsg.appendChild(contentDiv);
      
      // Add to message timeline
      messageTimeline.appendChild(thoughtMsg);
      thoughtMsg.scrollIntoView({ behavior: 'smooth', block: 'end' });
      
      // Also create neural flow canvas
      createNeuralFlowCanvas(taskId, content, isNliTask);
      
      return thoughtMsg;
    } else {
      console.error('[createOrUpdateThoughtBubble] No message timeline container found');
      return null;
    }
  };
  
  // Separate function to create just the neural flow canvas (no thought bubble)
  const createNeuralFlowCanvas = (taskId, content, isNliTask) => {
    try {
      console.log(`[createNeuralFlowCanvas] Creating neural flow for task ${taskId}`);
      
      // Get the message timeline container - the ONLY container we use
      const messageTimeline = document.querySelector('.message-timeline-container');
      if (!messageTimeline) {
        console.error('[createNeuralFlowCanvas] Message timeline container not found!');
        return null;
      }
      
      // Check if we already have a neural flow instance for this task
      if (neuralFlows[taskId]) {
        console.log(`[createNeuralFlowCanvas] Neural flow instance for task ${taskId} already exists`);
        return neuralFlows[taskId];
      }
      
      // Find or create the bubble container
      let canvasBubble = messageTimeline.querySelector(`.thought-bubble[data-task-id="${taskId}"].creative-bubble`);
      
      // If bubble doesn't exist or was removed, create it
      if (!canvasBubble) {
        console.log(`[createNeuralFlowCanvas] Creating new canvas bubble for task ${taskId}`);
        
        // Create bubble element
        canvasBubble = document.createElement('div');
        canvasBubble.className = 'thought-bubble creative-bubble';
        canvasBubble.setAttribute('data-task-id', taskId);
        canvasBubble.setAttribute('data-neural-flow', 'true'); // Mark as neural flow container
        
        // Styling
        Object.assign(canvasBubble.style, {
          width: '100%',
          height: '300px',
          animation: 'fadeIn 0.3s',
          position: 'relative',
          overflow: 'hidden'
        });
        
        // Create canvas container
        const canvasContainer = document.createElement('div');
        canvasContainer.className = 'neural-canvas-container neural-flow-container';
        canvasContainer.setAttribute('data-task-id', taskId);
        Object.assign(canvasContainer.style, {
          width: '100%',
          height: '100%',
          position: 'relative',
          zIndex: 1
        });
        
        // Add to DOM
        canvasBubble.appendChild(canvasContainer);
        messageTimeline.appendChild(canvasBubble);
        
        // Initialize neural flow
        const neuralFlow = new NeuralFlow(canvasContainer);
        
        // Store references
        neuralFlows[taskId] = neuralFlow;
        taskCanvasMapping[taskId] = true;
        
        // Add cleanup on task completion
        window.eventBus.on(`taskComplete:${taskId}`, () => {
          console.log(`[createNeuralFlowCanvas] Task ${taskId} completed, cleaning up handlers`);
          window.eventBus.off(`taskComplete:${taskId}`);
        });
        
        console.log(`[createNeuralFlowCanvas] Neural flow for task ${taskId} created successfully`);
        return neuralFlow;
      } else {
        // If bubble exists but no neural flow instance, create one
        const existingContainer = canvasBubble.querySelector('.neural-canvas-container');
        if (existingContainer) {
          console.log(`[createNeuralFlowCanvas] Found existing container for task ${taskId}, reattaching neural flow`);
          const neuralFlow = new NeuralFlow(existingContainer);
          neuralFlows[taskId] = neuralFlow;
          return neuralFlow;
        }
      }
    } catch (err) {
      console.error('Error creating neural flow canvas:', err);
    }
  };
  
  // This method handles task start event from EventBus
  const handleTaskStart = (payload) => {
    console.log('eventBus received taskStart:', payload);
    
    // CRITICAL FIX: Extract taskId from payload properly
    let taskId = null;
    if (payload && payload.taskId) {
      taskId = payload.taskId;
    } else if (payload && payload.payload && payload.payload.taskId) {
      // Sometimes the taskId is nested inside a payload property
      taskId = payload.payload.taskId;
      console.log(`[CommandCenter] Found taskId ${taskId} in nested payload`);
    } else {
      // Generate a temporary ID if we don't have one
      taskId = 'temp-' + Date.now();
      console.log(`[CommandCenter] Generated temporary taskId ${taskId} for invalid payload`);
    }
    
    // Ensure we have a valid command
    const command = payload.command || 
                  (payload.payload && payload.payload.command) || 
                  (payload.prompt) || 
                  'Unknown task';
    
    // Check for existing task first
    const state = tasksStore.getState();
    const existingTask = state.active.find(task => task._id === taskId);
    
    if (existingTask) {
      console.log(`[CommandCenter] Task ${taskId} already exists, updating status only`);
      // Just update the status of the existing task
      tasksStore.updateTask(taskId, {
        status: 'pending',
        progress: 0
      });
    } else {
      // Use addTask which has deduplication logic
      tasksStore.addTask({
        _id: taskId,
        command: command,
        status: 'pending',
        progress: 0,
        startTime: payload.startTime || new Date(),
        result: null,
        error: null
      });
    }
    
    // CRITICAL: Determine if this is an NLI task first
    const isNliTask = payload.route === 'nli' || sessionStorage.getItem(`nli-task-${taskId}`) === 'true';
    if (isNliTask) {
      sessionStorage.setItem(`nli-task-${taskId}`, 'true');
    }
    
    // Clear intermediate results container for new tasks
    const intermediateContainer = document.getElementById('intermediate-results-container');
    if (intermediateContainer) {
      intermediateContainer.innerHTML = '';
      console.log(`[DEBUG] Cleared intermediate results container for new task ${taskId}`);
    }
    
    // IMPORTANT: First check if we already have a container for this task to prevent duplicates
    const existingContainer = document.querySelector(`.msg-item[data-task-id="${taskId}"]`);
    let thoughtContainer = null;
    let contentDiv = null;
    
    // Three scenarios:
    // 1. No container exists yet - create a new one
    // 2. Container exists in activeThoughtStreams - use that one
    // 3. Container exists in DOM but not in activeThoughtStreams - claim it
    
    try {
      if (existingContainer) {
        console.log(`[handleTaskStart] Found existing container for task ${taskId}, using it`);
        thoughtContainer = existingContainer;
        contentDiv = existingContainer.querySelector('.msg-content');
        
        if (!contentDiv) {
          contentDiv = document.createElement('div');
          contentDiv.className = 'msg-content';
          contentDiv.style.maxHeight = '200px';
          contentDiv.style.overflowY = 'auto';
          contentDiv.style.paddingRight = '5px';
          contentDiv.style.scrollBehavior = 'smooth';
          thoughtContainer.appendChild(contentDiv);
        }
      } else {
        // No existing container, create a new one
        console.log(`[handleTaskStart] Creating new thought container for task ${taskId}`);
        const result = createThoughtContainer(taskId, isNliTask);
        thoughtContainer = result.container;
        contentDiv = result.contentDiv;
        
        // Add to timeline in correct position
        const messageTimeline = document.querySelector('.message-timeline-container');
        if (messageTimeline) {
          messageTimeline.appendChild(thoughtContainer);
        }
      }
      
      // Always register with activeThoughtStreams for consistent tracking
      if (thoughtContainer && contentDiv) {
        if (!window.activeThoughtStreams) window.activeThoughtStreams = {};
        window.activeThoughtStreams[taskId] = {
          element: contentDiv,
          container: thoughtContainer, // Store the container too
          buffer: '',
          taskId,
          isNli: isNliTask,
          lastUpdated: Date.now()
        };
        
        // Ensure the container is visible and styled correctly
        thoughtContainer.style.opacity = '1';
        thoughtContainer.style.display = 'block';
        thoughtContainer.style.fontStyle = 'normal';
        
        // Scroll to make visible
        setTimeout(() => {
          thoughtContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
      
      // Now we can create the neural flow bubble separately
      // This is still needed for visualizing the neural flow
      createOrUpdateThoughtBubble(taskId, command);
      
    } catch (err) {
      console.error('[handleTaskStart] Error creating thought container:', err);
    }
  };

  // Handler for NLI response persisted event (fired when assistant completes its response)
  const handleNliResponsePersisted = (payload) => {
    console.log('eventBus received nliResponsePersisted:', payload);
    
    // Transition all thought messages that haven't been completed yet
    console.log('[DEBUG] NLI response persisted, updating any active thought messages');
    transitionThoughtBubbles();
  };
  
  // Enhanced function to transition thought bubbles from thinking to completed state
  const transitionThoughtBubbles = (taskId = null, forceTransition = false) => {
    console.log(`[DEBUG] Transitioning thought bubbles for ${taskId ? 'task: ' + taskId : 'all tasks'}, force=${forceTransition}`);
    
    // Use multiple selectors with a primary focus on message IDs and thought messages
    const selectors = [];
    
    // Target thought messages by message IDs pattern (primary approach)
    selectors.push('.msg-thought-item[data-message-id^="thought-"]'); // Target by message ID prefix
    
    // If we have a taskId, use data-task-id selectors as secondary approach
    if (taskId) {
      // TaskID-based selectors (still useful for some legacy messages)
      selectors.push(`.message-item[data-task-id="${taskId}"] .msg-type.msg-thought`); // Specific element inside messages
      selectors.push(`.thought-bubble[data-task-id="${taskId}"]`); // Legacy approach
    } else {
      // Otherwise try to find all potential thought messages
      selectors.push('.msg-item.msg-thought'); // Modern approach
      selectors.push('.msg-type.msg-thought'); // Target the specific element with "Thinking..." text
      selectors.push('.thought-bubble'); // Legacy bubbles
    }
    
    // Track if we found any elements to update
    let foundElements = false;
    
    // Try each selector
    selectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      console.log(`[DEBUG] Found ${elements.length} elements with selector: ${selector}`);
      
      elements.forEach(thoughtMessage => {
        foundElements = true;
        
        // Always update if forced, otherwise be more selective
        const isAlreadyComplete = thoughtMessage.classList.contains('thought-complete') || 
                                 thoughtMessage.classList.contains('complete');
                                  
        if (forceTransition || !isAlreadyComplete) {
          console.log('[DEBUG] Transforming thought message', thoughtMessage);
          
          // CRITICAL: Save the original position in the DOM before updating
          const parentNode = thoughtMessage.parentNode;
          const nextSibling = thoughtMessage.nextSibling;
          
          // Record original styles to preserve
          const originalPosition = window.getComputedStyle(thoughtMessage).position;
          const originalTop = window.getComputedStyle(thoughtMessage).top;
          const originalLeft = window.getComputedStyle(thoughtMessage).left;
          const originalZIndex = window.getComputedStyle(thoughtMessage).zIndex;
          
          // Update the visual appearance thoroughly
          thoughtMessage.style.opacity = '1';
          thoughtMessage.style.fontStyle = 'normal';
          thoughtMessage.style.fontWeight = 'normal';
          
          // Preserve position explicitly
          thoughtMessage.style.position = originalPosition !== 'static' ? originalPosition : 'relative';
          if (originalTop) thoughtMessage.style.top = originalTop;
          if (originalLeft) thoughtMessage.style.left = originalLeft;
          if (originalZIndex) thoughtMessage.style.zIndex = originalZIndex;
          
          // Check if this is an NLI thought bubble that should not be modified
          const isNliThoughtBubble = [
            // Check message ID pattern
            thoughtMessage.getAttribute('data-message-id') && thoughtMessage.getAttribute('data-message-id').includes('thought-'),
            // Check for task IDs
            thoughtMessage.getAttribute('data-task-id') && thoughtMessage.getAttribute('data-task-id').includes('-streaming'),
            // Check if message has NLI classes
            thoughtMessage.classList.contains('msg-thought-item')
          ].some(check => check === true);
          
          // ONLY add completion classes for non-NLI thought bubbles
          if (!isNliThoughtBubble) {
            // For standard tasks, add the completion classes
            thoughtMessage.classList.add('thought-complete');
            thoughtMessage.classList.add('complete');
            thoughtMessage.classList.remove('typing-bubble');
            thoughtMessage.classList.remove('transitioning');
          } else {
            console.log('[DEBUG] NLI thought bubble detected, preserving original classes');
            // For NLI tasks, we want to KEEP the original styling
            // But we should still remove transitioning to prevent unwanted animations
            thoughtMessage.classList.remove('transitioning');
          }
          
          // For NLI tasks, we DO NOT want to reposition the thought bubbles
          // This was causing the unwanted transition where thought bubbles moved
          // REMOVED: The code that was repositioning elements in the DOM
          
          // CRITICAL: Direct targeting of the "Thinking..." text elements
          // First look for the specific msg-type elements which contain the "Thinking..." text
          const msgTypeElements = [
            thoughtMessage.querySelector('.msg-type.msg-thought'),
            thoughtMessage.querySelector('div.msg-type'),
            thoughtMessage.querySelector('.thought-label')
          ].filter(Boolean); // Remove nulls
          
          // Directly update the Thinking... text to Complete
          msgTypeElements.forEach(el => {
            if (el && (el.textContent.includes('Thinking') || 
                      el.textContent.includes('THINKING') || 
                      el.textContent.includes('...'))) {
              console.log('[DEBUG] Found thinking element to update:', el.textContent);
              
              // Comprehensive check for NLI tasks to never change their content
              // This preserves the original text without adding "Finale..."
              const thoughtMsgId = thoughtMessage.getAttribute('data-message-id') || '';
              const thoughtTaskId = thoughtMessage.getAttribute('data-task-id') || '';
              
              // ANY of these conditions = NLI task that shouldn't be modified
              const isNliThought = [
                // Check thought message ID pattern which indicates NLI
                thoughtMsgId.includes('thought-'),
                // Check for streaming attributes in containers
                thoughtTaskId.includes('-streaming'),
                // Check if this thought is part of a task marked as NLI 
                taskNliMapping[thoughtTaskId] === true,
                // Check session storage
                sessionStorage.getItem(`nli-task-${thoughtTaskId}`) === 'true'
              ].some(check => check === true);
              
              if (isNliThought) {
                // FOR ALL NLI TASKS: Keep the original text for ALL thought bubbles
                console.log('[DEBUG] NLI thought detected, preserving original text');
                // Don't add complete class to avoid styling changes
                // Don't modify content at all
              } else {
                // Only for non-NLI tasks, show completion
                el.innerHTML = '<span style="margin-right: 5px;">🏁</span>Finale...';
                el.classList.add('complete');
                el.classList.add('thought-complete');
                
                // Apply specific styling requested
                el.style.fontStyle = 'normal';
                el.style.opacity = '1';
                el.style.margin = '0';
                el.style.marginTop = '-1.5rem';
                el.style.borderTopLeftRadius = 'unset';
                el.style.fontWeight = '500';
              }
              
              // Also apply to parent element to ensure visibility
              if (el.parentElement) {
                el.parentElement.style.fontStyle = 'normal';
                el.parentElement.style.opacity = '1';
              }
            }
          });
          
          // Try to explicitly target the timestamp element next to the Thinking... text
          const msgTimeEl = thoughtMessage.querySelector('.msg-time');
          if (msgTimeEl && msgTimeEl.previousElementSibling && 
              msgTimeEl.previousElementSibling.textContent.includes('Thinking')) {
            msgTimeEl.previousElementSibling.textContent = 'Complete';
          }
          
          // Also do a more aggressive search for any THINKING... text anywhere in the bubble
          const textNodes = [];
          const walkTree = (node) => {
            if (node.nodeType === 3) { // Text node
              if (node.textContent.includes('THINKING') || 
                  node.textContent.includes('Thinking') || 
                  node.textContent.includes('...')) {
                textNodes.push(node);
              }
            } else {
              for (let i = 0; i < node.childNodes.length; i++) {
                walkTree(node.childNodes[i]);
              }
            }
          };
          walkTree(thoughtMessage);
          
          textNodes.forEach(textNode => {
            textNode.textContent = textNode.textContent
              .replace(/THINKING\.\.\./g, 'COMPLETE')
              .replace(/Thinking\.\.\./g, 'Complete')
              .replace(/thinking\.\.\./g, 'complete');
          });
          
          // Remove any typing indicators
          const typingIndicators = [
            thoughtMessage.querySelector('.typing-indicator'),
            thoughtMessage.querySelector('.pulse'),
            thoughtMessage.querySelector('.thinking-animation')
          ].filter(Boolean); // Remove nulls
          
          typingIndicators.forEach(indicator => {
            indicator.remove();
          });
        }
      });
    });
    
    // If we couldn't find any elements and we have a taskId, try a more aggressive approach for task completion
    if (!foundElements && taskId) {
      console.log(`[DEBUG] No thought elements found for task ${taskId}, trying broader selectors`);
      
      // Try to find any messages related to this task
      const taskElements = document.querySelectorAll(`[data-task-id="${taskId}"]`);
      taskElements.forEach(el => {
        // Update any element that might be a thought element
        if (el.classList.contains('message-item') || 
            el.classList.contains('thought-bubble') || 
            el.classList.contains('msg-thought-item') ||
            el.textContent.includes('THINKING') || 
            el.textContent.includes('Thinking')) {
          console.log('[DEBUG] Updating task element', el);
          el.style.opacity = '1';
          el.classList.add('thought-complete');
          el.classList.add('complete');
          el.classList.remove('typing-bubble');
          el.classList.remove('transitioning');
          
          // Try to replace any THINKING... text
          el.innerHTML = el.innerHTML
            .replace(/THINKING\.\.\./g, 'COMPLETE')
            .replace(/Thinking\.\.\./g, 'Complete')
            .replace(/thinking\.\.\./g, 'complete');
        }
      });
    }
    
    // Global check for any thinking text still showing (last resort)
    if (forceTransition || taskId) {
      const allThinkingTexts = document.querySelectorAll('.thought-text, .thinking-text, .msg-type.msg-thought');
      allThinkingTexts.forEach(el => {
        if (el.textContent.includes('THINKING') || el.textContent.includes('Thinking') || el.textContent.includes('...')) {
          el.textContent = el.textContent
            .replace(/THINKING\.\.\./g, 'COMPLETE')
            .replace(/Thinking\.\.\./g, 'Complete')
            .replace(/thinking\.\.\./g, 'complete');
          el.classList.add('complete');
          el.classList.add('thought-complete');
          
          // Also try to add the complete class to parent elements
          let parent = el.parentElement;
          while (parent && parent.tagName !== 'BODY') {
            if (parent.classList.contains('thought-bubble') || 
                parent.classList.contains('msg-thought-item') ||
                parent.classList.contains('typing-bubble')) {
              parent.classList.add('complete');
              parent.classList.add('thought-complete');
              parent.classList.remove('typing-bubble');
            }
            parent = parent.parentElement;
          }
        }
      });
    }
  };

  const handleTaskComplete = (payload) => {
    console.log('eventBus received taskComplete:', payload);
    // Unwrap SSE or WebSocket payload
    const data = payload.payload || payload;
    const taskId = data.taskId;
    if (!taskId) return;
    
    // Track if this task was initiated from chat, so we can improve task-chat integration
    const taskInitiatedFromChat = sessionStorage.getItem(`chatInitiatedTask-${taskId}`) === 'true';
    if (taskInitiatedFromChat) {
      console.log(`[CommandCenter] Task ${taskId} was initiated from chat, will ensure chat knows about completion`);
    }
    
    // Find any thought messages related to this task and update them
    console.log(`[DEBUG] Task completed: ${taskId}, updating thought messages`);
    
    // Ensure any thought bubbles for this task are properly transitioned
    transitionThoughtBubbles(taskId, true); // Force transition regardless of current state
    
    // Also handle any thought bubbles for this task (legacy approach)
    transitionThoughtBubble(taskId, true); // Force transition regardless of current state
    
    // Parse result string if needed (server sends as string to avoid JSON issues)
    let finalResult = {};
    try {
      if (typeof data.result === 'string') {
        finalResult = JSON.parse(data.result);
      } else {
        finalResult = data.result || {};
      }
    } catch (e) {
      console.error('[CommandCenter] Error parsing task result:', e);
      finalResult = data.result || {}; // Use as-is if parse fails
    }
    
    const error = data.error || null;
    
    // For tasks initiated from chat, send a notification to the chat interface
    if (taskInitiatedFromChat && !error) {
      // Get the task summary and original command
      let taskSummary = '';
      const originalCommand = finalResult.originalCommand || data.command || 'Task completed';
      
      if (finalResult.aiPrepared && finalResult.aiPrepared.summary) {
        taskSummary = finalResult.aiPrepared.summary;
      } else if (finalResult.summary) {
        taskSummary = finalResult.summary;
      } else {
        taskSummary = `Task completed successfully`;
      }
      
      // Create a completion card with the original command
      const completionCard = document.createElement('div');
      completionCard.className = 'task-completion-card';
      completionCard.innerHTML = `
        <div class="task-completion-header">
          <i class="fas fa-check-circle"></i>
          <h4>${originalCommand}</h4>
        </div>
        <div class="task-completion-summary">${taskSummary}</div>
      `;
      
      // Add to message timeline
      const messageTimeline = document.querySelector('.message-timeline');
      if (messageTimeline) {
        messageTimeline.appendChild(completionCard);
        completionCard.scrollIntoView({ behavior: 'smooth' });
      }
      
      // Get any report URLs
      const reportInfo = [];
      if (finalResult.nexusReportUrl) {
        reportInfo.push(`Analysis Report: ${finalResult.nexusReportUrl}`);
      }
      if (finalResult.landingReportUrl) {
        reportInfo.push(`Landing Page Report: ${finalResult.landingReportUrl}`);
      }
      
      // Create a chat notification including task result and links
      const chatNotification = {
        role: 'assistant',
        content: `✅ Task completed: "${originalCommand || data.command || ''}"\n\n${taskSummary}${reportInfo.length > 0 ? '\n\nTask Reports Available:\n- ' + reportInfo.join('\n- ') : ''}`,
        timestamp: new Date(),
        type: 'chat',
        taskId: taskId
      };
      
      // Add this notification to the chat
      addChatMessage(chatNotification);
      console.log(`[CommandCenter] Added task completion notification to chat for task ${taskId}`);
      
      // Clear the chat-initiated flag as we've handled it
      sessionStorage.removeItem(`chatInitiatedTask-${taskId}`);
    }
    
    // Simplified logging focused on essential information
    console.log('[Task Complete] Task ID:', taskId);
    
    // Mark task as completed in store
    tasksStore.updateTask(taskId, {
      status: 'completed',
      progress: 100,
      result: finalResult,
      error
    });
    
    // Enhanced URL extraction with better fallbacks for the reported issue
    // Extract the screenshot path first as it's the most reliable
    const screenshotPath = finalResult.screenshotPath || 
                          (finalResult.aiPrepared && finalResult.aiPrepared.screenshotPath) || 
                          '';
    
    // When server sends null URLs but has a screenshot path, convert it to a valid URL
    // This fixes the specific issue seen in the logs
    const screenshotUrl = finalResult.screenshot || 
                         (finalResult.aiPrepared && finalResult.aiPrepared.screenshot) || 
                         (screenshotPath ? screenshotPath : '');
    
    // For nexusReportUrl, check if there's a screenshot path pattern that contains web-*.html
    // This helps recover report URLs when they're null but screenshot path exists
    let nexusReportUrl = finalResult.nexusReportUrl || 
                       (finalResult.aiPrepared && finalResult.aiPrepared.nexusReportUrl) || 
                       finalResult.reportUrl || 
                       '';
    
    // Similarly for landing report URL                    
    let landingReportUrl = finalResult.landingReportUrl || 
                         (finalResult.aiPrepared && finalResult.aiPrepared.landingReportUrl) || 
                         finalResult.runReport || 
                         '';
    
    // If we have a screenshot path but null report URLs, try to extract report URLs from the path
    // This handles the case where report URLs are null but should be derived from the screenshot path
    if ((!nexusReportUrl || !landingReportUrl) && screenshotPath) {
      // Extract the run ID from the screenshot path
      const runIdMatch = screenshotPath.match(/\/nexus_run\/([^/]+)\//); 
      if (runIdMatch && runIdMatch[1]) {
        const runId = runIdMatch[1];
        console.log(`[Task Complete] Extracted run ID from screenshot path: ${runId}`);
        
        // If nexusReportUrl is empty, try to construct it
        if (!nexusReportUrl) {
          // Check if this appears to be a date-based filename which indicates a web report
          const dateMatch = screenshotPath.match(/web-[\d_-]+\.html/);
          if (dateMatch) {
            nexusReportUrl = `/nexus_run/report/${dateMatch[0]}`;
            console.log(`[Task Complete] Reconstructed nexusReportUrl: ${nexusReportUrl}`);
          }
        }
        
        // If landingReportUrl is empty, try to construct a probable landing report URL
        if (!landingReportUrl) {
          // These usually follow the landing-report-timestamp.html pattern
          landingReportUrl = `/nexus_run/report/landing-report-${Date.now()}.html`;
          console.log(`[Task Complete] Constructed fallback landingReportUrl: ${landingReportUrl}`);
        }
      }
    }
    
    console.log('[Task Complete] Report URLs:', { 
      nexusReportUrl, 
      landingReportUrl, 
      screenshotUrl 
    });
    
    // Extract AI summary from standard locations
    const aiSummary = finalResult.aiPrepared?.summary || 
                     finalResult.summary || 
                     finalResult.extractedInfo || 
                     (finalResult.aiSummary?.summary) || 
                     '';
    
    // Get plan text if available
    const planEntries = tasksStore.getState().stepLogs[taskId] || [];
    const lastPlan = planEntries.filter(l => l.type === 'planLog').slice(-1)[0];
    const planText = lastPlan ? lastPlan.message : '';
    
    // IMPORTANT: Add to message-timeline-container, not message-timeline
    const timelineEl = document.querySelector('.message-timeline-container'); 
    if (timelineEl) {
      // Check if we already have a completion card for this task to avoid duplicates
      const existingCard = timelineEl.querySelector(`.task-complete-card[data-task-id="${taskId}"]`);
      if (existingCard) {
        console.log(`[renderTaskCompletion] Task completion card already exists for ${taskId}, skipping duplicate`);
        return;
      }
      // Remove any existing task completion cards for this task to avoid duplicates
      document.querySelectorAll(`.task-complete-card[data-task-id="${taskId}"]`)
        .forEach(el => el.remove());
      
      // Create a modern, chat-style completion card that's outside the canvas
      const card = document.createElement('div');
      card.className = 'msg-item msg-assistant task-complete-card';
      card.setAttribute('data-task-id', taskId);
      
      // Format timestamp
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      
      // Build HTML with report links - focused on providing clear access to reports
      let reportsHtml = '';
      
      // Focus on the important report links and create a clean, compact display
      reportsHtml += '<div class="task-report-links compact-links">';
      
      // Display links inline with icons for a cleaner look
      // Build available reports list
      const reportLinks = [];
      
      // Check for analysis report (nexusReportUrl)
      if (nexusReportUrl && (nexusReportUrl.startsWith('/') || nexusReportUrl.startsWith('http'))) {
        // Convert relative URLs to absolute to prevent React Router interference
        const fullNexusUrl = nexusReportUrl.startsWith('/') ? 
          (window.location.origin + nexusReportUrl) : nexusReportUrl;
        // Use onclick with window.open to completely bypass React Router
        reportLinks.push(`<a href="javascript:void(0)" onclick="window.open('${fullNexusUrl}', '_blank')" class="report-link analysis-report">
          <i class="fa fa-chart-bar"></i> Analysis Report</a>`);
      }
      
      // Check for landing page report (landingReportUrl)
      if (landingReportUrl && (landingReportUrl.startsWith('/') || landingReportUrl.startsWith('http'))) {
        // Convert relative URLs to absolute to prevent React Router interference
        const fullLandingUrl = landingReportUrl.startsWith('/') ? 
          (window.location.origin + landingReportUrl) : landingReportUrl;
        // Use onclick with window.open to completely bypass React Router
        reportLinks.push(`<a href="javascript:void(0)" onclick="window.open('${fullLandingUrl}', '_blank')" class="report-link landing-report">
          <i class="fa fa-external-link-alt"></i> Landing Page Report</a>`);
      }
      
      // Check for screenshot path as a fallback for reports
      if ((!nexusReportUrl && !landingReportUrl) && screenshotPath && (screenshotPath.startsWith('/') || screenshotPath.startsWith('http'))) {
        // If we have a web report pattern in the screenshot path, use it as a report link
        if (screenshotPath.includes('web-') && screenshotPath.includes('.html')) {
          // Convert relative URLs to absolute to prevent React Router interference
          const fullScreenshotUrl = screenshotPath.startsWith('/') ? 
            (window.location.origin + screenshotPath) : screenshotPath;
          // Use onclick with window.open to completely bypass React Router
          reportLinks.push(`<a href="javascript:void(0)" onclick="window.open('${fullScreenshotUrl}', '_blank')" class="report-link analysis-report">
            <i class="fa fa-chart-bar"></i> Web Report</a>`);
        }
      }
      
      // Removed duplicate Report button that was formerly here
      
      // Check for generic report URL
      if (finalResult.reportUrl && (finalResult.reportUrl.startsWith('/') || finalResult.reportUrl.startsWith('http')) && 
          finalResult.reportUrl !== nexusReportUrl && finalResult.reportUrl !== landingReportUrl) {
        // Convert relative URLs to absolute to prevent React Router interference
        const fullReportUrl = finalResult.reportUrl.startsWith('/') ? 
          (window.location.origin + finalResult.reportUrl) : finalResult.reportUrl;
        reportLinks.push(`<a href="javascript:void(0)" onclick="window.open('${fullReportUrl}', '_blank')" class="report-link generic-report"><i class="fa fa-file"></i> View Results</a>`);
      }
      
      // Check for runReport if it's different from the above links
      if (finalResult.runReport && (finalResult.runReport.startsWith('/') || finalResult.runReport.startsWith('http')) && 
          finalResult.runReport !== nexusReportUrl && finalResult.runReport !== landingReportUrl && finalResult.runReport !== finalResult.reportUrl) {
        // Convert relative URLs to absolute to prevent React Router interference
        const fullRunReportUrl = finalResult.runReport.startsWith('/') ? 
          (window.location.origin + finalResult.runReport) : finalResult.runReport;
        reportLinks.push(`<a href="javascript:void(0)" onclick="window.open('${fullRunReportUrl}', '_blank')" class="report-link run-report"><i class="fa fa-running"></i> Run Report</a>`);
      }
      
      // Add available screenshots as a final option if other reports aren't available
      // First check for screenshotUrl, then fall back to screenshotPath
      const effectiveScreenshotUrl = screenshotUrl || screenshotPath || '';
      if (reportLinks.length === 0 && effectiveScreenshotUrl && (effectiveScreenshotUrl.startsWith('/') || effectiveScreenshotUrl.startsWith('http'))) {
        // Convert relative URLs to absolute to prevent React Router interference
        const fullScreenshotUrl = effectiveScreenshotUrl.startsWith('/') ? 
          (window.location.origin + effectiveScreenshotUrl) : effectiveScreenshotUrl;
        reportLinks.push(`<a href="javascript:void(0)" onclick="window.open('${fullScreenshotUrl}', '_blank')" class="report-link screenshot-link"><i class="fa fa-image"></i> Screenshot</a>`);
      }
      
      // Add logging for debugging what links we actually display
      console.log('[Task Complete] Report links displayed:', reportLinks.length > 0 ? reportLinks : 'None');
      console.log('[Task Complete] Effective fallback URLs used:', {
        effectiveScreenshotUrl,
        nexusReportUrl, 
        landingReportUrl, 
        screenshotPath
      });
      
      // Add report links section if we have any links
      if (reportLinks.length > 0) {
        reportsHtml += reportLinks.join('');
      } else {
        reportsHtml += '<span class="no-reports">No reports available</span>';
      }
      
      reportsHtml += '</div>';
      
      // Get the original command from any available source
      const originalCommand = data.command || 
                            finalResult.originalCommand || 
                            finalResult.userCommand || 
                            finalResult.prompt || 
                            (finalResult.raw && finalResult.raw.command);
      
      // Check if this is a YAML task (multiple detection methods for robustness)
      const isYamlTask = 
        finalResult.yamlMapId || 
        finalResult.yamlMapName || 
        (finalResult.raw && finalResult.raw.yamlMapId) || 
        (finalResult.raw && finalResult.raw.yamlMapName) || 
        (originalCommand && originalCommand.startsWith('/yaml'));
      
      // Extract the YAML map name for YAML tasks
      const yamlMapName = isYamlTask ? (finalResult.yamlMapName || 
                         (finalResult.raw && finalResult.raw.yamlMapName) || 
                         'Unknown YAML Map') : null;
      
      // Clean up the AI summary when it contains raw JSON
      let cleanSummary = aiSummary;
      
      // Check if aiSummary contains JSON content
      if (aiSummary && (aiSummary.includes('{') || aiSummary.includes('}') || aiSummary.includes('":'))) {
        // Extract clean info from execution result if available
        if (finalResult.executionResult) {
          try {
            const result = typeof finalResult.executionResult === 'string' 
              ? JSON.parse(finalResult.executionResult) 
              : finalResult.executionResult;
              
            // Extract actual description if available
            if (result['0'] && result['0'].description) {
              cleanSummary = result['0'].description;
            } else if (typeof result === 'object') {
              // Look for description in any first-level property
              for (const key in result) {
                if (result[key] && typeof result[key] === 'object' && result[key].description) {
                  cleanSummary = result[key].description;
                  break;
                }
              }
              
              // If we still don't have a clean message, use a default
              if (cleanSummary === aiSummary) {
                cleanSummary = `Successfully ran YAML map: ${yamlMapName}`;
              }
            }
          } catch (e) {
            // Fallback to a clean default message
            cleanSummary = `Successfully ran YAML map: ${yamlMapName}`;
          }
        } else {
          // No execution result but messy aiSummary, use default
          cleanSummary = `Successfully ran YAML map: ${yamlMapName}`;
        }
      }
      
      // Create a more modern, chat-like message with success styling - without redundant header
      card.innerHTML = `
        <div class="msg-meta">
          <span class="msg-type task-success"><i class="fas fa-check-circle"></i> Task Completed</span>
          <span class="msg-time">${timeStr}</span>
        </div>
        <div class="msg-content">
          <div class="task-success-container">
            <div class="task-title">${
              // Show original command if available
              originalCommand ? 
                `${originalCommand}` : 
                // Fall back to YAML map name for YAML tasks
                isYamlTask ? 
                  `YAML map ${yamlMapName} executed` : 
                  'Task completed'
            }</div>
            <div class="task-success-summary">${cleanSummary}</div>
            ${planText ? `<div class="task-success-plan">${planText}</div>` : ''}
            ${reportsHtml}
          </div>
        </div>
      `;
      
      timelineEl.appendChild(card);
      
      // Add a small delay before adding the system message to let the task completion card appear first
      /*
      setTimeout(() => {
        // Create a system message from AI with the summary
        if (aiSummary) {
          const messageCard = document.createElement('div');
          messageCard.className = 'msg-item msg-assistant system-message-card';
          messageCard.setAttribute('data-task-id', taskId);
          
          // Format content that looks like a message from the AI assistant
          messageCard.innerHTML = `
            <div class="msg-meta">
              <span class="msg-avatar"><i class="fas fa-robot"></i></span>
              <span class="msg-time">${timeStr}</span>
            </div>
            <div class="msg-content">
              <div class="markdown-content">
                <p>${aiSummary}</p>
                <p class="system-msg-links">
                  ${landingReportUrl ? `<a href="javascript:void(0)" onclick="window.open('${landingReportUrl.startsWith('/') ? window.location.origin + landingReportUrl : landingReportUrl}', '_blank')" class="report-link landing-report"><i class="fa fa-rocket"></i> Landing</a>` : ''}
                  ${nexusReportUrl ? `<a href="javascript:void(0)" onclick="window.open('${nexusReportUrl.startsWith('/') ? window.location.origin + nexusReportUrl : nexusReportUrl}', '_blank')" class="report-link analysis-report"><i class="fa fa-chart-line"></i> Analysis</a>` : ''}
                </p>
              </div>
            </div>
          `;
          
          timelineEl.appendChild(messageCard);
          timelineEl.scrollTop = timelineEl.scrollHeight; // Auto-scroll to show new content
        }
      }, 500); // Short delay to sequence the messages
      */
      
      // Scroll immediately to show the task completion card
      timelineEl.scrollTop = timelineEl.scrollHeight;
    }
  };
  
  // --- Helper: Render Intermediate Results ---
  /**
   * Enhanced helper function to transition a thought bubble from thinking state to completed state
   * Designed to be maximally reliable using multiple selector strategies, especially for task completion
   * @param {string} taskId - ID of the task associated with the bubble
   * @param {boolean} forceTransition - Whether to force transition even if not in typing state
   */
  function transitionThoughtBubble(taskId, forceTransition = false) {
    console.log(`[DEBUG] Attempting to transition thought bubble for task ${taskId}, forceTransition=${forceTransition}`);
    
    // Create an array of selector strategies to maximize our chances of finding the bubble
    const selectors = [
      `.thought-bubble[data-task-id="${taskId}"]`, // Exact match with data attribute
      `.typing-bubble[data-task-id="${taskId}"]`,  // Typing state with data attribute
      `.message-item[data-task-id="${taskId}"] .thought-bubble`, // Parent-child relationship
      `.message-item[data-task-id="${taskId}"] .typing-bubble`, // Parent-child with typing
      `.message-content[data-task-id="${taskId}"] .thought-bubble`, // Alternative parent-child
      `[data-task-id="${taskId}"].thought-bubble`, // Alternative attribute syntax
      `[data-task-id="${taskId}"]`  // Any element with taskId (last resort)
    ];
    
    // Try multiple selector strategies until we find a bubble
    let bubble = null;
    let foundSelector = null;
    
    for (const selector of selectors) {
      bubble = document.querySelector(selector);
      if (bubble) {
        foundSelector = selector;
        console.log(`[DEBUG] Found bubble with selector: ${selector}`);
        break;
      }
    }
    
    // If no bubble found with primary selectors, try broader secondary search
    if (!bubble) {
      console.warn(`[DEBUG] Could not find thought bubble with primary selectors`);
      
      // Try looking for all bubbles and find one that might match
      const allBubbles = document.querySelectorAll('.thought-bubble, .typing-bubble, .msg-thought-item');
      console.log(`[DEBUG] Found ${allBubbles.length} total bubbles in document, searching for match...`);
      
      // Look for a bubble that contains the taskId in any attribute or content
      for (const possibleBubble of allBubbles) {
        // Check data attributes
        if (possibleBubble.dataset.taskId === taskId) {
          bubble = possibleBubble;
          foundSelector = 'attribute-search';
          console.log(`[DEBUG] Found bubble via attribute search`);
          break;
        }
        
        // Check if taskId is in any of the bubble's content
        if (possibleBubble.innerHTML && possibleBubble.innerHTML.includes(taskId)) {
          bubble = possibleBubble;
          foundSelector = 'content-search';
          console.log(`[DEBUG] Found bubble via content search`);
          break;
        }
      }
      
      // Still no bubble? Last resort: transition ALL recent bubbles
      if (!bubble && forceTransition) {
        console.log(`[DEBUG] No specific bubble found, force-transitioning all recent bubbles`);
        document.querySelectorAll('.thought-bubble, .typing-bubble, .msg-thought-item').forEach(b => {
          if (b.classList.contains('typing-bubble') || 
              b.style.opacity === '0.6' || 
              b.style.fontStyle === 'italic' ||
              !b.classList.contains('complete')) {
            // Apply transition to all possible candidates
            applyTransition(b, true);
          }
        });
        return; // We've done a global transition, no need to continue
      }
    }
    
    // If we still haven't found anything, there's nothing to transition
    if (!bubble) {
      console.warn(`[DEBUG] Still could not find any matching bubble for task ${taskId}`);
      return;
    }
    
    // Log the current state of the bubble
    console.log(`[DEBUG] Found bubble state:`, {
      foundVia: foundSelector,
      hasTypingClass: bubble.classList.contains('typing-bubble'),
      hasTransitioningClass: bubble.classList.contains('transitioning'),
      hasCompleteClass: bubble.classList.contains('complete'),
      currentClasses: Array.from(bubble.classList),
      currentStyles: {
        animation: bubble.style.animation,
        opacity: bubble.style.opacity,
        fontStyle: bubble.style.fontStyle
      }
    });
    
    // Apply the transition with much more relaxed criteria
    // Only skip if explicitly marked complete AND not forced
    const isAlreadyComplete = bubble.classList.contains('complete') && !forceTransition;
    
    if (!isAlreadyComplete) {
      applyTransition(bubble, forceTransition);
    } else {
      console.log(`[DEBUG] Skipping transition for bubble ${taskId} - already in complete state and force=false`);
    }
  }
  
  // Helper function to apply transition effects to a bubble
  function applyTransition(bubble, forceTransition) {
    console.log(`[CommandCenter] Applying transition to bubble`, bubble);
    
    // Explicitly remove any existing animations
    bubble.style.animation = 'none';
    // Force a reflow to ensure animation restart
    void bubble.offsetWidth;
    
    // Update all possible state indicators to ensure the transition works
    bubble.style.opacity = '1';
    bubble.style.fontStyle = 'normal';
    bubble.style.fontWeight = 'normal';
    
    // Add transition classes and animations
    bubble.classList.remove('typing-bubble');
    bubble.classList.add('transitioning');
    bubble.style.animation = 'fadeTransform 0.7s ease-in-out forwards';
    
    // Update any label element within the bubble
    const labels = [
      bubble.querySelector('.msg-type.msg-thought'),
      bubble.querySelector('.msg-type'),
      bubble.querySelector('.thought-label'),
      bubble.querySelector('.typing-indicator')
    ].filter(Boolean); // Remove nulls
    
    labels.forEach(label => {
      if (label && (label.textContent.includes('Thinking') || label.textContent.includes('...'))) {
        label.textContent = 'Thought';
        label.classList.add('complete');
      }
    });
    
    // Reset animation after it completes to allow for further state changes
    setTimeout(() => {
      console.log(`[DEBUG] Animation timer completed for bubble`, bubble);
      bubble.classList.remove('transitioning');
      // Add the 'complete' class to mark this bubble as fully transitioned
      bubble.classList.add('complete');
      bubble.classList.add('thought-complete'); // Add both class variants for compatibility
      
      // Log the final state
      console.log(`[DEBUG] Final bubble state:`, {
        hasTypingClass: bubble.classList.contains('typing-bubble'),
        hasTransitioningClass: bubble.classList.contains('transitioning'),
        hasCompleteClass: bubble.classList.contains('complete'),
        currentClasses: Array.from(bubble.classList)
      });
    }, 700); // Match the animation duration
  }
  
  function renderIntermediateResults(taskId) {
    let container = document.getElementById('intermediate-results-container');
    if (!container) {
      const timeline = document.querySelector('.message-timeline-container');
      if (!timeline) return;
      container = document.createElement('div');
      container.id = 'intermediate-results-container';
      container.className = 'intermediate-results-container';
      timeline.insertAdjacentElement('afterend', container);
    }
    container.innerHTML = '';
    const results = tasksStore.getIntermediateResults(taskId) || [];
    results.forEach((res, idx) => {
      const el = document.createElement('div');
      el.className = `intermediate-result-item ${res.__final ? 'final-result' : ''}`;
      el.innerHTML = `
        <div class="step-header">
          <span class="step-number">Step ${idx + 1}</span>
          ${res.__final ? '<span class="final-badge">✓ Final</span>' : ''}
        </div>
        <pre>${JSON.stringify(res, null, 2)}</pre>
      `;
      container.appendChild(el);
    });
    // Always scroll to bottom
    container.scrollTop = container.scrollHeight;
  }

  // --- Event Handlers ---

  /**
   * Handle task error events
   * @param {Object} payload - Task error payload
   */
  const handleTaskError = (payload) => {
    console.error('eventBus received taskError:', payload);
    // Unwrap SSE or WebSocket payload if needed
    const data = payload.payload || payload;
    const taskId = data.taskId;
    if (!taskId) return;
    
    // Enhanced error handling with result extraction
    const errorResult = data.result || {};
    
    // Update task status to error
    tasksStore.updateTask(taskId, {
      status: 'error',
      progress: 0,
      error: data.error || 'Unknown error occurred',
      result: errorResult // Store any result data that might contain reports
    });
    
    // Variables to store possible report URLs
    let nexusReportUrl = null;
    let landingReportUrl = null;
    let reportUrl = null;
    let runReport = null;
    
    // Find any report URLs in the error data
    if (data.result) {
      // Look for common report URL patterns
      reportUrl = data.result.reportUrl || null;
      nexusReportUrl = data.result.nexusReportUrl || null;
      landingReportUrl = data.result.landingReportUrl || null;
      runReport = data.result.runReport || null;
      
      // Log what we found
      console.log('[DEBUG] Error data contains reports:', { 
        reportUrl, nexusReportUrl, landingReportUrl, runReport 
      });
    }
    
    // Display error in UI - FIXED: Use message-timeline-container instead of message-timeline
    // This ensures error messages appear in the scrollable area with other messages
    const timelineContainer = document.querySelector('.message-timeline-container');
    if (timelineContainer) {
      const errorCard = document.createElement('div');
      errorCard.className = 'bubble-card task-error-card';
      errorCard.setAttribute('data-task-id', taskId);
      
      // Base error content
      let cardContent = `
        <span class="status-badge failure">⚠️</span>
        <span class="error-summary">Task failed: ${data.error || 'Unknown error'}</span>
      `;
      
      // Add report links if available (in a compact, inline format)
      if (reportUrl || nexusReportUrl || landingReportUrl || runReport) {
        cardContent += '<div class="task-report-links error-reports compact-links">';
        
        // Build available reports list for errors
        const reportLinks = [];
        
        // Add report links in priority order
        if (reportUrl && (reportUrl.startsWith('/') || reportUrl.startsWith('http'))) {
          reportLinks.push(`<a href="${reportUrl}" target="_blank" class="report-link error-report"><i class="fa fa-exclamation-circle"></i> Error Report</a>`);
        }
        if (nexusReportUrl && nexusReportUrl !== reportUrl && (nexusReportUrl.startsWith('/') || nexusReportUrl.startsWith('http'))) {
          reportLinks.push(`<a href="${nexusReportUrl}" target="_blank" class="report-link midscene-report"><i class="fa fa-chart-bar"></i> Analysis</a>`);
        }
        if (landingReportUrl && landingReportUrl !== reportUrl && landingReportUrl !== nexusReportUrl && (landingReportUrl.startsWith('/') || landingReportUrl.startsWith('http'))) {
          reportLinks.push(`<a href="${landingReportUrl}" target="_blank" class="report-link landing-report"><i class="fa fa-file-alt"></i> Report</a>`);
        }
        if (runReport && runReport !== reportUrl && runReport !== nexusReportUrl && runReport !== landingReportUrl && (runReport.startsWith('/') || runReport.startsWith('http'))) {
          reportLinks.push(`<a href="${runReport}" target="_blank" class="report-link run-report"><i class="fa fa-running"></i> Run Report</a>`);
        }
        
        // Add all collected report links
        if (reportLinks.length > 0) {
          cardContent += reportLinks.join('');
        }
        
        cardContent += '</div>';
      }
      
      errorCard.innerHTML = cardContent;
      
      // Append to the message-timeline-container so it's part of the scrollable area
      timelineContainer.appendChild(errorCard);
      
      // Scroll to the bottom to show the new error message
      timelineContainer.scrollTop = timelineContainer.scrollHeight;
      
      // Also attempt to use scrollToLatestMessage for more reliable scrolling
      if (typeof scrollToLatestMessage === 'function') {
        try {
          scrollToLatestMessage(true);
        } catch (e) {
          console.warn('Could not use scrollToLatestMessage:', e);
        }
      }
    }
  };

  // --- Register eventBus listeners (after DOM ready) ---
  eventBus.on('stepProgress', handleStepProgress);
  eventBus.on('taskStart', handleTaskStart);
  eventBus.on('taskComplete', handleTaskComplete);
  eventBus.on('taskError', handleTaskError);

  // WebSocket intermediate result handling with cleanup
  function setupIntermediateResultHandler() {
    const handleIntermediateResult = (data) => {
      console.group('[CLIENT] Handling intermediateResult');
      console.log('Raw event data:', data);
      
      if (!data?.taskId) {
        console.error('Invalid payload - missing taskId');
        return;
      }
      
      console.log('Current intermediateResults:', 
        tasksStore.getIntermediateResults(data.taskId));
        
      tasksStore.addIntermediate(data.taskId, {
        ...data.result,
        _debugReceivedAt: new Date().toISOString()
      });

      console.log('[DEBUG] Store after update:', {
        intermediates: tasksStore.getIntermediateResults(data.taskId),
        allTasks: tasksStore.getState().intermediateResults
      });
      
      renderIntermediateResults(data.taskId);
      console.groupEnd();
    };

    // Subscribe to events
    eventBus.on('intermediateResult', handleIntermediateResult);
    
    // Return cleanup function
    return () => {
      eventBus.off('intermediateResult', handleIntermediateResult);
    };
  }

  // Initialize during component setup
  const cleanupIntermediateHandler = setupIntermediateResultHandler();

  // Register the nliResponsePersisted handler with the event system
  eventBus.on('nliResponsePersisted', handleNliResponsePersisted);

  // Add to existing cleanup logic
  function destroy() {
    eventBus.off('taskStart', handleTaskStart);
    eventBus.off('taskComplete', handleTaskComplete);
    eventBus.off('taskError', handleTaskError);
    eventBus.off('nliResponsePersisted', handleNliResponsePersisted);
    
    if (typeof cleanupIntermediateHandler === 'function') {
      cleanupIntermediateHandler();
    }
    
    // Existing cleanup code...
  }

  // Enhanced render function with modern iOS-style UI - integrated with sidebar
  function renderIntermediateResults(taskId, stepId) {
    let container = document.getElementById('intermediate-results-container');
    
    // If container doesn't exist or we can't find it, exit
    if (!container) {
      console.warn('Could not find intermediate-results-container, cannot render results');
      return;
    }
    
    // Clear the container when a new task starts (stepId is 1)
    if (stepId === 1) {
      console.log('[DEBUG] New task started, clearing intermediate results container');
      container.innerHTML = '';
      container.style.display = 'flex';
      container.classList.add('active');
      return;
    }
    
    // Ensure container is visible and active
    container.classList.add('active');
    container.style.display = 'flex';
    
    // Add header with controls if not already there
    if (!container.querySelector('.results-header')) {
      const resultsHeader = document.createElement('div');
      resultsHeader.className = 'results-header';
      
      const resultsTitle = document.createElement('div');
      resultsTitle.className = 'results-title';
      resultsTitle.innerHTML = '<i class="fas fa-tasks"></i> Task Results';
      
      const resultsControls = document.createElement('div');
      resultsControls.className = 'results-controls';
      
      const minimizeBtn = document.createElement('button');
      minimizeBtn.className = 'results-control';
      minimizeBtn.innerHTML = '<i class="fas fa-minus"></i>';
      minimizeBtn.title = 'Minimize';
      minimizeBtn.addEventListener('click', () => {
        container.classList.toggle('minimized');
        minimizeBtn.innerHTML = container.classList.contains('minimized') 
          ? '<i class="fas fa-expand"></i>' 
          : '<i class="fas fa-minus"></i>';
      });
      
      const closeBtn = document.createElement('button');
      closeBtn.className = 'results-control';
      closeBtn.innerHTML = '<i class="fas fa-times"></i>';
      closeBtn.title = 'Close';
      closeBtn.addEventListener('click', () => {
        // Simply hide the container completely without removing content
        container.style.display = 'none';
        
        // Mark it as inactive
        container.classList.remove('active');
        
        // Add a direct inline style to ensure it's hidden
        container.style.visibility = 'hidden';
        
        // Set a data attribute to indicate it was closed by the user
        container.setAttribute('data-closed', 'true');
        
        console.log('Intermediate results panel closed');
      });
      
      resultsControls.appendChild(minimizeBtn);
      resultsControls.appendChild(closeBtn);
      resultsHeader.appendChild(resultsTitle);
      resultsHeader.appendChild(resultsControls);
      
      container.appendChild(resultsHeader);
    }
    
    // Remove any existing results content, but keep the header
    const header = container.querySelector('.results-header');
    container.innerHTML = '';
    if (header) container.appendChild(header);
    
    // Get results and filter for only those with screenshots
    const results = tasksStore.getIntermediateResults(taskId) || [];
    // Filter to keep only results with screenshot/screenshotUrl
    const resultsWithScreenshots = results.filter(item => {
      return item && (item.screenshot || item.screenshotUrl || 
                     (item.result && (item.result.screenshot || item.result.screenshotUrl)));
    });
    console.log(`[CommandCenter] Filtered intermediate results: ${resultsWithScreenshots.length}/${results.length} have screenshots`);
    
    // Reverse array to show newest first
    const reversedResults = [...resultsWithScreenshots].reverse();
    
    // If no results yet, show a loading indicator
    if (reversedResults.length === 0) {
      const loadingItem = document.createElement('div');
      loadingItem.className = 'intermediate-result-item loading';
      loadingItem.innerHTML = `
        <div class="ir-step-header">
          <span class="ir-step-number">Processing</span>
        </div>
        <div class="loading-indicator">
          <div class="loading-dots">
            <span></span><span></span><span></span>
          </div>
          <div class="loading-text">Executing task...</div>
        </div>
      `;
      container.appendChild(loadingItem);
      return;
    }
    
    reversedResults.forEach((res, idx) => {
      // Use original index for step number from filtered results
      const originalIndex = resultsWithScreenshots.length - idx - 1;
      const isFinal = res.__final || false;
      
      const resultItem = document.createElement('div');
      resultItem.className = `intermediate-result-item ${isFinal ? 'final-result' : ''}`;
      
      // Extract screenshot URL and other important data if they exist
      const screenshotUrl = res.screenshotUrl || '';
      const currentUrl = res.currentUrl || '';
      const extractedInfo = res.extractedInfo || '';
      
      // Structure for header - using unique classes for intermediate results
      const header = document.createElement('div');
      header.className = 'ir-step-header';
      
      // Step number with icon - using unique classes for intermediate results
      const stepNumber = document.createElement('span');
      stepNumber.className = 'ir-step-number';
      stepNumber.textContent = `Step ${originalIndex + 1}`;
      
      // Add final flag icon if this is the final result
      if (isFinal) {
        const finalFlag = document.createElement('span');
        finalFlag.className = 'final-flag';
        finalFlag.innerHTML = '<i class="fas fa-flag-checkered"></i>';
        stepNumber.appendChild(finalFlag);
      }
      
      header.appendChild(stepNumber);
      resultItem.appendChild(header);
      
      // Content area with JSON and thumbnail
      const contentArea = document.createElement('div');
      contentArea.className = 'result-content';
      
      // JSON content
      const jsonContent = document.createElement('div');
      jsonContent.className = 'result-json';
      
      // Process JSON to make it more readable by extracting key information
      let displayData = { ...res };
      
      // Remove debug and internal properties for cleaner display
      ['_debugReceivedAt', '__final'].forEach(key => {
        if (displayData.hasOwnProperty(key)) {
          delete displayData[key];
        }
      });
      
      // Extracted info section if available
      if (extractedInfo && typeof extractedInfo === 'string' && extractedInfo.trim().length > 0) {
        const infoElement = document.createElement('div');
        infoElement.className = 'extracted-info';
        infoElement.innerHTML = `
          <div class="info-label"><i class="fas fa-info-circle"></i> Information</div>
          <div class="info-content">${extractedInfo}</div>
        `;
        jsonContent.appendChild(infoElement);
      }
      
      // Add pre element with formatted JSON with transition properties
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(displayData, null, 2);
      pre.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      pre.style.opacity = '0'; // Start with 0 opacity for fade-in effect
      jsonContent.appendChild(pre);
      
      contentArea.appendChild(jsonContent);
      
      // Thumbnail if screenshot URL exists
      if (screenshotUrl) {
        const thumbnail = document.createElement('img');
        thumbnail.className = 'result-thumbnail';
        thumbnail.src = screenshotUrl;
        thumbnail.alt = `Screenshot from step ${originalIndex + 1}`;
        thumbnail.loading = 'lazy';
        
        // Add click handler to expand image
        thumbnail.addEventListener('click', () => {
          // Create modern image preview
          const preview = document.createElement('div');
          preview.className = 'image-preview-overlay';
          preview.innerHTML = `
            <div class="image-preview-container">
              <div class="image-preview-header">
                <span>Screenshot - Step ${originalIndex + 1}</span>
                <button class="image-preview-close"><i class="fas fa-times"></i></button>
              </div>
              <img src="${screenshotUrl}" alt="Full screenshot" class="image-preview-img">
            </div>
          `;
          
          document.body.appendChild(preview);
          
          // Add close handler
          preview.querySelector('.image-preview-close').addEventListener('click', () => {
            preview.classList.add('closing');
            setTimeout(() => preview.remove(), 300);
          });
          
          // Close on background click
          preview.addEventListener('click', (e) => {
            if (e.target === preview) {
              preview.classList.add('closing');
              setTimeout(() => preview.remove(), 300);
            }
          });
          
          // Prevent scroll body when modal is open
          document.body.style.overflow = 'hidden';
          preview.addEventListener('transitionend', () => {
            document.body.style.overflow = '';
          }, { once: true });
        });
        
        contentArea.appendChild(thumbnail);
      }
      
      resultItem.appendChild(contentArea);
      
      // URL display if available
      if (currentUrl) {
        const urlElement = document.createElement('div');
        urlElement.className = 'result-url';
        urlElement.innerHTML = `<i class="fas fa-link"></i> ${currentUrl}`;
        resultItem.appendChild(urlElement);
      }
      
      // Toggle for showing/hiding content (esp. for mobile)
      if (Object.keys(displayData).length > 3) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'content-toggle';
        toggleBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Show more';
        toggleBtn.setAttribute('aria-expanded', 'false');
        
        toggleBtn.addEventListener('click', () => {
          const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
          
          // Toggle the expanded class on the result item for clean JSON viewing
          if (isExpanded) {
            // Collapsing - first fade out pre element, then remove expanded class
            pre.style.opacity = '0';
            pre.style.transform = 'translateY(10px)';
            
            setTimeout(() => {
              resultItem.classList.remove('expanded');
              pre.style.maxHeight = '120px';
              pre.style.display = 'none'; // Hide the JSON content when collapsed
              
              // Re-show any previously hidden elements
              const thumbnail = resultItem.querySelector('.result-thumbnail');
              const extractedInfo = resultItem.querySelector('.extracted-info');
              
              if (thumbnail) thumbnail.style.display = '';
              if (extractedInfo) extractedInfo.style.display = '';
              
              // Restore normal layout
              const resultContent = resultItem.querySelector('.result-content');
              if (resultContent) resultContent.style.display = 'flex';
            }, 200);
            
          } else {
            // Expanding - immediately add expanded class, then fade in pre element
            resultItem.classList.add('expanded');
            pre.style.maxHeight = 'none';
            pre.style.display = 'block'; // Show the JSON content when expanded
            
            // Ensure proper styling for content area
            const resultContent = resultItem.querySelector('.result-content');
            if (resultContent) resultContent.style.display = 'block';
            
            // Apply animation effect manually for better control
            setTimeout(() => {
              pre.style.opacity = '1';
              pre.style.transform = 'translateY(0)';
            }, 50);
          }
          
          // Update button text and aria state
          toggleBtn.innerHTML = isExpanded 
            ? '<i class="fas fa-chevron-down"></i> Show more' 
            : '<i class="fas fa-chevron-up"></i> Show less';
          toggleBtn.setAttribute('aria-expanded', !isExpanded);
        });
        
        // Initially collapsed for cleaner UI
        pre.style.maxHeight = '120px';
        pre.style.overflow = 'hidden';
        
        resultItem.appendChild(toggleBtn);
      }
      
      container.appendChild(resultItem);
    });
    
    // Add subtle animation to show activity
    container.style.animation = 'none';
    setTimeout(() => {
      container.style.animation = 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)';
    }, 10);
  }

  function renderStepLogs(taskId) {
    let container = document.getElementById('task-step-logs-container');
    if (!container) {
      const timeline = document.querySelector('.message-timeline-container');
      if (!timeline) return;
      container = document.createElement('div');
      container.id = 'task-step-logs-container';
      container.className = 'task-step-logs-container';
      timeline.insertAdjacentElement('afterend', container);
    }
    
    // Clear existing logs
    container.innerHTML = '';
    
    // Get only the latest result
    const results = tasksStore.getIntermediateResults(taskId) || [];
    const latestResult = results[results.length - 1];
    
    if (!latestResult) return;

    // Only show the main step information, not the detailed logs
    if (latestResult.__final || latestResult.step) {
      const el = document.createElement('div');
      el.className = 'task-step-log-item';
      
      // Extract step number from the result or use the array length as fallback
      const stepNumber = latestResult.step?.number || results.length;
      const stepTitle = latestResult.step?.description || latestResult.message || 'Step in progress';
      
      // Only show the step header with essential information
      el.innerHTML = `
        <div class="step-header" style="display: flex; align-items: center; padding: 4px 0;">
          <div class="step-number-badge" style="background: linear-gradient(135deg, var(--theme-primary-color), var(--theme-secondary-color)); 
               color: white; border-radius: 4px; padding: 2px 8px; font-size: 0.8rem; font-weight: 500;">
            Step ${stepNumber}
          </div>
        </div>
      `;
      
      container.appendChild(el);
      
      // Auto-scroll to show the latest step
      container.scrollTop = container.scrollHeight;
    }
  }

  // Expose public methods
  container.setActiveTab = (tabType) => {
    if (tabs.some(tab => tab.id === tabType)) {
      activeTab = tabType;
      
      // Update UI
      tabButtons.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.taskType === activeTab));
      
      showActiveSection(activeTab);
      
      // Update store
      uiStore.setState({ activeTab });
    }
  };
  
  // Cleanup method
  container.destroy = destroy;

  // Update intermediateResult handler to dispatch custom events
  eventBus.on('intermediateResult', (data) => {
    // Update vanilla JS store first
    tasksStore.addIntermediate(data.taskId, data.result);
    
    // Get updated results
    const results = tasksStore.getIntermediateResults(data.taskId) || [];
    
    // Dispatch custom event for React components
    document.dispatchEvent(new CustomEvent('taskUpdate', {
      detail: {
        taskId: data.taskId,
        results: results,
        eventType: data.event,
        timestamp: new Date().toISOString()
      }
    }));
    
    // Maintain existing rendering
    renderIntermediateResults(data.taskId);
  });

  return container;
}

/**
 * Mount a command center to a parent element
 * @param {HTMLElement} parent - Parent element
 * @param {Object} props - Command center properties
 * @returns {HTMLElement} The mounted command center
 */
CommandCenter.mount = (parent, props = {}) => {
  const commandCenter = CommandCenter(props);
  parent.appendChild(commandCenter);
  return commandCenter;
};

export default CommandCenter;
