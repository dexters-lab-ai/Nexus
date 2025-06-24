import { homedir } from 'os';

const pcControlConfig = {
  // Maximum number of search results to return
  MAX_SEARCH_RESULTS: 10,
  
  // Allowed directories for file operations (for security)
  ALLOWED_DIRECTORIES: [
    homedir(),
    'C:\\Users\\Public',
    'C:\\Temp',
    'C:\\Windows\\Temp'
  ],
  
  // Timeout for commands in milliseconds
  COMMAND_TIMEOUT: 30000, // 30 seconds
  
  // Maximum file size to handle (in bytes)
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  
  // Media control settings
  MEDIA: {
    VOLUME_STEP: 2000, // Volume change step (0-65535)
    MAX_VOLUME: 65535,
    MIN_VOLUME: 0
  }
};

export default pcControlConfig;
