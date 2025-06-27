import { 
  AndroidAgent, 
  AndroidDevice, 
  getConnectedDevices 
} from '@midscene/android';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';

const execPromise = promisify(exec);

class AndroidControl {
  constructor() {
    this.device = null;
    this.agent = null;
    this.activeSessions = new Map();
    this.isDocker = process.env.DOCKER === 'true' || process.env.NODE_ENV === 'production';
    this.logPrefix = '[AndroidControl]';
    this.config = this._getConfig();
  }

  /**
   * Get connected Android devices
   * @returns {Promise<Array>} List of connected devices
   */
  /**
   * Get detailed device information using ADB shell commands
   * @param {string} deviceId - Device UDID
   * @returns {Promise<Object>} Detailed device information
   */
  async getDeviceDetails(deviceId) {
    // In Docker/production, use Midscene's device info
    if (this.isDocker || process.env.NODE_ENV === 'production') {
      try {
        // Get basic device info from Midscene
        const devices = await getConnectedDevices();
        const device = devices.find(d => d.udid === deviceId) || {};
        
        return {
          model: device.model || 'Android Device',
          manufacturer: device.manufacturer || 'Unknown',
          device: device.udid || deviceId,
          brand: device.brand || 'Unknown',
          state: device.state || 'device',
          lastUpdated: new Date().toISOString()
        };
      } catch (error) {
        console.error(`${this.logPrefix} Error getting device info from Midscene:`, error);
        return this._getFallbackDeviceInfo(deviceId);
      }
    }
    
    // In development, try to get detailed info via ADB
    try {
      const [
        model, manufacturer, device, brand, 
        androidVersion, sdkVersion, cpuAbi
      ] = await Promise.all([
        this._execAdbCommand(deviceId, 'getprop ro.product.model'),
        this._execAdbCommand(deviceId, 'getprop ro.product.manufacturer'),
        this._execAdbCommand(deviceId, 'getprop ro.product.device'),
        this._execAdbCommand(deviceId, 'getprop ro.product.brand'),
        this._execAdbCommand(deviceId, 'getprop ro.build.version.release'),
        this._execAdbCommand(deviceId, 'getprop ro.build.version.sdk'),
        this._execAdbCommand(deviceId, 'getprop ro.product.cpu.abi')
      ]);

      return {
        model: model || 'Unknown',
        manufacturer: manufacturer || 'Unknown',
        device: device || 'Unknown',
        brand: brand || 'Unknown',
        androidVersion: androidVersion || 'Unknown',
        sdkVersion: sdkVersion || 'Unknown',
        cpuAbi: cpuAbi ? cpuAbi.split('-')[0] : 'Unknown',
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      console.error(`${this.logPrefix} Error getting device details:`, error);
      return this._getFallbackDeviceInfo(deviceId);
    }
  }
  
  /**
   * Get fallback device information when details can't be retrieved
   * @private
   */
  _getFallbackDeviceInfo(deviceId) {
    return {
      model: 'Android Device',
      manufacturer: 'Unknown',
      device: deviceId,
      brand: 'Unknown',
      state: 'device',
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Execute ADB shell command (local development only)
   * @private
   */
  async _execAdbCommand(deviceId, command) {
    if (this.isDocker || process.env.NODE_ENV === 'production') {
      console.warn('ADB commands are disabled in production/Docker');
      return '';
    }

    try {
      // First try to use the device if we have an active connection
      if (this.device && this.device.udid === deviceId) {
        try {
          const result = await this.device.shell(command);
          return (result || '').trim();
        } catch (error) {
          console.warn(`${this.logPrefix} Device shell command failed, falling back to ADB CLI`);
        }
      }

      // Fall back to local ADB CLI
      const { stdout } = await execPromise(`adb -s ${deviceId} shell ${command}`);
      return (stdout || '').trim();
    } catch (error) {
      console.warn(`${this.logPrefix} ADB command failed (${command}):`, error.message);
      return '';
    }
  }
  
  /**
   * Connect to a device using network ADB
   * @param {string} ip - Device IP address
   * @param {number} [port=5555] - ADB port (default: 5555)
   * @returns {Promise<Object>} Connection result
   */
  async connectOverNetwork(ip, port = 5555) {
    try {
      // First try to connect using ADB
      if (!this.isDocker && process.env.NODE_ENV !== 'production') {
        await execPromise(`adb connect ${ip}:${port}`);
      }
      
      // Then get device info using Midscene
      const devices = await getConnectedDevices();
      const device = devices.find(d => d.udid.includes(ip));
      
      if (device) {
        this.device = device;
        return { 
          success: true, 
          device: await this.getDeviceDetails(device.udid) 
        };
      }
      
      return { 
        success: false, 
        error: 'Device not found after connection' 
      };
    } catch (error) {
      console.error(`${this.logPrefix} Network connection failed:`, error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  async getConnectedDevices() {
    try {
      const devices = await getConnectedDevices();
      
      // If no devices found, return empty array instead of throwing
      if (!devices || !Array.isArray(devices) || devices.length === 0) {
        console.log(`${this.logPrefix} No devices found`);
        return [];
      }
      
      console.log(`${this.logPrefix} Found ${devices.length} device(s):`, devices.map(d => d.udid).join(', '));
      
      // Get detailed info for each device
      const devicesWithDetails = [];
      
      for (const device of devices) {
        try {
          const details = await this.getDeviceDetails(device.udid);
          devicesWithDetails.push({
            id: device.udid,
            name: details.model || `Android Device (${device.udid})`,
            state: device.state || 'device',
            port: device.port || 5555,
            type: device.udid.includes(':') ? 'tcpip' : 'usb',
            ...details
          });
        } catch (error) {
          console.warn(`${this.logPrefix} Error getting details for device ${device.udid}:`, error);
          // Still include the device but with minimal info
          devicesWithDetails.push({
            id: device.udid,
            name: `Android Device (${device.udid})`,
            state: device.state || 'unknown',
            port: device.port || 5555,
            type: device.udid.includes(':') ? 'tcpip' : 'usb',
            model: 'Unknown',
            manufacturer: 'Unknown',
            error: error.message || 'Failed to get device details'
          });
        }
      }

      return devicesWithDetails;
    } catch (error) {
      console.error(`${this.logPrefix} Error in getConnectedDevices:`, error);
      // Return empty array instead of throwing to prevent unhandled rejections
      return [];
    }
  }

  /**
   * Check if ADB is available and working
   * @returns {Promise<Object>} Status object with installation and device info
   */
  async checkAdbStatus() {
    try {
      console.log(`${this.logPrefix} Checking ADB status...`);
      
      // Check if we can get devices
      const devices = await this.getConnectedDevices();
      const isAdbAvailable = devices !== undefined; // getConnectedDevices returns [] on no devices, undefined on error
      
      console.log(`${this.logPrefix} ADB check complete, available:`, isAdbAvailable);
      
      return {
        installed: isAdbAvailable,
        version: isAdbAvailable ? 'ADB (via @midscene/android)' : null,
        devices: Array.isArray(devices) ? devices : [],
        error: null,
        status: 'success',
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`${this.logPrefix} Error in checkAdbStatus:`, error);
      
      return {
        installed: false,
        version: null,
        devices: [],
        error: error.message || 'ADB not available',
        status: 'error',
        timestamp: new Date().toISOString()
      };
    }
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
   * Disconnect from the current device
   * @returns {Promise<Object>} Disconnect status
   */
  async disconnect() {
    try {
      console.log(`${this.logPrefix} Disconnecting from device...`);
      
      // Disconnect the device if connected
      if (this.device) {
        try {
          await this.device.disconnect();
        } catch (error) {
          console.error(`${this.logPrefix} Error disconnecting device:`, error);
          // Continue with cleanup even if device disconnect fails
        }
        this.device = null;
      }

      // Clean up the agent if it exists
      if (this.agent) {
        try {
          await this.agent.disconnect();
        } catch (error) {
          console.error(`${this.logPrefix} Error disconnecting agent:`, error);
          // Continue with cleanup even if agent disconnect fails
        }
        this.agent = null;
      }

      // Clear any active sessions
      this.activeSessions.clear();

      console.log(`${this.logPrefix} Successfully disconnected`);
      
      return {
        success: true,
        message: 'Successfully disconnected from device',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`${this.logPrefix} Error in disconnect:`, error);
      throw {
        success: false,
        message: `Failed to disconnect: ${error.message}`,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    try {
      if (this.device) {
        await this.device.disconnect();
        this.device = null;
      }
      if (this.agent) {
        await this.agent.disconnect();
        this.agent = null;
      }
      this.activeSessions.clear();
    } catch (error) {
      console.error(`${this.logPrefix} Error during cleanup:`, error);
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
