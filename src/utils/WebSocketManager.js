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
      PING_INTERVAL: 30000,     // 30 seconds between pings
      PONG_TIMEOUT: 10000,      // 10 seconds to wait for pong
      MAX_RETRIES: 5,           // Max reconnection attempts
      INITIAL_RETRY_DELAY: 1000, // Start with 1 second
      MAX_RETRY_DELAY: 30000,    // Max 30 seconds between retries
      DEBUG: process.env.NODE_ENV !== 'production'
    };

    // Connection state
    this.ws = null;
    this.connectionState = connectionStates.DISCONNECTED;
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
    this.pingInterval = null;
    this.lastPingTime = null;
    this.lastPongTime = null;
    
    // User context
    this.userId = null;
    this.isAuthenticated = false;
    
    // Event subscribers
    this.subscribers = new Set();
    this.pendingMessages = [];
    
    WebSocketManager.instance = this;
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
    this.userId = userId || this.userId || 'guest_' + Math.random().toString(36).substr(2, 9);
    this.isAuthenticated = isAuthenticated;
    
    if (this.connectionState === connectionStates.CONNECTED) {
      this.log('WebSocket already connected');
      return;
    }
    
    if (this.connectionState === connectionStates.CONNECTING) {
      this.log('WebSocket connection already in progress');
      return;
    }
    
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
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
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
      this.cleanup();
    }

    this.connectionState = connectionStates.CONNECTING;
    this.notify({ type: 'connecting' });

    const wsUrl = this.getWebSocketUrl();
    this.log(`Connecting to WebSocket: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);
      this.setupEventHandlers();
      await this.waitForConnection();
      this.setupPingPong();
      this.processPendingMessages();
    } catch (error) {
      this.error('WebSocket connection failed:', error);
      this.handleDisconnect();
    }
  }

  setupEventHandlers() {
    if (!this.ws) return;

    this.ws.onopen = () => {
      this.connectionState = connectionStates.CONNECTED;
      this.reconnectAttempts = 0;
      this.log('WebSocket connected');
      this.notify({ type: 'connected' });
      this.sendAuthUpdate();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleIncomingMessage(data);
      } catch (error) {
        this.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = (event) => {
      this.log(`WebSocket closed: ${event.code} ${event.reason || ''}`);
      this.handleDisconnect(event);
    };

    this.ws.onerror = (error) => {
      this.error('WebSocket error:', error);
      this.handleDisconnect();
    };
  }

  handleIncomingMessage(data) {
    if (data.type === 'pong') {
      this.lastPongTime = Date.now();
      this.log(`Pong received for ping ${data.pingId || 'unknown'}`);
      // Forward the pong to any listeners
      this.notify(data);
    } else if (data.type === 'ping') {
      this.log(`Ping received, sending pong for ping ${data.pingId || 'unknown'}`);
      this.send({ 
        type: 'pong', 
        pingId: data.pingId, 
        timestamp: Date.now() 
      });
    } else {
      this.notify(data);
    }
  }

  /**
   * Manually send a ping and wait for pong
   * @returns {Promise<boolean>} Whether pong was received
   */
  async ping() {
    if (!this.isConnected) {
      this.log('Cannot ping: WebSocket not connected');
      return false;
    }

    return new Promise((resolve) => {
      const pingId = Date.now();
      const timeout = setTimeout(() => {
        this.log(`Ping ${pingId} timed out`);
        resolve(false);
      }, this.config.PONG_TIMEOUT);

      const unsubscribe = this.subscribe((message) => {
        if (message.type === 'pong' && message.pingId === pingId) {
          clearTimeout(timeout);
          unsubscribe();
          this.log(`Pong received for ping ${pingId}`);
          resolve(true);
        }
      });

      try {
        this.send({ type: 'ping', pingId, timestamp: Date.now() });
        this.lastPingTime = Date.now();
      } catch (error) {
        this.error('Error sending ping:', error);
        clearTimeout(timeout);
        unsubscribe();
        resolve(false);
      }
    });
  }

  setupPingPong() {
    this.clearPingInterval();
    this.lastPingTime = Date.now();
    this.lastPongTime = Date.now();

    this.pingInterval = setInterval(async () => {
      if (this.connectionState !== connectionStates.CONNECTED || !this.ws) {
        return;
      }

      const now = Date.now();
      const timeSinceLastPong = now - this.lastPongTime;
      
      // Check if we missed a pong
      if (timeSinceLastPong > this.config.PONG_TIMEOUT) {
        this.log(`No pong received in ${timeSinceLastPong}ms (timeout: ${this.config.PONG_TIMEOUT}ms), reconnecting...`);
        this.handleDisconnect();
        return;
      }

      // Send ping and wait for pong
      try {
        this.log('Sending ping...');
        const pongReceived = await this.ping();
        if (!pongReceived) {
          this.log('Ping failed, reconnecting...');
          this.handleDisconnect();
        }
      } catch (error) {
        this.error('Error in ping/pong:', error);
        this.handleDisconnect();
      }
    }, this.config.PING_INTERVAL);
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
    if (this.connectionState === connectionStates.DISCONNECTED) {
      return;
    }

    this.cleanup();
    this.connectionState = connectionStates.DISCONNECTED;
    this.notify({ type: 'disconnected', event });

    if (this.reconnectAttempts < this.config.MAX_RETRIES) {
      this.attemptReconnect();
    } else {
      this.connectionState = connectionStates.ERROR;
      this.notify({ 
        type: 'error', 
        message: 'Max reconnection attempts reached' 
      });
    }
  }

  attemptReconnect() {
    this.connectionState = connectionStates.RECONNECTING;
    this.reconnectAttempts++;
    
    const delay = Math.min(
      this.config.INITIAL_RETRY_DELAY * Math.pow(2, this.reconnectAttempts - 1),
      this.config.MAX_RETRY_DELAY
    );

    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.MAX_RETRIES})`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(error => {
        this.error('Reconnection failed:', error);
        this.handleDisconnect();
      });
    }, delay);
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

  cleanup() {
    this.clearPingInterval();
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client closed');
      }
      
      this.ws = null;
    }
  }

  clearPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const path = '/ws';
    const params = new URLSearchParams({
      userId: this.userId,
      isAuthenticated: this.isAuthenticated ? 'true' : 'false',
      v: '1.0' // Version for cache busting
    });

    return `${protocol}//${host}${path}?${params.toString()}`;
  }

  notify(message) {
    this.subscribers.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        console.error('Error in WebSocket subscriber:', error);
      }
    });
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

// Export a singleton instance
export const webSocketManager = new WebSocketManager();
export default webSocketManager;