// WebSocket Manager with enhanced reliability and authentication support
export const WebSocketManager = {
    // Initialize with default values
    _initialized: false,
    ws: null,
    subscribers: new Set(),
    isConnected: false,
    reconnectAttempts: 0,
    MAX_RETRIES: 10, // Increased max retries
    INITIAL_RETRY_DELAY: 1000, // Start with 1 second
    MAX_RETRY_DELAY: 30000, // Max 30 seconds between retries
    currentUserId: null,
    isAuthenticated: false,
    connectionPromise: null,
    connectionTimeout: null,
    reconnectTimeout: null,
    debug: process.env.NODE_ENV !== 'production',
    lastPingTime: null,
    PING_INTERVAL: 60000, // 60 seconds between pings
    PONG_TIMEOUT: 30000,    // 30 seconds to wait for pong before reconnecting
    CONNECTION_TIMEOUT: 10000, // 10 seconds connection timeout
    lastPongTime: null,     // Track last pong received
    pendingAuthUpdates: [], // Queue for auth updates that need to be sent after connection

    log(...args) {
      if (this.debug) {
        console.log('[WebSocket]', ...args);
      }
    },
    
    /**
     * Sends an authentication update to the server
     * @private
     */
    async sendAuthUpdate(userId, isAuthenticated) {
      if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.log('Queueing auth update - not connected');
        this.pendingAuthUpdates.push({ userId, isAuthenticated });
        return false;
      }
      
      try {
        const message = {
          type: 'update_auth_state',
          userId,
          isAuthenticated,
          timestamp: Date.now()
        };
        
        this.log('Sending auth update:', message);
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        this.error('Failed to send auth update:', error);
        this.pendingAuthUpdates.push({ userId, isAuthenticated });
        return false;
      }
    },

    error(...args) {
      console.error('[WebSocket]', ...args);
    },

    /**
     * Process any pending authentication updates
     * @private
     */
    processPendingAuthUpdates() {
      if (!this.pendingAuthUpdates.length) return;
      
      this.log(`Processing ${this.pendingAuthUpdates.length} pending auth updates`);
      
      // Process all pending updates
      while (this.pendingAuthUpdates.length > 0) {
        const update = this.pendingAuthUpdates.shift();
        if (update) {
          this.sendAuthUpdate(update.userId, update.isAuthenticated)
            .catch(error => {
              this.error('Error processing pending auth update:', error);
              // Re-queue the failed update
              this.pendingAuthUpdates.unshift(update);
              return false;
            });
        }
      }
    },
    
    cleanup() {
      this.log('Cleaning up WebSocket connection');
      this.clearTimeouts();
      this.clearPingInterval();
      
      if (this.ws) {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onmessage = null;
        this.ws.onerror = null;
        
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
        
        this.ws = null;
      }
      
      this.isConnected = false;
    },
    
    clearTimeouts() {
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }
      
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
    },
    
    clearPingInterval() {
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
        this.pingInterval = null;
      }
      this.lastPingTime = null;
      this.lastPongTime = null;
      // Remove pong handler
      if (this.ws) {
        this.ws.onpong = null;
      }
    },
    
    setupPing() {
      this.clearPingInterval();
      
      this.lastPingTime = Date.now();
      this.lastPongTime = Date.now();
      
      // Setup ping interval
      this.pingInterval = setInterval(() => {
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            // Check if we've missed too many pongs
            if (Date.now() - this.lastPongTime > (this.PING_INTERVAL + this.PONG_TIMEOUT)) {
              this.log('No pong received, reconnecting...');
              this.handleDisconnect();
              return;
            }
            
            // Send ping and update last ping time
            this.ws.ping();
            this.lastPingTime = Date.now();
            
          } catch (error) {
            this.error('Error in ping interval:', error);
            this.handleDisconnect();
          }
        }
      }, this.PING_INTERVAL);
      
      // Setup pong handler
      if (this.ws) {
        this.ws.onpong = () => {
          this.lastPongTime = Date.now();
          this.log('Pong received');
        };
      }
    },
    
    getWebSocketUrl(userId, isAuthenticated) {
      // Use environment variable if available, otherwise construct from current host
      let wsUrl = window.__ENV__?.wsUrl || 
                `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:${window.location.port || (window.location.protocol === 'https:' ? '443' : '80')}/ws`;
      
      // Ensure URL ends with /ws
      if (!wsUrl.endsWith('/ws')) {
        wsUrl = wsUrl.endsWith('/') ? `${wsUrl}ws` : `${wsUrl}/ws`;
      }
      
      const separator = wsUrl.includes('?') ? '&' : '?';
      wsUrl = `${wsUrl}${separator}userId=${encodeURIComponent(userId)}`;
      
      if (isAuthenticated) {
        wsUrl += '&authenticated=true';
      }
      
      return wsUrl;
    },
    
    handleDisconnect() {
      this.isConnected = false;
      this.cleanup();
      this.notify({ type: 'connection', status: 'disconnected', isAuthenticated: this.isAuthenticated });
      this.attemptReconnect();
    },
    
    attemptReconnect() {
      if (this.reconnectAttempts >= this.MAX_RETRIES) {
        this.error('Max reconnection attempts reached');
        this.notify({ 
          type: 'connection', 
          status: 'error', 
          error: 'max_retries_reached',
          message: 'Max reconnection attempts reached',
          isAuthenticated: this.isAuthenticated 
        });
        return;
      }
      
      if (!this.currentUserId) {
        this.log('No user ID available for reconnection');
        return;
      }
      
      this.reconnectAttempts++;
      
      // Exponential backoff with jitter
      const baseDelay = Math.min(
        this.INITIAL_RETRY_DELAY * Math.pow(2, this.reconnectAttempts - 1),
        this.MAX_RETRY_DELAY
      );
      const jitter = Math.random() * 1000; // Add up to 1s jitter
      const delay = Math.min(baseDelay + jitter, this.MAX_RETRY_DELAY);
      
      this.log(`Reconnecting in ${Math.round(delay)}ms... (${this.reconnectAttempts}/${this.MAX_RETRIES})`);
      
      this.reconnectTimeout = setTimeout(() => {
        this.init(this.currentUserId, this.isAuthenticated).catch(error => {
          this.error('Reconnection attempt failed:', error);
        });
      }, delay);
    },

    /**
     * Initialize WebSocket connection with authentication
     * @param {string} userId - The user ID to connect with
     * @param {boolean} isAuthenticated - Whether the user is authenticated
     * @returns {Promise} Resolves when connected, rejects on error
     */
    async init(userId, isAuthenticated = false) {
      // If already connected with same auth state, do nothing
      if (this.ws && this.isConnected && this.isAuthenticated === isAuthenticated && this.currentUserId === userId) {
        this.log('Already connected with same auth state');
        return Promise.resolve();
      }

      // If we have a connection in progress with different auth state, queue the update
      if (this.connectionPromise && (this.isAuthenticated !== isAuthenticated || this.currentUserId !== userId)) {
        this.log('Queuing auth state update for after connection');
        this.pendingAuthUpdates.push({ userId, isAuthenticated });
        return this.connectionPromise;
      }

      // Clean up any existing connection
      this.cleanup();
      this.clearTimeouts();

      this.currentUserId = userId;
      this.isAuthenticated = isAuthenticated;
      
      // If we already have a connection in progress, return that promise
      if (this.connectionPromise) {
        this.log('Connection already in progress, returning existing promise');
        return this.connectionPromise;
      }

      this.connectionPromise = new Promise((resolve, reject) => {
        const wsUrl = this.getWebSocketUrl(userId, isAuthenticated);
        this.log(`Attempting ${isAuthenticated ? 'authenticated' : 'guest'} connection to:`, wsUrl);
        
        try {
          this.ws = new WebSocket(wsUrl);
          
          // Set up connection timeout
          this.connectionTimeout = setTimeout(() => {
            if (!this.isConnected) {
              this.error('Connection timeout');
              this.cleanup();
              this.notify({ 
                type: 'connection', 
                status: 'error', 
                error: 'timeout',
                message: 'Connection timeout',
                isAuthenticated 
              });
              reject(new Error('Connection timeout'));
            }
          }, this.CONNECTION_TIMEOUT);
          
          this.ws.onopen = () => {
            this.clearTimeouts();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            
            // Process any pending auth updates
            this.processPendingAuthUpdates();
            
            // Send initial auth state if we have one
            if (this.currentUserId) {
              this.sendAuthUpdate(this.currentUserId, this.isAuthenticated);
            }
            this.log(`${isAuthenticated ? 'Authenticated' : 'Guest'} connection established`);
            this.setupPing();
            // Set up message handler
            this.ws.onmessage = (event) => {
              try {
                const data = JSON.parse(event.data);
                
                // Handle auth state acknowledgements
                if (data.type === 'auth_state_updated') {
                  this.log('Auth state updated on server:', data);
                  this.isAuthenticated = data.isAuthenticated;
                  this.currentUserId = data.userId;
                }
                
                // Notify subscribers about the message
                this.notify(data);
              } catch (error) {
                this.error('Error parsing message:', error, event.data);
              }
            };
            
            // Notify about successful connection
            this.notify({ 
              type: 'connection', 
              status: 'connected',
              isAuthenticated,
              timestamp: Date.now() 
            });
            
            resolve();
          };
      
          this.ws.onclose = (event) => {
            this.clearTimeouts();
            this.log(`${isAuthenticated ? 'Authenticated' : 'Guest'} connection closed`, event);
            
            // If we were connected, try to reconnect
            if (this.isConnected) {
              this.handleDisconnect();
            } else {
              // If we were trying to connect, reject the promise
              if (this.connectionPromise) {
                const error = new Error(`Connection closed: ${event.reason || 'Unknown reason'}`);
                error.code = event.code;
                reject(error);
              }
            }
            
            this.connectionPromise = null;
          };
      
          this.ws.onerror = (error) => {
            this.clearTimeouts();
            this.error('WebSocket error:', error);
            
            if (this.connectionPromise) {
              reject(error);
              this.connectionPromise = null;
            }
            
            this.handleDisconnect();
          };
          
        } catch (error) {
          this.clearTimeouts();
          this.error('Error creating WebSocket:', error);
          reject(error);
          this.connectionPromise = null;
          this.handleDisconnect();
        }
      });

      return this.connectionPromise.finally(() => {
        this.connectionPromise = null;
      });
    },

    /**
     * Updates the authentication state and manages WebSocket reconnection if needed
     * @param {string} userId - The user ID to authenticate with
     * @param {boolean} isAuthenticated - Whether the user is authenticated
     * @returns {Promise<void>} Resolves when the update is complete
     * @throws {Error} If there's an error during the update process
     */
    async updateAuthState(userId, isAuthenticated) {
      // Normalize inputs
      const newUserId = userId || 'guest';
      
      // Skip if no meaningful change
      if (this.isAuthenticated === isAuthenticated && this.currentUserId === newUserId) {
        this.log('Auth state unchanged, skipping update');
        return;
      }

      const wasAuthenticated = this.isAuthenticated;
      const previousUserId = this.currentUserId;
      
      // Update local state first
      this.isAuthenticated = isAuthenticated;
      this.currentUserId = newUserId;
      
      this.log(`Auth state changed: ${previousUserId} -> ${this.currentUserId}, auth: ${wasAuthenticated} -> ${isAuthenticated}`);
      
      try {
        // If we have an active connection, try to update it
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.log('Sending auth update to server...');
          await this._sendAuthUpdate();
        } 
        // If no connection or connection closed, reconnect with new auth state
        else {
          this.log('No active connection, reconnecting with new auth state...');
          await this.reconnect();
          return;
        }
        
        // If we're still connected after the update, we need to fully reconnect
        if (this.isConnected) {
          this.log('Reinitializing connection with new auth state...');
          this.cleanup();
          await this.init(this.currentUserId, this.isAuthenticated);
        }
      } catch (error) {
        this.log(`Error updating auth state: ${error.message}`, 'error');
        // Re-throw to allow callers to handle the error
        throw error;
      }
    },

    /**
     * Sends authentication update to the WebSocket server
     * @private
     * @returns {Promise<void>}
     */
    _sendAuthUpdate() {
      return new Promise((resolve, reject) => {
        try {
          const authMessage = {
            type: 'auth_update',
            userId: this.currentUserId,
            isAuthenticated: this.isAuthenticated,
            timestamp: Date.now()
          };
          
          this.ws.send(JSON.stringify(authMessage), (error) => {
            if (error) {
              this.log(`Failed to send auth update: ${error.message}`, 'error');
              reject(error);
            } else {
              this.log('Auth update sent successfully');
              resolve();
            }
          });
        } catch (error) {
          this.log(`Error in _sendAuthUpdate: ${error.message}`, 'error');
          reject(error);
        }
      });
    },
  
    subscribe(callback) {
      this.subscribers.add(callback);
      return () => this.unsubscribe(callback);
    },
  
    unsubscribe(callback) {
      this.subscribers.delete(callback);
    },
  
    notify(data) {
      // Add timestamp if not present
      const message = { ...data };
      if (!message.timestamp) {
        message.timestamp = Date.now();
      }
      
      // Notify all subscribers
      for (const callback of this.subscribers) {
        try {
          callback(message);
        } catch (error) {
          this.error('Error in WebSocket subscriber:', error);
        }
      }
    },
  
    send(data, { queueIfDisconnected = true } = {}) {
      // If not connected but queuing is enabled, queue the message
      if (!this.isConnected && queueIfDisconnected) {
        this.log('Queueing message (disconnected):', data.type || 'unknown');
        return new Promise((resolve, reject) => {
          // Try to send when connected
          const onConnected = () => {
            this.unsubscribe(onConnected);
            this.send(data, { queueIfDisconnected: false })
              .then(resolve)
              .catch(reject);
          };
          
          this.subscribe(onConnected);
          
          // If not connected within 10 seconds, reject
          setTimeout(() => {
            this.unsubscribe(onConnected);
            reject(new Error('Failed to send message: connection timeout'));
          }, 10000);
        });
      }
      
      // If connected, send immediately
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          const message = JSON.stringify(data);
          this.ws.send(message);
          this.log('Message sent:', data.type || 'unknown');
          return Promise.resolve();
        } catch (error) {
          this.error('Error sending message:', error);
          return Promise.reject(error);
        }
      }
      
      this.error('Cannot send message - not connected');
      return Promise.reject(new Error('Not connected to WebSocket server'));
    },
    
    // Close the connection cleanly
    close() {
      this.log('Closing WebSocket connection');
      this.cleanup();
      this.currentUserId = null;
      this.isAuthenticated = false;
      this.connectionPromise = null;
      this.reconnectAttempts = 0;
    },
    
    /**
     * Initialize the WebSocket connection
     * @param {Object} options - Configuration options
     * @param {string} [options.userId] - Optional user ID for initial connection
     * @param {boolean} [options.isAuthenticated=false] - Whether the user is authenticated
     * @returns {Promise} Resolves when connected
     */
    initialize: async function(options = {}) {
      if (this._initialized) {
        this.log('WebSocketManager already initialized');
        return Promise.resolve();
      }
      
      this._initialized = true;
      const { userId, isAuthenticated = false } = options;
      
      // If no userId provided, generate a guest ID
      const connectionUserId = userId || `guest_${Math.random().toString(36).substr(2, 9)}`;
      
      this.log('Initializing WebSocket connection for user:', connectionUserId);
      
      try {
        await this.init(connectionUserId, isAuthenticated);
        this.log('WebSocket connection initialized successfully');
        return Promise.resolve();
      } catch (error) {
        this.error('Failed to initialize WebSocket connection:', error);
        return Promise.reject(error);
      }
    }
  };

// Make available globally for backward compatibility
if (typeof window !== 'undefined') {
  window.WebSocketManager = WebSocketManager;
  
  // Initialize with default guest connection
  WebSocketManager.initialize().catch(error => {
    console.error('Failed to initialize WebSocket connection:', error);
  });
}

export default WebSocketManager;