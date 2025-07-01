// Mock implementation of PC Control for non-Windows environments
class MockPCControl {
  constructor() {
    this.isWindows = false;
    console.log('PC Control is disabled in this environment (running in production/Linux)');
  }

  // Mock methods that return successful responses but do nothing
  async executeCommand() {
    return { stdout: '', stderr: '' };
  }

  executeSync() {
    return '';
  }

  async searchFiles() {
    return { success: true, files: [] };
  }

  async controlMedia(action) {
    console.log(`[Mock] Media control action: ${action} (not executed in this environment)`);
    return { success: true, action };
  }

  async systemCommand(action) {
    console.log(`[Mock] System command: ${action} (not executed in this environment)`);
    return { success: true, action };
  }

  async cleanup() {
    // No cleanup needed for mock
  }
}

// Export mock instance
export default new MockPCControl();
