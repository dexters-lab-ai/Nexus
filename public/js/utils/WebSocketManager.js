// WebSocket Manager
export const WebSocketManager = {
    ws: null,
    subscribers: new Set(),
    isConnected: false,
    reconnectAttempts: 0,
    MAX_RETRIES: 5,
    RETRY_DELAY: 5000,
    currentUserId: null,
    isAuthenticated: false,
    connectionPromise: null,
  
    async init(userId, isAuthenticated = false) {
      // If already connected with same auth state, do nothing
      if (this.ws && this.isConnected && this.isAuthenticated === isAuthenticated && this.currentUserId === userId) {
        return;
      }

      // If we have an existing connection, close it first
      if (this.ws) {
        this.ws.onclose = null; // Prevent reconnection attempts
        this.ws.close();
        this.isConnected = false;
        this.ws = null;
      }

      this.currentUserId = userId;
      this.isAuthenticated = isAuthenticated;
      this.reconnectAttempts = 0;

      // If we already have a connection in progress, return that promise
      if (this.connectionPromise) {
        return this.connectionPromise;
      }

      this.connectionPromise = new Promise((resolve, reject) => {
        let wsUrl = window.__ENV__?.wsUrl || 
                  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
        
        const separator = wsUrl.includes('?') ? '&' : '?';
        wsUrl = `${wsUrl}${separator}userId=${encodeURIComponent(userId)}`;
        
        if (isAuthenticated) {
          wsUrl += '&authenticated=true';
        }
        
        console.log(`[WebSocket] ${isAuthenticated ? 'Authenticated' : 'Guest'} connection to:`, wsUrl);
        this.ws = new WebSocket(wsUrl);
        
        // Connection timeout
        const timeout = setTimeout(() => {
          if (!this.isConnected) {
            console.error('[WebSocket] Connection timeout');
            this.ws?.close();
            reject(new Error('Connection timeout'));
          }
        }, 10000);
        
        this.ws.onopen = () => {
          clearTimeout(timeout);
          console.log(`[WebSocket] ${isAuthenticated ? 'Authenticated' : 'Guest'} connection established`);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.notify({ type: 'connection', status: 'connected', isAuthenticated });
          resolve();
        };
    
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.notify(data);
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        };
    
        this.ws.onclose = (event) => {
          clearTimeout(timeout);
          console.log(`[WebSocket] ${this.isAuthenticated ? 'Authenticated' : 'Guest'} connection closed`, event);
          this.isConnected = false;
          this.notify({ type: 'connection', status: 'disconnected', isAuthenticated: this.isAuthenticated });
          
          // Only try to reconnect if we were connected before
          if (this.reconnectAttempts < this.MAX_RETRIES && this.isAuthenticated) {
            this.reconnectAttempts++;
            const delay = this.RETRY_DELAY * Math.pow(2, this.reconnectAttempts);
            console.log(`[WebSocket] Reconnecting in ${delay}ms... (${this.reconnectAttempts}/${this.MAX_RETRIES})`);
            setTimeout(() => this.init(userId, this.isAuthenticated), delay);
          } else if (this.reconnectAttempts >= this.MAX_RETRIES) {
            console.error('[WebSocket] Max reconnection attempts reached');
          }
          
          this.connectionPromise = null;
        };
    
        this.ws.onerror = (error) => {
          clearTimeout(timeout);
          console.error('[WebSocket] Error:', error);
          this.connectionPromise = null;
          reject(error);
        };
      });

      return this.connectionPromise.finally(() => {
        this.connectionPromise = null;
      });
    },
  
    // Update authentication state
    async updateAuthState(userId, isAuthenticated) {
      if (this.isAuthenticated === isAuthenticated && this.currentUserId === userId) {
        return;
      }
      
      console.log(`[WebSocket] Updating auth state: ${isAuthenticated ? 'authenticated' : 'guest'}`);
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
      for (const callback of this.subscribers) {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in WebSocket subscriber:', error);
        }
      }
    },
  
    send(data) {
      if (this.isConnected) {
        try {
          this.ws.send(JSON.stringify(data));
          return true;
        } catch (error) {
          console.error('[WebSocket] Error sending message:', error);
          return false;
        }
      }
      console.warn('[WebSocket] Cannot send message - not connected');
      return false;
    },
    
    // Close the connection cleanly
    close() {
      if (this.ws) {
        this.ws.onclose = null; // Prevent reconnection
        this.ws.close();
        this.ws = null;
      }
      this.isConnected = false;
      this.currentUserId = null;
      this.isAuthenticated = false;
      this.connectionPromise = null;
    }
  };
  
  // Make available globally for backward compatibility
  if (typeof window !== 'undefined') {
    window.WebSocketManager = WebSocketManager;
  }

  export default WebSocketManager;