/**
 * Thought Bubble Manager
 * Handles intercepting and styling thought bubbles for a fixed-position animated effect
 */

const ThoughtBubbleManager = {
  // Track active thought bubbles
  activeBubbles: new Set(),
  // Counter for step numbers
  stepCounter: 0,
  
  /**
   * Initialize the thought bubble manager
   */
  init() {
    // Create the container if it doesn't exist
    this.ensureContainer();
    
    // Set up mutation observer to intercept thought bubbles
    this.setupMutationObserver();
    
    // Subscribe to taskComplete events
    this.setupEventListeners();
    
    console.log('[ThoughtBubbleManager] Initialized');
    return this;
  },
  
  /**
   * Ensure the fixed-position container exists (initially hidden)
   */
  ensureContainer() {
    // Check if container already exists
    let container = document.querySelector('.thought-bubbles-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'thought-bubbles-container';
      container.style.display = 'none'; // Hide by default
      document.body.appendChild(container);
      console.log('[ThoughtBubbleManager] Created thought bubbles container');
    }
    this.container = container;
    return container;
  },
  
  /**
   * Set up event listeners for task events
   */
  setupEventListeners() {
    if (window.eventBus) {
      // Listen for taskComplete events
      window.eventBus.on('taskComplete', (data) => {
        this.clearTaskBubbles(data.taskId || data.task_id);
      });
      
      // Listen for taskError events
      window.eventBus.on('taskError', (data) => {
        this.clearTaskBubbles(data.taskId || data.task_id);
      });
      
      console.log('[ThoughtBubbleManager] Event listeners registered');
    } else {
      console.warn('[ThoughtBubbleManager] EventBus not available, task events won\'t be handled');
    }
  },
  
  /**
   * Set up mutation observer to detect thought bubbles being added to DOM
   */
  setupMutationObserver() {
    // Create a new observer
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check each added node
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if this is a thought bubble or contains one
              const thoughtBubbles = node.classList && node.classList.contains('msg-thought-item') ? 
                [node] : node.querySelectorAll('.msg-thought-item');
                
              if (thoughtBubbles.length > 0) {
                console.log('[ThoughtBubbleManager] Detected thought bubble(s)', thoughtBubbles.length);
                thoughtBubbles.forEach(bubble => this.moveToBubbleContainer(bubble));
              }
            }
          });
        }
      });
    });
    
    // Start observing
    this.observer.observe(document.body, { 
      childList: true, 
      subtree: true 
    });
    
    console.log('[ThoughtBubbleManager] Mutation observer setup complete');
  },
  
  /**
   * Move a thought bubble to the fixed container
   * @param {HTMLElement} bubble - The thought bubble element
   */
  moveToBubbleContainer(bubble) {
    // Ensure container exists
    const container = this.ensureContainer();
    
    // Skip if already moved
    if (bubble.parentElement === container || bubble.dataset.processed === 'true') {
      return;
    }
    
    // Clone the bubble to prevent reference issues
    const clonedBubble = bubble.cloneNode(true);
    clonedBubble.dataset.processed = 'true';
    
    // Get taskId for reference
    const taskId = bubble.getAttribute('data-task-id') || 
                  bubble.getAttribute('data-message-id')?.replace('thought-', '') || 
                  `thought-${Date.now()}`;
    
    // Add animation classes
    clonedBubble.classList.add('new-bubble');
    
    // Add to container - newest at the top
    if (container.firstChild) {
      container.insertBefore(clonedBubble, container.firstChild);
    } else {
      container.appendChild(clonedBubble);
    }
    
    // Limit to maximum 5 bubbles
    if (container.childElementCount > 5) {
      if (container.lastChild) {
        container.lastChild.classList.add('fade-out');
        setTimeout(() => {
          if (container.lastChild && container.childElementCount > 5) {
            container.removeChild(container.lastChild);
          }
        }, 500);
      }
    }
    
    console.log(`[ThoughtBubbleManager] Moved thought bubble for task ${taskId} to fixed container`);
    
    // Hide the original bubble if it still exists in DOM
    if (bubble.parentElement) {
      bubble.style.display = 'none';
    }
    
    return clonedBubble;
  },
  
  /**
   * Create a new thought bubble directly in the fixed container
   * @param {string} taskId - The task ID
   * @param {string} content - The thought content
   * @returns {HTMLElement} The created bubble element
   */
  createThoughtBubble(taskId, content) {
    const container = this.ensureContainer();
    
    // Create bubble
    const bubble = document.createElement('div');
    bubble.className = 'msg-thought-item typing-bubble';
    bubble.setAttribute('data-task-id', taskId);
    bubble.setAttribute('data-message-id', `thought-${taskId}`);
    
    // Create content
    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.textContent = content || 'Thinking...';
    
    bubble.appendChild(contentDiv);
    
    // Add animation classes
    bubble.classList.add('new-bubble');
    
    // Add to container - newest at the top
    if (container.firstChild) {
      container.insertBefore(bubble, container.firstChild);
    } else {
      container.appendChild(bubble);
    }
    
    return bubble;
  },
  
  /**
   * Update or create a thought bubble for a specific task
   * @param {string} taskId - Task ID
   * @param {string} content - Thought content
   */
  updateThoughtBubble(taskId, content) {
    if (!this.container) this.ensureContainer();
    
    // Show the container if it's hidden
    if (this.container.style.display === 'none') {
      this.container.style.display = 'flex';
    }
    
    // Track this bubble as active
    this.activeBubbles.add(taskId);
    
    // Check if a thought bubble already exists for this task
    let bubble = this.container.querySelector(`.msg-thought-item[data-task-id="${taskId}"]`);
    
    if (!bubble) {
      // Create new thought bubble
      bubble = document.createElement('div');
      bubble.className = 'msg-thought-item';
      bubble.dataset.taskId = taskId;
      bubble.dataset.stepNumber = this.getNextStepNumber();
      
      // Create typing indicator content
      bubble.innerHTML = `
        <span class="step-badge">${bubble.dataset.stepNumber}</span>
        <p class="thought-content">${content}</p>
        <span class="typing-dots"></span>
      `;
      
      // Add the bubble to the container
      this.container.appendChild(bubble);
      
      // Trigger animation
      setTimeout(() => bubble.classList.add('slide-in'), 10);
      
      // Limit the number of visible bubbles
      this.limitVisibleBubbles();
    } else {
      // Update existing bubble content
      const contentEl = bubble.querySelector('.thought-content');
      if (contentEl) {
        contentEl.textContent = content;
      }
    }
  },
  
  /**
   * Get the next step number for thought bubbles
   * @returns {number} The incremented step number
   */
  getNextStepNumber() {
    // Increment and return the step counter
    return ++this.stepCounter;
  },
  
  /**
   * Mark a thought bubble as complete
   * @param {string} taskId - The task ID
   */
  completeThoughtBubble(taskId) {
    if (!this.container) this.ensureContainer();
    
    // Find existing bubble for this task
    const bubble = this.container.querySelector(`.msg-thought-item[data-task-id="${taskId}"]`);
    if (!bubble) return;
    
    // Mark as complete
    bubble.classList.remove('typing-bubble', 'typing', 'thinking');
    bubble.classList.add('complete');
    
    // Remove typing dots
    const typingDots = bubble.querySelector('.typing-dots');
    if (typingDots) {
      typingDots.remove();
    }
    
    // Add completion indicator
    const checkmark = document.createElement('span');
    checkmark.className = 'completion-mark';
    checkmark.innerHTML = '✓';
    bubble.appendChild(checkmark);
    
    // Remove from active bubbles set
    this.activeBubbles.delete(taskId);
    
    // Fade out after a delay
    setTimeout(() => {
      bubble.classList.add('fade-out');
      setTimeout(() => {
        bubble.remove();
        // Check if there are any remaining active bubbles
        if (this.activeBubbles.size === 0) {
          // Hide the container if no active bubbles
          this.container.style.display = 'none';
        }
      }, 500);
    }, 2000);
  },
  
  /**
   * Clear all thought bubbles for a specific task
   * @param {string} taskId - The task ID
   */
  clearTaskBubbles(taskId) {
    if (!this.container) return;
    if (!taskId) return;
    
    // Find all thought bubbles for this task
    const bubbles = this.container.querySelectorAll(`.msg-thought-item[data-task-id="${taskId}"]`);
    
    if (bubbles.length === 0) return;
    
    console.log(`[ThoughtBubbleManager] Clearing ${bubbles.length} bubbles for task ${taskId}`);
    
    // Remove task from active bubbles
    this.activeBubbles.delete(taskId);
    
    // Remove each bubble with animation
    bubbles.forEach((bubble) => {
      bubble.classList.add('fade-out');
      setTimeout(() => bubble.remove(), 300);
    });
    
    // If no active bubbles remain, hide the container
    if (this.activeBubbles.size === 0) {
      setTimeout(() => {
        this.container.style.display = 'none';
      }, 350);
    }
  },
};

export default ThoughtBubbleManager;
