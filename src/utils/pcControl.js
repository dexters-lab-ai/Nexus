import { exec, spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

class PCControl {
  constructor() {
    this.activeProcesses = new Map();
    this.tempFiles = [];
    this.isWindows = process.platform === 'win32';
    this.initialize();
  }

  initialize() {
    if (!this.isWindows) {
      throw new Error('PC Control is currently only supported on Windows');
    }
    // Ensure required tools are available
    this.verifyDependencies();
  }

  verifyDependencies() {
    // Check for NirCmd (for media control)
    try {
      this.executeSync('where nircmd');
    } catch (error) {
      console.warn('NirCmd not found in PATH. Media controls will be limited.');
      console.info('Download from: https://www.nirsoft.net/utils/nircmd.html');
    }
  }

  executeSync(command, options = {}) {
    try {
      const result = require('child_process').execSync(command, {
        ...options,
        stdio: ['inherit', 'pipe', 'pipe'],
        encoding: 'utf-8',
        windowsHide: true
      });
      return result.toString().trim();
    } catch (error) {
      console.error('Command failed:', error.message);
      throw error;
    }
  }

  async executeCommand(command, options = {}) {
    return new Promise((resolve, reject) => {
      const process = exec(command, {
        ...options,
        windowsHide: true
      }, (error, stdout, stderr) => {
        if (error) {
          return reject({ error, stderr });
        }
        resolve({ stdout, stderr });
      });
      
      const processId = `cmd_${Date.now()}`;
      this.activeProcesses.set(processId, process);
      
      process.on('exit', () => {
        this.activeProcesses.delete(processId);
      });
    });
  }

  // File operations
  async searchFiles(query, directory = os.homedir()) {
    try {
      const cmd = `where /r "${directory}" *${query}*`;
      const { stdout } = await this.executeCommand(cmd);
      return {
        success: true,
        files: stdout.split('\r\n').filter(Boolean)
      };
    } catch (error) {
      console.error('File search error:', error);
      return { success: false, error: 'File search failed' };
    }
  }

  // Media control
  async controlMedia(action) {
    const commands = {
      play: 'nircmd.exe mediaplay',
      pause: 'nircmd.exe mediapause',
      next: 'nircmd.exe mediaplaynext',
      previous: 'nircmd.exe mediaplayprev',
      stop: 'nircmd.exe mediastop',
      volumeUp: 'nircmd.exe changesysvolume 2000',
      volumeDown: 'nircmd.exe changesysvolume -2000',
      mute: 'nircmd.exe mutesysvolume 2',
      unmute: 'nircmd.exe mutesysvolume 1',
      vol: (level) => `nircmd.exe setsysvolume ${Math.min(Math.max(0, level), 65535)}`
    };

    try {
      let command = commands[action];
      if (typeof command === 'function') {
        command = command(...Array.from(arguments).slice(1));
      }
      
      if (!command) {
        throw new Error(`Unsupported media action: ${action}`);
      }

      await this.executeCommand(command);
      return { success: true, action };
    } catch (error) {
      console.error('Media control error:', error);
      return { success: false, error: `Failed to ${action} media` };
    }
  }

  // System controls
  async systemCommand(action) {
    const commands = {
      lock: 'rundll32.exe user32.dll,LockWorkStation',
      sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
      restart: 'shutdown /r /t 0',
      shutdown: 'shutdown /s /t 0',
      logoff: 'shutdown /l /f'
    };

    try {
      const command = commands[action];
      if (!command) {
        throw new Error(`Unsupported system command: ${action}`);
      }
      await this.executeCommand(command);
      return { success: true, action };
    } catch (error) {
      console.error('System command error:', error);
      return { success: false, error: `Failed to execute ${action}` };
    }
  }

  // Cleanup
  async cleanup() {
    // Terminate active processes
    for (const [id, process] of this.activeProcesses) {
      try {
        process.kill();
      } catch (error) {
        console.error(`Error terminating process ${id}:`, error);
      }
    }
    this.activeProcesses.clear();

    // Cleanup temporary files
    for (const file of this.tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } catch (error) {
        console.error(`Error deleting temp file ${file}:`, error);
      }
    }
    this.tempFiles = [];
  }
}

// Create and export singleton instance
const pcControl = new PCControl();
export default pcControl;
