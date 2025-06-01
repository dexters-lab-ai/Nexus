// Environment Configuration
const isBrowser = typeof window !== 'undefined';
const isProduction = process.env.NODE_ENV === 'production';
const nodeEnv = process.env.NODE_ENV || 'development';

// Helper function to safely get environment variables
const getEnv = (key, defaultValue = '') => {
  // Browser environment: Check Vite imports first
  if (isBrowser && typeof import.meta !== 'undefined' && import.meta.env) {
    // Check all possible variations of the key
    const value = import.meta.env[`VITE_${key}`] || 
                 import.meta.env[key] || 
                 (typeof window.__ENV__ !== 'undefined' ? window.__ENV__[key] : null);
    if (value) return value;
    return defaultValue;
  }
  
  // Server environment
  // Check all possible variations of the key
  if (process.env[key]) return process.env[key];
  if (process.env[`VITE_${key}`]) return process.env[`VITE_${key}`];
  return defaultValue;
};

// In browser, use import.meta.env, in Node.js use process.env
const env = isBrowser ? (typeof import.meta !== 'undefined' ? import.meta.env : {}) : process.env;

// Debug logging
console.log('Environment:', {
  NODE_ENV: nodeEnv,
  isProduction,
  API_URL: getEnv('API_URL'),
  WS_URL: getEnv('WS_URL'),
  FRONTEND_URL: getEnv('FRONTEND_URL')
});

// Helper function to get the current host in browser
const getCurrentHost = () => {
  if (!isBrowser) return '';
  return `${window.location.protocol}//${window.location.host}`;
};

const config = {
  // Server Configuration
  port: parseInt(getEnv('PORT', '3420')),  // Backend server port
  nodeEnv,
  isProduction,
  isDevelopment: !isProduction,

  // API Configuration
  apiUrl: isProduction
    ? getEnv('API_URL') || getEnv('VITE_API_URL') || '/api'
    : getEnv('API_URL') || getEnv('VITE_API_URL') || 'http://localhost:3420',
  
  wsUrl: isProduction
    ? getEnv('WS_URL') || getEnv('OPERATOR_APP_WS_URL') || getEnv('VITE_WS_URL') || 
      `wss://${getEnv('FRONTEND_DOMAIN', isBrowser ? window.location.host : '')}`
    : getEnv('WS_URL') || getEnv('VITE_WS_URL') || 'ws://localhost:3420/ws',
    
  frontendUrl: isProduction
    ? getEnv('FRONTEND_URL') || getEnv('VITE_FRONTEND_URL') || 
      `https://${getEnv('FRONTEND_DOMAIN', isBrowser ? window.location.host : '')}`
    : getEnv('FRONTEND_URL') || getEnv('VITE_FRONTEND_URL') || 'http://localhost:3000',
  
  // Paths
  basePath: getEnv('BASE_PATH', ''),
  
  // Cookies - handle both server and browser environments
  cookieDomain: isProduction 
    ? getEnv('COOKIE_DOMAIN', isBrowser ? window.location.hostname : '')
    : 'localhost',
    
  secureCookies: isProduction || getEnv('SECURE_COOKIES', 'false') === 'true',
  
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
  // Always ensure /ws is present at the end (for both dev and prod)
  if (!config.wsUrl.endsWith('/ws')) {
    // Remove trailing slash if present, then append /ws
    config.wsUrl = config.wsUrl.replace(/\/$/, '') + '/ws';
  }
}

// Log configuration in development
if (config.isDevelopment) {
  console.log('Environment Configuration:', JSON.stringify(config, null, 2));
}

export default config;
