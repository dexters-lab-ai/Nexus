import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Button, 
  Card, 
  List, 
  Typography, 
  Space, 
  Tag, 
  Alert, 
  message, 
  Modal, 
  Progress, 
  Badge, 
  Tooltip, 
  Divider, 
  notification,
  Popconfirm
} from 'antd';
import { 
  AndroidFilled, 
  SyncOutlined, 
  UsbOutlined, 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  ExclamationCircleOutlined, 
  InfoCircleOutlined, 
  LoadingOutlined, 
  QuestionCircleOutlined,
  LinkOutlined,
  DisconnectOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CheckOutlined,
  WarningOutlined
} from '@ant-design/icons';
import PropTypes from 'prop-types';
import api from '../utils/api';
import './AndroidConnection.css';

// Get WebSocket URL based on environment
const getWebSocketUrl = (deviceId = '') => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const deviceParam = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : '';
  return `${protocol}//${host}/ws/android${deviceParam}`;
};

// Status constants
const STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};

// Error boundary component
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('AndroidConnection Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert
          type="error"
          message="Something went wrong"
          description={
            <div>
              <p>Failed to load Android connection widget.</p>
              <Button 
                type="primary" 
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Retry
              </Button>
            </div>
          }
          showIcon
          style={{ margin: '16px' }}
        />
      );
    }
    return this.props.children;
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired
};

// Get API base URL based on environment
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  } else if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return `http://${window.location.hostname}:3420`; // Development port
  }
  return window.location.origin; // Production
};

// Helper function to make API requests
const apiRequest = async (endpoint, options = {}) => {
  try {
    const apiBase = getApiBaseUrl();
    const response = await fetch(`${apiBase}${endpoint}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return await response.json();
  } catch (error) {
    console.error('API Request Failed:', error);
    console.debug('API Base URL:', getApiBaseUrl());
    throw error;
  }
};

const { Title, Text, Paragraph } = Typography;

// Add some inline styles for connection status
const connectionStatusStyles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '16px',
    backgroundColor: '#fafafa',
    border: '1px solid #f0f0f0'
  },
  connected: {
    backgroundColor: '#f6ffed',
    borderColor: '#b7eb8f'
  },
  error: {
    backgroundColor: '#fff2f0',
    borderColor: '#ffccc7'
  },
  icon: {
    marginRight: '8px',
    fontSize: '16px'
  },
  text: {
    flex: 1
  },
  button: {
    marginLeft: '8px'
  }
};

const AndroidConnection = () => {
  // ADB and device status states
  const [adbStatus, setAdbStatus] = useState({
    installed: false,
    checking: true,
    version: null
  });

  const [deviceStatus, setDeviceStatus] = useState({
    connected: false,
    connecting: false,
    device: null,
    devices: []
  });

  const [status, setStatus] = useState(STATUS.DISCONNECTED);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Removed setupComplete state as we're using manual installation
  const [installProgress, setInstallProgress] = useState([]);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const ws = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectTimeout = useRef(null);
  const isMounted = useRef(true);

  // ADB status is now checked through the API client
  // All ADB status checks should use api.android.getStatus()

  // Handle installation progress updates
  const handleInstallProgress = useCallback((data) => {
    setInstallProgress(prev => [...prev, {
      type: data.status || 'info',
      message: data.message,
      timestamp: data.timestamp || Date.now()
    }]);
    
    if (data.status === 'success') {
      setTimeout(() => {
        setSetupComplete(true);
        setShowInstallModal(false);
        setInstallProgress([]);
      }, 1500);
    } else if (data.status === 'error') {
      setIsInstalling(false);
    }
  }, []);

  // Define handler functions before they're used in handleWebSocketMessage
  const handlePing = useCallback(() => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'pong',
        timestamp: Date.now()
      }));
    }
  }, []);

  const handlePingMessage = useCallback((data) => {
    if (ws.current) {
      ws.current.lastPong = Date.now();
      ws.current.isAlive = true;
    }
  }, []);

  const updateDeviceStatus = (data) => {
    setConnectedDevice(data.connected ? data.deviceId : null);
    setDevices(data.connected ? [{ id: data.deviceId, name: data.deviceName || 'Android Device' }] : []);
    setSetupComplete(data.setupComplete);
    setLoading(false);
  };

  const handleDeviceConnected = (data) => {
    setConnectedDevice(data.deviceId);
    setDevices([{ id: data.deviceId, name: data.deviceName || 'Android Device' }]);
    setStatus(STATUS.CONNECTED);
    message.success('Android device connected');
  };

  const handleDeviceDisconnected = (data) => {
    setConnectedDevice(null);
    setDevices([]);
    setStatus(STATUS.DISCONNECTED);
    message.warning('Android device disconnected');
  };

  const handleInstallStatus = useCallback((data) => {
    setSetupComplete(data.completed || false);
    if (data.error) {
      message.error(`Installation error: ${data.error}`);
      setError(data.error);
    } else if (data.completed) {
      message.success('Android tools installed successfully!');
    } else if (data.message) {
      message.info(data.message);
    }
    setLoading(false);
  }, []);

  // Handle WebSocket messages for device communication
  const handleWebSocketMessage = useCallback((data) => {
    if (!data || !data.type) {
      console.warn('Received message with no type:', data);
      return;
    }

    console.log('WebSocket message received:', data.type, data);

    switch (data.type) {
      case 'connection_ack':
        console.log('Android control client registered');
        setStatus(STATUS.CONNECTED);
        setLoading(false);
        break;
        
      case 'device_status':
      case 'android_status':
        // Update device connection status
        setDeviceStatus(prev => ({
          ...prev,
          connected: data.connected || false,
          device: data.device || null,
          devices: data.devices || [],
          connecting: false,
          error: data.error || null
        }));
        
        // Update connection status
        setStatus(data.connected ? STATUS.CONNECTED : STATUS.DISCONNECTED);
        
        // Show connection status message
        if (data.connected) {
          message.success(`Connected to ${data.device?.name || 'Android device'}`);
        } else if (data.error) {
          message.error(`Device error: ${data.error}`);
        }
        break;

      case 'device_connecting':
        setDeviceStatus(prev => ({
          ...prev,
          connecting: true,
          error: null
        }));
        setStatus(STATUS.CONNECTING);
        message.info('Connecting to device...');
        break;
        
      case 'device_connected':
        setDeviceStatus(prev => ({
          ...prev,
          connected: true,
          connecting: false,
          device: {
            id: data.deviceId,
            name: data.deviceName || 'Android Device',
            ...data.deviceInfo
          },
          error: null
        }));
        setStatus(STATUS.CONNECTED);
        message.success('Device connected successfully');
        break;
        
      case 'device_disconnected':
        setDeviceStatus(prev => ({
          ...prev,
          connected: false,
          connecting: false,
          device: null,
          error: data.reason || 'Device disconnected'
        }));
        setStatus(STATUS.DISCONNECTED);
        message.warning('Device disconnected');
        break;
        
      case 'android_error':
        setError(data.message || 'An error occurred with Android connection');
        setLoading(false);
        setDeviceStatus(prev => ({
          ...prev,
          connected: false,
          connecting: false,
          error: data.message || 'Connection error'
        }));
        message.error(data.message || 'An error occurred');
        break;
        
      case 'pong':
        // Handle ping-pong for connection keep-alive
        if (ws.current) {
          ws.current.lastPong = Date.now();
          ws.current.isAlive = true;
        }
        break;
        
      case 'ping':
        // Respond to ping from server
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
          }));
        }
        break;

      default:
        console.log('Unhandled message type:', data.type);
    }
  }, [
    handleInstallProgress, 
    handleInstallStatus,
    handlePingMessage,
    handlePing
  ]);

  // Check ADB status using the API client
  const checkAdbStatus = useCallback(async () => {
    try {
      console.log('Starting ADB status check...');
      setAdbStatus(prev => ({ ...prev, checking: true }));
      
      // Use the API client to check ADB status
      const status = await api.android.getStatus();
      console.log('ADB status response:', status);
      
      // Update ADB status state
      const newStatus = {
        installed: status.installed,
        checking: false,
        version: status.version || null,
        error: status.error || null
      };
      
      console.log('Updating ADB status:', newStatus);
      setAdbStatus(newStatus);
      
      // Update device list if devices are found
      if (status.devices && status.devices.length > 0) {
        console.log('Found connected devices:', status.devices);
        setDeviceStatus(prev => ({
          ...prev,
          devices: status.devices,
          connected: true,
          status: 'connected',
          device: status.devices[0] // Set the first device as active
        }));
        return true;
      }
      
      // No devices found
      console.log('No devices found, updating device status');
      setDeviceStatus(prev => ({
        ...prev,
        connected: false,
        status: 'disconnected',
        devices: [],
        device: null
      }));
      
      return status.installed || false;
      
    } catch (error) {
      const errorMsg = error.message || 'Failed to check ADB status';
      console.error('Error checking ADB status:', errorMsg, error);
      
      // Update status with error
      setAdbStatus({
        installed: false,
        checking: false,
        version: null,
        error: errorMsg
      });
      
      // Show error to user
      message.error(`ADB Check Failed: ${errorMsg}`);
      
      return false;
    }
  }, []);

  // Check ADB status on component mount and when WebSocket connects
  useEffect(() => {
    let intervalId;
    let isMounted = true;
    
    const checkStatus = async () => {
      if (!isMounted) return;
      
      try {
        const isInstalled = await checkAdbStatus();
        
        // Show install modal if ADB is not installed
        if (!isInstalled) {
          console.log('ADB not installed, showing installation modal');
          setShowInstallModal(true);
        } else {
          setShowInstallModal(false);
        }
        
        // Set up interval only if ADB is not installed
        if (!isInstalled && !intervalId) {
          console.log('Setting up ADB status check interval');
          intervalId = setInterval(checkStatus, 10000);
        } else if (isInstalled && intervalId) {
          console.log('ADB is now installed, clearing interval');
          clearInterval(intervalId);
          intervalId = null;
        }
      } catch (error) {
        console.error('Error in ADB status check:', error);
        // Show install modal on error
        setShowInstallModal(true);
        // Retry after delay on error
        if (isMounted) {
          setTimeout(checkStatus, 5000);
        }
      }
    };
    
    // Initial check
    checkStatus();
    
    // Cleanup function
    return () => {
      isMounted = false;
      if (intervalId) {
        console.log('Clearing ADB status check interval');
        clearInterval(intervalId);
      }
    };
  }, []); // No dependencies to prevent unnecessary re-renders

  // Handle ADB installation
  const installAdb = useCallback(async () => {
    try {
      setIsInstalling(true);
      setInstallProgress([{ 
        type: 'info', 
        message: 'Starting ADB installation...',
        timestamp: Date.now()
      }]);
      
      // Show installation instructions
      const installUrl = 'https://developer.android.com/studio/releases/platform-tools';
      setInstallProgress(prev => [...prev, {
        type: 'info',
        message: `Please install ADB from: ${installUrl}`,
        timestamp: Date.now()
      }]);
      
      // Open installation page in new tab
      window.open(installUrl, '_blank');
      
      // Show success message
      setInstallProgress(prev => [...prev, {
        type: 'success',
        message: 'Please follow the installation instructions in the new tab',
        timestamp: Date.now()
      }]);
      
      // Close modal after delay
      setTimeout(() => {
        setShowInstallModal(false);
        setIsInstalling(false);
        setInstallProgress([]);
      }, 5000);
      
    } catch (error) {
      console.error('Error during ADB installation:', error);
      setInstallProgress(prev => [...prev, {
        type: 'error',
        message: `Installation error: ${error.message}`,
        timestamp: Date.now()
      }]);
      setIsInstalling(false);
    }
  }, []);

  // Initialize WebSocket connection for device communication
  const initWebSocket = useCallback(() => {
    if (ws.current) {
      ws.current.close();
    }

    setStatus(STATUS.CONNECTING);
    setLoading(true);
    
    try {
      // Generate a unique client ID if no device is connected
      const deviceId = deviceStatus.device?.id || `client_${Date.now()}`;
      const wsUrl = getWebSocketUrl(deviceId);
      
      console.log('Connecting to Android WebSocket:', wsUrl);
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = async () => {
        if (!isMounted.current) return;
        
        try {
          setStatus(STATUS.CONNECTED);
          reconnectAttempts.current = 0;
          console.log('WebSocket connected for Android control');
          
          // Register this as a control client
          ws.current.send(JSON.stringify({ 
            type: 'register_client',
            userId: 'current_user_id', // Replace with actual user ID from your auth system
            timestamp: Date.now(),
            clientType: 'web'
          }));
          
          // Initial status check - this will handle ADB status check via API
          await refreshStatus();
          
        } catch (error) {
          console.error('Error during WebSocket initialization:', error);
          setStatus(STATUS.ERROR);
          setError('Failed to initialize device connection. Please try again.');
          
          // Attempt to reconnect on error
          if (reconnectAttempts.current < maxReconnectAttempts) {
            console.log('Attempting to reconnect...');
            attemptReconnect();
          }
        }
      };

      ws.current.onmessage = (event) => {
        if (!isMounted.current) return;
        
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data.type, data);
          
          // Handle different message types
          switch (data.type) {
            case 'connection_ack':
              console.log('Successfully registered with WebSocket server');
              setStatus(STATUS.CONNECTED);
              setLoading(false);
              break;
              
            case 'device_status_update':
              // Update device status from server
              setDeviceStatus(prev => ({
                ...prev,
                status: data.status,
                lastUpdated: data.timestamp
              }));
              break;
              
            case 'device_connected':
              setDeviceStatus(prev => ({
                ...prev,
                connected: true,
                device: data.device,
                error: null
              }));
              setStatus(STATUS.CONNECTED);
              message.success(`Device connected: ${data.device?.name || 'Android device'}`);
              break;
              
            case 'device_disconnected':
              setDeviceStatus(prev => ({
                ...prev,
                connected: false,
                device: null,
                error: data.reason || 'Device disconnected'
              }));
              setStatus(STATUS.DISCONNECTED);
              message.warning('Device disconnected');
              break;
              
            case 'pong':
              // Update last pong time for keep-alive
              if (ws.current) {
                ws.current.lastPong = Date.now();
              }
              break;
              
            case 'error':
              console.error('WebSocket error:', data.message);
              setError(data.message);
              setStatus(STATUS.ERROR);
              break;
              
            default:
              console.warn('Unhandled WebSocket message type:', data.type);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error, event.data);
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus(STATUS.ERROR);
        setError('Connection error. Please check your network and try again.');
        attemptReconnect();
      };

      ws.current.onclose = () => {
        if (!isMounted.current) return;
        
        console.log('WebSocket disconnected');
        setStatus(STATUS.DISCONNECTED);
        
        // Attempt to reconnect if not manually closed
        if (isMounted.current) {
          attemptReconnect();
        }
      };
      
      // Set up ping-pong for connection keep-alive
      const pingInterval = setInterval(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            type: 'ping',
            timestamp: Date.now()
          }));
        }
      }, 30000); // Ping every 30 seconds
      
      // Return cleanup function
      return () => {
        clearInterval(pingInterval);
      };
    } catch (error) {
      console.error('Error initializing WebSocket:', error);
      setError('Failed to initialize WebSocket connection');
      setStatus(STATUS.ERROR);
      setLoading(false);
    }

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [checkAdbStatus]);

  const attemptReconnect = () => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      setError('Max reconnection attempts reached. Please refresh the page.');
      return;
    }

    reconnectAttempts.current += 1;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
    
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
    }
    
    reconnectTimeout.current = setTimeout(() => {
      if (isMounted.current) {
        initWebSocket();
      }
    }, delay);
  };

  // handlePing and handlePingMessage are already defined at the top of the file
  // Handle installation status updates - implementation moved to the top of the file
  // handleDeviceDisconnected is already defined at the top of the file

  const handleError = (errorMessage) => {
    setError(errorMessage);
    message.error(errorMessage);
  };

  useEffect(() => {
    isMounted.current = true;
    initWebSocket();

    return () => {
      isMounted.current = false;
      if (ws.current) {
        ws.current.close();
      }
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
    };
  }, [initWebSocket]);

  const refreshStatus = async () => {
    try {
      setLoading(true);
      
      // Get ADB status and device list from the API
      const status = await api.android.getStatus();
      
      // Update ADB status state
      setAdbStatus({
        installed: status.installed,
        checking: false,
        version: status.version || null,
        error: status.error || null
      });
      
      if (!status.installed) {
        console.log('ADB not installed, showing installation prompt');
        // Don't automatically show the install modal here
        // Let the user click the install button
        return;
      }
      const hasDevices = status.devices && status.devices.length > 0;
      
      // Update device status based on server response
      setDeviceStatus(prev => ({
        ...prev,
        connected: hasDevices,
        status: hasDevices ? 'connected' : 'disconnected',
        devices: status.devices || [],
        error: hasDevices ? null : 'No devices found'
      }));
      
      // Show appropriate message
      if (hasDevices) {
        message.success(`Found ${status.devices.length} device(s)`);
      } else {
        message.info('No Android devices found. Please connect a device.');
      }
    } catch (error) {
      console.error('Error refreshing status:', error);
      message.error('Failed to refresh device status: ' + (error.message || 'Unknown error'));
      
      // Fall back to WebUSB check if server check fails
      const isWebUsbAvailable = !!navigator.usb;
      setDeviceStatus(prev => ({
        ...prev,
        connected: false,
        status: 'error',
        error: isWebUsbAvailable ? 'No devices found' : 'WebUSB not available',
        devices: []
      }));
      
      if (!isWebUsbAvailable) {
        setShowInstallModal(true);
      }
    } finally {
      setLoading(false);
    }
  };

  // Connect to an Android device
  const handleConnect = async () => {
    try {
      setLoading(true);
      
      // First check if ADB is installed using the API
      const status = await api.android.getStatus();
      
      if (!status.installed) {
        message.warning('ADB is required to connect to Android devices. Please install ADB first.');
        setShowInstallModal(true);
        return false;
      }
      
      // If we have a selected device, connect to it
      if (selectedDevice) {
        await connectDevice(selectedDevice.id);
      }

      setLoading(true);
      
      // Request USB device access
      try {
        const device = await navigator.usb.requestDevice({
          filters: [{
            classCode: 0xFF, // Vendor specific class
            protocolCode: 0x01 // ADB protocol
          }]
        });

        console.log('Selected USB device:', device);
        
        // Notify WebSocket server about the connection
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({
            type: 'connect_device',
            deviceId: device.serialNumber || device.deviceId,
            deviceInfo: {
              vendorId: device.vendorId,
              productId: device.productId,
              deviceName: device.productName || 'Android Device'
            },
            timestamp: Date.now()
          }));
          
          setStatus(STATUS.CONNECTING);
          message.info('Connecting to device...');
        }
      } catch (error) {
        console.log('No device selected or access denied:', error);
        message.warning('No device selected or access denied');
        setLoading(false);
      }
    } catch (error) {
      console.error('Connection error:', error);
      message.error(`Connection failed: ${error.message}`);
      setStatus(STATUS.ERROR);
      setLoading(false);
    }
  };

  const handleInstall = () => {
    try {
      // Open the Android command-line tools download page in a new tab
      const downloadUrl = 'https://developer.android.com/studio/releases/platform-tools';
      const newWindow = window.open(downloadUrl, '_blank');
      
      if (!newWindow) {
        throw new Error('Please allow popups for this site to download Android Tools');
      }
      
      // Show installation modal with instructions
      setShowInstallModal(true);
      setInstallProgress([
        {
          type: 'info',
          message: 'Opened Android Command Line Tools download page in your browser.',
          timestamp: Date.now()
        },
        {
          type: 'info',
          message: 'Please follow these steps to install ADB:',
          timestamp: Date.now()
        },
        {
          type: 'info',
          message: '1. Download the Command-line tools for your operating system',
          timestamp: Date.now()
        },
        {
          type: 'info',
          message: '2. Extract the downloaded package to a location of your choice (e.g., C:\\android-sdk)',
          timestamp: Date.now()
        },
        {
          type: 'info',
          message: '3. Add the platform-tools directory to your system PATH',
          timestamp: Date.now()
        },
        {
          type: 'info',
          message: '4. Set the following environment variables:',
          timestamp: Date.now()
        },
        {
          type: 'info',
          message: '   - ANDROID_HOME: Path to your Android SDK directory (e.g., C:\\android-sdk)',
          timestamp: Date.now()
        },
        {
          type: 'info',
          message: '   - ANDROID_SDK_ROOT: Same as ANDROID_HOME',
          timestamp: Date.now()
        },
        {
          type: 'info',
          message: '5. Verify the installation by opening a new terminal and running: adb --version',
          timestamp: Date.now()
        },
        {
          type: 'info',
          message: '6. Restart this application after installation',
          timestamp: Date.now()
        }
      ]);
      
    } catch (err) {
      console.error('Error opening download page:', err);
      setError('Failed to open download page: ' + (err.message || 'Unknown error'));
      
      // Fallback: If popup is blocked, show the URL directly
      if (err.message.includes('popup')) {
        setInstallProgress([
          {
            type: 'error',
            message: 'Pop-up was blocked. Please visit this URL manually:',
            timestamp: Date.now()
          },
          {
            type: 'info',
            message: 'https://developer.android.com/studio/releases/platform-tools',
            timestamp: Date.now()
          }
        ]);
      }
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case STATUS.CONNECTED:
        return <Badge status="success" text="Connected" />;
      case STATUS.CONNECTING:
        return <Badge status="processing" text="Connecting..." />;
      case STATUS.ERROR:
        return <Badge status="error" text="Connection Error" />;
      default:
        return <Badge status="default" text="Disconnected" />;
    }
  };

  const deviceConnect = useCallback(async (deviceUdid = null) => {
    const udid = deviceUdid || selectedDevice?.udid;
    
    if (!udid) {
      setError('No device selected');
      return;
    }

    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to server');
      return;
    }
    
    setLoading(true);
    setError('');

    setDeviceStatus(prev => ({
      ...prev,
      status: 'connecting',
      error: null
    }));

    try {
      // Check if ADB is installed and working
      const isAdbInstalled = await checkAdbStatus();
      if (!isAdbInstalled) {
        throw new Error('ADB is not installed or not working. Please check your ADB installation.');
      }

      // Send connect command via WebSocket
      ws.current.send(JSON.stringify({
        type: 'connect_device',
        deviceUdid: udid,
        timestamp: Date.now()
      }));
      
      // Update the selected device from the current device list
      setSelectedDevice(deviceStatus.devices.find(d => d.udid === udid) || null);
      
      // For local connection, we'll assume success after a short delay
      // The actual connection status will be updated by the WebSocket handler
      setTimeout(() => {
        setDeviceStatus(prev => ({
          ...prev,
          status: 'connected',
          connectedDevice: udid,
          error: null
        }));
      }, 1000);
      
    } catch (err) {
      console.error('Connection error:', err);
      setDeviceStatus(prev => ({
        ...prev,
        status: 'disconnected',
        error: err.message || 'Failed to connect to device',
        connectedDevice: null
      }));
      setError('Failed to connect to device: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [ws, setSelectedDevice, checkAdbStatus, selectedDevice]);

  const handleDisconnect = async () => {
    // Try WebSocket disconnection first if available
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      try {
        setLoading(true);
        ws.current.send(JSON.stringify({
          type: 'disconnect_device',
          timestamp: Date.now()
        }));
        
        // Update UI immediately for better UX
        setConnectedDevice(null);
        setDevices([]);
        setStatus(STATUS.DISCONNECTED);
        message.success('Disconnected from Android device');
        return;
      } catch (err) {
        console.error('WebSocket disconnect error:', err);
        // Fall through to API-based disconnection
      }
    }
    
    // Fall back to API-based disconnection if WebSocket fails or isn't available
    try {
      setLoading(true);
      const data = await apiRequest('/api/android/disconnect', { method: 'POST' });
      
      if (data.success) {
        message.success('Disconnected from Android device');
        setConnectedDevice(null);
        setDevices([]);
        setStatus(STATUS.DISCONNECTED);
      } else {
        throw new Error(data.error || 'Failed to disconnect');
      }
    } catch (err) {
      console.error('Disconnect error:', err);
      message.error(err.status === 401 ? 'Session expired' : 'Failed to disconnect: ' + (err.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const renderConnectionButton = () => {
    // Show loading state
    if (adbStatus.checking) {
      return (
        <div className="connection-status" style={{
          padding: '16px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
            <LoadingOutlined style={{ fontSize: 32, color: '#1890ff' }} />
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600, color: '#fff' }}>Checking Android Debug Bridge</h3>
              <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.75)' }}>Verifying your ADB installation and device connection...</p>
            </div>
          </div>
        </div>
      );
    }

    // Show error state or when ADB is not installed
    if (adbStatus.error || !adbStatus.installed) {
      const errorMessage = adbStatus.error || 'Android Debug Bridge (ADB) is not installed or not properly configured.';
      
      return (
        <div className="connection-status" style={{
          padding: '16px',
          borderRadius: '12px',
          background: 'rgba(255, 77, 79, 0.1)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 77, 79, 0.2)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '20px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(255, 77, 79, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '8px'
            }}>
              <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '32px' }} />
            </div>
            
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600, color: '#fff' }}>Android Debug Bridge Required</h3>
              <p style={{ 
                margin: '0 0 16px', 
                color: 'rgba(255, 255, 255, 0.75)', 
                maxWidth: '500px',
                lineHeight: '1.5'
              }}>
                {errorMessage}
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button 
                type="primary" 
                icon={<DownloadOutlined />} 
                onClick={() => setShowInstallModal(true)}
                size="large"
                style={{
                  background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                  border: 'none',
                  boxShadow: '0 2px 0 rgba(5, 145, 255, 0.1)',
                  fontWeight: 500
                }}
              >
                Install ADB Tools
              </Button>
              <Button 
                type="default" 
                icon={<QuestionCircleOutlined />} 
                onClick={() => window.open('https://developer.android.com/studio/command-line/adb', '_blank')}
                size="large"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontWeight: 500
                }}
              >
                Learn More
              </Button>
            </div>
            
            <div style={{ 
              marginTop: '16px', 
              padding: '12px 16px', 
              background: 'rgba(0, 0, 0, 0.2)', 
              borderRadius: '8px', 
              textAlign: 'left', 
              width: '100%',
              maxWidth: '500px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', color: '#fff' }}>
                <InfoCircleOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                Quick Start Guide
              </div>
              <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: '1.6' }}>
                <ol style={{ margin: '0 0 0 16px', padding: 0 }}>
                  <li style={{ marginBottom: '6px' }}>Download and install Android Platform Tools</li>
                  <li style={{ marginBottom: '6px' }}>Add ADB to your system PATH</li>
                  <li>Enable USB debugging on your Android device</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Connected state
    if (deviceStatus.connected && deviceStatus.device) {
      return (
        <div className="connection-status" style={{
          padding: '16px',
          borderRadius: '12px',
          background: 'rgba(82, 196, 26, 0.1)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(82, 196, 26, 0.2)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(82, 196, 26, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <CheckCircleOutlined style={{ color: '#52c41a', fontSize: '24px' }} />
            </div>
            
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                marginBottom: '4px'
              }}>
                <h3 style={{ 
                  margin: 0, 
                  fontSize: '16px', 
                  fontWeight: 600,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {deviceStatus.device.name || 'Android Device'}
                </h3>
                <span style={{
                  fontSize: '12px',
                  background: 'rgba(0, 0, 0, 0.2)',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontWeight: 500
                }}>
                  Connected
                </span>
              </div>
              
              {deviceStatus.device.model && (
                <div style={{ 
                  display: 'flex', 
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: '4px'
                }}>
                  <span style={{
                    fontSize: '13px',
                    color: 'rgba(255, 255, 255, 0.75)',
                    background: 'rgba(255, 255, 255, 0.05)',
                    padding: '2px 8px',
                    borderRadius: '4px'
                  }}>
                    {deviceStatus.device.model}
                  </span>
                  {deviceStatus.device.serial && (
                    <span style={{
                      fontSize: '13px',
                      color: 'rgba(255, 255, 255, 0.6)',
                      background: 'rgba(255, 255, 255, 0.03)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontFamily: 'monospace'
                    }}>
                      {deviceStatus.device.serial}
                    </span>
                  )}
                </div>
              )}
            </div>
            
            <Button 
              type="default"
              danger
              icon={<DisconnectOutlined />}
              onClick={handleDisconnect}
              disabled={loading}
              style={{
                background: 'rgba(255, 77, 79, 0.1)',
                borderColor: 'rgba(255, 77, 79, 0.3)',
                color: '#ff4d4f',
                fontWeight: 500
              }}
            >
              Disconnect
            </Button>
          </div>
        </div>
      );
    }

    // Connecting state
    if (status === STATUS.CONNECTING || deviceStatus.connecting) {
      return (
        <div className="connection-status" style={{
          padding: '16px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.08)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(24, 144, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <LoadingOutlined style={{ color: '#1890ff', fontSize: '24px' }} />
            </div>
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: 600, color: '#fff' }}>Connecting to Device</h3>
              <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.65)' }}>Please wait while we connect to your Android device...</p>
            </div>
          </div>
        </div>
      );
    }
    
    // ADB not installed or error state
    if (!adbStatus.installed || adbStatus.error) {
      const errorMessage = adbStatus.error || 'Android Debug Bridge (ADB) is not installed or not properly configured.';
      
      return (
        <div className="connection-status" style={{
          padding: '16px',
          borderRadius: '12px',
          background: 'rgba(255, 77, 79, 0.1)',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 77, 79, 0.2)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '20px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(255, 77, 79, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '8px'
            }}>
              <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '32px' }} />
            </div>
            
            <div>
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600, color: '#fff' }}>Android Debug Bridge Required</h3>
              <p style={{ 
                margin: '0 0 16px', 
                color: 'rgba(255, 255, 255, 0.75)', 
                maxWidth: '500px',
                lineHeight: '1.5'
              }}>
                {errorMessage}
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
              <Button 
                type="primary" 
                icon={<DownloadOutlined />} 
                onClick={() => setShowInstallModal(true)}
                size="large"
                style={{
                  background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
                  border: 'none',
                  boxShadow: '0 2px 0 rgba(5, 145, 255, 0.1)',
                  fontWeight: 500
                }}
              >
                Install ADB Tools
              </Button>
              <Button 
                type="default" 
                icon={<QuestionCircleOutlined />} 
                onClick={() => window.open('https://developer.android.com/studio/command-line/adb', '_blank')}
                size="large"
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontWeight: 500
                }}
              >
                Learn More
              </Button>
            </div>
            
            <div style={{ 
              marginTop: '16px', 
              padding: '12px 16px', 
              background: 'rgba(0, 0, 0, 0.2)', 
              borderRadius: '8px', 
              textAlign: 'left', 
              width: '100%',
              maxWidth: '500px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', color: '#fff' }}>
                <InfoCircleOutlined style={{ marginRight: '8px', color: '#1890ff' }} />
                Quick Start Guide
              </div>
              <div style={{ fontSize: '14px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: '1.6' }}>
                <ol style={{ margin: '0 0 0 16px', padding: 0 }}>
                  <li style={{ marginBottom: '6px' }}>Download and install Android Platform Tools</li>
                  <li style={{ marginBottom: '6px' }}>Add ADB to your system PATH</li>
                  <li>Enable USB debugging on your Android device</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Default state - No device connected
    return (
      <div className="connection-status" style={{
        padding: '16px',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(10px)',
        border: '1px dashed rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(24, 144, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '8px'
          }}>
            <UsbOutlined style={{ color: '#1890ff', fontSize: '28px' }} />
          </div>
          
          <div>
            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600, color: '#fff' }}>No Device Connected</h3>
            <p style={{ 
              margin: '0 0 16px', 
              color: 'rgba(255, 255, 255, 0.65)', 
              maxWidth: '500px',
              lineHeight: '1.5'
            }}>
              Connect an Android device with USB debugging enabled to get started
            </p>
          </div>
          
          <Button 
            type="primary" 
            icon={<UsbFilled />}
            onClick={handleConnect}
            loading={loading}
            size="large"
            style={{
              background: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
              border: 'none',
              boxShadow: '0 2px 0 rgba(5, 145, 255, 0.1)',
              fontWeight: 500,
              padding: '0 24px',
              height: '40px',
              borderRadius: '8px'
            }}
          >
            Connect Device
          </Button>
          
          <div style={{ 
            marginTop: '8px', 
            fontSize: '13px', 
            color: 'rgba(255, 255, 255, 0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <InfoCircleOutlined style={{ fontSize: '12px' }} />
            <span>Make sure USB debugging is enabled in Developer Options</span>
          </div>
        </div>
      </div>
    );
  };

  const renderInstallButton = () => {
    return (
      <Tooltip 
        title="Download and install Android command-line tools"
        placement="top"
      >
        <Button 
          type="primary"
          icon={<DownloadOutlined />}
          onClick={() => window.open('https://developer.android.com/studio/releases/platform-tools', '_blank')}
          style={{ marginTop: 16 }}
        >
          Download Android Tools
        </Button>
      </Tooltip>
    );
  };

  // Calculate installation progress percentage
  const calculateProgress = () => {
    if (!installProgress.length) return 0;
    
    const totalSteps = 5; // Total expected steps in installation
    const completedSteps = installProgress.filter(p => 
      p.type === 'success' || 
      (p.type === 'info' && p.message.includes('completed'))
    ).length;
    
    return Math.min(Math.round((completedSteps / totalSteps) * 100), 100);
  };

  // Render installation modal
  const renderInstallModal = () => {
    const progress = calculateProgress();
    const hasError = installProgress.some(p => p.type === 'error');
    const isComplete = installProgress.some(p => p.type === 'success' && p.message.includes('completed'));
    
    return (
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DownloadOutlined />
            <span>Android Tools Installation</span>
          </div>
        }
        open={showInstallModal}
        onCancel={() => !isInstalling && setShowInstallModal(false)}
        footer={[
          <Button 
            key="close" 
            type="primary"
            onClick={() => setShowInstallModal(false)}
            disabled={isInstalling && !isComplete}
          >
            {isComplete ? 'Done' : isInstalling ? 'Installing...' : 'Close'}
          </Button>
        ]}
        width={700}
        maskClosable={!isInstalling}
        keyboard={!isInstalling}
      >
        <div style={{ marginBottom: 16 }}>
          {isInstalling && !isComplete && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span>Installation Progress</span>
                <span>{progress}%</span>
              </div>
              <Progress 
                percent={progress} 
                status={hasError ? 'exception' : 'active'}
                showInfo={false}
                strokeColor={hasError ? '#ff4d4f' : '#1890ff'}
              />
            </div>
          )}
          
          <div style={{ 
            maxHeight: '50vh', 
            overflowY: 'auto', 
            border: '1px solid #f0f0f0',
            borderRadius: 4,
            padding: 16
          }}>
            {installProgress.length > 0 ? (
              installProgress.map((item, index) => (
                <div 
                  key={index}
                  style={{ 
                    padding: '8px 0',
                    borderBottom: '1px solid #f0f0f0',
                    color: item.type === 'error' ? '#ff4d4f' : 'inherit'
                  }}
                >
                  {item.message}
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(0, 0, 0, 0.45)' }}>
                <LoadingOutlined style={{ fontSize: 24, marginBottom: 16, display: 'block' }} />
                <div>Preparing installation instructions...</div>
              </div>
            )}
          </div>
          
          {isComplete && (
            <div style={{ 
              marginTop: 16,
              padding: '12px 16px',
              backgroundColor: '#f6ffed',
              border: '1px solid #b7eb8f',
              borderRadius: 4
            }}>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
              Installation completed successfully!
            </div>
          )}
          
          {hasError && (
            <div style={{ 
              marginTop: 16,
              padding: '12px 16px',
              backgroundColor: '#fff2f0',
              border: '1px solid #ffccc7',
              borderRadius: 4
            }}>
              <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
              Installation encountered an error. Please check the logs above for details.
            </div>
          )}
        </div>
      </Modal>
    );
  };

  return (
    <ErrorBoundary>
      <Card 
        title={
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <AndroidFilled style={{ marginRight: 8 }} />
            <span>Android Device</span>
            <div style={{ marginLeft: 8 }}>
              {getStatusBadge()}
            </div>
            <Tooltip 
              title={
                <div>
                  <p>Connection status: {status}</p>
                  {error && <p>Error: {error}</p>}
                  <p>Click for more details</p>
                </div>
              }
              placement="right"
            >
              <Button 
                type="text" 
                size="small" 
                icon={<InfoCircleOutlined />} 
                onClick={() => setModalVisible(true)}
              />
            </Tooltip>
            <Button 
              type="text" 
              size="small" 
              icon={<ReloadOutlined />} 
              onClick={refreshStatus}
              loading={loading}
              style={{ marginLeft: 4 }}
            />
          </div>
        }
    >
      <div style={{ minHeight: '120px' }}>
        {error && (
          <Alert
            type="error"
            message="Connection Error"
            description={
              <div>
                <p>{error}</p>
                <Button 
                  type="primary" 
                  size="small" 
                  onClick={refreshStatus}
                  loading={loading}
                >
                  Retry
                </Button>
              </div>
            }
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {loading && !error ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <LoadingOutlined style={{ fontSize: 24 }} />
            <div>Checking status...</div>
          </div>
        ) : status === STATUS.CONNECTED ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <List
              dataSource={deviceStatus.devices || []}
              renderItem={device => (
                <List.Item>
                  <List.Item.Meta
                    title={device.name}
                    description={
                      <Space direction="vertical" size={0}>
                        <Text type="secondary" style={{ fontSize: 12 }}>ID: {device.id}</Text>
                        <Text type="success" style={{ fontSize: 12 }}>
                          <Badge status="success" /> Connected
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
            {renderConnectionButton()}
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {renderConnectionButton()}
            <Button 
              type="link" 
              block 
              onClick={() => setModalVisible(true)}
              style={{ marginTop: 8 }}
            >
              Setup Instructions & Troubleshooting
            </Button>
          </Space>
        )}
      </div>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AndroidFilled />
            <span>Android Device Setup</span>
          </div>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button 
            key="close" 
            onClick={() => setModalVisible(false)}
          >
            Close
          </Button>,
          <Button 
            key="download" 
            type="primary" 
            onClick={handleInstall}
            icon={<DownloadOutlined />}
          >
            Download Android Tools
          </Button>
        ]}
        width={600}
      >
        <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '0 16px 16px 0' }}>
          <div style={{ marginBottom: 24 }}>
            <Title level={5} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: '50%',
                backgroundColor: '#1890ff',
                color: '#fff',
                fontWeight: 'bold',
                flexShrink: 0
              }}>
                1
              </span>
              <span>Install Android Command Line Tools</span>
            </Title>
            <div style={{ paddingLeft: 40, marginBottom: 24 }}>
              <div style={{ 
                backgroundColor: '#f0f7ff',
                border: '1px solid #91d5ff',
                borderRadius: 8,
                padding: '16px',
                marginBottom: '24px'
              }}>
                <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>What is ADB?</Title>
                <p style={{ marginBottom: 12, lineHeight: 1.6 }}>
                  <strong>Android Debug Bridge (ADB)</strong> is a command-line tool that lets you communicate with an Android device. 
                  This app uses ADB to:
                </p>
                <ul style={{ margin: '0 0 16px 0', paddingLeft: '24px', lineHeight: 1.8 }}>
                  <li>Securely connect to Android devices</li>
                  <li>Transfer files between your computer and device</li>
                  <li>Access device features and debugging information</li>
                  <li>Enable advanced functionality within this application</li>
                </ul>
                <p style={{ marginBottom: 0, lineHeight: 1.6 }}>
                  To get started, you'll need to install the Android Command Line Tools which include ADB.
                </p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <Title level={5} style={{ marginBottom: 12 }}>Download Android Command Line Tools</Title>
                <Button 
                  type="primary" 
                  icon={<DownloadOutlined />}
                  onClick={handleInstall}
                  size="large"
                  style={{ marginBottom: 16 }}
                >
                  Download Now
                </Button>
                <div style={{ color: '#595959', marginBottom: 16 }}>
                  <p>After downloading, follow these steps:</p>
                </div>
                
                <div style={{ 
                  backgroundColor: '#f9f9f9', 
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 16
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{
                      backgroundColor: '#e6f7ff',
                      color: '#1890ff',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                      flexShrink: 0,
                      fontWeight: 'bold'
                    }}>A</div>
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Extract the downloaded ZIP file</div>
                      <div style={{ color: '#595959', fontSize: 14 }}>
                        Extract the contents to a permanent location, for example:
                        <div style={{ 
                          backgroundColor: '#f0f0f0', 
                          padding: '8px 12px', 
                          borderRadius: 4,
                          margin: '8px 0',
                          fontFamily: 'monospace',
                          fontSize: 13
                        }}>
                          C:\\android-sdk
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <Divider style={{ margin: '16px 0' }} />
                  
                  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{
                      backgroundColor: '#e6f7ff',
                      color: '#1890ff',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                      flexShrink: 0,
                      fontWeight: 'bold'
                    }}>B</div>
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Set up environment variables</div>
                      <ol style={{ margin: '8px 0', paddingLeft: 20, color: '#595959' }}>
                        <li>Press <Text keyboard>Win + X</Text> and select <Text>System</Text></li>
                        <li>Click <Text>About</Text> &gt; <Text>Advanced system settings</Text></li>
                        <li>Click <Text>Environment Variables</Text></li>
                        <li>Under <Text>System variables</Text>, click <Text>New</Text> and add:
                          <ul style={{ margin: '8px 0 8px 20px', paddingLeft: 8 }}>
                            <li>Variable name: <Text code>ANDROID_HOME</Text></li>
                            <li>Variable value: <Text code>C:\\android-sdk</Text> (or your chosen path)</li>
                          </ul>
                        </li>
                        <li>Find and select the <Text code>Path</Text> variable, then click <Text>Edit</Text>
                          <ul style={{ margin: '8px 0 8px 20px', paddingLeft: 8 }}>
                            <li>Click <Text>New</Text> and add: <Text code>%ANDROID_HOME%\\platform-tools</Text></li>
                            <li>Click <Text>New</Text> and add: <Text code>%ANDROID_HOME%\\cmdline-tools\\latest\\bin</Text></li>
                          </ul>
                        </li>
                      </ol>
                    </div>
                  </div>
                  
                  <Divider style={{ margin: '16px 0' }} />
                  
                  <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                    <div style={{
                      backgroundColor: '#e6f7ff',
                      color: '#1890ff',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                      flexShrink: 0,
                      fontWeight: 'bold'
                    }}>C</div>
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: 4 }}>Verify the installation</div>
                      <div style={{ color: '#595959' }}>
                        <p>1. Open a new Command Prompt or PowerShell window</p>
                        <p>2. Run this command:</p>
                        <div style={{ 
                          backgroundColor: '#1e1e1e', 
                          color: '#d4d4d4',
                          padding: '8px 12px', 
                          borderRadius: 4,
                          margin: '8px 0',
                          fontFamily: 'monospace',
                          fontSize: 13,
                          overflowX: 'auto'
                        }}>
                          adb --version
                        </div>
                        <p>3. You should see the ADB version number if installed correctly</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Alert 
                  type="info"
                  showIcon
                  message="Important Notes"
                  description={
                    <div>
                      <p>• You may need to <strong>restart your computer</strong> for the PATH changes to take effect</p>
                      <p>• After installation, <strong>restart this application</strong> to detect the changes</p>
                      <p>• If you encounter issues, try running your terminal as Administrator</p>
                    </div>
                  }
                  style={{ marginTop: 16 }}
                />
              </div>
            </div>
          </div>
          
          <div style={{ marginBottom: 24 }}>
            <Title level={5} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                fontWeight: 'normal',
              }}>
                2
              </span>
              Enable Developer Options
            </Title>
            <div style={{ paddingLeft: 32 }}>
              <Paragraph type="secondary">
                Go to <Text code>Settings</Text> {'>'} <Text code>About phone</Text> {'>'} Tap "Build number" 7 times
              </Paragraph>
              <div style={{ marginTop: 8 }}>
                <Alert 
                  type="info"
                  message="Look for 'Build number' in the 'About phone' section"
                  showIcon
                />
              </div>
            </div>
          </div>
          
          <div style={{ marginBottom: 24 }}>
            <Title level={5} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                fontWeight: 'normal',
              }}>
                3
              </span>
              Enable USB Debugging
            </Title>
            <div style={{ paddingLeft: 32 }}>
              <Paragraph type="secondary">
                Go to <Text code>Settings</Text> {'>'} <Text code>System</Text> {'>'} 
                <Text code>Developer options</Text> {'>'} Enable <Text code>USB debugging</Text>
              </Paragraph>
              <div style={{ marginTop: 8 }}>
                <Alert 
                  type="info"
                  message="Developer options will appear after enabling it in step 2"
                  showIcon
                />
              </div>
            </div>
          </div>
          
          <div>
            <Title level={5} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: '50%',
                backgroundColor: '#f0f0f0',
                fontWeight: 'normal',
              }}>
                4
              </span>
              Connect Your Device
            </Title>
            <div style={{ paddingLeft: 32 }}>
              <Paragraph type="secondary">
                Connect your device via USB and tap "Allow USB debugging" on the prompt
              </Paragraph>
              <div style={{ marginTop: 8 }}>
                <Alert 
                  type="info"
                  message={
                    <div>
                      <p>• Use a USB cable to connect your Android device</p>
                      <p>• Look for a "USB debugging" prompt on your device</p>
                      <p>• Tap "OK" to allow USB debugging from this computer</p>
                      <p>• Check "Always allow from this computer" to avoid future prompts</p>
                    </div>
                  }
                  showIcon
                />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ marginTop: 24 }}>
              <Alert
                type="error"
                message="Troubleshooting"
                description={
                  <div>
                    <p>If you're having trouble connecting:</p>
                    <ol>
                      <li>Make sure USB debugging is enabled in Developer options</li>
                      <li>Try a different USB cable or USB port</li>
                      <li>On your device, check for any prompts to allow USB debugging</li>
                      <li>Restart both your computer and Android device</li>
                      <li>Ensure you have the latest device drivers installed</li>
                    </ol>
                    <div style={{ marginTop: 16 }}>
                      <Button 
                        type="primary" 
                        onClick={refreshStatus}
                        loading={loading}
                      >
                        Check Connection Again
                      </Button>
                    </div>
                  </div>
                }
                showIcon
              />
            </div>
          )}
        </div>
      </Modal>
    </Card>
    </ErrorBoundary>
  );
};

AndroidConnection.propTypes = {
  // Add any props if needed in the future
};

export default AndroidConnection;
