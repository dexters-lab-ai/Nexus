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
    this.currentSettings = this._getDefaultSettings();
    this.connectionState = {
      isConnecting: false,
      lastError: null,
      connectionType: null, // 'usb', 'network', 'remote'
      lastConnected: null
    };
  }

  /**
   * Update connection settings
   * @param {Object} settings - Connection settings
   * @returns {Object} Updated settings
   */
  /**
   * Update connection settings and environment variables
   * @param {Object} newSettings - New settings to apply
   * @returns {Object} The updated settings
   */
  updateSettings(newSettings = {}) {
    // Create a new settings object with defaults, current settings, and new settings
    const settings = {
      ...this._getDefaultSettings(),
      ...this.currentSettings, // Keep any existing settings
      ...newSettings, // Apply new settings
    };

    // Ensure ports are numbers
    if (newSettings.remoteAdbPort !== undefined) {
      settings.remoteAdbPort = parseInt(newSettings.remoteAdbPort, 10) || 5037;
    }
    if (newSettings.adbPort !== undefined) {
      settings.adbPort = parseInt(newSettings.adbPort, 10) || 5555;
    }

    // Update current settings
    this.currentSettings = settings;

    // Update environment variables
    this._updateEnvironmentVariables(settings);
    
    console.log(`${this.logPrefix} Updated connection settings`, {
      ...settings,
      customAdbPath: settings.customAdbPath ? '***' + settings.customAdbPath.slice(-15) : 'not set',
      remoteAdbPort: settings.remoteAdbPort,
    });
    
    return settings;
  }

  /**
   * Update environment variables based on current settings
   * @private
   * @param {Object} settings - Settings to use for environment variables
   */
  _updateEnvironmentVariables(settings) {
    const envVars = {
      ANDROID_HOME: '/opt/android-sdk',
      ANDROID_SDK_ROOT: '/opt/android-sdk',
      MIDSCENE_ADB_PATH: 'C:\\platform-tools\\adb.exe',
      MIDSCENE_ADB_REMOTE_HOST: '192.168.137.1',
      MIDSCENE_ADB_REMOTE_PORT: '5037'
    };

    // Update process.env with new values
    Object.entries(envVars).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    });
  }
  
  /**
   * Get default connection settings
   * @private
   * @returns {Object} Default connection settings
   */
  _getDefaultSettings() {
    const isProd = process.env.NODE_ENV === 'production' || process.env.DOCKER === 'true';
    const isWindows = process.platform === 'win32';
    
    // Default ADB path based on platform
    const defaultAdbPath = isWindows 
      ? 'C:\\program-tools\\adb.exe'  // Default Windows path
      : '/usr/bin/adb';                 // Default Linux/macOS path
    
    return {
      // Device connection settings
      deviceIpAddress: process.env.ANDROID_DEVICE_IP || '',
      adbPort: parseInt(process.env.ANDROID_ADB_PORT || '5555', 10),
      
      // Remote ADB settings - these take precedence over environment variables when set via updateSettings()
      remoteAdbHost: process.env.MIDSCENE_ADB_REMOTE_HOST || '',
      remoteAdbPort: parseInt(process.env.MIDSCENE_ADB_REMOTE_PORT || '5037', 10),
      customAdbPath: process.env.MIDSCENE_ADB_PATH || defaultAdbPath,
      
      // Connection preferences
      useRemoteAdb: isProd, // Default to remote in production
      autoReconnect: true,
      connectionTimeout: 30000, // 30 seconds
      
      // Last used connection info
      lastUsedConnection: 'usb',
      lastConnectedAt: null,
      
      // Debug settings
      debug: process.env.NODE_ENV !== 'production',
      logLevel: process.env.LOG_LEVEL || (isProd ? 'warn' : 'debug'),
      
      // Platform info
      platform: process.platform,
      isWindows
    };
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
  /**
   * Connect to a device over network
   * @param {string} ip - Device IP address
   * @param {number} [port=5555] - ADB port (default: 5555)
   * @param {Object} [settings] - Additional connection settings
   * @returns {Promise<Object>} Connection result
   */
  async connectOverNetwork(ip, port = 5555, settings = {}) {
    const startTime = Date.now();
    const connectionId = `net-${Date.now()}`;
    const connectionSettings = { 
      ...this.currentSettings, 
      ...settings,
      deviceIpAddress: ip,
      adbPort: port
    };
    
    // Update connection state
    this.connectionState = {
      isConnecting: true,
      lastError: null,
      connectionType: settings.useRemoteAdb ? 'remote' : 'network',
      connectionId,
      startTime
    };
    
    try {
      // Validate inputs
      if (!ip || typeof ip !== 'string') {
        throw new Error('Invalid IP address');
      }
      
      port = parseInt(port, 10) || 5555;
      if (port < 1 || port > 65535) {
        throw new Error('Invalid port number');
      }
      
      // Update settings with provided values
      this.updateSettings(connectionSettings);
      
      console.log(`${this.logPrefix} [${connectionId}] Connecting to ${ip}:${port}`, { 
        useRemoteAdb: connectionSettings.useRemoteAdb,
        remoteAdbHost: connectionSettings.remoteAdbHost || 'not set',
        remoteAdbPort: connectionSettings.remoteAdbPort || 'default',
        connectionType: this.connectionState.connectionType
      });
      
      // For local development, try to connect using ADB directly
      if (!connectionSettings.useRemoteAdb && !this.isDocker) {
        await this._connectWithLocalAdb(ip, port, connectionSettings);
      }
      
      // Get device info using Midscene
      const devices = await this._getDevicesWithRetry(
        connectionSettings.maxRetries || 3,
        connectionSettings.retryDelay || 1000
      );
      
      const deviceId = `${ip}:${port}`;
      const device = devices.find(d => d.udid.includes(ip) || d.udid === deviceId);
      
      if (!device) {
        throw new Error(`Device ${deviceId} not found in connected devices`);
      }
      
      // Initialize device with Midscene
      this.device = new AndroidDevice(device.udid, {
        timeout: connectionSettings.connectionTimeout || 30000,
        host: connectionSettings.remoteAdbHost,
        port: connectionSettings.remoteAdbPort,
        adbPath: connectionSettings.customAdbPath
      });
      
      await this.device.connect();
      
      // Initialize agent
      this.agent = new AndroidAgent(this.device, {
        aiActionContext: this._getAiContext(connectionSettings)
      });
      
      // Update connection state
      this.connectionState = {
        ...this.connectionState,
        isConnecting: false,
        isConnected: true,
        lastConnected: new Date().toISOString(),
        deviceId: device.udid
      };
      
      // Get device details
      const deviceDetails = await this.getDeviceDetails(device.udid);
      
      console.log(`${this.logPrefix} [${connectionId}] Successfully connected to ${device.udid} in ${Date.now() - startTime}ms`);
      
      return { 
        success: true, 
        device: deviceDetails,
        connectionType: this.connectionState.connectionType,
        connectionTime: Date.now() - startTime,
        settings: connectionSettings
      };
      
    } catch (error) {
      const errorMessage = this._getErrorMessage(error);
      console.error(`${this.logPrefix} [${connectionId}] Network connection failed:`, errorMessage);
      
      // Update connection state
      this.connectionState = {
        ...this.connectionState,
        isConnecting: false,
        isConnected: false,
        lastError: errorMessage,
        lastErrorTime: new Date().toISOString()
      };
      
      // Clean up on error
      try {
        await this.disconnect();
      } catch (cleanupError) {
        console.warn(`${this.logPrefix} [${connectionId}] Error during cleanup:`, cleanupError.message);
      }
      
      return { 
        success: false, 
        error: errorMessage,
        connectionType: this.connectionState.connectionType,
        settings: connectionSettings,
        stack: connectionSettings.debug ? error.stack : undefined
      };
    }
  }

  async getConnectedDevices() {
    try {
      // Ensure we have the latest settings applied
      if (this.currentSettings) {
        // This will update environment variables with current settings
        this._updateEnvironmentVariables(this.currentSettings);
        
        console.log(`${this.logPrefix} Using connection settings:`, {
          useRemoteAdb: this.currentSettings.useRemoteAdb,
          remoteAdbHost: this.currentSettings.remoteAdbHost,
          remoteAdbPort: this.currentSettings.remoteAdbPort,
          customAdbPath: this.currentSettings.customAdbPath ? 
            '***' + this.currentSettings.customAdbPath.slice(-15) : 'not set',
          platform: this.currentSettings.platform,
          isWindows: this.currentSettings.isWindows
        });
      } else {
        console.warn(`${this.logPrefix} No connection settings found, using defaults`);
        // Initialize with default settings if none exist
        this.updateSettings({});
      }

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
  /**
   * Disconnect from the current device
   * @returns {Promise<Object>} Disconnect result
   */
  async disconnect() {
    const { device, connectionState } = this;
    const connectionId = connectionState.connectionId || 'disconnect-' + Date.now();
    
    // If already disconnected
    if (!device) {
      return { 
        success: true, 
        message: 'No active device to disconnect',
        connectionId
      };
    }
    
    const deviceId = device.udid;
    const connectionType = device.connectionType || 'usb';
    const settings = device.connectionSettings || {};
    
    console.log(`${this.logPrefix} [${connectionId}] Disconnecting from ${connectionType} device: ${deviceId}`);
    
    try {
      // For network devices, try to disconnect using ADB
      if (connectionType === 'network' && deviceId.includes(':')) {
        await this._disconnectNetworkDevice(deviceId, settings);
      }
      
      // Close any active sessions
      await this._closeActiveSessions();
      
      // Disconnect the device
      if (typeof device.disconnect === 'function') {
        await device.disconnect();
      }
      
      // Clean up references
      this.device = null;
      this.agent = null;
      
      // Update connection state
      this.connectionState = {
        ...this.connectionState,
        isConnected: false,
        isConnecting: false,
        lastDisconnected: new Date().toISOString()
      };
      
      console.log(`${this.logPrefix} [${connectionId}] Successfully disconnected from ${deviceId}`);
      
      return { 
        success: true, 
        deviceId,
        connectionType,
        connectionId,
        message: `Disconnected ${connectionType} device: ${deviceId}`
      };
      
    } catch (error) {
      const errorMessage = this._getErrorMessage(error);
      console.error(`${this.logPrefix} [${connectionId}] Error during disconnection:`, errorMessage);
      
      // Update connection state
      this.connectionState = {
        ...this.connectionState,
        isConnected: false,
        isConnecting: false,
        lastError: errorMessage,
        lastErrorTime: new Date().toISOString()
      };
      
      return { 
        success: false, 
        error: errorMessage,
        connectionId,
        stack: this.currentSettings.debug ? error.stack : undefined
      };
    }
  }

  /**
   * Connect to a device using local ADB
   * @private
   */
  async _connectWithLocalAdb(ip, port, settings) {
    const adbPath = settings.customAdbPath || 'adb';
    const deviceId = `${ip}:${port}`;
    
    try {
      console.log(`${this.logPrefix} [local-adb] Connecting to ${deviceId}...`);
      
      // Try to connect using ADB
      const { stdout, stderr } = await execPromise(`${adbPath} connect ${deviceId}`);
      
      if (stderr && !stdout.includes('connected to')) {
        throw new Error(stderr.trim() || 'Failed to connect to device');
      }
      
      console.log(`${this.logPrefix} [local-adb] ${stdout.trim()}`);
      
    } catch (error) {
      console.warn(`${this.logPrefix} [local-adb] ADB connect failed:`, error.message);
      // Don't throw, we'll try with Midscene anyway
    }
  }
  
  /**
   * Disconnect a network device using ADB
   * @private
   */
  async _disconnectNetworkDevice(deviceId, settings) {
    try {
      const adbPath = settings.customAdbPath || 'adb';
      console.log(`${this.logPrefix} Disconnecting network device: ${deviceId}`);
      
      const { stdout, stderr } = await execPromise(`${adbPath} disconnect ${deviceId}`);
      
      if (stderr && !stdout.includes('disconnected')) {
        console.warn(`${this.logPrefix} ADB disconnect warning:`, stderr.trim());
      }
      
      console.log(`${this.logPrefix} ${stdout.trim()}`);
      
    } catch (error) {
      console.warn(`${this.logPrefix} Failed to disconnect device ${deviceId}:`, error.message);
      // Don't throw, continue with other cleanup
    }
  }
  
  /**
   * Close all active sessions
   * @private
   */
  async _closeActiveSessions() {
    const closePromises = [];
    
    for (const [id, session] of this.activeSessions) {
      if (typeof session.close === 'function') {
        closePromises.push(
          session.close()
            .then(() => {
              this.activeSessions.delete(id);
              console.log(`${this.logPrefix} Closed session: ${id}`);
            })
            .catch(error => {
              console.error(`${this.logPrefix} Error closing session ${id}:`, error);
            })
        );
      } else {
        this.activeSessions.delete(id);
      }
    }
    
    await Promise.allSettled(closePromises);
  }
  
  /**
   * Get AI context for device operations
   * @private
   */
  _getAiContext(settings) {
    return `
      Environment: ${this.isDocker ? 'Docker' : 'Local'}
      Connection Type: ${settings.useRemoteAdb ? 'Remote ADB' : 'Direct'}
      Remote ADB: ${settings.remoteAdbHost ? `${settings.remoteAdbHost}:${settings.remoteAdbPort}` : 'Not configured'}
      
      Instructions:
      - If any location, permission, or user agreement popup appears, click agree
      - If login page appears, close it unless explicitly told to log in
      - Be efficient with interactions and minimize unnecessary steps
      - Report any errors or unexpected behavior
    `;
  }
  
  /**
   * Extract a clean error message from an error object
   * @private
   */
  _getErrorMessage(error) {
    if (!error) return 'Unknown error';
    
    // Handle different error formats
    if (typeof error === 'string') return error;
    if (error.message) return error.message;
    if (error.error) return String(error.error);
    
    return 'An unknown error occurred';
  }
  
  // ... (rest of the class remains the same)
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

  /**
   * Set the ADB host address
   * @param {string} host - The ADB host address
   */
  setAdbHost(host) {
    // Use updateSettings to ensure environment variables are properly updated
    this.updateSettings({ remoteAdbHost: host });
    console.log(`${this.logPrefix} Set ADB host to: ${host}`);
  }

  /**
   * Set the ADB port
   * @param {number|string} port - The ADB port number
   */
  setAdbPort(port) {
    // Use updateSettings to ensure environment variables are properly updated
    const portNum = typeof port === 'string' ? parseInt(port, 10) : port;
    this.updateSettings({ remoteAdbPort: portNum });
    console.log(`${this.logPrefix} Set ADB port to: ${portNum}`);
  }

  /**
   * Set the custom ADB path
   * @param {string} path - The path to the ADB executable
   */
  setAdbPath(path) {
    // Use updateSettings to ensure environment variables are properly updated
    this.updateSettings({ customAdbPath: path });
    console.log(`${this.logPrefix} Set ADB path to: ${path || 'default'}`);
  }

  /**
   * Test the ADB connection with current settings
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    try {
      console.log(`${this.logPrefix} Testing ADB connection...`);
      
      // Check if ADB is available
      const adbStatus = await this.checkAdbStatus();
      
      if (!adbStatus.installed) {
        throw new Error('ADB is not installed or not in PATH');
      }
      
      // Try to get the list of devices
      const devices = await this.getConnectedDevices();
      
      return {
        success: true,
        message: 'Successfully connected to ADB server',
        version: adbStatus.version,
        devices: Array.isArray(devices) ? devices : [],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`${this.logPrefix} ADB connection test failed:`, error);
      return {
        success: false,
        message: error.message || 'Failed to connect to ADB server',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString()
      };
    }
  }
}

// Export a singleton instance
const androidControl = new AndroidControl();
export default androidControl;
