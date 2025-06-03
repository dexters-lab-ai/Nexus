// WebSocket Manager
export const WebSocketManager = {
    ws: null,
    subscribers: new Set(),
    isConnected: false,
    reconnectAttempts: 0,
    MAX_RETRIES: 5,
    RETRY_DELAY: 5000,
  
    init(userId) {
      if (this.ws && this.isConnected) return;
  
      let wsUrl = window.__ENV__?.wsUrl || 
                 `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
      
      const separator = wsUrl.includes('?') ? '&' : '?';
      wsUrl = `${wsUrl}${separator}userId=${encodeURIComponent(userId)}`;
      
      console.log('[WebSocket] Connecting to:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notify({ type: 'connection', status: 'connected' });
      };
  
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.notify(data);
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
  
      this.ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        this.isConnected = false;
        this.notify({ type: 'connection', status: 'disconnected' });
        
        if (this.reconnectAttempts < this.MAX_RETRIES) {
          this.reconnectAttempts++;
          console.log(`[WebSocket] Reconnecting... (${this.reconnectAttempts}/${this.MAX_RETRIES})`);
          setTimeout(() => this.init(userId), this.RETRY_DELAY * Math.pow(2, this.reconnectAttempts));
        }
      };
  
      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        this.ws?.close();
      };
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
        this.ws.send(JSON.stringify(data));
        return true;
      }
      console.warn('[WebSocket] Cannot send message - not connected');
      return false;
    }
  };
  
  // Make available globally for backward compatibility
  if (typeof window !== 'undefined') {
    window.WebSocketManager = WebSocketManager;
  }

  export default WebSocketManager;