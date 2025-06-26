import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Progress reporting helper
const reportProgress = (type, message, data = {}) => {
  console.log(JSON.stringify({ type, message, ...data, timestamp: Date.now() }));
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const platform = os.platform();
const isWindows = platform === 'win32';
const isMac = platform === 'darwin';
const isLinux = platform === 'linux';

console.log('Setting up Android development environment...');

// Check ADB installation
async function checkAdb() {
  return new Promise((resolve) => {
    const adb = spawn('adb', ['--version']);
    let output = '';
    
    adb.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    adb.on('close', (code) => {
      if (code === 0) {
        const version = output.split('\n')[0];
        reportProgress('info', 'ADB is installed', { version });
        resolve(true);
      } else {
        reportProgress('warning', 'ADB is not installed or not in PATH');
        resolve(false);
      }
    });
    
    adb.on('error', () => {
      reportProgress('warning', 'ADB is not installed or not in PATH');
      resolve(false);
    });
  });
}

// Install ADB based on platform
async function installAdb() {
  return new Promise((resolve, reject) => {
    reportProgress('info', 'Starting ADB installation...');
    
    let command, args;
    
    if (isWindows) {
      reportProgress('info', 'Please install Android Studio or platform-tools on Windows', {
        links: [
          { text: 'Download Android Studio', url: 'https://developer.android.com/studio' },
          { text: 'Download Platform Tools', url: 'https://developer.android.com/tools/releases/platform-tools' }
        ]
      });
      return resolve(false);
    } 
    else if (isMac) {
      command = 'brew';
      args = ['install', '--cask', 'android-platform-tools'];
    }
    else if (isLinux) {
      command = 'sudo';
      args = ['apt-get', 'update', '&&', 'sudo', 'apt-get', 'install', '-y', 'android-tools-adb', 'android-tools-fastboot'];
    } else {
      reportProgress('error', 'Unsupported platform');
      return reject(new Error('Unsupported platform'));
    }
    
    const proc = spawn(command, args, { shell: true });
    
    proc.stdout.on('data', (data) => {
      reportProgress('info', data.toString().trim());
    });
    
    proc.stderr.on('data', (data) => {
      reportProgress('warning', data.toString().trim());
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        reportProgress('success', 'ADB installed successfully');
        resolve(true);
      } else {
        reportProgress('error', 'Failed to install ADB');
        reject(new Error(`Installation failed with code ${code}`));
      }
    });
    
    proc.on('error', (error) => {
      reportProgress('error', 'Failed to start installation process', { error: error.message });
      reject(error);
    });
  });
}

// Set up environment variables
function setupEnvironment() {
  console.log('\nSetting up environment variables...');
  
  let androidHome = '';
  if (isWindows) {
    androidHome = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
  } else {
    androidHome = path.join(os.homedir(), 'Library/Android/sdk'); // macOS
    if (!fs.existsSync(androidHome)) {
      androidHome = '/usr/local/share/android-sdk'; // Linux
    }
  }

  const shellConfig = isWindows ? 
    path.join(os.homedir(), 'Documents', 'WindowsPowerShell', 'profile.ps1') :
    path.join(os.homedir(), isMac ? '.zshrc' : '.bashrc');

  const exportCmd = isWindows ? 
    `[System.Environment]::SetEnvironmentVariable('ANDROID_HOME', '${androidHome}', 'User')` :
    `echo '\nexport ANDROID_HOME=${androidHome}\nexport PATH=\$PATH:\$ANDROID_HOME/platform-tools' >> ${shellConfig}`;

  try {
    if (isWindows) {
      execSync(`powershell -Command "${exportCmd}"`);
    } else {
      fs.appendFileSync(shellConfig, `\nexport ANDROID_HOME=${androidHome}\nexport PATH=\$PATH:\$ANDROID_HOME/platform-tools`);
      console.log(`✓ Added environment variables to ${shellConfig}`);
    }
    console.log('✓ Environment variables set successfully');
    console.log(`ANDROID_HOME=${androidHome}`);
  } catch (error) {
    console.error('Error setting environment variables:', error.message);
  }
}

// Main function
async function main() {
  console.log('Android Setup Tool\n===================');
  
  // Check ADB
  const adbInstalled = checkAdb();
  
  if (!adbInstalled) {
    await installAdb();
  } else {
    setupEnvironment();
    console.log('\nSetup complete! Please restart your terminal for changes to take effect.');
  }

  // Check connected devices
  try {
    console.log('\nChecking for connected devices...');
    const devices = execSync('adb devices -l').toString();
    console.log(devices || 'No devices found');
  } catch (e) {
    console.log('Error checking devices:', e.message);
  }
}

main().catch(console.error);
