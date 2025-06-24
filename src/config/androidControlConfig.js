/**
 * Configuration for Android control functionality
 */

const androidControlConfig = {
  // Default command timeout in milliseconds
  defaultCommandTimeout: 30000, // 30 seconds
  
  // Maximum command execution time
  maxCommandTime: 120000, // 2 minutes
  
  // Default device UDID (leave empty to use first connected device)
  defaultDeviceUdid: '',
  
  // Common app package names
  appPackages: {
    chrome: 'com.android.chrome',
    firefox: 'org.mozilla.firefox',
    twitter: 'com.twitter.android',
    instagram: 'com.instagram.android',
    facebook: 'com.facebook.katana',
    whatsapp: 'com.whatsapp',
    gmail: 'com.google.android.gm',
    maps: 'com.google.android.apps.maps',
    youtube: 'com.google.android.youtube',
    settings: 'com.android.settings',
    playstore: 'com.android.vending',
    camera: 'com.android.camera2',
    gallery: 'com.android.gallery3d',
    messages: 'com.android.messaging',
    phone: 'com.android.dialer',
    contacts: 'com.android.contacts'
  },
  
  // Common actions and their corresponding AI instructions
  commonActions: {
    'open': 'Open the {app} app',
    'search': 'Search for "{query}" in the search bar',
    'like': 'Like the first {count} {item}',
    'scroll': 'Scroll {direction} to find {item}',
    'go_back': 'Press the back button',
    'go_home': 'Go to home screen',
    'recent_apps': 'Show recent apps',
    'take_screenshot': 'Take a screenshot',
    'volume_up': 'Increase volume',
    'volume_down': 'Decrease volume',
    'volume_mute': 'Mute volume',
    'brightness_up': 'Increase brightness',
    'brightness_down': 'Decrease brightness',
    'rotate_screen': 'Rotate screen orientation'
  },
  
  // Rate limiting configuration (requests per minute)
  rateLimiting: {
    enabled: true,
    maxRequests: 30, // Max requests per minute
    windowMs: 60000 // 1 minute window
  },
  
  // Logging configuration
  logging: {
    level: 'info', // error, warn, info, debug, trace
    saveToFile: true,
    maxFileSize: '10m', // 10MB
    maxFiles: '5d', // Keep logs for 5 days
    directory: './logs/android-control'
  },
  
  // Security settings
  security: {
    allowSystemCommands: false, // Allow potentially dangerous system commands
    allowedCommands: [
      'input',
      'am',
      'pm',
      'settings',
      'content',
      'dumpsys',
      'getprop',
      'wm',
      'cmd'
    ],
    blockedCommands: [
      'rm',
      'dd',
      'mv',
      'su',
      'reboot',
      'shutdown',
      'wipe',
      'format'
    ]
  }
};

export default androidControlConfig;
