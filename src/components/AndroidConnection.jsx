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

  // Poll connection status periodically
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

  // Connect to device using api.android
  const handleConnect = useCallback(async (selectedDeviceId) => {
    if (!isMounted.current) return;
    
    try {
      updateState(prev => ({ 
        ...prev, 
        loading: true, 
        error: null, 
        status: STATUS.CONNECTING 
      }));
      
      // Get current status first to check ADB and devices
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
      
      console.log(`Connecting to device: ${deviceToConnect}`);
      
      // Connect to the device
      const result = await api.android.connectDevice(deviceToConnect);
      
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
        device: connectionStatus.device || result.device || { id: deviceToConnect, name: `Android Device (${deviceToConnect})` },
        devices: connectionStatus.devices || status.devices || [],
        loading: false,
        error: null
      }));
      
      // Show success notification
      notification.success({
        message: 'Device Connected',
        description: `Successfully connected to ${deviceToConnect}`,
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

    pollingRef.current = setInterval(() => {
      if (isMounted.current) {
        pollConnectionStatus().catch(console.error);
      }
    }, 5000);

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
            onClick={() => handleConnect()}
            loading={state.loading}
            icon={<LinkOutlined />}
          >
            {state.loading ? 'Connecting...' : 'Connect Device'}
          </Button>
        </div>
      </div>
    );
  };

  // Render connection button
  const renderConnectionButton = () => {
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

    return (
      <RippleButton
        className={`${baseButtonClass} ant-btn-primary`}
        icon={<LinkOutlined />}
        onClick={() => handleConnect()}
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
        {renderConnectionButton()}
      </div>
      {renderInstallModal()}
    </Card>
  );
};

export default AndroidConnection;