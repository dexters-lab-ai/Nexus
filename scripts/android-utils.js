#!/usr/bin/env node

import { getConnectedDevices, AndroidDevice } from '@midscene/android';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class AndroidUtils {
  /**
   * List all connected Android devices
   */
  static async listDevices() {
    try {
      const devices = await getConnectedDevices();
      return {
        success: true,
        devices: devices.map(device => ({
          udid: device.udid,
          state: device.state,
          model: device.model,
          manufacturer: device.manufacturer
        }))
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }

  /**
   * Take a screenshot from a connected device
   * @param {string} udid - Device UDID
   * @param {string} outputPath - Path to save the screenshot
   */
  static async takeScreenshot(udid, outputPath = 'screenshot.png') {
    try {
      const device = new AndroidDevice(udid);
      await device.connect();
      
      // Take screenshot and save to file
      await device.screenshot(outputPath);
      
      return {
        success: true,
        outputPath,
        message: `Screenshot saved to ${outputPath}`
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }

  /**
   * Install an APK file on the device
   * @param {string} udid - Device UDID
   * @param {string} apkPath - Path to the APK file
   * @param {boolean} reinstall - Whether to reinstall if already installed
   */
  static async installApk(udid, apkPath, reinstall = false) {
    try {
      const device = new AndroidDevice(udid);
      await device.connect();
      
      // Install the APK
      const result = await device.installApk(apkPath, { reinstall });
      
      return {
        success: true,
        message: `APK installed successfully: ${result}`,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }

  /**
   * Execute a shell command on the device
   * @param {string} udid - Device UDID
   * @param {string} command - Shell command to execute
   */
  static async executeShellCommand(udid, command) {
    try {
      const device = new AndroidDevice(udid);
      await device.connect();
      
      // Execute the shell command
      const result = await device.shell(command);
      
      return {
        success: true,
        command,
        output: result.toString()
      };
    } catch (error) {
      return {
        success: false,
        command,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }

  /**
   * Get device information
   * @param {string} udid - Device UDID
   */
  static async getDeviceInfo(udid) {
    try {
      const device = new AndroidDevice(udid);
      await device.connect();
      
      // Get device properties
      const props = await device.shell('getprop');
      const info = {};
      
      // Parse the properties
      props.toString().split('\n').forEach(line => {
        const match = line.match(/\[(.+?)\]: \[(.*?)\]/);
        if (match) {
          info[match[1]] = match[2];
        }
      });
      
      return {
        success: true,
        info: {
          manufacturer: info['ro.product.manufacturer'],
          model: info['ro.product.model'],
          device: info['ro.product.device'],
          androidVersion: info['ro.build.version.release'],
          sdkVersion: info['ro.build.version.sdk'],
          cpuAbi: info['ro.product.cpu.abi'],
          display: info['ro.build.display.id'],
          fingerprint: info['ro.build.fingerprint']
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }
}

// If run directly, provide a CLI interface
if (require.main === module) {
  const [,, command, ...args] = process.argv;
  
  const commands = {
    'list': async () => {
      const result = await AndroidUtils.listDevices();
      console.log(JSON.stringify(result, null, 2));
    },
    'screenshot': async (udid, outputPath = 'screenshot.png') => {
      const result = await AndroidUtils.takeScreenshot(udid, outputPath);
      console.log(JSON.stringify(result, null, 2));
    },
    'install': async (udid, apkPath, reinstall = false) => {
      const result = await AndroidUtils.installApk(udid, apkPath, reinstall === 'true');
      console.log(JSON.stringify(result, null, 2));
    },
    'shell': async (udid, ...cmd) => {
      const result = await AndroidUtils.executeShellCommand(udid, cmd.join(' '));
      console.log(JSON.stringify(result, null, 2));
    },
    'info': async (udid) => {
      const result = await AndroidUtils.getDeviceInfo(udid);
      console.log(JSON.stringify(result, null, 2));
    },
    'help': () => {
      console.log(`
Android Device Management Utility

Usage:
  node scripts/android-utils.js <command> [args...]

Commands:
  list                    List all connected devices
  screenshot <udid> [path]  Take a screenshot from the device
  install <udid> <apk>      Install an APK on the device
  shell <udid> <command>    Execute a shell command on the device
  info <udid>               Get device information
  help                     Show this help message
`);
    }
  };

  // Execute the command or show help
  const cmd = commands[command] || commands.help;
  cmd(...args).catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export default AndroidUtils;
