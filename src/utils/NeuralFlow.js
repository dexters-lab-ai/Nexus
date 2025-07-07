import { eventBus } from './events.js';

// Make eventBus available globally if it's not already
if (typeof window !== 'undefined' && !window.eventBus) {
  window.eventBus = eventBus;
}

/**
 * NeuralFlow.js - Lightweight, beautiful canvas-based neural flow visualization
 * A modern, lightweight alternative to 3D visualization for thought logs
 */

export default class NeuralFlow {
  constructor(container) {
    try {
      // Ensure container exists and is properly set up
      if (!container) {
        console.error('[NeuralFlow] Container element is required');
        return;
      }
      
      console.log('[NeuralFlow] Initializing with container:', container);
      
      // Clear any existing content in the container
      container.innerHTML = '';
      
      this.container = container;
      this.nodes = [];
      this.branches = []; // Store branch connections between main and sub-steps
      this.animationFrameId = null;
      this.hoveredNodeIdx = -1;
      this.lastFrameTime = 0;
      this.particleTime = 0;
      this.planNodeCreated = false; // Flag to identify if we have a plan node already
      this.autoScrollEnabled = true; // Enable auto-scrolling by default
      this.cameraY = 0; // Track camera vertical position
      this.targetCameraY = 0; // Target camera position for smooth panning
      this.cameraSpeed = 0.1; // Camera movement speed
      this.isDragging = false;
      this.lastMouseY = 0;
      this.topPadding = 40; // 40px padding from top for first node
      this.isDisposed = false; // Flag to track if disposed
      this.resizeObserver = null; // For tracking container size changes
      this.resizeThrottle = null; // For throttling resize events
      
      // Bind methods
      this.handleTaskComplete = this.handleTaskComplete.bind(this);
      this.handleMouseMove = this.handleMouseMove.bind(this);
      this.handleClick = this.handleClick.bind(this);
      this.animate = this.animate.bind(this);
      this.handleResize = this.handleResize.bind(this);
      this.handleMouseEnter = this.handleMouseEnter.bind(this);
      this.handleMouseLeave = this.handleMouseLeave.bind(this);
      this.handleTouchStart = this.handleTouchStart.bind(this);
      this.handleTouchMove = this.handleTouchMove.bind(this);
      this.handleTouchEnd = this.handleTouchEnd.bind(this);
      
      // Create high-res canvas for crisp rendering
      this.initCanvas();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Listen for task completion events
      if (window.eventBus) {
        window.eventBus.on('taskComplete', this.handleTaskComplete);
      }
      
      // Start animation loop
      this.animationFrameId = requestAnimationFrame(this.animate);
      
      console.log('[NeuralFlow] Initialization complete');
    } catch (error) {
      console.error('[NeuralFlow] Error during initialization:', error);
    }
  }
  
  /**
   * Handle task completion events
   * Scrolls to the latest node when a task completes
   */
  handleTaskComplete() {
    if (this.isDisposed || !this.autoScrollEnabled) return;
    
    // Use immediate scroll to jump to the latest node
    this.scrollToLatest(true);
    
    // Force a redraw to ensure the scroll is applied
    this.needsResize = true;
    this.lastFrameTime = 0;
  }

  /**
   * Set up all event listeners for the canvas
   */
  setupEventListeners() {
    if (!this.canvas) {
      console.error('[NeuralFlow] Cannot set up event listeners: canvas not initialized');
      return;
    }
    
    console.log('[NeuralFlow] Setting up event listeners');
    
    // Remove any existing listeners first to prevent duplicates
    this.removeEventListeners();
    
    // Add new listeners with passive: false to ensure preventDefault() works
    const options = { passive: false };
    
    // Mouse events
    this.canvas.addEventListener('mousemove', this.handleMouseMove, options);
    this.canvas.addEventListener('mouseenter', this.handleMouseEnter, options);
    this.canvas.addEventListener('mouseleave', this.handleMouseLeave, options);
    this.canvas.addEventListener('click', this.handleClick, options);
    
    // Touch events for mobile
    this.canvas.addEventListener('touchstart', this.handleTouchStart, options);
    this.canvas.addEventListener('touchmove', this.handleTouchMove, options);
    this.canvas.addEventListener('touchend', this.handleTouchEnd, options);
    
    // Prevent context menu on canvas
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      return false;
    }, { passive: false });
    
    console.log('[NeuralFlow] Event listeners set up');
  }
  
  /**
   * Hides all tooltips in the container
   */
  hideAllTooltips() {
    // Remove the main tooltip
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
      this.tooltip = null;
    }
    
    // Remove any other tooltips that might be in the container
    const tooltips = this.container.querySelectorAll('.tooltip, .neural-flow-tooltip');
    tooltips.forEach(tooltip => {
      if (tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
    });
  }

  /**
   * Remove all event listeners
   */
  removeEventListeners() {
    if (!this.canvas) return;
    
    const options = { passive: false };
    
    // Remove mouse event listeners
    this.canvas.removeEventListener('mousemove', this.handleMouseMove, options);
    this.canvas.removeEventListener('mouseenter', this.handleMouseEnter, options);
    this.canvas.removeEventListener('mouseleave', this.handleMouseLeave, options);
    this.canvas.removeEventListener('click', this.handleClick, options);
    
    // Remove touch event listeners
    this.canvas.removeEventListener('touchstart', this.handleTouchStart, options);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove, options);
    this.canvas.removeEventListener('touchend', this.handleTouchEnd, options);
  }
  
  handleMouseEnter(e) {
    console.log('[NeuralFlow] Mouse entered canvas');
    this.canvas.style.cursor = 'default';
  }
  
  handleMouseLeave(e) {
    console.log('[NeuralFlow] Mouse left canvas');
    this.hoveredNodeIdx = -1;
    this.canvas.style.cursor = 'default';
  }
  
  handleTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.canvas.dispatchEvent(mouseEvent);
    }
  }
  
  handleTouchMove(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.canvas.dispatchEvent(mouseEvent);
    }
  }
  
  handleTouchEnd(e) {
    if (e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      const mouseEvent = new MouseEvent('click', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      this.canvas.dispatchEvent(mouseEvent);
    }
  }
  
  dispose() {
    console.log('[NeuralFlow] Disposing instance');
    
    // Hide all tooltips first
    this.hideAllTooltips();
    
    // Cancel any pending animation frames
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Clear any pending resize throttles
    if (this.resizeThrottle) {
      clearTimeout(this.resizeThrottle);
      this.resizeThrottle = null;
    }
    
    // Disconnect resize observer if it exists
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    // Remove window resize listener
    window.removeEventListener('resize', this.handleResize);
    
    // Remove all event listeners
    this.removeEventListeners();
    
    // Remove task complete listener
    if (window.eventBus) {
      window.eventBus.off('taskComplete', this.handleTaskComplete);
    }
    
    // Clean up DOM elements
    if (this.controls && this.controls.parentNode) {
      this.controls.parentNode.removeChild(this.controls);
      this.controls = null;
    }
    
    // Remove global click handler
    if (this._globalClickHandler) {
      document.removeEventListener('click', this._globalClickHandler);
      this._globalClickHandler = null;
    }
    
    // Remove any injected styles
    const styleElement = document.getElementById('neural-flow-control-style');
    if (styleElement && styleElement.parentNode) {
      styleElement.parentNode.removeChild(styleElement);
    }
    
    // Clear canvas
    if (this.ctx) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Mark as disposed
    this.isDisposed = true;
  }
  
  initCanvas() {
    try {
      console.log('[NeuralFlow] Initializing canvas');
      
      // Set initial container styles
      this.container.style.position = 'relative';
      this.container.style.overflow = 'auto';
      this.container.style.width = '100%';
      this.container.style.maxWidth = '100%';
      this.container.style.height = '100%';
      this.container.style.maxHeight = '100%';
      this.container.style.boxSizing = 'border-box';
      
      // Ensure proper padding and margins
      this.container.style.padding = '0';
      this.container.style.margin = '0';
      
      // Set minimum height if not specified
      if (!this.container.style.height && !this.container.style.minHeight) {
        this.container.style.minHeight = '300px';
      }
      
      // Make sure container is visible and can receive events
      this.container.style.pointerEvents = 'auto';
      this.container.style.userSelect = 'none'; // Prevent text selection during drag
      
      // Force dark background with rich gradient regardless of theme
      this.container.style.setProperty('background-color', '#0a0f20', 'important');
      this.container.style.setProperty('background-image', 'linear-gradient(to bottom, #0a0f20 0%, #111b30 40%, #162042 100%)', 'important');
      this.container.style.setProperty('color', '#ffffff', 'important');
      
      // Add explicit class for additional CSS targeting
      this.container.classList.add('neural-flow-container');
      
      // Create canvas if it doesn't exist
      if (!this.canvas) {
        // Create high-DPI canvas for sharp rendering
        this.canvas = document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.maxHeight = '100%';
        this.canvas.style.maxWidth = '100%';
        this.canvas.style.pointerEvents = 'auto'; // Ensure canvas receives events
        
        // Add canvas to container
        this.container.appendChild(this.canvas);
      }
      
      // Set up resize observer if not already done
      if (!this.resizeObserver && 'ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(entries => {
          if (!this.resizeThrottle) {
            this.resizeThrottle = setTimeout(() => {
              this.resizeThrottle = null;
              this.resize();
            }, 100); // Throttle resize events
          }
        });
        
        // Start observing the container for size changes
        this.resizeObserver.observe(this.container);
      }
      
      // Create controls container if it doesn't exist
      if (!this.controls) {
        this.controls = document.createElement('div');
        this.controls.className = 'neural-flow-controls';
        this.controls.innerHTML = `
          <button class="control-btn" id="neural-flow-up" title="Scroll Up">
            <i class="fas fa-arrow-up"></i>
          </button>
          <button class="control-btn" id="neural-flow-down" title="Scroll Down">
            <i class="fas fa-arrow-down"></i>
          </button>
          <button class="control-btn" id="neural-flow-follow" title="Auto-follow New Content" data-active="true">
            <i class="fas fa-map-marked-alt"></i>
          </button>
        `;
        
        // Style controls with unique ID for cleanup
        const style = document.createElement('style');
        style.id = 'neural-flow-control-style';
        style.textContent = `
          .neural-flow-controls {
            position: absolute;
            right: 20px;
            bottom: 20px;
            z-index: 1000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            background: rgba(20, 25, 40, 0.9);
            padding: 10px 8px;
            border-radius: 12px;
            border: 1px solid rgba(100, 120, 255, 0.2);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(5px);
          }
          .control-btn {
            background: rgba(30, 35, 60, 0.7);
            border: 1px solid rgba(100, 120, 255, 0.2);
            color: #a0a0c0;
            border-radius: 8px;
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 14px;
          }
          .control-btn:hover {
            background: rgba(100, 120, 255, 0.4);
            color: #fff;
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
          }
          .control-btn:active {
            transform: translateY(0);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }
          .control-btn[data-active="true"] {
            background: var(--primary, #4a6cf7);
            color: white;
            border-color: var(--primary, #4a6cf7);
            box-shadow: 0 0 0 2px rgba(74, 108, 247, 0.3);
          }
          #neural-flow-follow i::before {
            content: '\\f5a0'; /* Map marked with location icon */
          }
        `;
        document.head.appendChild(style);
        
        // Add controls to NeuralFlow container with proper z-index
        this.controls.style.zIndex = '1000'; // Ensure controls are above canvas
        this.container.appendChild(this.controls);
        this.container.style.position = 'relative'; // Ensure container is positioned for absolute children
        
        // Add global click handler to hide tooltips when clicking outside
        if (!this._globalClickHandler) {
          this._globalClickHandler = (e) => {
            // If click is outside the container, hide tooltips
            if (!this.container.contains(e.target)) {
              this.hideAllTooltips();
            }
          };
          document.addEventListener('click', this._globalClickHandler);
        }
      }
      
      // Set initial size
      this.resize();
      
      // Setup control buttons
      this.setupControls();
      
      console.log('[NeuralFlow] Canvas initialization complete');
    } catch (error) {
      console.error('[NeuralFlow] Error initializing canvas:', error);
    }
  }
  
  /**
   * Handle window resize events with throttling
   */
  handleResize() {
    if (this.resizeThrottle) {
      clearTimeout(this.resizeThrottle);
    }
    
    this.resizeThrottle = setTimeout(() => {
      this.resizeThrottle = null;
      this.resize();
    }, 100); // Throttle to once every 100ms
  }
  
  /**
   * Resize the canvas while preserving content and event listeners
   */
  resize() {
    if (!this.container || !this.canvas) {
      console.warn('[NeuralFlow] Cannot resize: container or canvas not available');
      return;
    }
    
    console.log('[NeuralFlow] Resizing canvas');
    
    // Store the current scroll position
    const wasScrolledToBottom = this.isAtBottom();
    
    // Get the computed style to account for any padding/border
    const style = window.getComputedStyle(this.container);
    const width = this.container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const height = this.container.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    
    // Only proceed if we have valid dimensions
    if (width <= 0 || height <= 0) {
      console.warn('[NeuralFlow] Invalid container dimensions during resize');
      return;
    }
    
    // Store the current canvas content if it exists
    let imageData = null;
    if (this.ctx && this.canvas.width > 0 && this.canvas.height > 0) {
      try {
        imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      } catch (e) {
        console.warn('[NeuralFlow] Could not preserve canvas content during resize:', e);
      }
    }
    
    // Set the display size (CSS pixels)
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    
    // Set the actual size in memory (scaled for device resolution)
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * dpr);
    this.canvas.height = Math.floor(height * dpr);
    
    // Scale the context to ensure correct drawing operations
    this.ctx.scale(dpr, dpr);
    
    // Store dimensions for later use
    this.width = width;
    this.height = height;
    
    // Restore the content if we had any
    if (imageData) {
      try {
        // Create a temporary canvas to hold the image data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageData.width;
        tempCanvas.height = imageData.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);
        
        // Draw the temp canvas onto our resized canvas
        this.ctx.save();
        this.ctx.scale(1/dpr, 1/dpr); // Temporarily remove the DPR scale
        this.ctx.drawImage(tempCanvas, 0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
      } catch (e) {
        console.warn('[NeuralFlow] Could not restore canvas content after resize:', e);
      }
    }
    
    // Update node positions based on new dimensions
    if (this.nodes.length > 0) {
      this.updateNodePositions();
    }
    
    // Restore scroll position if needed
    if (wasScrolledToBottom) {
      this.scrollToLatest(true);
    }
    
    console.log(`[NeuralFlow] Canvas resized to ${width}x${height} (${dpr}x DPI)`);
  }
  
  updateNodePositions() {
    if (!this.nodes.length) return;
    
    // Find main (non-sub) nodes
    const mainNodes = this.nodes.filter(node => !node.isSubStep);
    
    // Calculate layout dimensions
    const mainNodesPerRow = Math.max(3, Math.min(5, Math.floor(this.width / 250))); // More space between nodes
    const verticalSpacing = 100; // Increased vertical spacing
    const subNodeOffset = { x: 40, y: 36 }; // Offset for sub-steps
    
    // Calculate starting Y position (lower on the canvas)
    const startY = 150;
    
    // Position main nodes first
    mainNodes.forEach((node, mainIdx) => {
      const idx = this.nodes.indexOf(node);
      const row = Math.floor(mainIdx / mainNodesPerRow);
      const col = mainIdx % mainNodesPerRow;

      // For alternating rows, reverse direction for organic brain feel
      const x = row % 2 === 0 
        ? 100 + col * ((this.width - 200) / (mainNodesPerRow - 1 || 1))
        : this.width - 100 - col * ((this.width - 200) / (mainNodesPerRow - 1 || 1));
      
      // Position all nodes with 80px padding from top
      const y = (row === 0) ? 80 : (80 + row * verticalSpacing);
      
      // Set target position with slight random variation (less for plan node)
      const randomJitter = node.isPlanNode ? 5 : 15;
      node.tx = x + (Math.random() - 0.5) * randomJitter;
      node.ty = y + (Math.random() - 0.5) * randomJitter;
      
      if (!node.x) {
        // Initial position for animation
        node.x = node.isPlanNode ? node.tx : node.tx;
        node.y = node.isPlanNode ? node.ty - 80 : -50; // Plan node comes from top
      }
      
      // Now position any sub-steps related to this main node
      const subSteps = this.nodes.filter(n => n.parentStepId === idx);
      
      subSteps.forEach((subNode, subIdx) => {
        // Position in a semi-circle around the parent
        const angle = -Math.PI/2 + (Math.PI * (subIdx / Math.max(subSteps.length, 1)));
        const distance = node.radius * 5.5;
        
        subNode.tx = node.tx + Math.cos(angle) * distance;
        subNode.ty = node.ty + Math.sin(angle) * distance + 10;
        
        // Add slight random variation
        subNode.tx += (Math.random() - 0.5) * 10;
        subNode.ty += (Math.random() - 0.5) * 10;
        
        if (!subNode.x) {
          subNode.x = node.tx; // Start from parent
          subNode.y = node.ty;
        }
      });
    });
    
    // Special positioning for plan node if it exists
    const planNode = this.nodes.find(node => node.isPlanNode);
    if (planNode) {
      // Always position plan node prominently with top padding
      planNode.tx = 90;
      planNode.ty = this.topPadding + 40; // Position below top padding
      if (!planNode.x) {
        planNode.x = planNode.tx;
        planNode.y = -50; // Start from above
      }
    }
  }
  
  addNode(text) {
    // Determine node type based on text content
    const isPlanNode = !this.planNodeCreated && 
                        (text.toLowerCase().includes('plan created') || 
                         text.toLowerCase().includes('planning') || 
                         text.toLowerCase().includes('creating plan'));
    const isStepNode = text.match(/step\s+\d+/i) || 
                        text.match(/executing step/i) || 
                        text.toLowerCase().includes('executing');
    
    // Extract step number if this is a main step
    let stepNumber = null;
    const stepMatch = text.match(/step\s+(\d+)/i);
    if (stepMatch) {
      stepNumber = parseInt(stepMatch[1]);
    }
    
    // Look for completion pattern to determine if this is a completion node
    const isCompletionNode = text.toLowerCase().includes('complete') || 
                             text.toLowerCase().includes('finished') || 
                             text.toLowerCase().includes('completed');
    
    // Determine parent step
    let parentStepId = -1;
    
    // If this is a step node, try to find its parent step
    if (isStepNode && stepNumber > 1) {
      // Look for the previous main step
      for (let i = this.nodes.length - 1; i >= 0; i--) {
        const existingNode = this.nodes[i];
        if (!existingNode.isSubStep && existingNode.stepNumber === stepNumber - 1) {
          parentStepId = i;
          break;
        }
      }
      
      // If we didn't find a parent by step number, connect to the last main node
      if (parentStepId === -1 && this.nodes.length > 0) {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
          if (!this.nodes[i].isSubStep) {
            parentStepId = i;
            break;
          }
        }
      }
    }
    
    // Mark the special node types
    if (isPlanNode) this.planNodeCreated = true;
    
    // Calculate initial position with top padding
    const initialY = this.nodes.length > 0 ? 
      Math.max(...this.nodes.map(n => n.y + 100)) : this.topPadding;
    
    // Create the node with appropriate properties
    const node = {
      text,
      isPlanNode,
      isStepNode,
      stepNumber,
      isCompletionNode,
      isFinal: false, // Will be updated after node is added
      parentStepId,
      isSubStep: parentStepId >= 0,
      x: this.width / 2, 
      y: initialY,
      tx: 0, // target x (will be set in updateNodePositions)
      ty: 0, // target y (will be set in updateNodePositions)
      radius: isPlanNode ? 10 : 8,
      dendrites: [],
      dendriteCount: isPlanNode ? 9 : (Math.floor(Math.random() * 4) + 4),
      alpha: 0, // for fade-in
      hovered: false,
      pulsePhase: Math.random() * Math.PI * 2,
      energyParticles: [],
      timeCreated: Date.now(),
      addedAt: Date.now()
    };
    
    // Generate brain cell-like dendrites
    for (let i = 0; i < node.dendriteCount; i++) {
      const angle = (i / node.dendriteCount) * Math.PI * 2;
      const length = node.radius * (1.2 + Math.random() * 1.0);
      const curve = 0.3 + Math.random() * 0.5;
      
      node.dendrites.push({
        angle,
        length, 
        curve,
        pulseOffset: Math.random() * Math.PI * 2
      });
    }
    
    const nodeIdx = this.nodes.length;
    this.nodes.push(node);
    
    // Create branch connection if this is a sub-step
    if (parentStepId >= 0) {
      this.branches.push({
        fromIdx: parentStepId,
        toIdx: nodeIdx,
        type: 'sub-step'
      });
    } 
    // Otherwise, connect to previous node if not a plan node
    else if (nodeIdx > 0 && !isPlanNode) {
      // Find the most recent non-sub-step to connect to, or connect to plan node
      let connectToIdx = nodeIdx - 1;
      while (connectToIdx > 0 && this.nodes[connectToIdx].isSubStep) {
        connectToIdx--;
      }
      
      this.branches.push({
        fromIdx: connectToIdx,
        toIdx: nodeIdx,
        type: 'main-flow'
      });
    }
    
    // Update the "isFinal" flag to be true only for the last node
    this.nodes.forEach((n, i) => {
      n.isFinal = (i === this.nodes.length - 1);
    });
    
    this.updateNodePositions();
    
    // Only auto-scroll for specific node types:
    // - First node
    // - Completion nodes
    // - Nodes that indicate the start of a new execution step
    const isExecutionStep = text.toLowerCase().includes('executing step');
    const shouldScroll = nodeIdx === 0 || isCompletionNode || isExecutionStep;
    
    if (shouldScroll) {
      const isFirstNode = nodeIdx === 0;
      
      // Use a small delay to ensure the node is fully rendered
      requestAnimationFrame(() => {
        // Update node positions and ensure canvas size is correct
        this.updateNodePositions();
        this.ensureCanvasSize();
        
        // Then scroll to the latest node after a delay to ensure nodes are rendered
        setTimeout(() => {
          this.scrollToLatest(true, true);
        }, 2000);
      });
    }
    
    // Track node count and timing for debugging purposes
    const currentTime = Date.now();
    node.addedAt = currentTime;
    
    // Log the node addition for debugging
    if (console && console.debug) {
      console.debug(`[NeuralFlow] Added node #${nodeIdx + 1}:`, {
        text: text.length > 30 ? text.substring(0, 30) + '...' : text,
        isPlanNode,
        isStepNode,
        isCompletionNode,
        isSubStep: node.isSubStep,
        parentStepId: node.parentStepId
      });
    }
    
    // Handle completion nodes with immediate scroll
    if (isCompletionNode) {
      if (console && console.debug) {
        console.debug('[NeuralFlow] Completion node detected, scrolling immediately');
      }
      
      if (this.autoScrollEnabled) {
        requestAnimationFrame(() => {
          this.scrollToLatest(true, true); // Force immediate scroll
        });
      }
    }
    
    // Clear the pending scroll flag if it exists
    if (this.pendingScroll !== undefined) {
      this.pendingScroll = false;
    }
    
    // Only handle auto-scroll for completion nodes after initial render
    if (isCompletionNode) {
      setTimeout(() => {
        if (node === this.nodes[this.nodes.length - 1]) {
          this.scrollToLatest(true, true);
        }
      }, 150);
    }
    
    return node;
  }
  
  setupControls() {
    // Ensure controls exist
    if (!this.controls) return;
    
    const upBtn = this.controls.querySelector('#neural-flow-up');
    const downBtn = this.controls.querySelector('#neural-flow-down');
    const followBtn = this.controls.querySelector('#neural-flow-follow');
    
    if (!upBtn || !downBtn || !followBtn) return;
    
    // Camera movement speed (pixels per click)
    const moveStep = 150; // Increased from 100 to 150px
    
    // Initialize follow button state
    followBtn.setAttribute('data-active', this.autoScrollEnabled.toString());
    
    // Move camera up/down (positive dy moves content down, negative moves up)
    upBtn.onclick = () => this.moveCamera(-moveStep);
    downBtn.onclick = () => this.moveCamera(moveStep);
    
    // Toggle auto-follow
    followBtn.onclick = () => {
      this.autoScrollEnabled = !this.autoScrollEnabled;
      followBtn.setAttribute('data-active', this.autoScrollEnabled.toString());
      
      if (this.autoScrollEnabled) {
        this.scrollToLatest();
      }
    };
    
    // Add mouse wheel for camera movement (invert deltaY to match natural scrolling)
    this.container.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.moveCamera(e.deltaY * 0.5); // Removed the negative sign to match natural scrolling
    });
    
    // Add mouse drag for camera movement
    this.container.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouseY = e.clientY;
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dy = e.clientY - this.lastMouseY;
        this.moveCamera(dy);
        this.lastMouseY = e.clientY;
      }
    });
    
    document.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
    
    // Keyboard controls
    const handleKeyDown = (e) => {
      if (e.ctrlKey) {
        switch (e.key) {
          case 'ArrowUp':
            this.scrollBy(-scrollStep);
            e.preventDefault();
            break;
          case 'ArrowDown':
            this.scrollBy(scrollStep);
            e.preventDefault();
            break;
          case 'Home':
            this.scrollToTop();
            e.preventDefault();
            break;
          case 'End':
            this.scrollToLatest();
            e.preventDefault();
            break;
          case 'f':
            this.autoScrollEnabled = !this.autoScrollEnabled;
            followBtn.setAttribute('data-active', this.autoScrollEnabled.toString());
            if (this.autoScrollEnabled) this.scrollToLatest();
            e.preventDefault();
            break;
        }
      }
    };
    
    // Store reference to the handler for proper cleanup
    this._keyDownHandler = handleKeyDown;
    document.addEventListener('keydown', this._keyDownHandler);
  }
  
  // Check if we're scrolled to the bottom (or very close)
  /**
   * Enhanced precision method to detect if the viewport is scrolled to the bottom.
   * This implementation uses the same logic as scrollToLatest for consistency
   * and provides better detection with adaptive thresholds.
   * 
   * @param {number} threshold - Pixel threshold to consider "at bottom" (default: 20)
   * @returns {boolean} True if scrolled to bottom within threshold
   */
  isAtBottom(threshold = 20) {
    // Handle empty node list case
    if (this.nodes.length === 0) return true;
    
    // Get the latest node and viewport dimensions
    const latestNode = this.nodes[this.nodes.length - 1];
    const viewportHeight = this.container.clientHeight;
    
    // Use consistent calculation with scrollToLatest method
    const nodeRadius = latestNode.radius || 20;
    const nodeBottom = latestNode.y + nodeRadius + 3;
    
    // Calculate adaptive margin based on viewport (same as in scrollToLatest)
    const adaptiveBottomMargin = Math.max(10, Math.min(30, viewportHeight * 0.05));
    
    // Calculate ideal position using same formula as scrollToLatest
    const idealPosition = Math.max(
      0,
      nodeBottom - viewportHeight + adaptiveBottomMargin
    );
    
    // The current bottom edge of the visible area
    const visibleBottom = this.cameraY + viewportHeight;
    
    // Two ways to determine "at bottom":
    // 1. Camera Y is close to ideal position (within threshold)
    const isCameraAtIdealPosition = Math.abs(this.cameraY - idealPosition) <= threshold;
    
    // 2. The bottom node is fully visible with its required margin
    const isBottomNodeVisible = nodeBottom <= (visibleBottom - adaptiveBottomMargin + threshold);
    
    // Consider at bottom if either condition is true
    return isCameraAtIdealPosition || isBottomNodeVisible;
  }

  /**
   * Auto-scroll implementation for the NeuralFlow canvas
   * - Uses dynamic container height for flexible behavior
   * - Implements smooth scrolling with precise positioning
   * - Handles both immediate and smooth scrolling
   * 
   * @param {boolean} immediate - If true, jump instantly; if false, smooth scroll
   */
  /**
   * Scrolls to the latest node with debouncing and smooth scrolling
   * @param {boolean} immediate - If true, jumps instantly without animation
   * @param {boolean} force - If true, bypasses debounce and forces a scroll
   */
  scrollToLatest(immediate = false, force = false) {
    // Skip if disposed, no nodes, or already scrolling (unless forced)
    if (this.isDisposed || this.nodes.length === 0 || (this._isScrolling && !force)) {
      return;
    }
    
    // Mark that we're handling a scroll
    this._isScrolling = true;
    
    // Clear any pending scroll timeouts
    if (this._scrollTimeout) {
      clearTimeout(this._scrollTimeout);
      this._scrollTimeout = null;
    }
    
    const latestNode = this.nodes[this.nodes.length - 1];
    const containerHeight = this.container.clientHeight || 300;
    const nodeRadius = latestNode.radius || 20;
    const nodeHeight = nodeRadius * 2;
    
    // Calculate target position to show the latest node at 90% of viewport height
    const targetY = Math.max(0, latestNode.y - (containerHeight * 0.9) + (nodeHeight / 2));
    
    // Skip if we're already at or very close to the target position
    if (!force && Math.abs(this.cameraY - targetY) < 5) {
      this._isScrolling = false;
      return;
    }
    
    if (immediate) {
      // For immediate jumps, set both current and target positions
      this.cameraY = targetY;
      this.targetCameraY = targetY;
      this._needsImmediateJump = true;
      
      // Force immediate update
      this.needsResize = true;
      this.lastFrameTime = 0;
      
      // Reset scroll state after a short delay
      this._scrollTimeout = setTimeout(() => {
        this._isScrolling = false;
        this._scrollTimeout = null;
      }, 100);
      
      if (console && console.debug) {
        console.debug('[NeuralFlow] Immediate scroll to:', {
          nodeY: latestNode.y,
          targetY,
          containerHeight,
          nodeHeight
        });
      }
      return;
    }
    
    // For smooth scrolling, update the target position
    this.targetCameraY = targetY;
    this.autoScrollEnabled = true;
    
    // Update UI button state if controls exist
    const followBtn = this.controls?.querySelector('#neural-flow-follow');
    if (followBtn) {
      followBtn.setAttribute('data-active', 'true');
    }
    
    // Reset scroll state after animation completes
    this._scrollTimeout = setTimeout(() => {
      this._isScrolling = false;
      this._scrollTimeout = null;
    }, 500); // Slightly longer timeout for smooth scrolls
    
    if (console && console.debug) {
      console.debug('[NeuralFlow] Smooth scrolling to:', {
        nodeY: latestNode.y,
        targetY,
        containerHeight,
        nodeHeight
      });
    }
  }
  
moveCamera(dy) {
  this.autoScrollEnabled = false;
  const followBtn = this.controls?.querySelector('#neural-flow-follow');
  if (followBtn) {
    followBtn.setAttribute('data-active', 'false');
  }
  
  // Calculate the actual movement amount based on container dimensions
  const moveAmount = dy * (this.container.clientHeight / 800); // Normalize based on viewport height
  
  // Update camera position
  this.cameraY += moveAmount;
  this.targetCameraY = this.cameraY;
  
  // Clamp camera position to valid range based on content and viewport
  const maxY = Math.max(0, this.getContentHeight() - this.height);
  this.cameraY = Math.max(0, Math.min(this.cameraY, maxY));
  this.targetCameraY = this.cameraY;
  }
  
  // Calculate the total height of all nodes plus padding
  getContentHeight() {
    if (this.nodes.length === 0) return this.container.clientHeight;
    
    // Find the bottom of the lowest node
    let maxY = 0;
    this.nodes.forEach(node => {
      maxY = Math.max(maxY, node.y + node.radius * 2);
    });
    
    // Add some padding at the bottom
    return maxY + 40;
  }
  
  scrollToTop() {
    this.autoScrollEnabled = false;
    this.targetCameraY = 0;
    this.cameraY = 0; // Immediately set camera position
    
    const followBtn = this.controls?.querySelector('#neural-flow-follow');
    if (followBtn) {
      followBtn.setAttribute('data-active', 'false');
    }
  }
  
  handleMouseMove(e) {
    try {
      if (!this.canvas) {
        console.error('[NeuralFlow] Canvas not available for mousemove handling');
        return;
      }
      
      const rect = this.canvas.getBoundingClientRect();
      
      // Get accurate mouse coordinates accounting for DPI scaling and camera position
      const mouseX = (e.clientX - rect.left);
      const mouseY = (e.clientY - rect.top);
      
      // Convert to canvas coordinates with camera offset
      const canvasX = mouseX;
      const canvasY = mouseY + this.cameraY;
      
      // Check for node hover - applying camera offset
      let newHoveredNodeIdx = -1;
      
      // Loop backwards to prioritize newer nodes (on top) for hover detection
      for (let i = this.nodes.length - 1; i >= 0; i--) {
        const node = this.nodes[i];
        if (!node) continue;
        
        // Calculate distance from mouse to node center, accounting for camera position
        const dx = canvasX - node.x;
        const dy = canvasY - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // Update hovered state with slightly larger detection area
        const wasHovered = node.hovered;
        node.hovered = dist < node.radius * 2.0; // Increased detection radius for better UX
        
        // If found a hovered node, store its index and exit loop (top node priority)
        if (node.hovered) {
          newHoveredNodeIdx = i;
          
          // If just started hovering, create "ripple" effect
          if (!wasHovered) {
            console.log(`[NeuralFlow] Node ${i} hovered at (${node.x.toFixed(1)}, ${node.y.toFixed(1)})`);
            this.createRipple(node);
          }
          
          break; // Stop checking nodes once we find one that's hovered
        }
      }
      
      // Update cursor if hover state changed
      if (newHoveredNodeIdx !== this.hoveredNodeIdx) {
        this.hoveredNodeIdx = newHoveredNodeIdx;
        this.canvas.style.cursor = newHoveredNodeIdx >= 0 ? 'pointer' : 'default';
        
        // Force a redraw to update hover states
        this.lastFrameTime = 0;
      }
      
      // Handle dragging if needed
      if (this.isDragging) {
        const dy = e.clientY - this.lastMouseY;
        this.lastMouseY = e.clientY;
        this.moveCamera(-dy);
      }
    } catch (error) {
      console.error('[NeuralFlow] Error in handleMouseMove:', error);
    }
  }
  
  handleClick(e) {
    try {
      // Prevent default to avoid any unwanted behavior
      e.preventDefault();
      e.stopPropagation();
      
      console.log('[NeuralFlow] Click event received', e);
      
      if (!this.canvas) {
        console.error('[NeuralFlow] Canvas not available for click handling');
        return;
      }
      
      const rect = this.canvas.getBoundingClientRect();
      
      // Get accurate mouse coordinates relative to canvas
      const mouseX = (e.clientX - rect.left);
      const mouseY = (e.clientY - rect.top);
      
      // Convert screen coordinates to canvas coordinates with camera offset
      const canvasX = mouseX;
      const canvasY = mouseY + this.cameraY; // Add camera offset for world coordinates
      
      console.log(`[NeuralFlow] Click at screen (${mouseX.toFixed(4)}, ${mouseY.toFixed(4)}), ` +
                  `canvas (${canvasX.toFixed(4)}, ${canvasY.toFixed(4)}), ` +
                  `camera offset ${this.cameraY.toFixed(4)}`);
      
      // Track if we found and processed a node
      let nodeFound = false;
      
      // Loop in reverse to prioritize top nodes when overlapping (better UX)
      for (let i = this.nodes.length - 1; i >= 0; i--) {
        const node = this.nodes[i];
        if (!node) continue;
        
        // Calculate distance from click to node center, accounting for camera offset
        const dx = canvasX - node.x;
        const dy = canvasY - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const clickThreshold = node.radius * 1.5; // 50% larger clickable area
        
        // Debug logging for node checking
        if (i % 5 === 0) { // Log only every 5th node to avoid console spam
          console.log(`[NeuralFlow] Checking node ${i}: ` +
                     `pos=(${node.x.toFixed(1)},${node.y.toFixed(1)}), ` +
                     `distance=${distance.toFixed(1)}, threshold=${clickThreshold.toFixed(1)}`);
        }
        
        if (distance <= clickThreshold) {
          console.log(`[NeuralFlow] Node ${i} clicked at distance ${distance.toFixed(1)} (threshold: ${clickThreshold.toFixed(1)})`);
          nodeFound = true;
          
          // Create visual feedback
          this.createRipple(node);
          
          // Show tooltip with node details
          this.showTooltip(node);
          
          // If clicking on final node or completion node, ensure we scroll to it
          if (node.isFinal || node.isCompletionNode) {
            this.scrollToLatest();
          }
          
          // Highlight the clicked node temporarily
          this.highlightNode(i);
          
          break;
        }
      }
      
      if (!nodeFound) {
        console.log(`[NeuralFlow] No node found at click location (${canvasX.toFixed(1)}, ${canvasY.toFixed(1)})`);
        
        // If no node was clicked, hide all tooltips
        this.hideAllTooltips();
      }
    } catch (error) {
      console.error('[NeuralFlow] Error in handleClick:', error);
    }
  }
  
  /**
   * Create a ripple effect on a node
   * @param {Object} node - The node to create a ripple on
   */
  createRipple(node) {
    try {
      if (!node) return;
      
      if (!node.ripples) node.ripples = [];
      
      node.ripples.push({
        radius: node.radius * 1.2,
        alpha: 0.8,
        maxRadius: node.radius * 4,
        timestamp: performance.now()
      });
      
      // Force a redraw to show the ripple immediately
      this.lastFrameTime = 0;
    } catch (error) {
      console.error('[NeuralFlow] Error creating ripple:', error);
    }
  }
  
  /**
   * Highlight a node temporarily
   * @param {number} nodeIndex - Index of the node to highlight
   * @param {number} [duration=1000] - Duration of the highlight in ms
   */
  highlightNode(nodeIndex, duration = 1000) {
    try {
      if (nodeIndex < 0 || nodeIndex >= this.nodes.length) {
        console.warn(`[NeuralFlow] Invalid node index for highlight: ${nodeIndex}`);
        return;
      }
      
      const node = this.nodes[nodeIndex];
      if (!node) return;
      
      console.log(`[NeuralFlow] Highlighting node ${nodeIndex}`);
      
      // Set highlight properties
      node.highlighted = true;
      node.highlightStart = performance.now();
      node.highlightDuration = duration;
      
      // Force a redraw to show the highlight immediately
      this.lastFrameTime = 0;
      
      // Remove highlight after duration
      setTimeout(() => {
        if (node) {
          node.highlighted = false;
          this.lastFrameTime = 0; // Force redraw
        }
      }, duration);
      
    } catch (error) {
      console.error('[NeuralFlow] Error highlighting node:', error);
    }
  }
  
  /**
   * Show a tooltip for a node
   * @param {Object} node - The node to show the tooltip for
   */
  showTooltip(node) {
    try {
      if (!node) {
        console.warn('[NeuralFlow] Cannot show tooltip: node is null');
        return;
      }
      
      console.log(`[NeuralFlow] Showing tooltip for node:`, node);
      
      // Clear any existing tooltips from the DOM
      this.hideAllTooltips();
  
      // Also remove any tooltips that might be in the container
      const existingTooltips = this.container.querySelectorAll('.tooltip, .neural-flow-tooltip');
      existingTooltips.forEach(tooltip => {
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      });
      
      // Create tooltip element
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'neural-flow-tooltip';
      
      // Style the tooltip
      Object.assign(this.tooltip.style, {
        position: 'absolute',
        backgroundColor: 'rgba(30, 35, 60, 0.95)',
        color: '#fff',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '14px',
        pointerEvents: 'none',
        zIndex: '1000',
        maxWidth: '300px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(100, 120, 255, 0.3)',
        backdropFilter: 'blur(4px)',
        transform: 'translate(-50%, -100%)',
        transition: 'opacity 0.2s, transform 0.2s',
        opacity: '0',
        left: `${node.x}px`,
        top: `${node.y - node.radius - 10}px`,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word'
      });
      
      // Set tooltip content
      const nodeText = this.formatNodeText(node.text || 'No content');
      this.tooltip.textContent = nodeText;
      
      // Add to container with higher z-index to ensure it's above controls
      this.tooltip.style.zIndex = '1001'; // Higher than controls (1000)
      this.container.appendChild(this.tooltip);
      
      // Force reflow to ensure styles are applied before animating
      void this.tooltip.offsetWidth;
      
      // Fade in
      this.tooltip.style.opacity = '1';
      
      // Position the tooltip above the node, ensuring it stays within viewport
      const tooltipRect = this.tooltip.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      
      let left = node.x;
      let top = node.y - node.radius - tooltipRect.height - 10;
      
      // Adjust if tooltip goes off the left/right edges
      if (left - tooltipRect.width / 2 < 10) {
        left = tooltipRect.width / 2 + 10;
      } else if (left + tooltipRect.width / 2 > containerRect.width - 10) {
        left = containerRect.width - tooltipRect.width / 2 - 10;
      }
      
      // Adjust if tooltip goes above the container
      if (top < 10) {
        top = node.y + node.radius + 10;
        this.tooltip.style.transform = 'translate(-50%, 0)';
      }
      
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${top}px`;
      
    } catch (error) {
      console.error('[NeuralFlow] Error showing tooltip:', error);
    }
    
    // Debug feedback in console
    console.log('NeuralFlow: Showing tooltip for node', node);
    
    // Format the detailed tooltip content with enhanced information
    const formattedTime = new Date(node.timeCreated).toLocaleTimeString();
    const formattedDate = new Date(node.timeCreated).toLocaleDateString();
    let nodeType = "Processing Step";
    let nodeIcon = '🔄';
    
    // Determine node type with specific icons
    if (node.isPlanNode) {
      nodeType = "Plan Creation";
      nodeIcon = '🧠';
    } else if (node.isCompletionNode) {
      nodeType = "Task Completion";
      nodeIcon = '✅';
    } else if (node.isSubStep) {
      nodeType = "Sub-step";
      nodeIcon = '📎';
    } else if (node.isFinal) {
      nodeType = "Final Step";
      nodeIcon = '🏁';
    }
    
    // Find connections for contextual information
    const connectedNodes = [];
    if (node.parentStepId !== undefined && node.parentStepId >= 0) {
      const parentNode = this.nodes[node.parentStepId];
      if (parentNode) {
        connectedNodes.push({ type: 'Parent', text: parentNode.text.substring(0, 40) + '...' });
      }
    }
    
    // Find child nodes (sub-steps)
    const childNodes = this.nodes.filter(n => n.parentStepId === this.nodes.indexOf(node));
    if (childNodes.length > 0) {
      connectedNodes.push({ type: 'Sub-steps', count: childNodes.length });
    }
    
    // Get progression information
    const nodeIndex = this.nodes.indexOf(node);
    const totalNodes = this.nodes.length;
    const progress = Math.round((nodeIndex / Math.max(1, totalNodes - 1)) * 100);
    
    // Build ultra-compact tooltip HTML with minimal content
    let tooltipContent = `
      <div class="neural-tooltip-header">
        <div class="neural-tooltip-type ${nodeType === 'Processing Step' ? 'processing-step' : ''}">${nodeIcon} ${nodeType}</div>
        <div class="neural-tooltip-time">${formattedTime}</div>
      </div>
      <div class="neural-tooltip-content">${node.text}</div>
      <div class="neural-tooltip-details">
        <div class="neural-tooltip-detail"><span>Step:</span> ${node.stepNumber || nodeIndex+1}/${totalNodes}</div>
        <div class="neural-tooltip-detail"><span>Progress:</span> <div class="tooltip-progress-bar"><div style="width: ${progress}%"></div></div></div>
      </div>
    `;
    
    // Add connection information if available
    if (connectedNodes.length > 0) {
      tooltipContent += `<div class="neural-tooltip-connections">`;
      connectedNodes.forEach(conn => {
        if (conn.type === 'Parent') {
          tooltipContent += `<div class="neural-tooltip-connection"><span>Parent:</span> ${conn.text}</div>`;
        } else if (conn.type === 'Sub-steps') {
          tooltipContent += `<div class="neural-tooltip-connection"><span>Sub-steps:</span> ${conn.count}</div>`;
        }
      });
      tooltipContent += `</div>`;
    }
    
    if (node.isPlanNode) {
      tooltipContent += `<div class="neural-tooltip-help">Start of processing sequence</div>`;
    }
    
    if (node.isFinal) {
      tooltipContent += `<div class="neural-tooltip-help">Final processing step</div>`;
    }
    
    // Create ultra-compact futuristic tooltip element 
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'neural-flow-tooltip';
    this.tooltip.innerHTML = tooltipContent;
    this.tooltip.style.position = 'absolute';
    // Position tooltip to always appear within the canvas container
    // Use containment check to prevent clipping at edges
    const containerWidth = this.container.clientWidth;
    
    // Calculate optimal position (prefer right side, fallback to left if near edge)
    const containerHeight = this.container.clientHeight;
    const preferRightSide = node.x < (containerWidth - 250); // 250px is approx tooltip width + padding
    
    if (preferRightSide) {
      // Position to the right of the node
      this.tooltip.style.left = `${Math.min(node.x + 35, containerWidth - 240)}px`;
      this.tooltip.style.top = `${Math.max(node.y - this.cameraY, 30)}px`; // Account for camera position
      this.tooltip.style.transform = 'translateY(-50%)';
    } else {
      // Position to the left of the node if near right edge
      this.tooltip.style.left = `${Math.max(node.x - 240, 10)}px`;
      this.tooltip.style.top = `${Math.max(node.y - this.cameraY, 30)}px`;
      this.tooltip.style.transform = 'translateY(-50%)';
    }
    
    // Ensure tooltip doesn't exceed container height
    const tooltipHeight = this.tooltip.offsetHeight;
    if (this.tooltip.style.top === `${Math.max(node.y - this.cameraY, 30)}px` && (node.y - this.cameraY + tooltipHeight) > containerHeight) {
      this.tooltip.style.top = `${containerHeight - tooltipHeight - 10}px`;
    }
    
    // Force pixel units for reliable positioning
    this.tooltip.style.position = 'absolute';
    
    // Match system card styling - simpler, more compact appearance
    this.tooltip.style.background = 'rgba(30, 35, 60, 0.92)';
    this.tooltip.style.backdropFilter = 'blur(8px)';
    this.tooltip.style.webkitBackdropFilter = 'blur(8px)';
  
    // Use system card border style with subtle glow
    this.tooltip.style.border = '1px solid rgba(156, 163, 175, 0.5)';
    this.tooltip.style.borderLeft = '2px solid rgba(156, 163, 175, 0.8)';
    this.tooltip.style.borderRadius = '4px';
    this.tooltip.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
  
    // Ultra compact sizing - minimal padding and margins
    this.tooltip.style.padding = '3px 5px';
    this.tooltip.style.width = '180px';
    this.tooltip.style.maxWidth = '80vw';
    
    // System card text styling
    this.tooltip.style.color = 'rgba(229, 231, 235, 0.9)';
    this.tooltip.style.zIndex = '10000';
    this.tooltip.style.overflow = 'hidden';
    this.tooltip.style.opacity = '0';
    this.tooltip.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
    this.tooltip.style.fontFamily = 'var(--font-sans, system-ui, -apple-system, sans-serif)';
    this.tooltip.style.fontSize = '10px';
    this.tooltip.style.lineHeight = '1.2';
    this.tooltip.style.letterSpacing = '0.1px';
  
    // Force higher z-index to ensure visibility
    this.tooltip.style.zIndex = '10000';
  
    // Append to DOM first (before animation)
    this.container.appendChild(this.tooltip);
  
    // Force a layout recalculation before starting animation
    this.tooltip.getBoundingClientRect();
  
    // Animate in with a slight delay
    setTimeout(() => {
      this.tooltip.style.opacity = '1';
      // Create a pulse animation at node location for visual feedback
      this.createRipple(node);
    }, 10);
  
    // Add system-card-matching internal styling
    const style = document.createElement('style');
    style.textContent = `
      .neural-tooltip-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2px;
        padding-bottom: 2px;
        border-bottom: 1px solid rgba(123, 77, 255, 0.8); /* Updated to match --primary-color */
      }
      .neural-tooltip-title {
        font-size: 10px;
        font-weight: 500;
        color: rgba(229, 231, 235, 0.9);
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .neural-tooltip-type {
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 2px;
        background: rgba(100, 110, 150, 0.15);
        color:rgb(198, 198, 221);
        font-weight: 500;
        border: 1px solid rgba(156, 163, 175, 0.3);
        white-space: nowrap;
        letter-spacing: 0.3px;
        text-transform: uppercase;
      }
      .neural-tooltip-content {
        margin: 2px 0 3px;
        font-size: 10px;
        line-height: 1.2;
        color: rgba(229, 231, 235, 0.9);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .neural-tooltip-details {
        display: flex;
        flex-direction: column;
      }
      .neural-tooltip-detail {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 1px 0;
        font-size: 9px;
        color: rgba(229, 231, 235, 0.8);
      }
      .neural-tooltip-detail span {
        color: rgba(156, 163, 175, 0.7);
        margin-right: 2px;
        font-weight: 500;
      }
      .tooltip-progress-bar {
        width: 80px;
        height: 4px;
        background: rgba(50, 60, 100, 0.3);
        border-radius: 2px;
        overflow: hidden;
        display: inline-block;
        vertical-align: middle;
        margin-left: 5px;
      }
      .tooltip-progress-bar > div {
        height: 100%;
        background: #7B4DFF; /* Updated to match --primary-color */
        border-radius: 2px;
        transition: width 0.3s ease;
      }
      .neural-tooltip-connections {
        margin-top: 2px;
        padding-top: 2px;
        border-top: 1px solid rgba(156, 163, 175, 0.25);
      }
      .neural-tooltip-connection {
        font-size: 9px;
        margin-bottom: 1px;
        display: flex;
        align-items: center;
        color: rgba(229, 231, 235, 0.8);
      }
      .neural-tooltip-connection span {
        color: rgba(156, 163, 175, 0.7);
        margin-right: 2px;
        font-weight: 500;
      }
      .neural-tooltip-help {
        font-size: 8px;
        margin-top: 2px;
        padding-top: 2px;
        color: rgba(156, 163, 175, 0.6);
        border-top: 1px solid rgba(170, 100, 255, 0.8);
        font-style: italic;
      }
      .tooltip-progress-bar {
        width: 40px;
        height: 3px;
        background: rgba(156, 163, 175, 0.15);
        border-radius: 1px;
        margin: 0 4px;
        position: relative;
        overflow: hidden;
      }
      .tooltip-progress-bar > div {
        height: 100%;
        background: var(--border-color, #6B7280);
        border-radius: 1px;
      }
    `;
    this.tooltip.appendChild(style);
    
    // Add to container
    this.container.appendChild(this.tooltip);
    
    // Animate in with smooth transition
    setTimeout(() => {
      this.tooltip.style.opacity = '1';
      this.tooltip.style.transform = 'translate(-50%, -100%)';
    }, 10);
    
    // Auto-remove after delay, but longer for more reading time
    setTimeout(() => {
      if (this.tooltip) {
        this.tooltip.style.opacity = '0';
        this.tooltip.style.transform = 'translate(-50%, -90%)';
        setTimeout(() => {
          if (this.tooltip && this.tooltip.parentNode) {
            this.container.removeChild(this.tooltip);
            this.tooltip = null;
          }
        }, 300);
      }
    }, 5000); // Longer display time - 5 seconds
  }
  
  /**
   * Enhanced animation loop with improved camera movement and performance
   * - Uses physics-based easing for natural scrolling
   * - Adaptive timing for consistent behavior across devices
   * - Optimized for both immediate and smooth transitions
   */
  animate(time) {
    // Skip if disposed
    if (this.isDisposed) return;
    
    // Initialize timing
    if (!this.lastFrameTime) {
      this.lastFrameTime = time;
      this.animationFrameId = requestAnimationFrame(this.animate);
      return;
    }
    
    // Calculate delta time with upper bound for stability
    const deltaTime = Math.min(100, time - this.lastFrameTime); // Cap at 100ms
    this.lastFrameTime = time;
    
    // Update particle effects (independent of scroll)
    this.particleTime += deltaTime * 0.001;
    
    // Handle immediate jumps first
    if (this._needsImmediateJump) {
      this.cameraY = this.targetCameraY;
      this._needsImmediateJump = false;
    }
    
    // Smooth camera movement with physics-based easing
    const cameraDiff = this.targetCameraY - this.cameraY;
    
    if (Math.abs(cameraDiff) > 0.1) {
      // Use a spring-damper system for natural feeling movement
      const springConstant = 0.2;  // Adjust for stiffness
      const damping = 0.8;         // Critical damping
      
      // Calculate spring force (Hooke's law)
      const springForce = springConstant * cameraDiff;
      
      // Apply damping (proportional to velocity)
      const velocity = (this.cameraY - this.lastCameraY) / (deltaTime || 1);
      const dampingForce = -damping * velocity;
      
      // Combine forces and apply
      const totalForce = springForce + dampingForce;
      
      // Update position using Verlet integration for stability
      const newCameraY = this.cameraY + totalForce * (deltaTime * 0.1);
      
      // Store current position for next frame's velocity calculation
      this.lastCameraY = this.cameraY;
      
      // Apply the new position
      this.cameraY = newCameraY;
      
      // If very close to target, snap to avoid jitter
      if (Math.abs(cameraDiff) < 0.5) {
        this.cameraY = this.targetCameraY;
      }
    } else {
      // Snap to target when close enough
      this.cameraY = this.targetCameraY;
    }
    
    // Ensure canvas is properly sized for content
    this.ensureCanvasSize();
    
    // Clear canvas with transparent background
    this.ctx.clearRect(0, 0, this.width, this.height);
    
    // Apply camera transform with subpixel precision
    this.ctx.save();
    this.ctx.translate(0, -Math.round(this.cameraY * 100) / 100); // Round to 2 decimal places for crisp rendering
    
    // Draw connections between nodes first (under nodes)
    this.drawConnections();
    
    // Draw ambient particles
    this.drawAmbientParticles();
    
    // Draw nodes
    this.nodes.forEach((node, i) => this.drawNode(node, i, time));
    
    // Restore transform
    this.ctx.restore();
    
    // Animate out tooltip if present and we're not hovering relevant node
    if (this.tooltip && this.hoveredNodeIdx === -1) {
      this.tooltip.style.opacity = '0';
      setTimeout(() => {
        if (this.tooltip && this.tooltip.parentNode) {
          this.container.removeChild(this.tooltip);
          this.tooltip = null;
        }
      }, 300);
    }
    
    // Continue animation loop
    this.animationFrameId = requestAnimationFrame(this.animate);
  }
  
  ensureCanvasSize() {
    if (this.isDisposed) return;
    
    // Use container's current height or default to 300px
    const targetHeight = this.container.clientHeight || 300;
    const currentHeight = parseInt(this.container.style.height) || 0;
    
    // Only update if height has changed significantly (more than 1px)
    if (Math.abs(currentHeight - targetHeight) > 1) {
      // Update container styles
      this.container.style.height = `${targetHeight}px`;
      this.container.style.minHeight = `${targetHeight}px`;
      this.container.style.maxHeight = `${targetHeight}px`;
      
      // Get current scroll position before resize
      const wasAtBottom = this.isAtBottom(20);
      const scrollRatio = this.cameraY / Math.max(1, this.getContentHeight() - this.height);
      
      // Update canvas dimensions
      const rect = this.container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      this.canvas.width = Math.floor(rect.width * dpr);
      this.canvas.height = Math.floor(targetHeight * dpr);
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${targetHeight}px`;
      
      this.ctx.scale(dpr, dpr);
      this.width = rect.width;
      this.height = targetHeight;
      
      // Calculate new content height
      const contentHeight = this.getContentHeight();
      const maxScroll = Math.max(0, contentHeight - targetHeight);
      
      // Preserve scroll position or adjust if we were at bottom
      if (wasAtBottom) {
        // If we were at bottom, stay at bottom
        this.cameraY = Math.max(0, contentHeight - targetHeight);
      } else {
        // Otherwise maintain relative scroll position
        this.cameraY = Math.min(maxScroll, Math.max(0, scrollRatio * maxScroll));
      }
      
      // Ensure target matches current position to prevent unwanted scrolling
      this.targetCameraY = this.cameraY;
      this.lastCameraY = this.cameraY; // For velocity calculations
      
      // Force a redraw on next frame
      this.needsResize = true;
      this.lastFrameTime = 0;
      
      if (console && console.log) {
        console.log('[NeuralFlow] Canvas resized:', {
          width: this.width,
          height: this.height,
          contentHeight,
          cameraY: this.cameraY,
          wasAtBottom,
          dpr
        });
      }
    }
  }
  
  drawConnections() {
    const now = Date.now();
    
    // Draw all branch connections from the branch list instead of sequential
    this.branches.forEach(branch => {
      const fromNode = this.nodes[branch.fromIdx];
      const toNode = this.nodes[branch.toIdx];
      
      // Only draw if both nodes have faded in
      if (fromNode.alpha < 0.1 || toNode.alpha < 0.1) return;
      
      // Determine connection style based on branch type
      const isMainFlow = branch.type === 'main-flow';
      const isSubStep = branch.type === 'sub-step';
      const isPlanConnection = fromNode.isPlanNode || toNode.isPlanNode;
      const isFinalConnection = toNode.isFinal;
      const isCompletionConnection = toNode.isCompletionNode;
      
      // Calculate control points for curved path - more curve for sub-steps
      const midX = (fromNode.x + toNode.x) / 2;
      const midY = (fromNode.y + toNode.y) / 2;
      
      // Add appropriate curve based on connection type and distance
      const dx = toNode.x - fromNode.x;
      const dy = toNode.y - fromNode.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      // Different curve styles for different connection types
      let curveFactor;
      if (isSubStep) {
        // Sub-steps have more pronounced curves
        curveFactor = Math.min(0.45, 80 / dist);
      } else if (isPlanConnection) {
        // Plan connections have slight, elegant curves
        curveFactor = Math.min(0.15, 30 / dist);
      } else {
        // Regular flow has natural neural curves
        curveFactor = Math.min(0.2, 40 / dist);
      }
      
      // Add slight randomization for organic feel
      const randomShift = isSubStep ? 0.1 : 0.05;
      const controlX = midX + dy * curveFactor * (1 + (Math.random() - 0.5) * randomShift);
      const controlY = midY - dx * curveFactor * (1 + (Math.random() - 0.5) * randomShift);
      
      // Create path for drawing
      const path = [];
      const steps = 30; // More steps for smoother curve
      
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = Math.pow(1-t, 2) * fromNode.x + 2 * (1-t) * t * controlX + Math.pow(t, 2) * toNode.x;
        const y = Math.pow(1-t, 2) * fromNode.y + 2 * (1-t) * t * controlY + Math.pow(t, 2) * toNode.y;
        path.push({x, y});
      }
      
      // Draw brain-like axon connection (slightly thicker near nodes, thinner in middle)
      this.ctx.save();
      
      // Determine connection color based on type
      let connectionColors;
      
      if (isPlanConnection) {
        // Plan node connections: purple
        connectionColors = {
          start: 'rgba(170, 100, 255, 0.8)',
          end: 'rgba(100, 160, 255, 0.7)',
          pulse: 'rgba(200, 150, 255, 0.9)',
          glow: 'rgba(170, 100, 255, 0.6)'
        };
      } else if (isFinalConnection) {
        // Final node: teal green
        connectionColors = {
          start: 'rgba(0, 210, 255, 0.8)',
          end: 'rgba(0, 255, 180, 0.8)',
          pulse: 'rgba(120, 255, 210, 0.9)',
          glow: 'rgba(0, 255, 180, 0.6)'
        };
      } else if (isCompletionConnection) {
        // Completion connections: aqua
        connectionColors = {
          start: 'rgba(0, 180, 220, 0.7)',
          end: 'rgba(0, 220, 200, 0.7)',
          pulse: 'rgba(100, 240, 230, 0.8)',
          glow: 'rgba(0, 200, 210, 0.5)'
        };
      } else if (isSubStep) {
        // Substep connections: lighter blue
        connectionColors = {
          start: 'rgba(70, 150, 240, 0.6)',
          end: 'rgba(90, 170, 255, 0.6)',
          pulse: 'rgba(130, 190, 255, 0.8)',
          glow: 'rgba(80, 160, 245, 0.4)'
        };
      } else {
        // Regular connections: blue
        connectionColors = {
          start: 'rgba(30, 160, 255, 0.7)',
          end: 'rgba(50, 180, 255, 0.7)',
          pulse: 'rgba(100, 200, 255, 0.8)', 
          glow: 'rgba(40, 170, 255, 0.5)'
        };
      }
      
      // Check if this connection involves a hovered node
      const isHighlighted = (branch.fromIdx === this.hoveredNodeIdx || branch.toIdx === this.hoveredNodeIdx);
      
      // Draw the main connection with gradient
      const gradient = this.ctx.createLinearGradient(fromNode.x, fromNode.y, toNode.x, toNode.y);
      gradient.addColorStop(0, connectionColors.start);
      gradient.addColorStop(1, connectionColors.end);
      
      // Draw the path with varying thickness
      for (let i = 1; i < path.length; i++) {
        const prev = path[i-1];
        const curr = path[i];
        
        // Calculate progress along the path for thickness variation
        const progress = i / path.length;
        const thickness = isHighlighted ? 2.5 : 1.8;
        
        // Axon is thicker near the nodes, thinner in middle - gives organic feel
        const axonThickness = thickness * (1 - 0.4 * Math.sin(progress * Math.PI));
        
        this.ctx.beginPath();
        this.ctx.moveTo(prev.x, prev.y);
        this.ctx.lineTo(curr.x, curr.y);
        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = axonThickness;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
      }
      
      // Add subtle glow effect around connection
      this.ctx.shadowColor = connectionColors.glow;
      this.ctx.shadowBlur = isHighlighted ? 12 : 8;
      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      
      for (let i = 1; i < path.length; i++) {
        this.ctx.lineTo(path[i].x, path[i].y);
      }
      
      this.ctx.strokeStyle = gradient;
      this.ctx.lineWidth = isHighlighted ? 1.8 : 1.5;
      this.ctx.stroke();
      this.ctx.restore();
      
      // Draw energy pulses along the path
      this.drawNeuralPulses(fromNode, toNode, path, connectionColors, isHighlighted);
    });
  }
  
  // Draw neural pulse animations traveling along connections
  drawNeuralPulses(fromNode, toNode, path, colors, isHighlighted) {
    const now = Date.now();
    
    // Create pulses at intervals
    if (!fromNode.pulses) fromNode.pulses = [];
    
    // Add new pulse occasionally
    if (Math.random() < 0.03) {
      fromNode.pulses.push({
        progress: 0,
        speed: 0.002 + Math.random() * 0.002,
        size: isHighlighted ? 3.5 : 2.8,
        createdAt: now
      });
    }
    
    // Move and draw existing pulses
    fromNode.pulses = fromNode.pulses.filter(pulse => {
      // Update progress
      pulse.progress += pulse.speed;
      
      // Remove if completed
      if (pulse.progress >= 1) return false;
      
      // Calculate position along path
      const pathIdx = Math.min(Math.floor(pulse.progress * path.length), path.length - 1);
      const pulseX = path[pathIdx].x;
      const pulseY = path[pathIdx].y;
      
      // Calculate glow effect
      const age = (now - pulse.createdAt) / 1000;
      const pulseIntensity = Math.min(1, age * 2) * (1 - pulse.progress * 0.5);
      
      // Draw pulse
      this.ctx.save();
      
      // Create circular glow
      const glowSize = pulse.size * (1.5 + Math.sin(now/200) * 0.3);
      const gradient = this.ctx.createRadialGradient(
        pulseX, pulseY, 0,
        pulseX, pulseY, glowSize
      );
      
      gradient.addColorStop(0, colors.pulse);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      
      this.ctx.beginPath();
      this.ctx.arc(pulseX, pulseY, glowSize, 0, Math.PI * 2);
      this.ctx.fillStyle = gradient;
      this.ctx.fill();
      
      // Draw core of pulse
      this.ctx.beginPath();
      this.ctx.arc(pulseX, pulseY, pulse.size * 0.7, 0, Math.PI * 2);
      this.ctx.fillStyle = colors.pulse;
      this.ctx.fill();
      
      this.ctx.restore();
      
      return true;
    });
  }
  
  drawEnergyParticles(from, to, controlX, controlY, isFinal) {
    const now = Date.now();
    const pathSegments = 30;
    
    // Create particle every so often
    if (Math.random() < 0.3) {
      const particle = {
        progress: 0,
        speed: 0.6 + Math.random() * 0.7,
        size: isFinal ? 4 : 3,
        color: isFinal ? 'rgba(0, 255, 180, 0.9)' : 'rgba(0, 210, 255, 0.9)',
        born: now
      };
      
      if (!from.energyParticles) from.energyParticles = [];
      from.energyParticles.push(particle);
    }
    
    // Animate existing particles
    if (from.energyParticles) {
      from.energyParticles.forEach((p, i) => {
        // Update progress
        p.progress += (p.speed / 50);
        
        // If completed, remove
        if (p.progress >= 1) {
          from.energyParticles.splice(i, 1);
          return;
        }
        
        // Calculate position on quadratic curve
        const t = p.progress;
        const x = (1-t)*(1-t)*from.x + 2*(1-t)*t*controlX + t*t*to.x;
        const y = (1-t)*(1-t)*from.y + 2*(1-t)*t*controlY + t*t*to.y;
        
        // Draw particle
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(x, y, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = p.color;
        this.ctx.shadowColor = p.color;
        this.ctx.shadowBlur = 10;
        this.ctx.fill();
        this.ctx.restore();
      });
    }
  }
  
  drawAmbientParticles() {
    if (!this.particles) {
      // Initialize particles
      this.particles = [];
      for (let i = 0; i < 25; i++) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          size: 0.5 + Math.random() * 1.5,
          speed: 0.2 + Math.random() * 0.7,
          angle: Math.random() * Math.PI * 2,
          angleSpeed: (Math.random() - 0.5) * 0.02,
          alpha: 0.1 + Math.random() * 0.4
        });
      }
    }
    
    // Update and draw particles
    this.particles.forEach(p => {
      // Update position
      p.angle += p.angleSpeed;
      p.x += Math.cos(p.angle) * p.speed;
      p.y += Math.sin(p.angle) * p.speed;
      
      // Wrap around screen
      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      if (p.y > this.height) p.y = 0;
      
      // Draw particle
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(100, 210, 255, ${p.alpha})`;
      this.ctx.fill();
    });
  }
  
  drawNode(node, idx, timestamp) {
    // Smooth animation to target position
    node.alpha = Math.min(1, node.alpha + 0.02);
    node.x = node.x + (node.tx - node.x) * 0.1;
    node.y = node.y + (node.ty - node.y) * 0.1;
    
    const timeSinceCreation = Date.now() - node.timeCreated;
    const isRecent = timeSinceCreation < 1000;
    
    // Determine node appearance
    const isHovered = node.hovered;
    const isPlanNode = node.isPlanNode;
    const isFinal = node.isFinal;
    const isSubStep = node.isSubStep;
    const isCompletionNode = node.isCompletionNode;
    
    // Different pulse rates for different node types
    const pulseFreq = isPlanNode ? 0.0015 : (isFinal ? 0.002 : 0.001);
    const pulseAmp = isPlanNode ? 0.5 : (isFinal ? 0.4 : 0.2);
    const pulse = Math.sin(timestamp * pulseFreq + node.pulsePhase) * pulseAmp + 1;
    
    // Different color schemes for different node types
    let nodeColors = {};
    
    if (isPlanNode) {
      // Plan node: purple/blue brain cell
      nodeColors = {
        main: `rgba(170, 100, 255, ${node.alpha})`,
        glow: `rgba(170, 100, 255, ${0.5 * pulse * node.alpha})`,
        ring: `rgba(170, 100, 255, ${0.8 * node.alpha})`,
        text: `rgba(200, 180, 255, ${node.alpha})`,
        nucleus: `rgba(120, 80, 220, ${0.9 * node.alpha})`,
        dendrite: `rgba(170, 100, 255, ${0.7 * node.alpha})`
      };
    } else if (isFinal) {
      // Final node: green/teal
      nodeColors = {
        main: `rgba(0, 255, 180, ${node.alpha})`,
        glow: `rgba(0, 255, 180, ${0.4 * pulse * node.alpha})`,
        ring: `rgba(0, 255, 180, ${0.8 * node.alpha})`,
        text: `rgba(140, 255, 210, ${node.alpha})`,
        nucleus: `rgba(0, 180, 120, ${0.9 * node.alpha})`,
        dendrite: `rgba(0, 255, 180, ${0.6 * node.alpha})`
      };
    } else if (isCompletionNode) {
      // Completion node: aqua blue
      nodeColors = {
        main: `rgba(0, 210, 220, ${node.alpha})`,
        glow: `rgba(0, 210, 220, ${0.4 * pulse * node.alpha})`,
        ring: `rgba(0, 210, 220, ${0.7 * node.alpha})`,
        text: `rgba(150, 240, 240, ${node.alpha})`,
        nucleus: `rgba(0, 160, 170, ${0.9 * node.alpha})`,
        dendrite: `rgba(0, 210, 220, ${0.6 * node.alpha})`
      };
    } else {
      // Regular node: cyan/blue
      nodeColors = {
        main: `rgba(30, 160, 255, ${node.alpha})`,
        glow: `rgba(30, 160, 255, ${0.3 * pulse * node.alpha})`,
        ring: `rgba(50, 180, 255, ${0.6 * node.alpha})`,
        text: `rgba(180, 230, 255, ${node.alpha})`,
        nucleus: `rgba(20, 130, 220, ${0.9 * node.alpha})`,
        dendrite: `rgba(50, 180, 255, ${0.55 * node.alpha})`
      };
    }
    
    // Draw subtle outer glow (brain cell aura)
    this.ctx.save();
    const glowRadius = node.radius * (1.4 + pulse * 0.3);
    const glowGradient = this.ctx.createRadialGradient(
      node.x, node.y, node.radius,
      node.x, node.y, glowRadius
    );
    glowGradient.addColorStop(0, nodeColors.glow);
    glowGradient.addColorStop(1, `rgba(0, 0, 0, 0)`);
    
    this.ctx.beginPath();
    this.ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = glowGradient;
    this.ctx.fill();
    
    // Draw brain cell dendrites (connections to nearby areas)
    if (node.dendrites && node.dendrites.length > 0) {
      node.dendrites.forEach(dendrite => {
        const baseAngle = dendrite.angle;
        const dendriteLength = dendrite.length * (1 + pulse * 0.1);
        
        const startX = node.x + Math.cos(baseAngle) * node.radius * 0.7;
        const startY = node.y + Math.sin(baseAngle) * node.radius * 0.7;
        
        // Main dendrite
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        
        // Create a curved dendrite with branches
        const endX = node.x + Math.cos(baseAngle) * dendriteLength;
        const endY = node.y + Math.sin(baseAngle) * dendriteLength;
        
        // Control point for curve
        const ctrlX = startX + Math.cos(baseAngle + dendrite.curve) * dendriteLength * 0.6;
        const ctrlY = startY + Math.sin(baseAngle + dendrite.curve) * dendriteLength * 0.6;
        
        this.ctx.quadraticCurveTo(ctrlX, ctrlY, endX, endY);
        
        // Draw with glow for hover
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeStyle = nodeColors.dendrite;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        
        // Add small branches at the end for some dendrites
        if (Math.random() > 0.5) {
          const branchAngle1 = baseAngle + (Math.random() - 0.5) * 1.2;
          const branchAngle2 = baseAngle + (Math.random() - 0.5) * 1.2;
          const branchLength = dendriteLength * 0.3;
          
          const branch1X = endX + Math.cos(branchAngle1) * branchLength * 0.5;
          const branch1Y = endY + Math.sin(branchAngle1) * branchLength * 0.5;
          
          this.ctx.beginPath();
          this.ctx.moveTo(endX, endY);
          this.ctx.lineTo(branch1X, branch1Y);
          this.ctx.lineWidth = 1;
          this.ctx.strokeStyle = nodeColors.dendrite;
          this.ctx.stroke();
          
          const branch2X = endX + Math.cos(branchAngle2) * branchLength * 0.4;
          const branch2Y = endY + Math.sin(branchAngle2) * branchLength * 0.4;
          
          this.ctx.beginPath();
          this.ctx.moveTo(endX, endY);
          this.ctx.lineTo(branch2X, branch2Y);
          this.ctx.stroke();
        }
        
        // Add pulse animation along dendrite
        const pulseFactor = Math.sin(timestamp * 0.005 + dendrite.pulseOffset);
        if (pulseFactor > 0.7) {
          const pulseProgress = (pulseFactor - 0.7) / 0.3; // 0 to 1
          const pulsePos = pulseProgress * 0.8; // Position along dendrite
          
          const pulseX = startX + (endX - startX) * pulsePos;
          const pulseY = startY + (endY - startY) * pulsePos;
          
          this.ctx.beginPath();
          this.ctx.arc(pulseX, pulseY, 2, 0, Math.PI * 2);
          this.ctx.fillStyle = nodeColors.ring;
          this.ctx.fill();
        }
      });
    }
    
    // Enhance glow effect when hovered or final/special node
    if (isHovered || isFinal || isPlanNode) {
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, node.radius * (1.2 + pulse * 0.3), 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255, 255, 255, ${0.1 * pulse * node.alpha})`;
      this.ctx.fill();
      
      // Add ripple effect on hover
      if (isHovered && node.ripples) {
        node.ripples.forEach((ripple, i) => {
          ripple.radius += 1.5;
          ripple.alpha -= 0.03;
          
          if (ripple.alpha <= 0 || ripple.radius >= ripple.maxRadius) {
            node.ripples.splice(i, 1);
            return;
          }
          
          this.ctx.beginPath();
          this.ctx.arc(node.x, node.y, ripple.radius, 0, Math.PI * 2);
          this.ctx.strokeStyle = `rgba(255, 255, 255, ${ripple.alpha})`;
          this.ctx.lineWidth = 1.5;
          this.ctx.stroke();
        });
      }
    }
    
    // Draw cell nucleus (inner circle)
    this.ctx.beginPath();
    this.ctx.arc(node.x, node.y, node.radius * 0.8, 0, Math.PI * 2);
    
    // Create organic-looking gradient for nucleus
    const nucleusGradient = this.ctx.createRadialGradient(
      node.x - node.radius * 0.3, node.y - node.radius * 0.3, 0,
      node.x, node.y, node.radius * 0.8
    );
    nucleusGradient.addColorStop(0, `rgba(255, 255, 255, ${0.7 * node.alpha})`);
    nucleusGradient.addColorStop(0.7, nodeColors.nucleus);
    nucleusGradient.addColorStop(1, `rgba(10, 20, 40, ${0.6 * node.alpha})`);
    
    this.ctx.fillStyle = nucleusGradient;
    this.ctx.fill();
    
    // Add faint outer membrane (ring)
    this.ctx.beginPath();
    this.ctx.arc(node.x, node.y, node.radius * 0.9, 0, Math.PI * 2);
    this.ctx.strokeStyle = nodeColors.ring;
    this.ctx.lineWidth = 1.2;
    this.ctx.stroke();
    
    // Add special indicator for plan node
    if (isPlanNode) {
      // Brain pattern inside node
      this.ctx.beginPath();
      this.ctx.moveTo(node.x - node.radius * 0.4, node.y);
      this.ctx.bezierCurveTo(
        node.x - node.radius * 0.2, node.y - node.radius * 0.3,
        node.x + node.radius * 0.2, node.y - node.radius * 0.3,
        node.x + node.radius * 0.4, node.y
      );
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
    }
    
    // Add check mark for completion nodes
    if (isCompletionNode) {
      const checkSize = node.radius * 0.6;
      this.ctx.beginPath();
      this.ctx.moveTo(node.x - checkSize * 0.3, node.y);
      this.ctx.lineTo(node.x, node.y + checkSize * 0.3);
      this.ctx.lineTo(node.x + checkSize * 0.5, node.y - checkSize * 0.3);
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      this.ctx.lineWidth = 1.8;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.stroke();
    }
    
    this.drawNodeText(node, node.x, node.y);
    
    // Draw "activation" animation for recent nodes
    if (isRecent) {
      const popProgress = Math.min(1, timeSinceCreation / 500);
      const popRadius = node.radius * (2 - popProgress);
      const popAlpha = 0.5 * (1 - popProgress);
      
      this.ctx.beginPath();
      this.ctx.arc(node.x, node.y, popRadius, 0, Math.PI * 2);
      this.ctx.strokeStyle = `rgba(255, 255, 255, ${popAlpha})`;
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
    }
    
    this.ctx.restore();
  }
  
  drawNodeText(node, x, y) {
    const { text, radius, isHovered } = node;
    if (!text) return; // Skip if no text
    
    this.ctx.font = '14px var(--font-family), sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    const lines = this.formatNodeText(text);
    lines.forEach((line, i) => {
      this.ctx.fillStyle = isHovered ? 'rgba(255, 255, 255, 0.9)' : `rgba(180, 230, 255, ${node.alpha})`;
      this.ctx.fillText(line, x, y + (i - lines.length / 2 + 0.5) * 20);
    });
  }
  
  formatNodeText(text) {
    // Prepare text and break into words for formatting
    const words = text.split(' ');
    const lines = [];
    
    if (words.length === 0) return lines;
  
    let currentLine = words[0];
    const maxWidth = 170; // Max width for text wrapping per user request
    const maxCharsPerLine = 22; // More restrictive character limit to ensure text fits
    
    // Create text wrapping with stricter limits
    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine + ' ' + word;
      
      // More aggressive width control - use both estimated pixel width and character count
      if (testLine.length * 7 > maxWidth || testLine.length > maxCharsPerLine) {
        // If the current line is already too long, truncate it with ellipsis
        if (currentLine.length > maxCharsPerLine) {
          lines.push(currentLine.substring(0, maxCharsPerLine - 3) + '...');
        } else {
          lines.push(currentLine);
        }
        // If this single word is already too long, truncate it
        if (word.length > maxCharsPerLine) {
          currentLine = word.substring(0, maxCharsPerLine - 3) + '...';
        } else {
          currentLine = word;
        }
      } else {
        currentLine = testLine;
      }
    }
    
    // Add the last line, with truncation if needed
    if (currentLine.length > maxCharsPerLine) {
      lines.push(currentLine.substring(0, maxCharsPerLine - 3) + '...');
    } else {
      lines.push(currentLine);
    }
    
    // Limit to 3 lines max to ensure uniformity and better fit
    if (lines.length > 3) {
      lines.splice(3, lines.length - 3);
      // Add ellipsis to the last visible line if we truncated lines
      const lastLine = lines[2];
      if (lastLine.slice(-3) !== '...') {
        lines[2] = lastLine.substring(0, lastLine.length > maxCharsPerLine - 3 ? maxCharsPerLine - 3 : lastLine.length) + '...';
      }
    }
    
    return lines;
  }
  
  cleanup() {
    // Cancel animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Remove canvas event listeners
    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.handleMouseMove);
      this.canvas.removeEventListener('click', this.handleClick);
    }
    
    // Remove keyboard event listener
    if (this._keyDownHandler) {
      document.removeEventListener('keydown', this._keyDownHandler);
      this._keyDownHandler = null;
    }
    
    // Remove controls
    if (this.controls && this.controls.parentNode) {
      this.controls.parentNode.removeChild(this.controls);
      this.controls = null;
    }
    
    // Remove canvas
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
      this.canvas = null;
    }
    
    // Remove tooltip if present
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
  }
  

}