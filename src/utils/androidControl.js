import { AndroidAgent, AndroidDevice, getConnectedDevices } from '@midscene/android';
import { v4 as uuidv4 } from 'uuid';

class AndroidControl {
  constructor() {
    this.device = null;
    this.agent = null;
    this.activeSessions = new Map();
    this.isDocker = process.env.DOCKER === 'true' || process.env.IS_DOCKER === 'true';
    this.logPrefix = '[AndroidControl]';
    this.config = this._getConfig();
  }

  /**
   * Get environment-specific configuration
   * @private
   */
  _getConfig() {
    return {
      connection: {
        timeout: 30000, // 30 seconds
        maxRetries: 3,
        retryDelay: 1000,
      },
      docker: {
        usbDevicePath: '/dev/bus/usb',
        useNetworkAdb: process.env.USE_NETWORK_ADB === 'true',
        adbHost: process.env.ADB_HOST || 'host.docker.internal',
        adbPort: process.env.ADB_PORT || '5037'
      },
      local: {
        usbDevicePath: process.env.USB_DEVICE_PATH || '/dev/bus/usb'
      }
    };
  }

  /**
   * Initialize connection to an Android device
   * @param {string} [deviceUdid] - Optional UDID of the device to connect to
   * @returns {Promise<Object>} Connection status
   */
  async connect(deviceUdid) {
    const envConfig = this.isDocker ? this.config.docker : this.config.local;
    const { connection } = this.config;
    
    console.log(`${this.logPrefix} Connecting in ${this.isDocker ? 'Docker' : 'local'} environment`);
    
    try {
      // Set up network ADB if needed
      if (this.isDocker && envConfig.useNetworkAdb) {
        console.log(`${this.logPrefix} Using network ADB at ${envConfig.adbHost}:${envConfig.adbPort}`);
        process.env.ADB_SERVER_SOCKET = `tcp:${envConfig.adbHost}:${envConfig.adbPort}`;
      }

      // Get connected devices with retry logic
      const devices = await this._getDevicesWithRetry(connection.maxRetries, connection.retryDelay);
      
      if (devices.length === 0) {
        const errorMsg = 'No Android devices found. ' + 
          (this.isDocker 
            ? 'Make sure USB devices are properly passed to the container.'
            : 'Please connect a device via USB and enable USB debugging.');
        throw new Error(errorMsg);
      }

      // Find target device
      const targetDevice = deviceUdid 
        ? devices.find(d => d.udid === deviceUdid)
        : devices[0];

      if (!targetDevice) {
        throw new Error(`Device with UDID ${deviceUdid} not found. Available devices: ${devices.map(d => d.udid).join(', ')}`);
      }

      console.log(`${this.logPrefix} Connecting to device: ${targetDevice.udid}`);
      
      // Initialize device with timeout
      this.device = new AndroidDevice(targetDevice.udid, {
        timeout: connection.timeout
      });
      
      await this.device.connect();

      // Initialize agent with environment-aware context
      this.agent = new AndroidAgent(this.device, {
        aiActionContext: `
          If any location, permission, user agreement, etc. popup appears, click agree. 
          If login page appears, close it unless explicitly told to log in.
          Be efficient with interactions and minimize unnecessary steps.
          Environment: ${this.isDocker ? 'Docker' : 'Local'}
        `
      });

      console.log(`${this.logPrefix} Successfully connected to device: ${targetDevice.udid}`);
      
      return {
        success: true,
        message: `Connected to device: ${targetDevice.udid} (${targetDevice.state})`,
        device: targetDevice,
        environment: this.isDocker ? 'docker' : 'local'
      };
    } catch (error) {
      console.error(`${this.logPrefix} Connection failed:`, error);
      throw new Error(`Failed to connect to Android device: ${error.message}`);
    }
  }
  
  /**
   * Get connected devices with retry logic
   * @private
   */
  async _getDevicesWithRetry(maxRetries, retryDelay) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const devices = await getConnectedDevices();
        if (devices.length > 0) return devices;
        
        if (attempt < maxRetries) {
          console.log(`${this.logPrefix} No devices found, retrying (${attempt}/${maxRetries})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          console.warn(`${this.logPrefix} Device detection attempt ${attempt} failed:`, error.message);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }
    
    throw lastError || new Error('No devices found after maximum retry attempts');
  }

  /**
   * Execute an AI-powered action on the device
   * @param {string} instruction - Natural language instruction
   * @param {Object} [options] - Additional options
   * @returns {Promise<Object>} Execution result
   */
  async executeAction(instruction, options = {}) {
    if (!this.agent) {
      throw new Error('Not connected to any Android device. Call connect() first.');
    }

    const sessionId = options.sessionId || uuidv4();
    const timeout = options.timeout || 30000; // 30 seconds default timeout

    try {
      console.log(`[AndroidControl] [${sessionId}] Executing: ${instruction}`);
      
      // Store session
      this.activeSessions.set(sessionId, {
        startTime: new Date(),
        status: 'executing'
      });

      // Execute the action with timeout
      const result = await Promise.race([
        this.agent.aiAction(instruction),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Action timed out')), timeout)
        )
      ]);

      // Update session
      this.activeSessions.set(sessionId, {
        ...this.activeSessions.get(sessionId),
        endTime: new Date(),
        status: 'completed',
        success: true
      });

      return {
        success: true,
        message: 'Action executed successfully',
        sessionId,
        result
      };
    } catch (error) {
      console.error(`[AndroidControl] [${sessionId}] Error executing action:`, error);
      
      // Update session with error
      if (this.activeSessions.has(sessionId)) {
        this.activeSessions.set(sessionId, {
          ...this.activeSessions.get(sessionId),
          endTime: new Date(),
          status: 'failed',
          error: error.message,
          success: false
        });
      }

      throw new Error(`Failed to execute action: ${error.message}`);
    }
  }

  /**
   * Launch an app or URL on the device
   * @param {string} target - Package name, URL, or app name
   * @returns {Promise<Object>} Launch result
   */
  async launch(target) {
    if (!this.agent) {
      throw new Error('Not connected to any Android device. Call connect() first.');
    }

    try {
      // If it's a URL, open in browser
      if (target.startsWith('http')) {
        await this.agent.launch(target);
        return {
          success: true,
          message: `Opened URL: ${target}`
        };
      }

      // Try to launch as package name
      await this.agent.launch(target);
      return {
        success: true,
        message: `Launched app: ${target}`
      };
    } catch (error) {
      console.error('Error launching app/URL:', error);
      throw new Error(`Failed to launch ${target}: ${error.message}`);
    }
  }

  /**
   * Get information about the current screen
   * @returns {Promise<Object>} Screen information
   */
  async getScreenInfo() {
    if (!this.agent) {
      throw new Error('Not connected to any Android device. Call connect() first.');
    }

    try {
      // Get basic screen info using AI
      const screenInfo = await this.agent.aiQuery(
        `{
          "currentApp": "string - name of the current app or website",
          "mainElements": "string[] - main interactive elements on screen",
          "canGoBack": "boolean - if back navigation is possible",
          "canGoHome": "boolean - if home navigation is possible",
          "hasNotifications": "boolean - if there are notifications visible"
        }`
      );

      return {
        success: true,
        screenInfo
      };
    } catch (error) {
      console.error('Error getting screen info:', error);
      throw new Error(`Failed to get screen info: ${error.message}`);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    try {
      if (this.device) {
        await this.device.disconnect();
      }
      this.device = null;
      this.agent = null;
      this.activeSessions.clear();
    } catch (error) {
      console.error('Error during Android control cleanup:', error);
      throw error;
    }
  }

  /**
   * Get active sessions
   * @returns {Array} List of active sessions
   */
  getActiveSessions() {
    return Array.from(this.activeSessions.entries()).map(([id, session]) => ({
      id,
      ...session
    }));
  }
}

// Export a singleton instance
const androidControl = new AndroidControl();
export default androidControl;
