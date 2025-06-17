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
      SESSION_CHECK_INTERVAL: 30000, // Check session every 30 seconds
      DEBUG: process.env.NODE_ENV !== 'production'
    };

    // Connection state
    this.ws = null;
    this.listeners = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10; // Increased from 5 to 10
    this.reconnectDelay = 1000; // Start with 1s, will increase exponentially
    this.pingInterval = null;
    this.lastPongTime = null;
    this.connectionId = null;
    this.pingTimeout = null;
    this.isAlive = false;
    this.isReconnecting = false;
    this.visibilityChangeHandler = null;
    this.sessionCheckInterval = null;
    this.lastSessionCheck = 0;
    
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
      this.setupVisibilityHandlers();
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
    try {
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
        this.log('WebSocket already connected, re-authenticating...');
        this.sendAuthUpdate();
        return Promise.resolve();
      }
      
      if (this.connectionState === connectionStates.CONNECTING) {
        this.log('WebSocket connection already in progress, waiting...');
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Connection timeout'));
          }, 10000); // 10 second timeout
          
          // Wait for connection to complete or fail
          const checkConnection = () => {
            if (this.connectionState === connectionStates.CONNECTED) {
              clearTimeout(timeout);
              resolve();
            } else if (this.connectionState === connectionStates.DISCONNECTED) {
              clearTimeout(timeout);
              this.connect()
                .then(resolve)
                .catch(reject);
            } else {
              setTimeout(checkConnection, 100);
            }
          };
          checkConnection();
        });
      }
      
      // If not connected or connecting, establish new connection
      return this.connect();
    } catch (error) {
      this.error('Error initializing WebSocket:', error);
      throw error;
    }
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
    // Clean up any existing connection
    this.cleanupConnection();
    
    // Reset connection state
    this.connectionState = connectionStates.CONNECTING;
    this.isAlive = false;
    
    try {
      // Create new WebSocket connection with authentication token if available
      const token = localStorage.getItem('authToken');
      const url = token ? `${this.connectionUrl}?token=${encodeURIComponent(token)}` : this.connectionUrl;
      
      this.log('Connecting to WebSocket...', { url: this.connectionUrl });
      this.ws = new WebSocket(url);
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.connectionState !== connectionStates.CONNECTED) {
          this.error('Connection timeout');
          this.handleDisconnect({ code: 4001, reason: 'Connection timeout', wasClean: false });
        }
      }, 10000); // 10 second connection timeout
      
      // Handle successful connection
      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.log('WebSocket connected, setting up ping interval');
        this.setupPingInterval();
        this.processPendingMessages();
        
        // If we have a user ID, send authentication
        if (this.userId) {
          this.sendAuthUpdate();
        }
        
        // Set up session validation interval
        this.setupSessionCheck();
      };
      
    } catch (error) {
      this.error('WebSocket connection failed:', error);
      this.handleDisconnect({ code: 4000, reason: error.message, wasClean: false });
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

  /**
   * Handle WebSocket disconnection with reconnection logic
   * @param {CloseEvent} event - The close event
   */
  async handleDisconnect(event = {}) {
    // Prevent multiple reconnection attempts
    if (this.isReconnecting) {
      this.log('Already attempting to reconnect, skipping duplicate attempt');
      return;
    }
    
    this.isReconnecting = true;
    this.log('Handling disconnect...', event);
    
    // Clean up the existing connection
    this.cleanupConnection();
    
    // Don't attempt to reconnect if this was a clean close from our side
    if (event && event.code === 1000 && event.wasClean) {
      this.log('Clean disconnect, not reconnecting');
      this.isReconnecting = false;
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
    this.log('Cleaning up WebSocket manager');
    this.cleanupConnection();
    this.listeners.clear();
    this.pendingMessages = [];
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    this.clearPingInterval();
    this.clearPingTimeout();
    this.clearSessionCheck();
    this.removeVisibilityHandlers();
    
    this.isReconnecting = false;
    this.reconnectAttempts = 0;
  }
  
  /**
   * Validate the current session with the server
   * @returns {Promise<boolean>} True if session is valid or validation is not available
   */
  async validateSession() {
    // Skip validation if we're in the middle of reconnecting
    if (this.isReconnecting) {
      this.log('Skipping session validation during reconnection');
      return true;
    }

    try {
      const apiBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? `http://${window.location.hostname}:3420`
        : window.location.origin;
      
      this.log('Validating session...');
      const response = await fetch(`${apiBase}/api/validate-session`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        // If the endpoint doesn't exist (404), treat as validation passed
        if (response.status === 404) {
          this.log('Session validation endpoint not found, skipping validation');
          return true;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      return data.valid === true;
    } catch (error) {
      // For network errors or missing endpoints, log but continue
      this.log('Session validation not available, continuing without it');
      return true;
    }
  }
  
  /**
   * Set up session validation interval
   * @private
   */
  setupSessionCheck() {
    // Clear any existing interval first
    this.clearSessionCheck();
    
    // Skip if we're already reconnecting
    if (this.isReconnecting) {
      this.log('Skipping session check setup during reconnection');
      return;
    }
    
    this.log('Setting up session validation check');
    
    this.sessionCheckInterval = setInterval(async () => {
      try {
        // Skip if we're reconnecting
        if (this.isReconnecting) {
          this.log('Skipping session check - currently reconnecting');
          return;
        }
        
        const now = Date.now();
        // Only check session if we haven't checked recently
        if (now - this.lastSessionCheck > this.config.SESSION_CHECK_INTERVAL) {
          this.log('Performing session validation check');
          const isValid = await this.validateSession();
          this.lastSessionCheck = now;
          
          if (!isValid) {
            this.log('Session is no longer valid, triggering reconnection');
            this.notify({ type: 'session_expired' });
            this.cleanupConnection();
            this.initialize();
          }
        }
      } catch (error) {
        // Don't treat validation errors as fatal
        this.log('Non-fatal error during session check:', error.message);
      }
    }, this.config.SESSION_CHECK_INTERVAL);
  }
  
  /**
   * Clear the session check interval
   * @private
   */
  clearSessionCheck() {
    if (this.sessionCheckInterval) {
      clearInterval(this.sessionCheckInterval);
      this.sessionCheckInterval = null;
    }
  }
  
  /**
   * Set up visibility change handlers
   * @private
   */
  setupVisibilityHandlers() {
    if (typeof document === 'undefined') return;
    
    this.visibilityChangeHandler = () => {
      if (document.visibilityState === 'visible') {
        this.log('Page became visible, checking connection...');
        if (!this.isConnected) {
          this.initialize();
        }
      }
    };
    
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }
  
  /**
   * Remove visibility change handlers
   * @private
   */
  removeVisibilityHandlers() {
    if (this.visibilityChangeHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
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