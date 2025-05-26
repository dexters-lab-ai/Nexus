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

  // Create component container
  const container = document.createElement('div');
  container.className = 'command-center';
  if (containerId) container.id = containerId;

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
        const message = JSON.parse(event.data);
        console.log('WebSocket: Received message:', message);

        // Process task steps from WebSocket events
        if (message.event === 'functionCallPartial') {
          console.debug('[DEBUG] WS functionCallPartial:', message.functionName, message.partialArgs);
          functionCallBuffers[message.taskId] = (functionCallBuffers[message.taskId] || '') + message.partialArgs;
          let args;
          try { 
            args = JSON.parse(functionCallBuffers[message.taskId]); 
          } catch { 
            return; 
          }
          delete functionCallBuffers[message.taskId];
          tasksStore.addStepLog(message.taskId, { type: 'functionCall', functionName: message.functionName, args, timestamp: new Date().toISOString() });
          renderStepLogs(message.taskId);
          const timelineEl = document.querySelector('.message-timeline-container');
          if (timelineEl) {
            let bubble = timelineEl.querySelector(`.thought-bubble[data-task-id="${message.taskId}"]`);
            if (!bubble) {
              bubble = document.createElement('div');
              bubble.className = 'thought-bubble creative-bubble typing-bubble';
              bubble.setAttribute('data-task-id', message.taskId);
              timelineEl.appendChild(bubble);
            }
            
            // Get existing step count to set appropriate canvas size class
            const existingSteps = tasksStore.getStepLogs(message.taskId) || [];
            const stepCount = existingSteps.length;
            
            // Set the exact step count for more granular canvas expansion
            bubble.setAttribute('data-step-count', stepCount.toString());
            
            // NEW APPROACH: Instead of fighting with max-height constraints,
            // we'll directly manipulate the container style and add classes
            
            // Remove any existing size classes
            bubble.classList.remove('size-small', 'size-medium', 'size-large', 'size-xlarge');
            
            // Base sizing on step count
            if (stepCount <= 3) {
              bubble.classList.add('size-small');  // Small visualization (few steps)
              bubble.style.height = '400px';
            } else if (stepCount <= 7) {
              bubble.classList.add('size-medium'); // Medium visualization
              bubble.style.height = '600px';
            } else if (stepCount <= 12) {
              bubble.classList.add('size-large');  // Large visualization
              bubble.style.height = '800px';
            } else {
              bubble.classList.add('size-xlarge'); // Extra large visualization (many steps)
              bubble.style.height = '1000px';
            }
            
            // Force bubble to be unconstrained by parent container
            bubble.style.maxHeight = 'none';
            bubble.style.overflow = 'visible';
            
            // Explicitly remove any parent container constraints
            const parent = bubble.parentElement;
            if (parent) {
              // Force parent to adjust to our size
              parent.style.minHeight = bubble.style.height;
              parent.style.height = 'auto';
            }
            
            console.log(`[CANVAS RESIZE] Task ${message.taskId}, Steps: ${stepCount}, Height: ${bubble.style.height}`);

            
            // Also set overflow to ensure content is visible but contained
            bubble.style.overflow = 'hidden';
            
            bubble.innerHTML = `<div class="thought-title"><em>Function:</em> ${message.functionName}</div><pre class="typing-content thought-text"></pre>`;
            const pre = bubble.querySelector('.typing-content'); 
            const text = JSON.stringify(args, null, 2);
            let i = 0; 
            const ti = setInterval(() => { 
              pre.textContent += text.charAt(i++); 
              bubble.scrollTop = bubble.scrollHeight; 
              if (i >= text.length) clearInterval(ti); 
            }, 20);
          }
          return;
        }

        // Handle thought complete events for commands
        if (message.event === 'thoughtComplete') {
          console.log('[Event] thoughtComplete', message);
          const tid = message.taskId || message.task_id;
          if (!tid) {
            console.warn('thoughtComplete message missing taskId:', message);
            return;
          }
          
          // Add thought to task steps in store
          tasksStore.addStepLog(tid, {
            type: 'thought',
            content: message.thought,
            timestamp: new Date().toISOString()
          });
          
          // Find or create thought bubble for this task
          const timeline = document.querySelector('.message-timeline-container');
          if (!timeline) return;
          
          let bubble = timeline.querySelector(`.thought-bubble[data-task-id="${tid}"]`);
          if (!bubble) {
            bubble = document.createElement('div');
            bubble.className = 'thought-bubble creative-bubble';
            bubble.setAttribute('data-task-id', tid);
            bubble.style.animation = 'fadeIn 0.3s';
            bubble.style.minHeight = '300px';
            bubble.style.height = '450px';
            bubble.style.maxHeight = 'none';
            timeline.appendChild(bubble);
            
            // Initialize NeuralFlow visualizer
            console.log(`Creating new NeuralFlow for thought ${tid}`);
            try {
              neuralFlows[tid] = new NeuralFlow(bubble);
            } catch (error) {
              console.error(`Error creating NeuralFlow for thought ${tid}:`, error);
            }
          }
          
          // Add thought content to neural flow
          try {
            if (neuralFlows[tid] && typeof neuralFlows[tid].addNode === 'function') {
              // Break the thought into separate nodes for better visualization
              const lines = message.thought.split('\n\n');
              lines.forEach((line, idx) => {
                if (line.trim()) {
                  // Add brief delay between nodes for animation effect
                  setTimeout(() => {
                    neuralFlows[tid].addNode(line.trim());
                  }, idx * 100);
                }
              });
            } else {
              // Fallback: Display as text if NeuralFlow fails
              bubble.innerHTML = `<div class="thought-title">Planning Thought</div><pre class="thought-text">${message.thought}</pre>`;
            }
          } catch (error) {
            console.error(`Error displaying thought for task ${tid}:`, error);
            bubble.innerHTML = `<div class="thought-title">Planning Thought</div><pre class="thought-text">${message.thought}</pre>`;
          }
          return;
        }
        
        if (message.event === 'planLog') {
          console.debug('[DEBUG] WS planLog:', message.message);
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
          
          tasksStore.addStepLog(tid, {
            type: 'planLog',
            message: message.message,
            stepNumber: stepNumber,
            action: stepAction,
            timestamp: new Date().toISOString()
          });
          
          // Update thought bubble with this log using NeuralFlow visualization
          const timeline = document.querySelector('.message-timeline-container');
          if (timeline) {
            // Safely get or create the bubble for this task
            let bubble = document.querySelector(`.thought-bubble[data-task-id="${tid}"]`);
            if (!bubble) {
              try {
                // Create a new bubble for this task
                bubble = document.createElement('div');
                bubble.className = 'thought-bubble creative-bubble';
                bubble.setAttribute('data-task-id', tid);
                bubble.style.animation = 'fadeIn 0.3s';
                // Set minimum height for visualization area
                bubble.style.minHeight = '180px';
                bubble.style.height = '220px';
                timeline.appendChild(bubble);
                
                // Initialize NeuralFlow visualizer
                console.log(`Creating new NeuralFlow for task ${tid}`);
                neuralFlows[tid] = new NeuralFlow(bubble);
              } catch (error) {
                console.error(`Error creating bubble or NeuralFlow for task ${tid}:`, error);
                return;
              }
            }
            
            // Safely add the node to the neural flow
            try {
              try {
                if (neuralFlows[tid]) {
                  // Check if the neural flow instance is valid
                  if (typeof neuralFlows[tid].addNode === 'function') {
                    neuralFlows[tid].addNode(message.message);
                  } else {
                    // Recreate the neural flow if it's corrupted
                    console.warn(`NeuralFlow for task ${tid} is invalid, recreating...`);
                    neuralFlows[tid] = new NeuralFlow(bubble);
                    neuralFlows[tid].addNode(message.message);
                  }
                } else {
                  console.warn(`NeuralFlow for task ${tid} not found, initializing...`);
                  try {
                    // Safe initialization of NeuralFlow
                    neuralFlows[tid] = new NeuralFlow(bubble);
                    neuralFlows[tid].addNode(message.message);
                  } catch (innerError) {
                    console.error(`Failed to initialize NeuralFlow for ${tid}:`, innerError);
                    // Create a basic fallback display for the message
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'neural-flow-fallback';
                    messageDiv.textContent = message.message;
                    bubble.appendChild(messageDiv);
                  }
                }
              } catch (flowError) {
                console.error(`Error handling NeuralFlow for task ${tid}:`, flowError);
                // Ensure the message is still displayed even if visualization fails
                if (!bubble.querySelector('.neural-flow-fallback')) {
                  const fallbackMsg = document.createElement('div');
                  fallbackMsg.className = 'neural-flow-fallback';
                  fallbackMsg.textContent = message.message;
                  bubble.appendChild(fallbackMsg);
                }
              }
              bubble.classList.remove('loading');
              
              // Auto-scroll to bottom
              timeline.scrollTop = timeline.scrollHeight;
            } catch (error) {
              console.error(`Error updating NeuralFlow for task ${tid}:`, error);
            }
          }
          return;
        }

        // Handle streaming messages
        if (message.type === 'chat_response_stream' || message.type === 'ai_thought_stream') {
          // Extract clean content from streaming message
          const content = message.content?.trim();
          
          // Skip empty or malformed messages
          if (!content) return;

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

          // Handle completion
          thoughtContainer.classList.remove('loading');
            
          // Add completion animation
          thoughtContainer.style.animation = 'pulse 1.5s infinite';
            
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
            console.debug('[DEBUG] functionCallPartial:', data.functionName, data.partialArgs);
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

  const handleTaskStart = (payload) => {
    console.log('eventBus received taskStart:', payload);
    // Add new task to tasksStore using the deduplication-aware addTask method
    if (payload && payload.taskId) {
      // Check for existing task first
      const state = tasksStore.getState();
      const existingTask = state.active.find(task => task._id === payload.taskId);
      
      if (existingTask) {
        console.log(`[CommandCenter] Task ${payload.taskId} already exists, updating status only`);
        // Just update the status of the existing task
        tasksStore.updateTask(payload.taskId, {
          status: 'pending',
          progress: 0
        });
      } else {
        // Use addTask which has deduplication logic
        tasksStore.addTask({
          _id: payload.taskId,
          command: payload.command,
          status: 'pending',
          progress: 0,
          startTime: payload.startTime || new Date(),
          result: null,
          error: null
        });
      }
    } else {
      console.error('[CommandCenter] Invalid taskStart payload: missing taskId', payload);
    }
  };

  const handleTaskComplete = (payload) => {
    console.log('eventBus received taskComplete:', payload);
    // Unwrap SSE or WebSocket payload
    const data = payload.payload || payload;
    const taskId = data.taskId;
    if (!taskId) return;
    
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
    
    const timelineEl = document.querySelector('.message-timeline-container'); 
    if (timelineEl) {
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
      
      // If we have both URLs, add a separator between them
      if (reportLinks.length > 1) {
        reportLinks.push('<span class="report-separator">|</span>');
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
      
      // Create a more modern, chat-like message with success styling - without redundant header
      card.innerHTML = `
        <div class="msg-meta">
          <span class="msg-type task-success"><i class="fas fa-check-circle"></i> Task Completed</span>
          <span class="msg-time">${timeStr}</span>
        </div>
        <div class="msg-content">
          <div class="task-success-container">
            <div class="task-success-summary">${aiSummary}</div>
            ${planText ? `<div class="task-success-plan">${planText}</div>` : ''}
            ${reportsHtml}
          </div>
        </div>
      `;
      
      timelineEl.appendChild(card);
      
      // Add a small delay before adding the system message to let the task completion card appear first
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
      
      // Scroll immediately to show the task completion card
      timelineEl.scrollTop = timelineEl.scrollHeight;
    }
  };
  
  // --- Helper: Render Intermediate Results ---
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
    
    // Display error in UI
    const timelineEl = document.querySelector('.message-timeline-container');
    if (timelineEl) {
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
      timelineEl.appendChild(errorCard);
      timelineEl.scrollTop = timelineEl.scrollHeight;
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

  // Add to existing cleanup logic
  function destroy() {
    eventBus.off('taskStart', handleTaskStart);
    eventBus.off('taskComplete', handleTaskComplete);
    eventBus.off('taskError', handleTaskError);
    
    if (typeof cleanupIntermediateHandler === 'function') {
      cleanupIntermediateHandler();
    }
    
    // Existing cleanup code...
  }

  // Enhanced render function with modern iOS-style UI - integrated with sidebar
  function renderIntermediateResults(taskId) {
    let container = document.getElementById('intermediate-results-container');
    
    // If container doesn't exist or we can't find it, exit
    if (!container) {
      console.warn('Could not find intermediate-results-container, cannot render results');
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
    container.innerHTML = '';
    const results = tasksStore.getIntermediateResults(taskId) || [];
    results.forEach((res, idx) => {
      const el = document.createElement('div');
      el.className = `task-step-log-item ${res.__final ? 'final-result' : ''}`;
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