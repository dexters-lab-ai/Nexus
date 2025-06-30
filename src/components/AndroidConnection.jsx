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
  notification,
  Input 
} from 'antd';
import { 
  AndroidFilled, 
  CheckCircleOutlined, 
  CloseCircleOutlined, 
  DownloadOutlined, 
  InfoCircleOutlined,
  LoadingOutlined, 
  QuestionCircleOutlined, 
  ReloadOutlined, 
  UsbOutlined,
  LinkOutlined,
  ToolOutlined,
  CodeOutlined,
  DisconnectOutlined, 
  SettingOutlined, 
  RobotOutlined
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
    installProgress: [],
    // Connection type state
    connectionType: 'usb', // 'usb', 'network', or 'remote'
    // Network connection state
    networkSettings: {
      ip: '',
      port: '5555'
    },
    // Remote ADB settings
    remoteAdbSettings: {
      host: '',
      port: '5037',
      customAdbPath: '',
      useRemote: false
    },
    showNetworkForm: false,
    showRemoteSettings: false,
    testingConnection: false,
    connectionTestResult: null
  });

  const isMounted = useRef(true);
  const pollingRef = useRef(null);

  // Update state helper
  const updateState = (updates) => {
    if (isMounted.current) {
      setState(prev => ({
        ...prev,
        ...(typeof updates === 'function' ? updates(prev) : updates)
      }));
    }
  };

  // Check ADB status and connected devices
  const checkAdbStatus = useCallback(async () => {
    if (!isMounted.current) return false;
    
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

      // Get status from the backend API
      const status = await api.android.getStatus();
      console.log('ADB Status from backend:', status);

      if (!isMounted.current) return false;

      // Determine if we have any connected devices
      const hasConnectedDevices = status.devices && status.devices.length > 0;
      const isAdbInstalled = status.installed || hasConnectedDevices;
      
      // Update state with the new status
      updateState(prev => {
        const newState = {
          ...prev,
          loading: false,
          adbStatus: {
            installed: isAdbInstalled,
            version: status.version || 'ADB',
            checking: false,
            error: status.error || null
          },
          devices: status.devices || [],
          error: status.error || null
        };

        // Update connection status based on devices and previous state
        if (hasConnectedDevices) {
          // If we have devices but weren't connected, set to DISCONNECTED (ready to connect)
          if (prev.status !== STATUS.CONNECTED) {
            newState.status = STATUS.DISCONNECTED;
          }
          // If we were connected, keep that status
        } else if (isAdbInstalled) {
          // ADB is installed but no devices
          newState.status = STATUS.DISCONNECTED;
        } else {
          // ADB not installed or error
          newState.status = STATUS.ERROR;
        }

        return newState;
      });

      return isAdbInstalled;
      
    } catch (error) {
      console.error('Error checking ADB status:', error);
      
      if (!isMounted.current) return false;
      
      const errorMessage = error.message || 'Failed to check ADB status';
      
      updateState(prev => ({
        ...prev,
        loading: false,
        adbStatus: {
          ...prev.adbStatus,
          installed: false,
          version: null,
          checking: false,
          error: errorMessage
        },
        status: STATUS.ERROR,
        error: errorMessage
      }));
      
      // Show error notification
      notification.error({
        message: 'ADB Status Error',
        description: errorMessage,
        placement: 'bottomRight',
        duration: 5
      });
      
      return false;
    }
  }, []);

  // Poll connection status periodically (every 10 seconds)
  const pollConnectionStatus = useCallback(async () => {
    if (!isMounted.current) return;
    
    try {
      const status = await api.android.getConnectionStatus();
      
      updateState(prev => {
        // Skip update if nothing changed
        const statusChanged = prev.status !== status.status;
        const deviceChanged = JSON.stringify(prev.device) !== JSON.stringify(status.device);
        const devicesChanged = JSON.stringify(prev.devices) !== JSON.stringify(status.devices);
        
        if (!statusChanged && !deviceChanged && !devicesChanged) {
          return prev;
        }
        
        const newStatus = status.status === 'connected' ? STATUS.CONNECTED : 
                         status.status === 'error' ? STATUS.ERROR : 
                         STATUS.DISCONNECTED;
        
        // Determine if ADB is installed based on the response
        const isAdbInstalled = status.installed || (status.devices && status.devices.length > 0);
        
        return {
          ...prev,
          status: newStatus,
          device: status.device || null,
          devices: status.devices || [],
          error: status.error || null,
          loading: false,
          adbStatus: {
            installed: isAdbInstalled,
            version: status.version || 'ADB',
            error: status.error || null,
            checking: false
          }
        };
      });
    } catch (error) {
      console.error('Failed to get connection status:', error);
      if (!isMounted.current) return;
      
      updateState(prev => ({
        ...prev,
        status: STATUS.ERROR,
        error: error.message || 'Failed to get connection status',
        loading: false,
        adbStatus: {
          ...prev.adbStatus,
          installed: false,
          error: error.message || 'Failed to check ADB status',
          checking: false
        }
      }));
    }
  }, []);

  // Handle connection type change
  const handleConnectionTypeChange = useCallback((type) => {
    updateState(prev => ({
      ...prev,
      connectionType: type,
      showNetworkForm: type === 'network',
      showRemoteSettings: type === 'remote',
      error: null
    }));
  }, []);

  // Load saved ADB settings
  const loadAdbSettings = useCallback(async () => {
    try {
      const settings = await api.user.getAdbSettings();
      updateState(prev => ({
        ...prev,
        remoteAdbSettings: {
          ...prev.remoteAdbSettings,
          ...settings,
          port: settings.port?.toString() || '5037'
        }
      }));
    } catch (error) {
      console.error('Failed to load ADB settings:', error);
    }
  }, []);

  // Save ADB settings
  const saveAdbSettings = useCallback(async () => {
    try {
      await api.user.updateAdbSettings({
        ...state.remoteAdbSettings,
        port: parseInt(state.remoteAdbSettings.port, 10) || 5037
      });
      notification.success({
        message: 'Settings Saved',
        description: 'ADB settings have been saved successfully.',
        placement: 'bottomRight'
      });
    } catch (error) {
      console.error('Failed to save ADB settings:', error);
      notification.error({
        message: 'Save Failed',
        description: error.message || 'Failed to save ADB settings',
        placement: 'bottomRight'
      });
    }
  }, [state.remoteAdbSettings]);

  // Test ADB connection
  const testAdbConnection = useCallback(async () => {
    try {
      updateState(prev => ({ ...prev, testingConnection: true, connectionTestResult: null }));
      
      const result = await api.user.testAdbConnection({
        remoteAdbHost: state.remoteAdbSettings.host,
        remoteAdbPort: parseInt(state.remoteAdbSettings.port, 10) || 5037,
        customAdbPath: state.remoteAdbSettings.customAdbPath
      });
      
      updateState(prev => ({
        ...prev,
        connectionTestResult: result.success ? 'success' : 'error',
        testingConnection: false
      }));
      
      notification[result.success ? 'success' : 'error']({
        message: result.success ? 'Connection Successful' : 'Connection Failed',
        description: result.message || (result.success ? 'Successfully connected to ADB server.' : 'Failed to connect to ADB server.'),
        placement: 'bottomRight'
      });
      
      return result.success;
    } catch (error) {
      console.error('Connection test failed:', error);
      updateState(prev => ({
        ...prev,
        connectionTestResult: 'error',
        testingConnection: false
      }));
      
      notification.error({
        message: 'Connection Test Failed',
        description: error.message || 'An error occurred while testing the connection',
        placement: 'bottomRight'
      });
      
      return false;
    }
  }, [state.remoteAdbSettings]);

  // Handle network settings change
  const handleNetworkSettingsChange = useCallback((field, value) => {
    updateState(prev => ({
      ...prev,
      networkSettings: {
        ...prev.networkSettings,
        [field]: value
      },
      error: null
    }));
  }, []);

  // Connect to device using api.android
  const handleConnect = useCallback(async (selectedDeviceId, connectionOptions = {}) => {
    if (!isMounted.current) return;
    
    try {
      updateState(prev => ({ 
        ...prev, 
        loading: true, 
        error: null, 
        status: STATUS.CONNECTING 
      }));

      let result;
      let connectionType = state.connectionType;
      
      // For remote connections, first test the connection
      if (connectionType === 'remote') {
        const isConnected = await testAdbConnection();
        if (!isConnected) {
          updateState(prev => ({ ...prev, loading: false, status: STATUS.ERROR }));
          return;
        }
        // Fall through to network connection with remote settings
        connectionType = 'network';
      }
      
      if (connectionType === 'network') {
        // Handle network connection
        const { ip, port = '5555' } = state.networkSettings;
        if (!ip) {
          throw new Error('Please enter a valid IP address');
        }
        
        console.log(`Connecting to network device: ${ip}:${port}`);
        
        // Include remote ADB settings if using remote connection
        const connectionOptions = state.connectionType === 'remote' ? {
          remoteAdbHost: state.remoteAdbSettings.host,
          remoteAdbPort: parseInt(state.remoteAdbSettings.port, 10) || 5037,
          customAdbPath: state.remoteAdbSettings.customAdbPath
        } : {};
        
        result = await api.android.connectOverNetwork(ip, parseInt(port, 10), connectionOptions);
      } else {
        // Handle USB connection
        const status = await api.android.getStatus();
        console.log('ADB Status:', status);
        
        if (!status.installed) {
          throw new Error(status.error || 'ADB is not installed. Please install Android Debug Bridge and try again.');
        }
        
        // If no devices found but ADB is installed
        if (!status.devices || status.devices.length === 0) {
          throw new Error('No Android devices found. Please ensure:' +
            '\n1. USB debugging is enabled on your device' +
            '\n2. Device is properly connected' +
            '\n3. You have authorized this computer for debugging');
        }
        
        // Use selected device or first available
        const deviceToConnect = selectedDeviceId || (status.devices[0]?.id);
        if (!deviceToConnect) {
          throw new Error('No valid device ID found');
        }
        
        console.log(`Connecting to USB device: ${deviceToConnect}`);
        result = await api.android.connectDevice(deviceToConnect, { type: 'usb' });
      }
      
      if (!result.success) {
        throw new Error(result.message || 'Failed to connect to device');
      }
      
      // Get updated status after connection
      const connectionStatus = await api.android.getConnectionStatus();
      console.log('Connection successful, status:', connectionStatus);
      
      if (!isMounted.current) return;
      
      updateState(prev => ({
        ...prev,
        status: connectionStatus.status === 'connected' ? STATUS.CONNECTED : STATUS.DISCONNECTED,
        device: connectionStatus.device || result.device || { 
          id: state.connectionType === 'network' 
            ? `${state.networkSettings.ip}:${state.networkSettings.port}` 
            : selectedDeviceId,
          name: state.connectionType === 'network'
            ? `Network Device (${state.networkSettings.ip}:${state.networkSettings.port})`
            : `Android Device (${selectedDeviceId})`
        },
        devices: connectionStatus.devices || [],
        loading: false,
        error: null,
        showNetworkForm: false
      }));
      
      // Show success notification
      notification.success({
        message: 'Device Connected',
        description: `Successfully connected to ${state.connectionType === 'network' 
          ? `${state.networkSettings.ip}:${state.networkSettings.port}` 
          : selectedDeviceId}`,
        placement: 'bottomRight'
      });
      
    } catch (error) {
      console.error('Connection failed:', error);
      if (!isMounted.current) return;
      
      updateState(prev => ({
        ...prev,
        status: STATUS.ERROR,
        error: error.message || 'Failed to connect to device',
        loading: false
      }));
      
      // Show error notification
      notification.error({
        message: 'Connection Failed',
        description: error.message || 'Failed to connect to the device',
        placement: 'bottomRight'
      });
    }
  }, []);

  // Disconnect from device using api.android
  const handleDisconnect = useCallback(async () => {
    if (state.status !== STATUS.CONNECTED && state.status !== STATUS.CONNECTING) return;
    if (!isMounted.current) return;

    try {
      updateState(prev => ({ 
        ...prev, 
        loading: true, 
        error: null 
      }));
      
      console.log('Disconnecting from device...');
      const result = await api.android.disconnectDevice();
      
      if (!result.success) {
        throw new Error(result.message || result.error || 'Failed to disconnect device');
      }
      
      // Get updated status after disconnection
      const status = await api.android.getConnectionStatus();
      console.log('Disconnection successful, status:', status);
      
      if (!isMounted.current) return;
      
      updateState(prev => ({
        ...prev,
        status: STATUS.DISCONNECTED,
        device: null,
        devices: status.devices || [],
        loading: false,
        error: null,
        adbStatus: {
          ...prev.adbStatus,
          installed: status.installed || false,
          version: status.version || null,
          error: status.error || null,
          checking: false
        }
      }));
      
      // Show success notification
      notification.success({
        message: 'Device Disconnected',
        description: 'Successfully disconnected from the device',
        placement: 'bottomRight'
      });
      
    } catch (error) {
      console.error('Disconnection failed:', error);
      if (!isMounted.current) return;
      
      updateState(prev => ({
        ...prev,
        status: STATUS.ERROR,
        loading: false,
        error: error.message || 'Failed to disconnect from device'
      }));
      
      // Show error notification
      notification.error({
        message: 'Disconnection Failed',
        description: error.message || 'Failed to disconnect from the device',
        placement: 'bottomRight'
      });
    }
  }, [state.status]);

  // Set up polling when component is active
  useEffect(() => {
    if (!active) return;

    isMounted.current = true;

    const init = async () => {
      try {
        await checkAdbStatus();
        await pollConnectionStatus();
      } catch (error) {
        console.error('Initialization error:', error);
      }
    };

    init();

    // Poll every 10 seconds when active
    const POLLING_INTERVAL = 10000;
    
    pollingRef.current = setInterval(() => {
      if (isMounted.current) {
        pollConnectionStatus().catch(console.error);
      }
    }, POLLING_INTERVAL);

    return () => {
      isMounted.current = false;
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [active, checkAdbStatus, pollConnectionStatus]);

  // Render status badge
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

  // Render connection button based on status
  const renderConnectionButton = () => {
    if (state.status === STATUS.CONNECTING) {
      return (
        <Button
          type="primary"
          loading
          icon={<LoadingOutlined />}
          style={{ width: '100%' }}
        >
          Connecting...
        </Button>
      );
    }

    if (state.status === STATUS.CONNECTED) {
      return (
        <Button
          type="primary"
          danger
          onClick={handleDisconnect}
          icon={<DisconnectOutlined />}
          style={{ width: '100%' }}
        >
          Disconnect Device
        </Button>
      );
    }

    return (
      <Button
        type="primary"
        onClick={handleConnect}
        icon={<LinkOutlined />}
        style={{ width: '100%' }}
      >
        Connect to Device
      </Button>
    );
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
                onClick={() => handleConnect()}
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
            {renderConnectionButton()}
          </div>
        </div>
      );
    }

  return (
    <div className="device-status idle">
      <AndroidFilled className="status-icon" />
      <div className="status-content">
        <h4>Ready to Connect</h4>
        {state.status === STATUS.DISCONNECTED && (
        <Button 
          type="primary" 
          icon={state.connectionType === 'usb' ? <UsbOutlined /> : <LinkOutlined />} 
          onClick={() => {
            if (state.connectionType === 'network' && !state.networkSettings.ip) {
              updateState({ 
                showNetworkForm: true,
                error: 'Please enter a valid IP address'
              });
              return;
            }
            handleConnect();
          }}
          loading={state.loading}
          style={{ marginRight: 8 }}
        >
          {state.connectionType === 'usb' ? 'Connect via USB' : 'Connect via Network'}
        </Button>
      )}</div>
    </div>
  );
};

// Render network connection form
const renderNetworkForm = () => (
  <div style={{ 
    margin: '16px 0',
    padding: '16px',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: '8px',
    border: '1px dashed #d9d9d9'
  }}>
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
        Device IP Address
      </label>
      <input
        type="text"
        value={state.networkSettings.ip}
        onChange={(e) => handleNetworkSettingsChange('ip', e.target.value)}
        placeholder="192.168.1.100"
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: '4px',
          border: '1px solid #d9d9d9',
          marginBottom: '12px'
        }}
      />
    </div>
    <div style={{ marginBottom: '16px' }}>
      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
        ADB Port (default: 5555)
      </label>
      <input
        type="number"
        value={state.networkSettings.port}
        onChange={(e) => handleNetworkSettingsChange('port', e.target.value)}
        placeholder="5555"
        style={{
          width: '100%',
          padding: '8px 12px',
          borderRadius: '4px',
          border: '1px solid #d9d9d9'
        }}
      />
    </div>
    <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
      <p>To connect over network:</p>
      <ol style={{ paddingLeft: '20px', margin: '8px 0' }}>
        <li>Ensure device is on the same network</li>
        <li>Enable ADB over network in developer options</li>
        <li>Enter device IP and port (default: 5555)</li>
      </ol>
    </div>
  </div>
);

// Render connection type toggle
const renderConnectionTypeToggle = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    margin: '16px 0',
    padding: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: '8px'
  }}>
    <Button 
      type={state.connectionType === 'usb' ? 'primary' : 'default'} 
      icon={<UsbOutlined />}
      onClick={() => toggleConnectionType()}
      style={{ marginRight: '8px' }}
    >
      USB Connection
    </Button>
    <Button 
      type={state.connectionType === 'network' ? 'primary' : 'default'} 
      icon={<LinkOutlined />}
      onClick={() => toggleConnectionType()}
    >
      Network Connection
    </Button>
  </div>
);

// Render connection status
const renderConnectionStatus = () => {
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
            onClick={() => handleConnect()}
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
      <div className="connected-device-container" style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%'
      }}>
        {/* Device Card */}
        <div className="device-card glass-card" style={{
          padding: '10px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: '10px',
            gap: '7px'
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1890ff, #36cfc9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              color: 'white',
              textAlign: 'center'
            }}>
              <AndroidFilled />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'white', textAlign: 'left' }}>
                {state.device?.name || 'Mobile'}
              </h3>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginTop: '4px'
              }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.65)', fontSize: '12px' }}>
                  {state.device?.id || 'Unknown ID'}
                </span>
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  Connected
                </Tag>
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
            gap: '8px',
            marginTop: '10px',
            fontSize: '12px'
          }}>
            <div className="device-info-item">
              <div style={{
                color: 'rgba(255, 255, 255, 0.65)',
                fontSize: '11px',
                marginBottom: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                Model
              </div>
              <div style={{ 
                fontWeight: 500, 
                color: 'white',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {state.device?.model || 'Unknown'}
              </div>
            </div>
            <div className="device-info-item">
              <div style={{
                color: 'rgba(255, 255, 255, 0.65)',
                fontSize: '11px',
                marginBottom: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                Brand
              </div>
              <div style={{ 
                fontWeight: 500, 
                color: 'white',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {state.device?.brand || 'Unknown'}
              </div>
            </div>
            <div className="device-info-item">
              <div style={{
                color: 'rgba(255, 255, 255, 0.65)',
                fontSize: '11px',
                marginBottom: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                Android
              </div>
              <div style={{ 
                fontWeight: 500, 
                color: 'white',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {state.device?.androidVersion || 'Unknown'}
              </div>
            </div>
            <div className="device-info-item">
              <div style={{
                color: 'rgba(255, 255, 255, 0.65)',
                fontSize: '11px',
                marginBottom: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                CPU
              </div>
              <div style={{ 
                fontWeight: 500, 
                color: 'white',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {state.device?.cpuAbi?.split('-')[0] || 'Unknown'}
              </div>
            </div>
            <div className="device-info-item">
              <div style={{
                color: 'rgba(255, 255, 255, 0.65)',
                fontSize: '11px',
                marginBottom: '2px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                SDK
              </div>
              <div style={{ 
                fontWeight: 500, 
                color: 'white',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                gap: '4px'
              }}>
                <div style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {state.device?.sdkVersion || '?'}
                </div>
                <Tooltip 
                  title={
                    <div style={{ padding: '8px' }}>
                      <div style={{ fontWeight: 500, marginBottom: '8px' }}>Automate Device with AI</div>
                      <div style={{ fontSize: '12px' }}>
                        You can now use the Agent to automate your device through the command center.
                        <div style={{ marginTop: '4px', fontStyle: 'italic' }}>
                          Try: "android open twitter and tweet Happy Friyay"
                        </div>
                      </div>
                    </div>
                  }
                  placement="topRight"
                  color="#1f1f1f"
                  overlayInnerStyle={{
                    maxWidth: '280px',
                    padding: '12px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    lineHeight: 1
                  }}>
                    <RobotOutlined style={{ 
                      color: '#52c41a', 
                      cursor: 'pointer',
                      fontSize: '14px',
                      marginLeft: '2px',
                      verticalAlign: 'middle'
                    }} />
                  </div>
                </Tooltip>
              </div>
            </div>
          </div>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            gap: '12px',
            marginTop: '0px'
          }}>
            <RippleButton
              className={`${baseButtonClass} ant-btn-primary`}
              icon={<ToolOutlined />}
              style={{
                flex: 1,
                background: 'rgba(24, 144, 255, 0.1)',
                borderColor: 'rgba(24, 144, 255, 0.5)'
              }}
            >
              Device Tools
            </RippleButton>
            <RippleButton
              className={`${baseButtonClass} ant-btn-dangerous`}
              icon={<UsbOutlined />}
              onClick={handleDisconnect}
              style={{ flex: 1 }}
            >
              Disconnect
            </RippleButton>
          </div>
      </div>
    );
  }

  // If we get here, show the connect button with connection type toggle
  return (
    <div className={statusClass} style={{ textAlign: 'center' }}>
      {/* Connection Type Toggle */}
      <div style={{ 
        display: 'flex', 
        gap: '7px', 
        marginBottom: '7px',
        justifyContent: 'center',
        padding: '7px',
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <Button
          type={state.connectionType === 'usb' ? 'primary' : 'default'}
          icon={<UsbOutlined />}
          onClick={() => handleConnectionTypeChange('usb')}
          size="small"
        >
          USB
        </Button>
        <Button
          type={state.connectionType === 'network' ? 'primary' : 'default'}
          icon={<LinkOutlined />}
          onClick={() => handleConnectionTypeChange('network')}
          size="small"
        >
          Network
        </Button>
        <Button
          type={state.connectionType === 'remote' ? 'primary' : 'default'}
          icon={<SettingOutlined />}
          onClick={() => handleConnectionTypeChange('remote')}
          size="small"
        >
          Remote ADB
        </Button>
      </div>
      
      {/* Network Connection Form */}
      {state.connectionType === 'network' && state.showNetworkForm && (
        <div className="network-connection-form">
          <div>
            <Input
              placeholder="Device IP (e.g., 192.168.1.100)"
              value={state.networkSettings.ip}
              onChange={(e) => updateState({
                networkSettings: {
                  ...state.networkSettings,
                  ip: e.target.value
                }
              })}
              className="network-connection-input"
              style={{ marginBottom: 8 }}
            />
            <Input
              placeholder="Port (default: 5555)"
              value={state.networkSettings.port}
              onChange={(e) => updateState({
                networkSettings: {
                  ...state.networkSettings,
                  port: e.target.value.replace(/\D/g, '') // Numbers only
                }
              })}
              className="network-connection-input"
            />
          </div>
        </div>
      )}

      {/* Remote ADB Settings */}
      {state.connectionType === 'remote' && state.showRemoteSettings && (
        <div className="remote-adb-settings">
          <div style={{ marginBottom: 16 }}>
            
            <div style={{ marginBottom: 12, padding: '10px' }}>
              <div className="form-label">ADB Server Host</div>
              <Input
                placeholder="e.g., 192.168.1.100 or adb.example.com"
                value={state.remoteAdbSettings.host}
                onChange={(e) => updateState({
                  remoteAdbSettings: {
                    ...state.remoteAdbSettings,
                    host: e.target.value
                  }
                })}
              />
              
              <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <div style={{ flex: 1 }}>
                  <div className="form-label">ADB Server Port</div>
                  <Input
                    placeholder="5037"
                    value={state.remoteAdbSettings.port}
                    onChange={(e) => updateState({
                      remoteAdbSettings: {
                        ...state.remoteAdbSettings,
                        port: e.target.value.replace(/\D/g, '') // Numbers only
                      }
                    })}
                  />
                </div>
                <div style={{ flex: 2 }}>
                  <div className="form-label">Custom ADB Path (optional)</div>
                  <Input
                    placeholder="e.g., /path/to/adb"
                    value={state.remoteAdbSettings.customAdbPath}
                    onChange={(e) => updateState({
                      remoteAdbSettings: {
                        ...state.remoteAdbSettings,
                        customAdbPath: e.target.value
                      }
                    })}
                  />
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button
                  type="primary"
                  onClick={testAdbConnection}
                  loading={state.testingConnection}
                  icon={<LinkOutlined />}
                  style={{ flex: 1 }}
                >
                  Test Connection
                </Button>
                <Button
                  type="default"
                  onClick={saveAdbSettings}
                  icon={<CheckCircleOutlined />}
                >
                  Save Settings
                </Button>
              </div>
              
              {state.connectionTestResult && (
                <div style={{
                  marginTop: 12,
                  padding: 8,
                  background: state.connectionTestResult === 'success' 
                    ? 'rgba(82, 196, 26, 0.15)' 
                    : 'rgba(255, 77, 79, 0.15)',
                  borderRadius: 4,
                  textAlign: 'center',
                  fontSize: 12,
                  color: state.connectionTestResult === 'success' ? '#52c41a' : '#ff4d4f'
                }}>
                  {state.connectionTestResult === 'success' 
                    ? '✓ Connection successful' 
                    : '✗ Connection failed. Please check your settings.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Connect Button */}
      <RippleButton
        className={`${baseButtonClass} ant-btn-primary`}
        icon={state.connectionType === 'usb' ? <UsbOutlined /> : <LinkOutlined />}
        onClick={() => handleConnect()}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          height: '40px',
          fontSize: '14px',
          fontWeight: 500
        }}
      >
        {state.connectionType === 'usb' ? 'Connect via USB' : 'Connect via Network'}
      </RippleButton>
    </div>
  );
};

  // Render installation modal
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
                   过渡: 'all 0.2s',
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
            fontSize: 18,
            color: '#52c41a',
            textShadow: '0 0 10px rgba(82, 196, 26, 0.5)'
          }} />
          <span style={{ 
            marginLeft: 10,
            fontSize: 14,
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
              onClick={pollConnectionStatus}
              loading={state.loading}
              size="small"
              type="text"
              style={{
                color: 'rgba(255, 255, 255, 0.65)',
                transition: 'all 0.2s'
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
                transition: 'all 0.2s'
              }}
            />
          )}
        </Space>
      }
    >
      <div className="connection-status">
        {renderConnectionStatus()}  
      </div>
      {renderInstallModal()}
    </Card>
  );
};
// renderConnectionButton() for simple button, renderConnectionStatus for rich device card info, renderDeviceStatus for minimalistic device name & button.

export default AndroidConnection;