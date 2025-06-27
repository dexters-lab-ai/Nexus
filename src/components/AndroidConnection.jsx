import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Button,
  Card, 
  List, 
  Tabs,
  Space, 
  Tag, 
  Alert, 
  Badge, 
  Spin, 
  Modal, 
  Steps, 
  Typography, 
  Tooltip, 
  notification 
} from 'antd';
import { 
  AndroidFilled, 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  DownloadOutlined, 
  LoadingOutlined, 
  QuestionCircleOutlined, 
  ReloadOutlined, 
  UsbOutlined,
  LinkOutlined,
  ToolOutlined,
  CodeOutlined
} from '@ant-design/icons'; 
import RippleButton from './RippleButton';
import api from '../utils/api';
import './AndroidConnection.css';

// Reusable action button component
const ActionButton = ({ 
  type = 'primary', 
  danger = false, 
  icon, 
  onClick, 
  children, 
  style = {},
  maxWidth = 200
}) => (
  <RippleButton
    type={type}
    danger={danger}
    onClick={onClick}
    style={{
      height: 40,
      fontSize: 14,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      maxWidth,
      margin: '0 auto',
      ...style
    }}
  >
    {icon}
    {children}
  </RippleButton>
);



// Status constants
const STATUS = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error'
};

const AndroidConnection = ({ onClose, active = false }) => {
  // Consolidated state
  const [state, setState] = useState({
    status: STATUS.DISCONNECTED,
    error: null,
    loading: false,
    adbStatus: {
      installed: false,
      checking: true,
      error: null
    },
    device: null,
    devices: [],
    showInstallModal: false,
    isInstalling: false,
    installProgress: []
  });

  const ws = useRef(null);
  const reconnectAttempts = useRef(0);
  const isMounted = useRef(true);
  const reconnectTimeout = useRef(null);

  // Update state helper
  const updateState = (updates) => {
    if (isMounted.current) {
      setState(prev => ({
        ...prev,
        ...(typeof updates === 'function' ? updates(prev) : updates)
      }));
    }
  };

  // Check ADB status with detailed feedback
  const checkAdbStatus = useCallback(async () => {
    console.log('checkAdbStatus called');
    try {
      updateState(prev => ({
        ...prev,
        loading: true,
        error: null,
        adbStatus: { 
          ...prev.adbStatus,
          checking: true,
          error: null 
        }
      }));

      const response = await api.android.getStatus();
      
      if (response.installed) {
        updateState(prev => ({
          ...prev,
          loading: false,
          adbStatus: {
            installed: true,
            version: response.version,
            error: null,
            checking: false
          },
          // Only update status if not already connected
          ...(prev.status !== STATUS.CONNECTED && {
            status: STATUS.DISCONNECTED,
            error: null
          })
        }));
      } else {
        updateState(prev => ({
          ...prev,
          loading: false,
          adbStatus: {
            installed: false,
            version: null,
            error: response.error || 'ADB is not installed',
            checking: false
          },
          status: STATUS.ERROR,
          error: 'ADB is not installed. Please install Android Debug Bridge.'
        }));
      }
      return response.installed;
    } catch (error) {
      console.error('Error checking ADB status:', error);
      updateState(prev => ({
        ...prev,
        loading: false,
        adbStatus: {
          installed: false,
          version: null,
          error: error.message,
          checking: false
        },
        status: STATUS.ERROR,
        error: 'Failed to check ADB status: ' + error.message
      }));
      return false;
    }
  }, []);

  // WebSocket connection manager
  const connectWebSocket = useCallback(() => {
    console.log('connectWebSocket called, current attempts:', reconnectAttempts.current);
    
    // Don't reconnect if we're already connected or have exceeded max attempts
    if (ws.current?.readyState === WebSocket.OPEN || reconnectAttempts.current >= 5) {
      console.log('WebSocket already connected or max attempts reached');
      return;
    }

    // Clean up any existing connection
    if (ws.current) {
      console.log('Cleaning up existing WebSocket connection');
      ws.current.onopen = null;
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.onmessage = null;
      try {
        ws.current.close();
      } catch (e) {
        console.error('Error closing WebSocket:', e);
      }
      ws.current = null;
    }

    // Only update state if this is the first attempt
    if (reconnectAttempts.current === 0) {
      updateState(prev => ({
        ...prev,
        status: STATUS.CONNECTING,
        error: null
      }));
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/frontend`;
    
    console.log('Creating new WebSocket connection to:', wsUrl);
    
    try {
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log('WebSocket connected successfully');
        reconnectAttempts.current = 0;
        updateState(prev => ({
          ...prev,
          status: STATUS.CONNECTED,
          error: null
        }));
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message received:', data);
          
          // Handle different message types
          switch (data.type) {
            case 'device_connected':
              console.log('Device connected:', data.device);
              updateState(prev => ({
                ...prev,
                device: data.device,
                // Only add to devices list if not already present
                devices: prev.devices.some(d => d.id === data.device.id) 
                  ? prev.devices 
                  : [...prev.devices, data.device],
                status: STATUS.CONNECTED,
                error: null,
                loading: false
              }));
              break;
              
            case 'device_disconnected':
              console.log('Device disconnected:', data.deviceId);
              updateState(prev => {
                const newDevices = prev.devices.filter(dev => dev.id !== data.deviceId);
                return {
                  ...prev,
                  // Only clear current device if it's the one that disconnected
                  device: prev.device?.id === data.deviceId ? null : prev.device,
                  devices: newDevices,
                  // Only go to disconnected state if it was the current device
                  status: prev.device?.id === data.deviceId ? STATUS.DISCONNECTED : prev.status,
                  error: prev.device?.id === data.deviceId ? 'Device disconnected' : prev.error
                };
              });
              break;
              
            case 'connection_established':
              console.log('WebSocket connection established');
              updateState(prev => ({
                ...prev,
                status: STATUS.CONNECTED,
                error: null
              }));
              
              // Request current device status
              if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.send(JSON.stringify({ type: 'get_device_status' }));
              }
              break;
              
            case 'error':
              console.error('WebSocket error:', data.message);
              updateState(prev => ({
                ...prev,
                status: data.severity === 'warning' ? prev.status : STATUS.ERROR,
                error: data.message || 'Connection error'
              }));
              break;
              
            case 'device_list':
              console.log('Received device list:', data.devices);
              if (data.devices && data.devices.length > 0) {
                updateState(prev => ({
                  ...prev,
                  devices: data.devices,
                  // If we don't have a current device but have devices, use the first one
                  device: prev.device || data.devices[0],
                  status: prev.device ? prev.status : STATUS.CONNECTED
                }));
              }
              break;
              
            default:
              console.log('Unhandled WebSocket message type:', data.type);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error, event.data);
          updateState(prev => ({
            ...prev,
            status: STATUS.ERROR,
            error: 'Failed to process message from server',
            loading: false
          }));
        }
      };

      ws.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        // Don't update state here to avoid UI flicker, let onclose handle it
      };

      ws.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        
        // Only attempt to reconnect if we're still mounted and haven't exceeded max attempts
        if (isMounted.current && reconnectAttempts.current < 5) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000); // Exponential backoff with max 30s
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/5)`);
          
          reconnectAttempts.current += 1;
          
          // Clear any existing timeout to prevent multiple reconnection attempts
          if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
          }
          
          reconnectTimeout.current = setTimeout(() => {
            if (isMounted.current) {
              connectWebSocket();
            }
          }, delay);
        } else if (isMounted.current) {
          console.log('Max reconnection attempts reached');
          updateState(prev => ({
            ...prev,
            status: STATUS.ERROR,
            error: 'Connection lost. Please refresh the page.',
            loading: false
          }));
        }
      };
      
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      if (isMounted.current) {
        updateState(prev => ({
          ...prev,
          status: STATUS.ERROR,
          error: 'Failed to connect to server',
          loading: false
        }));
      }
    }
  }, []);

  // Initialize WebSocket connection when component mounts
  useEffect(() => {
    isMounted.current = true;
    connectWebSocket();
    
    // Cleanup function
    return () => {
      isMounted.current = false;
      
      // Clear any pending reconnection attempts
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      
      // Close WebSocket connection
      if (ws.current) {
        console.log('Cleaning up WebSocket on unmount');
        ws.current.onopen = null;
        ws.current.onclose = null;
        ws.current.onerror = null;
        ws.current.onmessage = null;
        try {
          ws.current.close();
        } catch (e) {
          console.error('Error closing WebSocket on unmount:', e);
        }
        ws.current = null;
      }
    };
  }, [connectWebSocket]);

  // Check for connected devices
  const checkForDevices = useCallback(async () => {
    try {
      const status = await api.android.getStatus();
      
      if (!status.installed) {
        return { 
          error: 'ADB is not installed. Please install Android Debug Bridge first.',
          requiresInstall: true
        };
      }
      
      if (!status.devices || status.devices.length === 0) {
        return { 
          error: 'No Android devices found. Please connect a device via USB and enable USB debugging.',
          requiresConnection: true
        };
      }
      
      return { devices: status.devices };
    } catch (error) {
      console.error('Device check failed:', error);
      return { 
        error: error.message || 'Failed to check for devices',
        requiresRetry: true
      };
    }
  }, []);

  // Track retry attempts for device connection
  const retryCount = useRef(0);
  const maxRetries = 3;
  const connectionInProgress = useRef(false);

  // Connect to device
  const handleConnect = useCallback(async (isRetry = false) => {
    // Prevent multiple connection attempts in parallel
    if (connectionInProgress.current) {
      console.log('Connection attempt already in progress');
      return;
    }

    try {
      connectionInProgress.current = true;
      
      // Reset retry count if this is a manual connection attempt
      if (!isRetry) {
        retryCount.current = 0;
      }

      updateState(prev => ({
        ...prev,
        status: STATUS.CONNECTING,
        loading: true,
        error: null
      }));

      // Check if WebSocket is connected
      if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
        if (reconnectAttempts.current < 5) {
          console.log('WebSocket not connected, attempting to reconnect...');
          connectWebSocket();
          
          // Wait a bit for connection to establish
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // If still not connected after waiting, throw error
          if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
            throw new Error('Unable to establish connection to server');
          }
        } else {
          throw new Error('Connection to server failed after multiple attempts');
        }
      }

      // Check for available devices
      const deviceCheck = await checkForDevices();
      
      if (deviceCheck.error) {
        // Only show installation prompt if this is not a retry
        if (deviceCheck.requiresInstall && !isRetry) {
          updateState(prev => ({
            ...prev,
            showInstallModal: true,
            loading: false
          }));
          return;
        }
        
        // If we have devices but still get an error, it might be a connection issue
        if (deviceCheck.requiresConnection) {
          throw new Error(
            'No Android device detected.\n\n' +
            '1. Connect your device via USB\n' +
            '2. Enable USB debugging in Developer options\n' +
            '3. If prompted on your device, allow USB debugging\n' +
            '4. Try a different USB cable or port if needed'
          );
        }
        throw new Error(deviceCheck.error);
      }
      
      if (!deviceCheck.devices || deviceCheck.devices.length === 0) {
        // Only show the error if this is the first attempt
        if (!isRetry) {
          throw new Error('No devices available for connection');
        }
        // For retries, just return and let the retry logic handle it
        return;
      }

      // Connect to the first available device
      const device = deviceCheck.devices[0];
      console.log('Attempting to connect to device:', device.id);
      
      // Update state to show connecting to device
      updateState(prev => ({
        ...prev,
        device: { ...device, status: 'connecting' },
        loading: true,
        error: null
      }));
      
      // Connect to the device
      await api.android.connectDevice(device.id);
      
      // The WebSocket message handler will update the state when connection is confirmed
      
    } catch (error) {
      console.error('Connection failed:', error);
      
      // Only retry if we haven't exceeded max retries
      if (retryCount.current < maxRetries) {
        retryCount.current += 1;
        const retryMessage = `Connection failed (attempt ${retryCount.current}/${maxRetries})...`;
        console.log(`${retryMessage}:`, error.message);
        
        // Show loading state during retry
        updateState(prev => ({
          ...prev,
          status: STATUS.CONNECTING,
          loading: true,
          error: retryMessage
        }));
        
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, retryCount.current - 1), 10000); // Max 10s delay
        console.log(`Retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry the connection if we're still mounted
        if (isMounted.current) {
          return handleConnect(true);
        }
        return;
      }
      
      // If we've exhausted retries, show error
      updateState(prev => ({
        ...prev,
        status: STATUS.ERROR,
        error: `Failed to connect: ${error.message || 'Unknown error'}`,
        loading: false
      }));
    } finally {
      connectionInProgress.current = false;
    }
  }, [checkForDevices, connectWebSocket, updateState]);

  // Disconnect from device
  const handleDisconnect = useCallback(async () => {
    // Don't proceed if already disconnected
    if (state.status === STATUS.DISCONNECTED) {
      return;
    }

    // Set loading state
    updateState(prev => ({
      ...prev,
      loading: true,
      error: null
    }));

    try {
      // Only try to disconnect if we have a device connected
      if (state.device) {
        console.log('Disconnecting device:', state.device.id);
        await api.android.disconnectDevice();
      }
      
      // Update the UI immediately for better responsiveness
      updateState(prev => ({
        ...prev,
        status: STATUS.DISCONNECTED,
        device: null,
        loading: false,
        error: null
      }));
      
      console.log('Device disconnected successfully');
      
    } catch (error) {
      console.error('Disconnect failed:', error);
      // Even if the API call fails, we can still update the UI
      updateState(prev => ({
        ...prev,
        status: STATUS.DISCONNECTED,
        device: null,
        loading: false,
        error: error.message || 'Device was disconnected, but there was an error'
      }));
    }
  }, [state.device, state.status, updateState]);
  const handleInstall = useCallback(async () => {
    try {
      updateState({ 
        isInstalling: true, 
        installProgress: [{
          type: 'info',
          message: 'Starting ADB installation...',
          timestamp: Date.now()
        }],
        error: null
      });
      
      // Add a small delay to show the initial message
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Start the installation process
      const response = await api.android.install({
        onProgress: (progress) => {
          updateState(prev => ({
            installProgress: [
              ...prev.installProgress,
              {
                type: progress.status || 'info',
                message: progress.message,
                details: progress.details,
                timestamp: Date.now()
              }
            ]
          }));
        }
      });
      
      if (response.success) {
        // Add success message
        updateState(prev => ({
          installProgress: [
            ...prev.installProgress,
            {
              type: 'success',
              message: 'ADB installed successfully!',
              timestamp: Date.now()
            }
          ]
        }));
        
        // Update ADB status after a short delay
        setTimeout(() => {
          checkAdbStatus();
        }, 1500);
      } else {
        throw new Error(response.error || 'Installation failed');
      }
    } catch (error) {
      console.error('Installation error:', error);
      updateState(prev => ({
        error: error.message || 'Failed to install ADB',
        isInstalling: false,
        installProgress: [
          ...prev.installProgress,
          {
            type: 'error',
            message: 'Installation failed',
            details: error.message,
            timestamp: Date.now()
          }
        ]
      }));
    }
  }, [checkAdbStatus]);

  // Initialize/cleanup based on active state
  useEffect(() => {
    console.log('AndroidConnection active state changed:', active);
    
    if (active) {
      isMounted.current = true;
      console.log('Initializing AndroidConnection...');
      
      // Initialize ADB status check
      checkAdbStatus().then(installed => {
        console.log('ADB status checked, installed:', installed);
        if (installed) {
          // Only initialize WebSocket if ADB is installed
          connectWebSocket();
        }
      });
    } else {
      console.log('Cleaning up AndroidConnection...');
      // Cleanup WebSocket and timeouts
      if (ws.current) {
        console.log('Closing WebSocket connection');
        ws.current.close();
        ws.current = null;
      }
      if (reconnectTimeout.current) {
        console.log('Clearing reconnect timeout');
        clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
    }

    return () => {
      if (!active) {
        console.log('Component unmounting, cleaning up...');
        isMounted.current = false;
        if (ws.current) {
          console.log('Closing WebSocket connection (cleanup)');
          ws.current.close();
          ws.current = null;
        }
        if (reconnectTimeout.current) {
          console.log('Clearing reconnect timeout (cleanup)');
          clearTimeout(reconnectTimeout.current);
          reconnectTimeout.current = null;
        }
      }
    };
  }, [active]); // Removed checkAdbStatus and initWebSocket from deps to prevent unnecessary re-renders

  // Render status badge based on connection state
  const renderStatusBadge = () => {
    switch (state.status) {
      case STATUS.CONNECTED:
        return <Badge status="success" text="Connected" />;
      case STATUS.CONNECTING:
        return <Badge status="processing" text="Connecting" />;
      case STATUS.ERROR:
        return <Badge status="error" text="Error" />;
      default:
        return <Badge status="default" text="Disconnected" />;
    }
  };

  // Render device connection status
  const renderDeviceStatus = () => {
    if (state.error) {
      return (
        <div className="device-status error" style={{ padding: '16px', borderRadius: '8px', background: '#fff2f0', border: '1px solid #ffccc7' }}>
          <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '24px', marginBottom: '12px' }} />
          <div className="status-content" style={{ textAlign: 'center' }}>
            <h4 style={{ color: '#ff4d4f', marginBottom: '8px' }}>Connection Failed</h4>
            <div className="error-message" style={{ 
              background: 'white', 
              padding: '12px', 
              borderRadius: '4px', 
              borderLeft: '3px solid #ff4d4f',
              marginBottom: '16px',
              textAlign: 'left'
            }}>
              {state.error.split('\n').map((line, i) => (
                <React.Fragment key={i}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <Button 
                type="primary" 
                onClick={handleConnect}
                loading={state.loading}
                icon={<ReloadOutlined />}
                style={{ marginRight: '8px' }}
              >
                Try Again
              </Button>
              <Button 
                onClick={handleDisconnect}
                disabled={state.status !== STATUS.CONNECTED}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (state.status === STATUS.CONNECTED && state.device) {
      return (
        <div className="device-status connected">
          <CheckCircleOutlined className="status-icon" />
          <div className="status-content">
            <h4>Device Connected</h4>
            <p className="device-name">{state.device.name || 'Android Device'}</p>
            <Button 
              type="primary" 
              danger
              onClick={handleDisconnect}
              icon={<UsbOutlined />}
            >
              Disconnect
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="device-status idle">
        <AndroidFilled className="status-icon" />
        <div className="status-content">
          <h4>Ready to Connect</h4>
          <p>Connect your Android device via USB</p>
          <Button 
            type="primary" 
            onClick={handleConnect}
            loading={state.loading}
            icon={<LinkOutlined />}
          >
            {state.loading ? 'Connecting...' : 'Connect Device'}
          </Button>
        </div>
      </div>
    );
  };

  // Render connection button based on state
  const renderConnectionButton = () => {
    // Base button class with additional custom class for connection status
    const baseButtonClass = 'ant-btn';
    const statusClass = `connection-status ${state.status === STATUS.CONNECTED ? 'connected' : ''} ${state.status === STATUS.ERROR ? 'error' : ''}`;

    if (state.loading) {
      return (
        <RippleButton
          className={`${baseButtonClass} ant-btn-primary ant-btn-loading`}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'wait'
          }}
          disabled
        >
          <LoadingOutlined style={{ fontSize: 16 }} spin />
          <span>Connecting...</span>
        </RippleButton>
      );
    }

    // Show error state if there's an error
    if (state.error) {
      const isConnectionError = state.error.includes('No Android device detected');
      
      return (
        <div className="connection-status error glass-card" style={{ padding: '16px', textAlign: 'center' }}>
          <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: '24px', marginBottom: '8px' }} />
          <h3 style={{ marginBottom: '8px' }}>Connection Error</h3>
          <p style={{ 
            color: 'rgba(255, 255, 255, 0.8)',
            marginBottom: '16px',
            fontSize: '14px'
          }}>
            {isConnectionError 
              ? 'Unable to detect an Android device. Please check your connection and try again.'
              : 'An error occurred while connecting to the device.'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <RippleButton
              className={`${baseButtonClass} ant-btn-primary`}
              onClick={handleConnect}
              icon={<ReloadOutlined />}
            >
              Retry
            </RippleButton>
            <RippleButton
              className={`${baseButtonClass}`}
              onClick={() => updateState({ showInstallModal: true })}
            >
              View Setup Instructions
            </RippleButton>
          </div>
        </div>
      );
    }

    if (state.adbStatus.error || !state.adbStatus.installed) {
      return (
        <div className="connection-status error glass-card">
          <CloseCircleOutlined className="anticon" />
          <h3>ADB Not Found</h3>
          <p className="status-message">
            Android Debug Bridge (ADB) is required to connect to Android devices.
          </p>
          <RippleButton
            className={`${baseButtonClass} ant-btn-primary`}
            icon={<DownloadOutlined />}
            onClick={() => updateState({ showInstallModal: true })}
          >
            Install ADB Tools
          </RippleButton>
        </div>
      );
    }

    if (state.status === STATUS.CONNECTED) {
      return (
        <div className={`${statusClass} glass-card`}>
          <CheckCircleOutlined className="anticon" />
          <h3>Device Connected</h3>
          <p className="device-name">
            {state.device?.name || 'Android Device'}
          </p>
          <RippleButton
            className={`${baseButtonClass} ant-btn-dangerous`}
            icon={<UsbOutlined />}
            onClick={handleDisconnect}
          >
            Disconnect
          </RippleButton>
        </div>
      );
    }



    // Default connect button
    return (
      <RippleButton
        className={`${baseButtonClass} ant-btn-primary`}
        icon={<LinkOutlined />}
        onClick={handleConnect}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          opacity: state.adbStatus.installed ? 1 : 0.6,
          cursor: state.adbStatus.installed ? 'pointer' : 'not-allowed'
        }}
        disabled={!state.adbStatus.installed}
      >
        {state.adbStatus.installed ? 'Connect to Device' : 'ADB Not Installed'}
      </RippleButton>
    );
  };

  // Render installation modal with detailed guide
  const renderInstallModal = () => {
    const tabItems = [
      {
        key: 'android_studio',
        label: <span><CodeOutlined style={{ marginRight: 8 }} />Android Studio</span>,
        children: (
          <div style={{ padding: '8px 0' }}>
            <h3 style={{ marginTop: 0 }}>Install ADB via Android Studio</h3>
            <p>For a complete development environment with GUI tools:</p>
            <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
              <li>Download and install <a href="https://developer.android.com/studio" target="_blank" rel="noopener noreferrer">Android Studio</a></li>
              <li>Launch Android Studio and open SDK Manager:
                <ul style={{ margin: '8px 0' }}>
                  <li>Click <strong>More Actions</strong> → <strong>SDK Manager</strong> (or use the SDK Manager icon in the toolbar)</li>
                  <li>Go to <strong>SDK Tools</strong> tab</li>
                  <li>Check <strong>Android SDK Platform-Tools</strong> and <strong>Android SDK Build-Tools</strong></li>
                  <li>Click <strong>Apply</strong> to install</li>
                </ul>
              </li>
              <li>Find your SDK location:
                <ul style={{ margin: '8px 0' }}>
                  <li>In Android Studio, go to <strong>File</strong> → <strong>Project Structure</strong></li>
                  <li>Note the <strong>Android SDK Location</strong> path (usually <code>%USERPROFILE%\\AppData\\Local\\Android\\Sdk</code>)</li>
                </ul>
              </li>
              <li>Add to PATH (Windows):
                <div style={{ margin: '8px 0' }}>
                  <div style={{ marginBottom: 4 }}>Run these commands in Command Prompt (as Administrator):</div>
                  <pre style={{
                    background: 'rgba(15, 18, 30, 0.9)',
                    color: 'rgba(255, 255, 255, 0.9)',
                    padding: '8px',
                    borderRadius: '4px',
                    margin: '4px 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    overflowX: 'auto',
                    maxWidth: '100%'
                  }}>
                    setx ANDROID_HOME "%USERPROFILE%\\AppData\\Local\\Android\\Sdk"
                  </pre>
                  <pre style={{
                    background: 'rgba(15, 18, 30, 0.9)',
                    color: 'rgba(255, 255, 255, 0.9)',
                    padding: '8px',
                    borderRadius: '4px',
                    margin: '4px 0',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    overflowX: 'auto',
                    maxWidth: '100%'
                  }}>
                    setx PATH "%PATH%;%ANDROID_HOME%\\platform-tools"
                  </pre>
                </div>
              </li>
              <li>Restart your computer for changes to take effect</li>
              <li>Verify installation in Command Prompt:
                <pre style={{ background: 'rgba(15, 18, 30, 0.9)', color: 'rgba(255, 255, 255, 0.9)', padding: '8px', borderRadius: '4px', margin: '8px 0' }}>
                  adb --version
                </pre>
              </li>
            </ol>
          </div>
        )
      },
      {
        key: 'manual_setup',
        label: <span><ToolOutlined style={{ marginRight: 8 }} />Manual Setup</span>,
        children: (
          <div style={{ padding: '8px 0' }}>
            <h3 style={{ marginTop: 0 }}>Windows Setup</h3>
            <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
              <li>Download <code>platform-tools.zip</code> from the link below</li>
              <li>Extract the zip file - you'll get a folder named <code>platform-tools</code></li>
              <li>Move this folder to <code>C:\\</code> so the final path is <code>C:\\platform-tools</code></li>
              <li>Press <code>Win + R</code>, type <code>sysdm.cpl</code> and press Enter</li>
              <li>Go to "Advanced" tab → "Environment Variables"</li>
              <li>Under "System variables", click "New" and add:
                <ul style={{ margin: '8px 0' }}>
                  <li><strong>Variable name:</strong> <code>ANDROID_HOME</code></li>
                  <li><strong>Variable value:</strong> <code>C:\\platform-tools</code></li>
                </ul>
              </li>
              <li>Still in "System variables", find and select the "Path" variable, then click "Edit"</li>
              <li>In the Edit Environment Variable window:
                <ul style={{ margin: '8px 0' }}>
                  <li>Click "New" to add a new entry</li>
                  <li>Type: <code>%ANDROID_HOME%</code></li>
                  <li>Click "OK" to save</li>
                </ul>
              </li>
              <li>Click "OK" on all open dialogs to save your changes</li>
              <li><strong>Important:</strong> Close and reopen any open Command Prompts</li>
              <li>Open a new Command Prompt and verify:
                <pre style={{ background: 'rgba(15, 18, 30, 0.9)', color: 'rgba(255, 255, 255, 0.9)', padding: '8px', borderRadius: '4px', margin: '8px 0' }}>
                  adb --version
                  echo %ANDROID_HOME%
                </pre>
              </li>
            </ol>
          </div>
        )
      },
      {
        key: 'macos',
        label: 'macOS',
        children: (
          <div style={{ padding: '8px 0' }}>
            <h3 style={{ marginTop: 0 }}>macOS Setup</h3>
            <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
              <li>Download and extract Platform Tools ZIP file</li>
              <li>Open Terminal and run these commands:
                <pre style={{ background: 'rgba(15, 18, 30, 0.9)', color: 'rgba(255, 255, 255, 0.9)', padding: '8px', borderRadius: '4px', margin: '8px 0' }}>
                  {`# Extract to home directory
unzip ~/Downloads/platform-tools-*.zip -d ~/

# Set up environment variables
echo 'export ANDROID_HOME=$HOME/platform-tools' >> ~/.zshrc
echo 'export PATH=$PATH:$ANDROID_HOME' >> ~/.zshrc

# Apply changes
source ~/.zshrc

# Verify installation
adb --version`}
                </pre>
              </li>
              <li>Note: If you're using bash instead of zsh, replace <code>~/.zshrc</code> with <code>~/.bash_profile</code> or <code>~/.bashrc</code></li>
            </ol>
            <p><strong>Alternative (using Homebrew):</strong></p>
            <pre style={{ background: 'rgba(15, 18, 30, 0.9)', color: 'rgba(255, 255, 255, 0.9)', padding: '8px', borderRadius: '4px', margin: '8px 0' }}>
              brew install --cask android-platform-tools
            </pre>
          </div>
        )
      },
      {
        key: 'linux',
        label: 'Linux',
        children: (
          <div style={{ padding: '8px 0' }}>
            <h3 style={{ marginTop: 0 }}>Linux Setup</h3>
            <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
              <li>Download and extract Platform Tools ZIP file</li>
              <li>Open Terminal and run these commands:
                <pre style={{ background: 'rgba(15, 18, 30, 0.9)', color: 'rgba(255, 255, 255, 0.9)', padding: '8px', borderRadius: '4px', margin: '8px 0' }}>
                  {`# Create directory for Android SDK
mkdir -p ~/Android/Sdk

# Extract platform-tools
unzip ~/Downloads/platform-tools-*.zip -d ~/Android/Sdk

# Set up environment variables
echo 'export ANDROID_HOME=$HOME/Android/Sdk/platform-tools' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME' >> ~/.bashrc

# Apply changes
source ~/.bashrc

# Verify installation
adb --version`}
                </pre>
              </li>
              <li>Note: If you're using zsh, replace <code>~/.bashrc</code> with <code>~/.zshrc</code></li>
            </ol>
            <p><strong>Ubuntu/Debian (alternative):</strong></p>
            <pre style={{ background: 'rgba(15, 18, 30, 0.9)', color: 'rgba(255, 255, 255, 0.9)', padding: '8px', borderRadius: '4px', margin: '8px 0' }}>
              sudo apt-get install android-sdk-platform-tools
            </pre>
          </div>
        )
      }
    ];

    return (
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <AndroidFilled style={{ marginRight: 8, color: '#6e7aff' }} />
            <span>Android Debug Bridge (ADB) Setup</span>
          </div>
        }
        width={700}
        open={state.showInstallModal}
        onCancel={() => !state.isInstalling && updateState({ showInstallModal: false })}
        footer={[
          <Button 
            key="close" 
            onClick={() => updateState({ showInstallModal: false })}
            style={{ marginRight: 8 }}
          >
            Close
          </Button>,
          <Button 
            key="download" 
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => window.open('https://developer.android.com/studio/releases/platform-tools', '_blank')}
          >
            Download Platform Tools
          </Button>
        ]}
        bodyStyle={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <div style={{ marginBottom: 24 }}>
          <Alert 
            type="info" 
            message="What is ADB?"
            description={
              <div>
                <p>Android Debug Bridge (ADB) is a command-line tool that lets your computer communicate with an Android device. This app uses ADB to:</p>
                <ul style={{ margin: '8px 0 0 20px' }}>
                  <li>Connect to Android devices</li>
                  <li>Transfer files and data</li>
                  <li>Access device features</li>
                  <li>Enable debugging capabilities</li>
                </ul>
              </div>
            }
            style={{ marginBottom: 24 }}
          />
          
          <div style={{ marginBottom: 24 }}>
            <h3>Installation Steps</h3>
            
            <div style={{ 
              backgroundColor: 'rgba(110, 122, 255, 0.12)', 
              border: '1px solid rgba(175, 110, 255, 0.12)',
              borderRadius: 8,
              padding: '16px 16px 8px',
              marginBottom: 16
            }}>
              <h4>1. Download Platform Tools</h4>
              <p>Get the latest version for your operating system:</p>
              <Button 
                type="primary" 
                icon={<DownloadOutlined />}
                onClick={() => window.open('https://developer.android.com/studio/releases/platform-tools', '_blank')}
                style={{ margin: '8px 0 16px' }}
              >
                Download Platform Tools
              </Button>
              
              <h4>2. Install and Configure</h4>
              <Tabs
                defaultActiveKey="android_studio"
                items={tabItems}
                style={{ marginTop: 16 }}
              />
              
              <div style={{ borderTop: '1px solid #f0f0f0' }}>
                <h4 style={{ marginTop: 0 }}>3. Enable USB Debugging on Your Android Device</h4>
                <ol style={{ paddingLeft: 20, marginBottom: 16 }}>
                  <li><strong>Enable Developer Options</strong>:
                    <ol type="a" style={{ margin: '8px 0' }}>
                      <li>Open <strong>Settings</strong> on your Android device</li>
                      <li>Scroll down and tap <strong>About phone</strong></li>
                      <li>Tap the <strong>Software Information</strong> menu</li>
                      <li>Find <strong>Build number</strong> and tap it 7 times</li>
                      <li>Enter your PIN/pattern if prompted</li>
                      <li>You'll see a message "You are now a developer!"</li>
                    </ol>
                  </li>
                  <li><strong>Enable USB Debugging</strong>:
                    <ol type="a" style={{ margin: '8px 0' }}>
                      <li>Go back to <strong>Settings</strong> home</li>
                      <li>Scroll to bottom of Settings, tap <strong>Developer options</strong></li>
                      <li>Toggle on <strong>USB debugging</strong>. (if greyed out, go to Settings {'>'} Security and Privacy {'>'} <strong>Auto Blocker</strong>. Disable it first, go back to Developer Settings - allow usb debugging)</li>
                      <li>Confirm the security prompt</li>
                    </ol>
                  </li>
                  <li><strong>Connect Your Device</strong>:
                    <ol type="a" style={{ margin: '8px 0' }}>
                      <li>Connect your device to the computer via USB</li>
                      <li>On your device, tap the USB notification</li>
                      <li>Select <strong>File transfer</strong> or <strong>MTP</strong> mode</li>
                      <li>If prompted, allow USB debugging from this computer</li>
                    </ol>
                  </li>
                </ol>
                <Alert 
                  type="info"
                  message="Troubleshooting Tips"
                  description={
                    <ul style={{ margin: '8px 0 0 20px' }}>
                      <li>If you don't see the USB debugging prompt, try a different USB port</li>
                      <li>Make sure your device is not in "Charge only" mode</li>
                      <li>Try a different USB cable if connection fails</li>
                    </ul>
                  }
                  style={{ marginTop: 16 }}
                />
              </div>
              
              <h4>4. Verify Installation</h4>
              <p>Open a new terminal/command prompt and run:</p>
              <pre style={{ 
                background: 'rgba(15, 18, 30, 0.9)', 
                color: 'rgba(255, 255, 255, 0.9)',
                padding: '8px 12px', 
                borderRadius: '4px',
                overflowX: 'auto',
                margin: '8px 0 16px'
              }}>
                <code>adb version</code>
              </pre>
              <p>You should see the ADB version number if installed correctly.</p>
              
              <Alert 
                type="info"
                style={{ margin: '16px 0' }}
                message={
                  <>
                    <strong>After installation:</strong>
                    <ul style={{ margin: '8px 0 0 16px' }}>
                      <li>Restart this application for the changes to take effect</li>
                      <li>When prompted by Windows Firewall to "Allow access" for adb.exe, make sure to check both <strong>Private</strong> and <strong>Public</strong> networks</li>
                      <li>After restarting App, go to <strong>Command Center → Devices</strong> to connect your Android device</li>
                    </ul>
                  </>
                }
              />
            </div>
          </div>
          
          <Alert 
            type="warning" 
            showIcon
            message="Troubleshooting"
            description={
              <ul style={{ margin: '8px 0 0 20px' }}>
                <li>Restart your computer after installation</li>
                <li>On Windows, install USB drivers if devices aren't detected</li>
                <li>Enable USB debugging in Developer Options on your device</li>
                <li>Check USB connection mode (use "File Transfer" or "PTP" mode)</li>
              </ul>
            }
            style={{ marginBottom: 16 }}
          />
        </div>
      </Modal>
    );
  };

  return (
    <Card
      className="glass-card"
      title={
        <div style={{ 
          display: 'flex', 
          alignItems: 'center',
          color: 'rgba(255, 255, 255, 0.9)'
        }}>
          <AndroidFilled style={{ 
            marginRight: 10,
            fontSize: 18,
            color: '#52c41a',
            textShadow: '0 0 10px rgba(82, 196, 26, 0.5)'
          }} />
          <span style={{ 
            fontSize: 15,
            fontWeight: 500
          }}>
            Android Device
          </span>
          <div style={{ marginLeft: 10 }}>
            {renderStatusBadge()}
          </div>
        </div>
      }
      extra={
        <Space>
          <Tooltip title="Refresh status">
            <Button
              icon={<ReloadOutlined />}
              onClick={checkAdbStatus}
              loading={state.loading}
              size="small"
              type="text"
              style={{
                color: 'rgba(255, 255, 255, 0.65)',
                transition: 'all 0.2s',
                ':hover': {
                  color: '#fff',
                  transform: 'rotate(180deg)'
                }
              }}
            />
          </Tooltip>
          {onClose && (
            <Button
              icon={<CloseCircleOutlined />}
              onClick={onClose}
              size="small"
              type="text"
              style={{
                color: 'rgba(255, 77, 79, 0.8)',
                transition: 'all 0.2s',
                ':hover': {
                  color: '#ff4d4f',
                  transform: 'scale(1.1)'
                }
              }}
            />
          )}
        </Space>
      }
    >
      <div className="connection-status">
        {renderConnectionButton()}
      </div>
      {renderInstallModal()}
    </Card>
  );
};

export default AndroidConnection;
