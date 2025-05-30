// Environment Configuration
const isBrowser = typeof window !== 'undefined';
const isProduction = process.env.NODE_ENV === 'production';
const nodeEnv = process.env.NODE_ENV || 'development';

// Get MongoDB URI - prioritize direct process.env.MONGO_URI
// This ensures we get the value that was loaded by dotenv in server.js
console.log('Loading MongoDB URI from environment variables:', {
  hasMongoUri: !!process.env.MONGO_URI,
  nodeEnv: process.env.NODE_ENV,
  allEnvKeys: Object.keys(process.env).filter(k => k.includes('MONGO') || k.includes('NODE') || k.includes('VITE'))
});

const mongoUri = process.env.MONGO_URI;

// Helper function to safely get environment variables
const getEnv = (key, defaultValue = '') => {
  // First try to get from process.env directly (for server-side)
  if (process.env[key]) {
    return process.env[key];
  }
  
  // Then try VITE_ prefixed variables (for client-side)
  if (process.env[`VITE_${key}`]) {
    return process.env[`VITE_${key}`];
  }
  
  // For browser environment with Vite
  if (isBrowser && typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key] || import.meta.env[`VITE_${key}`] || defaultValue;
  }
  
  return defaultValue;
};

// In browser, use import.meta.env, in Node.js use process.env
const env = isBrowser ? (typeof import.meta !== 'undefined' ? import.meta.env : {}) : process.env;

// Debug logging
console.log('Environment:', {
  NODE_ENV: nodeEnv,
  isProduction,
  VITE_API_URL: getEnv('API_URL'),
  VITE_WS_URL: getEnv('WS_URL'),
  VITE_FRONTEND_URL: getEnv('FRONTEND_URL')
});

// Helper function to get the current host in browser
const getCurrentHost = () => {
  if (!isBrowser) return '';
  return `${window.location.protocol}//${window.location.host}`;
};

const config = {
  // Server Configuration
  port: parseInt(process.env.PORT || getEnv('PORT', '3420')),  // Backend server port
  nodeEnv,
  isProduction,
  isDevelopment: !isProduction,
  // MongoDB URI from environment variables
  mongoUri,

  // API Configuration
  apiUrl: isProduction
    ? getEnv('API_URL', '/api')
    : getEnv('API_URL', 'http://localhost:3420'),
  
  wsUrl: isProduction
    ? getEnv('WS_URL', `wss://${getEnv('FRONTEND_DOMAIN', isBrowser ? window.location.host : '')}`)
    : getEnv('WS_URL', 'ws://localhost:3420'),
    
  frontendUrl: isProduction
    ? getEnv('FRONTEND_URL', `https://${getEnv('FRONTEND_DOMAIN', isBrowser ? window.location.host : '')}`)
    : getEnv('FRONTEND_URL', 'http://localhost:3000'),
  
  // Paths
  basePath: getEnv('BASE_PATH', ''),
  
  // Cookies - handle both server and browser environments
  cookieDomain: isProduction 
    ? getEnv('COOKIE_DOMAIN', isBrowser ? window.location.hostname : '')
    : 'localhost',
    
  secureCookies: isProduction || getEnv('SECURE_COOKIES', 'false') === 'true',
  sessionSecret: getEnv('SESSION_SECRET', 'default-secret'),
  
  // Feature Flags
  features: {
    analytics: getEnv('ENABLE_ANALYTICS', 'false') === 'true',
  }
};

// Ensure API URL ends with no trailing slash
if (config.apiUrl.endsWith('/')) {
  config.apiUrl = config.apiUrl.slice(0, -1);
}

// Ensure WebSocket URL is properly formatted
if (config.wsUrl) {
  if (config.wsUrl.startsWith('http://')) {
    config.wsUrl = 'ws://' + config.wsUrl.substring(7);
  } else if (config.wsUrl.startsWith('https://')) {
    config.wsUrl = 'wss://' + config.wsUrl.substring(8);
  }
}

// Log configuration in development
if (config.isDevelopment) {
  console.log('Environment Configuration:', JSON.stringify(config, null, 2));
}

export default config;