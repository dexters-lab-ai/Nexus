import WebSocket from 'ws';

// Use the provided user ID for testing
const userId = '67fc732d27f293a2fe839908';
const ws = new WebSocket(`ws://localhost:3420/ws?userId=${userId}`);

console.log('Connecting to WebSocket server...');
console.log('User ID:', userId);
console.log('WebSocket URL:', `ws://localhost:3420/ws?userId=${userId}`);

ws.on('open', function open() {
  console.log('Connected to WebSocket server');
  
  // Send a test message
  ws.send(JSON.stringify({
    type: 'test',
    message: 'Hello WebSocket Server!'
  }));
});

ws.on('message', function incoming(message) {
  console.log('Received:', JSON.parse(message));
});

ws.on('close', function close() {
  console.log('Disconnected from WebSocket server');
});

ws.on('error', function error(err) {
  console.error('WebSocket error:', err);
});
