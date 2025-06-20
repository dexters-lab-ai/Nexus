// WebSocketManager.js - Refactored and cleaned up
import { api } from './api';
const connectionStates = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
};

class WebSocketManager {
  static instance = null;
  
  constructor(options = {}) {
    if (WebSocketManager.instance) {
      // If we already have an instance, update its config and return it
      Object.assign(WebSocketManager.instance.config, options);
      return WebSocketManager.instance;
    }

    // Default configuration
    const defaultConfig = {
      PING_INTERVAL: 25000,       // Send ping every 25 seconds
      PONG_TIMEOUT: 10000,        // Wait 10 seconds for pong response
      MAX_RETRIES: 10,            // Max reconnection attempts
      INITIAL_RETRY_DELAY: 1000,  // Start with 1 second
      MAX_RETRY_DELAY: 30000,     // Max 30 seconds between retries
      // Session check configuration
      SESSION_CHECK_INTERVAL: 120000, // Default: check session every 2 minutes
      MIN_SESSION_CHECK_INTERVAL: 30000, // Minimum allowed interval (30s)
      MAX_SESSION_CHECK_INTERVAL: 600000, // Maximum allowed interval (10min)
      SESSION_CHECK_RETRY_DELAY: 30000, // Retry delay after failed validation (30s)
      MAX_SESSION_VALIDATION_ATTEMPTS: 2, // Max consecutive validation failures
      // Allow environment variable override
      ...(process.env.REACT_APP_WS_SESSION_CHECK_INTERVAL && {
        SESSION_CHECK_INTERVAL: parseInt(process.env.REACT_APP_WS_SESSION_CHECK_INTERVAL, 10) || 120000
      }),
      DEBUG: process.env.NODE_ENV !== 'production' || process.env.REACT_APP_DEBUG_WS === 'true'
    };
    
    // Merge user options with defaults
    this.config = { ...defaultConfig, ...options };
    
    // Ensure session check interval is within bounds
    this.config.SESSION_CHECK_INTERVAL = Math.max(
      this.config.MIN_SESSION_CHECK_INTERVAL,
      Math.min(
        this.config.SESSION_CHECK_INTERVAL,
        this.config.MAX_SESSION_CHECK_INTERVAL
      )
    );

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
  // Visibility Handlers
  // ====================
  
  /**
   * Set up visibility change handlers to handle page visibility changes
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
      } else if (document.visibilityState === 'hidden') {
        this.log('Page hidden, cleaning up resources...');
        this.clearPingInterval();
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
  
  // ====================
  // Logging
  // ====================
  
  /**
   * Log a message to the console if debugging is enabled
   * @param {...any} args - Arguments to log
   * @private
   */
  log(...args) {
    if (this.config.DEBUG) {
      console.log('[WebSocket]', ...args);
    }
  }
  
  /**
   * Log an error message to the console
   * @param {...any} args - Arguments to log as error
   * @private
   */
  error(...args) {
    console.error('[WebSocket]', ...args);
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
      
      // Generate connection URL
      try {
        this.connectionUrl = this.constructWebSocketUrl();
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
      } catch (error) {
        this.error('Failed to initialize WebSocket URL:', error);
        return Promise.reject(error);
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
    if (this.isConnected) {
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

  /**
   * Notify all listeners of an event
   * @param {Object} data - Event data to send to listeners
   */
  notify(data) {
    this.listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in WebSocket listener:', error);
      }
    });
  }

  /**
   * Construct WebSocket URL with proper protocol and query parameters
   * @private
   * @returns {string} The WebSocket URL as a string
   */
  constructWebSocketUrl() {
    try {
      // Get base URL from environment or current host
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      
      // Create base URL
      const baseUrl = `${protocol}//${host}`;
      
      // Create URL object with WebSocket endpoint
      const url = new URL('/ws', baseUrl);
      
      // Add version for future compatibility
      url.searchParams.append('v', '1.1');
      
      // Add authentication token if available
      const token = localStorage.getItem('authToken');
      if (token) {
        url.searchParams.append('token', token);
      }
      
      // Generate a unique connection ID for this session if we don't have one
      if (!this.connectionId) {
        this.connectionId = `client-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      // Add connection ID to URL
      url.searchParams.append('connectionId', this.connectionId);
      
      return url.toString();
    } catch (error) {
      this.error('Error constructing WebSocket URL:', error);
      throw new Error(`Failed to construct WebSocket URL: ${error.message}`);
    }
  }

  async connect() {
    // If already connected, return
    if (this.isConnected) {
      this.log('WebSocket already connected');
      return;
    }
    
    // If connecting, wait for the connection to complete or fail
    if (this.isConnecting) {
      this.log('WebSocket connection in progress, waiting...');
      try {
        await this.waitForConnection(5000); // Wait up to 5 seconds
        if (this.isConnected) {
          this.log('WebSocket connected after wait');
          return;
        }
      } catch (error) {
        this.log('Error waiting for connection:', error);
      }
    }
    
    // Clean up any existing connection before creating a new one
    this.cleanupConnection();
    
    // Set connecting state
    this.connectionState = connectionStates.CONNECTING;
    
    try {
      // Construct WebSocket URL
      const wsUrl = this.constructWebSocketUrl();
      
      this.log('Connecting to WebSocket...', { url: wsUrl });
      
      // Create WebSocket connection
      this.ws = new WebSocket(wsUrl);
      
      // Set up event handlers
      this.setupEventHandlers();
      
      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.connectionState !== connectionStates.CONNECTED) {
          this.error('Connection timeout');
          this.handleDisconnect({ code: 4001, reason: 'Connection timeout', wasClean: false });
        }
      }, 10000); // 10 second connection timeout
      
      // Handle successful connection
      this.ws.onopen = () => {
        clearTimeout(this.connectionTimeout);
        this.connectionState = connectionStates.CONNECTED;
        this.isAlive = true;
        this.lastPongTime = Date.now();
        this.reconnectAttempts = 0;
        
        this.log('WebSocket connected, setting up ping interval');
        this.setupPingInterval();
        this.processPendingMessages();
        
        // If we have a user ID, send authentication
        if (this.userId) {
          this.sendAuthUpdate();
        }
        
        // Set up session validation interval
        this.setupSessionCheck();
        
        // Notify listeners of connection
        this.notify({ type: 'connection_state', state: 'connected' });
      };
      
    } catch (error) {
      this.error('WebSocket connection failed:', error);
      this.handleDisconnect({ code: 4000, reason: error.message, wasClean: false });
    }
  }

  get isConnected() {
    return this.connectionState === connectionStates.CONNECTED && 
           this.ws?.readyState === WebSocket.OPEN;
  }
  
  get isConnecting() {
    return this.connectionState === connectionStates.CONNECTING || 
           (this.ws && this.ws.readyState === WebSocket.CONNECTING);
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
      // Handle different message types
      switch (data.type) {
        case 'pong':
          // Handle application-level pong (if not using WebSocket protocol pings)
          this.handlePong();
          break;
          
        case 'ping':
          // Respond to server pings (though we prefer client-side pings)
          this.sendPong();
          break;
          
        // Add other message types as needed
        default:
          this.log('Unhandled message type:', data.type);
          break;
      }
    } catch (error) {
      this.error('Error handling message:', error, data);
    }
  }

  /**
   * Handle incoming pong from server
   */
  handlePong() {
    this.clearPingTimeout();
    this.isWaitingForPong = false;
    this.lastPongTime = Date.now();
    this.isAlive = true;
    
    // Calculate and log the round-trip time if we have a last ping time
    if (this.lastPingTime) {
      const rtt = Date.now() - this.lastPingTime;
      this.log(`Received pong from server (RTT: ${rtt}ms)`);
    } else {
      this.log('Received pong from server');
    }
  }

  // ... (rest of the class remains the same)

  /**
   * Clean up the WebSocket connection
   */
  cleanupConnection() {
    this.log('Cleaning up WebSocket connection');
    
    // Clear any pending ping/pong timeouts
    this.clearPingInterval();
    this.clearPingTimeout();
    
    // Clear any pending reconnection attempts
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    // Close the WebSocket connection if it exists
    if (this.ws) {
      try {
        // Save a reference to the WebSocket to avoid race conditions
        const ws = this.ws;
        this.ws = null;
        
        // Remove all event listeners to prevent memory leaks
        if (typeof ws.removeAllListeners === 'function') {
          ws.removeAllListeners();
        }
        
        // Nullify all handlers
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        
        // Only close if not already closed
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'Cleanup');
        }
      } catch (error) {
        this.error('Error during WebSocket cleanup:', error);
      } finally {
        this.connectionState = connectionStates.DISCONNECTED;
      }
    }
    
    // Clean up visibility handlers
    this.removeVisibilityHandlers();
  }

  // ... (rest of the class remains the same)
}

// Create a single instance of WebSocketManager
const createWebSocketManager = (options = {}) => {
  if (WebSocketManager.instance) {
    // Update config if instance exists
    if (WebSocketManager.instance.log) {
      WebSocketManager.instance.log('Using existing WebSocketManager instance');
    } else {
      console.log('[WebSocket] Using existing WebSocketManager instance');
    }
    Object.assign(WebSocketManager.instance.config, options);
    return WebSocketManager.instance;
  }
  
  const instance = new WebSocketManager(options);
  WebSocketManager.instance = instance;
  
  // Clean up on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      if (instance.cleanup) {
        instance.cleanup(true);
      }
    });
  }
  
  return instance;
};

// Also export a singleton instance as default
export const webSocketManager = createWebSocketManager();

export default webSocketManager;