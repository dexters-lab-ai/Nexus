// WebSocket Manager with enhanced reliability
export const WebSocketManager = {
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
    PING_INTERVAL: 25000, // 25 seconds
    CONNECTION_TIMEOUT: 10000, // 10 seconds

    log(...args) {
      if (this.debug) {
        console.log('[WebSocket]', ...args);
      }
    },

    error(...args) {
      console.error('[WebSocket]', ...args);
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
    },
    
    setupPing() {
      this.clearPingInterval();
      
      this.lastPingTime = Date.now();
      
      // Send ping every PING_INTERVAL ms
      this.pingInterval = setInterval(() => {
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
          try {
            this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            this.lastPingTime = Date.now();
          } catch (error) {
            this.error('Error sending ping:', error);
            this.handleDisconnect();
          }
        }
      }, this.PING_INTERVAL);
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

    async init(userId, isAuthenticated = false) {
      // If already connected with same auth state, do nothing
      if (this.ws && this.isConnected && this.isAuthenticated === isAuthenticated && this.currentUserId === userId) {
        this.log('Already connected with same auth state');
        return Promise.resolve();
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
            this.log(`${isAuthenticated ? 'Authenticated' : 'Guest'} connection established`);
            this.setupPing();
            this.notify({ 
              type: 'connection', 
              status: 'connected', 
              isAuthenticated,
              timestamp: Date.now() 
            });
            resolve();
          };
      
          this.ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              
              // Handle pong messages
              if (data.type === 'pong') {
                this.lastPingTime = Date.now();
                return;
              }
              
              this.notify(data);
            } catch (error) {
              this.error('Error processing WebSocket message:', error, event.data);
            }
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
  
    // Update authentication state
    async updateAuthState(userId, isAuthenticated) {
      if (this.isAuthenticated === isAuthenticated && this.currentUserId === userId) {
        this.log('Auth state unchanged, skipping update');
        return Promise.resolve();
      }
      
      this.log(`Updating auth state: ${isAuthenticated ? 'authenticated' : 'guest'}`);
      
      // If we're already connected, close the connection first
      if (this.isConnected) {
        this.log('Closing existing connection before updating auth state');
        this.cleanup();
      }
      
      return this.init(userId, isAuthenticated);
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
    }
  };
  
  // Make available globally for backward compatibility
  if (typeof window !== 'undefined') {
    window.WebSocketManager = WebSocketManager;
  }

  export default WebSocketManager;