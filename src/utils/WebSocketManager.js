// WebSocketManager.js - Refactored and cleaned up
const connectionStates = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

class WebSocketManager {
  static instance = null;
  
  constructor() {
    if (WebSocketManager.instance) {
      return WebSocketManager.instance;
    }

    // Configuration
    this.config = {
      PING_INTERVAL: 25000,     // Send ping every 25 seconds
      PONG_TIMEOUT: 10000,      // Wait 10 seconds for pong response
      MAX_RETRIES: 10,          // Max reconnection attempts
      INITIAL_RETRY_DELAY: 1000, // Start with 1 second
      MAX_RETRY_DELAY: 30000,    // Max 30 seconds between retries
      DEBUG: process.env.NODE_ENV !== 'production'
    };

    // Connection state
    this.ws = null;
    this.listeners = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // Start with 1s, will increase exponentially
    this.pingInterval = null;
    this.lastPongTime = null;
    this.connectionId = null;
    this.pingTimeout = null;
    this.isAlive = false;
    
    // User context - Will be set in initialize()
    this.userId = null;
    this.isAuthenticated = false;
    
    // Will be set when initialize() is called
    this.connectionUrl = null;
    
    // Message queue
    this.pendingMessages = [];
    
    WebSocketManager.instance = this;
    
    // Expose to window for global access if running in browser
    if (typeof window !== 'undefined') {
      window.WebSocketManager = this;
    }
  }

  // ====================
  // Public API
  // ====================
  
  /**
   * Initialize WebSocket connection with user context
   * @param {Object} options - Connection options
   * @param {string} options.userId - User ID
   * @param {boolean} [options.isAuthenticated=false] - Whether the user is authenticated
   * @returns {Promise<void>}
   */
  async initialize({ userId, isAuthenticated = false } = {}) {
    // Set user context
    this.userId = userId || `guest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    this.isAuthenticated = isAuthenticated;
    
    // Generate connection URL with the user ID
    this.connectionUrl = this.getWebSocketUrl();
    
    this.log('Initializing WebSocket with user:', { 
      userId: this.userId, 
      isAuthenticated: this.isAuthenticated 
    });
    
    // Check connection state first
    if (this.connectionState === connectionStates.CONNECTED) {
      this.log('WebSocket already connected');
      return Promise.resolve();
    }
    
    if (this.connectionState === connectionStates.CONNECTING) {
      this.log('WebSocket connection already in progress');
      return new Promise((resolve) => {
        // Wait for connection to complete or fail
        const checkConnection = () => {
          if (this.connectionState === connectionStates.CONNECTED) {
            resolve();
          } else if (this.connectionState === connectionStates.DISCONNECTED) {
            this.connect().then(resolve).catch(console.error);
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }
    
    // If not connected or connecting, establish new connection
    return this.connect();
  }

  /**
   * Send a message through the WebSocket
   * @param {Object} data - Data to send
   * @returns {boolean} - Whether the message was sent or queued
   */
  send(data) {
    if (this.connectionState === connectionStates.CONNECTED && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
        return true;
      } catch (error) {
        this.error('Failed to send message:', error);
        this.queueMessage(data);
        return false;
      }
    } else {
      this.queueMessage(data);
      return false;
    }
  }

  /**
   * Subscribe to WebSocket events
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Close the WebSocket connection
   * @param {number} [code=1000] - Close code
   * @param {string} [reason] - Close reason
   */
  close(code = 1000, reason) {
    this.cleanup();
    if (this.ws) {
      this.ws.close(code, reason);
    }
    this.connectionState = connectionStates.DISCONNECTED;
  }

  // ====================
  // Internal Methods
  // ====================

  async connect() {
    if (this.ws) {
      this.ws.close();
    }

    try {
      this.ws = new WebSocket(this.connectionUrl);
      this.setupEventHandlers();
      
      // Set up ping/pong after connection is established
      this.ws.onopen = () => {
        this.setupPingInterval();
        this.processPendingMessages();
      };
    } catch (error) {
      this.error('WebSocket connection failed:', error);
      this.handleDisconnect();
    }
  }

  setupEventHandlers() {
    if (!this.ws) return;

    try {
      // Bind handlers once and store references for cleanup
      this._boundOnOpen = this.onOpen.bind(this);
      this._boundOnMessage = this.onmessage.bind(this);
      this._boundOnClose = this.onclose.bind(this);
      this._boundOnError = this.onerror.bind(this);
      
      // Set up standard WebSocket event handlers
      this.ws.onopen = this._boundOnOpen;
      this.ws.onmessage = this._boundOnMessage;
      this.ws.onclose = this._boundOnClose;
      this.ws.onerror = this._boundOnError;
      
      // For native WebSocket ping/pong events (if supported)
      if (typeof this.ws.addEventListener === 'function') {
        // Bind ping/pong handlers
        this._boundHandlePing = (event) => {
          this.log('Native ping received');
          this.handlePing(event);
        };
        
        this._boundHandlePong = (event) => {
          this.log('Native pong received');
          this.handlePong(event);
        };
        
        this.ws.addEventListener('ping', this._boundHandlePing);
        this.ws.addEventListener('pong', this._boundHandlePong);
      }
      
      // Set up ping interval for connection health checks
      this.setupPingInterval();
      
    } catch (error) {
      this.error('Error setting up WebSocket event handlers:', error);
    }
  }

  onOpen() {
    this.log('WebSocket connected');
    this.reconnectAttempts = 0;
    this.isAlive = true;
    this.lastPongTime = Date.now();
    
    // Set up ping interval for native WebSocket pings
    this.setupPingInterval();
      
    // Notify listeners of connection
    this.notify({ type: 'connection_state', state: 'connected' });
  }

  onmessage(event) {
    try {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (e) {
        // If it's not JSON, it might be a binary message or ping/pong
        if (event.data === '[object Blob]' || event.data === '[object ArrayBuffer]') {
          // Handle binary data if needed
          return;
        }
        throw e;
      }
      this.handleIncomingMessage(data);
    } catch (error) {
      this.error('Error parsing message:', error);
    }
  }

  onclose(event) {
    this.log(`WebSocket closed: ${event.code} ${event.reason || ''}`);
    this.cleanupConnection();
    this.handleDisconnect(event);
      
    // Notify listeners of disconnection
    this.notify({ 
      type: 'disconnected', 
      event: event ? {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      } : null,
      timestamp: Date.now(),
      reconnectAttempt: this.reconnectAttempts + 1,
      maxReconnectAttempts: this.maxReconnectAttempts
    });
  }

  onerror(error) {
    this.error('WebSocket error:', error);
    this.cleanupConnection();
    this.handleDisconnect();
      
    // Notify listeners of error
    this.notify({ 
      type: 'connection_error', 
      error: error.message,
      timestamp: Date.now()
    });
  }

  /**
   * Handle incoming WebSocket messages
   * @param {Object} data - Parsed message data
   */
  handleIncomingMessage(data) {
    try {
      // Handle ping/pong messages first
      if (data && typeof data === 'object') {
        if (data.type === 'ping') {
          this.handlePing(data);
          return;
        } else if (data.type === 'pong') {
          this.handlePong(data);
          return;
        }
      }
      
      // Forward all other messages to listeners
      this.notify(data);
    } catch (error) {
      this.error('Error handling incoming message:', error);
    }
  }

  /**
   * Handle incoming ping from server
   * We'll respond with a pong message
   */
  handlePing() {
    this.log('Received ping from server, sending pong');
    this.lastPongTime = Date.now();
    this.isAlive = true;
    this.sendPong();
  }

  /**
   * Handle incoming pong from server
   */
  handlePong() {
    const now = Date.now();
    this.lastPongTime = now;
    this.isAlive = true;
    this.isWaitingForPong = false;
    
    // Clear any pending ping timeout
    this.clearPingTimeout();
    
    if (this.config.DEBUG) {
      const rtt = now - (this.lastPingTime || now);
      this.log(`Received pong (RTT: ${rtt}ms)`);
    }
  }

  /**
   * Send a pong message to the server
   */
  sendPong() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'pong',
          timestamp: Date.now()
        }));
        this.log('Sent pong to server');
      } catch (error) {
        this.error('Failed to send pong:', error);
      }
    }
  }
  /**
   * Send a ping message to the server
   */
  sendPing() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        this.isWaitingForPong = true;
        this.lastPingTime = Date.now();
        this.log('Sent ping to server');
        
        // Set timeout for pong response
        this.clearPingTimeout();
        this.pingTimeout = setTimeout(() => {
          if (this.isWaitingForPong) {
            this.log('Pong timeout, reconnecting...');
            this.cleanupConnection();
            this.handleDisconnect();
          }
        }, this.config.PONG_TIMEOUT);
        
      } catch (error) {
        this.error('Failed to send ping:', error);
      }
    }
  }

  /**
   * Set up ping interval to monitor connection health
   * We'll send pings to the server and expect pongs in response
   * @private
   */
  setupPingInterval() {
    // Clear any existing interval
    this.clearPingInterval();
    
    // Don't set up if WebSocket is not in OPEN state
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    
    // Set initial state
    this.isAlive = true;
    this.isWaitingForPong = false;
    
    // Send initial ping
    this.sendPing();
    
    // Set up the interval to send pings
    this.pingInterval = setInterval(() => {
      if (!this.isWaitingForPong) {
        this.sendPing();
      } else {
        this.log('Skipping ping - waiting for pong from previous ping');
      }
    }, this.config.PING_INTERVAL);
    
    this.log(`Ping monitoring started (sending pings every ${this.config.PING_INTERVAL/1000}s, expecting pong within ${this.config.PONG_TIMEOUT/1000}s)`);
  }
  
  /**
   * Clear the ping interval and timeout
   */
  clearPingInterval() {
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Clear ping timeout
    this.clearPingTimeout();
  }
  
  /**
   * Clear the ping timeout
   */
  clearPingTimeout() {
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout);
      this.pingTimeout = null;
    }
  }

  async waitForConnection() {
    return new Promise((resolve, reject) => {
      if (!this.ws) {
        return reject(new Error('WebSocket not initialized'));
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000); // 10 second timeout

      const onOpen = () => {
        clearTimeout(timeout);
        this.ws?.removeEventListener('open', onOpen);
        resolve();
      };

      if (this.ws.readyState === WebSocket.OPEN) {
        onOpen();
      } else {
        this.ws.addEventListener('open', onOpen);
      }
    });
  }

  handleDisconnect(event) {
    this.log('Handling disconnect...', event);
    this.cleanupConnection();
    
    // Don't attempt to reconnect if this was a clean close from our side
    if (event && event.code === 1000 && event.wasClean) {
      this.log('Clean disconnect, not reconnecting');
      return;
    }
    
    // Notify listeners of disconnection
    this.notify({ 
      type: 'disconnected', 
      event: event ? {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean
      } : null,
      timestamp: Date.now(),
      reconnectAttempt: this.reconnectAttempts + 1,
      maxReconnectAttempts: this.maxReconnectAttempts
    });
    
    // Clear any existing reconnection timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    // Only attempt to reconnect if we're not already reconnecting
    // and we haven't exceeded max attempts
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      // Exponential backoff with jitter
      const baseDelay = Math.min(
        this.config.MAX_RETRY_DELAY, 
        this.config.INITIAL_RETRY_DELAY * Math.pow(1.5, this.reconnectAttempts)
      );
      const jitter = Math.random() * 1000; // Add up to 1 second of jitter
      const delay = Math.floor(baseDelay + jitter);
      
      this.reconnectAttempts++;
      
      this.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      this.reconnectTimeout = setTimeout(() => {
        this.log('Attempting to reconnect now...');
        this.connect();
      }, delay);
      
      // Notify of reconnection attempt
      this.notify({
        type: 'reconnecting',
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
        nextAttemptIn: delay,
        timestamp: Date.now()
      });
    } else {
      this.log('Max reconnection attempts reached');
      this.notify({ 
        type: 'connection_failed', 
        message: 'Max reconnection attempts reached',
        attempts: this.reconnectAttempts,
        timestamp: Date.now()
      });
    }
  }

  sendAuthUpdate() {
    if (!this.userId) return;
    
    this.send({
      type: 'auth',
      userId: this.userId,
      isAuthenticated: this.isAuthenticated,
      timestamp: Date.now()
    });
  }

  queueMessage(data) {
    if (this.pendingMessages.length > 50) {
      this.pendingMessages.shift(); // Remove oldest message if queue is full
    }
    this.pendingMessages.push(data);
  }

  processPendingMessages() {
    while (this.pendingMessages.length > 0 && this.isConnected) {
      const message = this.pendingMessages.shift();
      this.send(message);
    }
  }

  /**
   * Clean up all resources and close the WebSocket connection
   */
  cleanup() {
    this.clearPingInterval();
    
    // Clear any pending reconnection
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    // Clean up WebSocket connection
    this.cleanupConnection();
  }

  /**
   * Clean up the WebSocket connection
   */
  cleanupConnection() {
    // Clear any pending timeouts/intervals first
    this.clearPingInterval();
    
    if (!this.ws) return;
    
    // Store reference to ws before cleanup
    const ws = this.ws;
    this.ws = null;
    
    try {
      // Null all handlers to prevent memory leaks
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      
      // Remove event listeners if they exist
      if (typeof ws.removeEventListener === 'function') {
        if (this._boundHandlePing) {
          try { ws.removeEventListener('ping', this._boundHandlePing); } catch (e) {}
        }
        if (this._boundHandlePong) {
          try { ws.removeEventListener('pong', this._boundHandlePong); } catch (e) {}
        }
      }
      
      // Close the WebSocket if it's still open or connecting
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        try {
          ws.close(1000, 'Client closing');
        } catch (closeError) {
          console.warn('Error while closing WebSocket:', closeError);
        }
      }
    } catch (error) {
      console.error('Error during WebSocket cleanup:', error);
    } finally {
      // Ensure we clean up our references
      this.isAlive = false;
    }
  }

  getWebSocketUrl() {
    if (!this.userId) {
      throw new Error('Cannot generate WebSocket URL: userId is not set');
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const path = '/ws';
    const params = new URLSearchParams({
      userId: this.userId,
      isAuthenticated: String(this.isAuthenticated),
      v: '1.0' // Version for cache busting
    });

    const url = `${protocol}//${host}${path}?${params.toString()}`;
    this.log('Generated WebSocket URL:', url);
    return url;
  }

  notify(data) {
    if (!data) return;
    
    // Add timestamp if not present
    if (!data.timestamp) {
      data.timestamp = Date.now();
    }
    
    // Add connection ID if not present
    if (!data.connectionId && this.connectionId) {
      data.connectionId = this.connectionId;
    }
    
    // Notify all listeners
    for (const listener of this.listeners) {
      try {
        if (typeof listener === 'function') {
          listener(data);
        }
      } catch (error) {
        console.error('Error in WebSocket listener:', error);
      }
    }
  }

  log(...args) {
    if (this.config.DEBUG) {
      console.log('[WebSocket]', ...args);
    }
  }

  error(...args) {
    console.error('[WebSocket]', ...args);
  }

  /**
   * Update authentication state and reconnect if needed
   * @param {string} userId - New user ID
   * @param {boolean} isAuthenticated - Whether the user is authenticated
   * @returns {Promise<void>}
   */
  async updateAuthState(userId, isAuthenticated) {
    const authChanged = this.userId !== userId || this.isAuthenticated !== isAuthenticated;
    
    if (!authChanged) {
      this.log('Auth state unchanged, skipping update');
      return;
    }
    
    this.log('Updating auth state:', { userId, isAuthenticated });
    this.userId = userId || this.userId;
    this.isAuthenticated = isAuthenticated;
    
    // If connected, update the server with new auth state
    if (this.isConnected) {
      this.sendAuthUpdate();
    } else {
      // If not connected, reconnect with new auth state
      await this.connect();
    }
  }

  // Getters
  get isConnected() {
    return this.connectionState === connectionStates.CONNECTED && 
           this.ws?.readyState === WebSocket.OPEN;
  }
}

// Export the class for named imports
export { WebSocketManager };

// Also export a singleton instance as default
const webSocketManager = new WebSocketManager();
export default webSocketManager;