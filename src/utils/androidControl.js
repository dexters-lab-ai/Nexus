import { 
  AndroidAgent, 
  AndroidDevice, 
  getConnectedDevices 
} from '@midscene/android';
import { exec } from 'child_process';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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
    
    // Enhanced reporting state
    this.reporting = {
      currentRunId: null,           // Unique ID for the current automation run
      runDir: null,                 // Base directory for run artifacts
      reportDir: null,              // Directory for report files
      screenshotsDir: null,         // Directory for screenshots
      screenshots: [],              // Array of screenshot metadata
      actionLog: [],                // Detailed action log
      startTime: null,              // When the run started
      endTime: null,                // When the run completed
      currentStep: 0,               // Current step number
      status: 'idle',               // 'idle' | 'running' | 'completed' | 'failed'
      error: null,                  // Error object if run failed
      deviceInfo: null,             // Device information
      commandHistory: [],           // History of commands executed
      performanceMetrics: {         // Performance tracking
        totalTime: 0,
        avgStepTime: 0,
        stepsCompleted: 0
      }
    };
  }

  /**
   * Initialize a new reporting session
   * @param {string} runId - Unique ID for this run
   * @param {string} [baseDir='midscene_run'] - Base directory for storing reports
   * @returns {Promise<Object>} - Object containing report paths
   */
  async initReporting(runId, baseDir = 'midscene_run') {
    // Create the base android runs directory if it doesn't exist
    const androidRunsDir = path.join(baseDir, 'android');
    const runDir = path.join(androidRunsDir, runId);
    const screenshotsDir = path.join(runDir, 'screenshots');
    
    // Create necessary directories with proper permissions
    await fs.promises.mkdir(androidRunsDir, { recursive: true, mode: 0o755 });
    await fs.promises.mkdir(runDir, { recursive: true, mode: 0o755 });
    await fs.promises.mkdir(screenshotsDir, { recursive: true, mode: 0o755 });
    
    // Define report paths
    const reportPaths = {
      baseDir,
      androidRunsDir,
      runDir,
      screenshotsDir,
      initialReport: path.join(runDir, 'report.html'),
      finalReport: path.join(runDir, 'nexus_report.html'),
      get screenshotBaseUrl() {
        return `/api/android/screenshots/${runId}`;
      },
      get reportUrl() {
        return `/api/android/reports/${runId}`;
      }
    };
    
    // Initialize reporting state
    this.reporting = {
      ...this.reporting,
      currentRunId: runId,
      ...reportPaths,
      screenshots: [],
      actionLog: [],
      startTime: new Date(),
      endTime: null,
      currentStep: 0,
      status: 'running',
      error: null,
      deviceInfo: this.device ? await this.getDeviceInfo() : null,
      commandHistory: [],
      performanceMetrics: {
        totalTime: 0,
        avgStepTime: 0,
        stepsCompleted: 0
      }
    };
    
    // Log initialization
    this._logAction('reporting_initialized', { 
      runId, 
      baseDir,
      reportPaths
    });
    
    return reportPaths;
  }

  /**
   * Log an action to the report
   * @param {string} action - Action name/type
   * @param {Object} data - Action data
   * @param {string} [level=info] - Log level (info, warning, error)
   */
  _logAction(action, data = {}, level = 'info') {
    const timestamp = new Date();
    const logEntry = {
      timestamp,
      action,
      data,
      level,
      step: this.reporting.currentStep
    };
    
    this.reporting.actionLog.push(logEntry);
    
    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      const logFn = console[level] || console.log;
      logFn(`[${timestamp.toISOString()}] [${level.toUpperCase()}] ${action}`, data);
    }
    
    return logEntry;
  }

  /**
   * Capture a screenshot and save it to the run directory
   * @param {string} name - Name for the screenshot (will be used in filename)
   * @param {Object} [metadata] - Additional metadata to store with the screenshot
   * @returns {Promise<Object>} - Screenshot metadata including path and URL
   */
  async captureScreenshot(name = 'screenshot', metadata = {}) {
    if (!this.device || this.reporting.status !== 'running') {
      throw new Error('Cannot capture screenshot: No active device or reporting session');
    }
    
    // Ensure screenshots directory exists
    await fs.promises.mkdir(this.reporting.screenshotsDir, { recursive: true, mode: 0o755 });
    
    // Sanitize the name for filename safety
    const safeName = name.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot_${safeName}_${timestamp}.png`;
    const filePath = path.join(this.reporting.screenshotsDir, filename);
    
    try {
      // Take screenshot using Midscene SDK
      this._logAction('capturing_screenshot', { name, step: this.reporting.currentStep });
      const screenshotBuffer = await this.device.takeScreenshot();
      
      // Save to file with error handling for filesystem operations
      try {
        await fs.promises.writeFile(filePath, screenshotBuffer);
      } catch (fsError) {
        // If write fails, try one more time after ensuring directory exists
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true, mode: 0o755 });
        await fs.promises.writeFile(filePath, screenshotBuffer);
      }
      
      // Create metadata entry with enhanced information
      const screenshotInfo = {
        id: uuidv4(),
        name,
        filename,
        path: filePath,
        // Use the URL pattern that matches our API endpoint
        url: `${this.reporting.screenshotBaseUrl}/${filename}`,
        timestamp: new Date(),
        step: this.reporting.currentStep,
        metadata: {
          deviceInfo: this.reporting.deviceInfo,
          ...metadata
        },
        // Add relative paths for easier access in reports
        relativePath: path.relative(this.reporting.runDir, filePath),
        webPath: `/midscene_run/android/${this.reporting.currentRunId}/screenshots/${filename}`
      };
      
      // Add to screenshots array and maintain a reasonable limit
      this.reporting.screenshots.push(screenshotInfo);
      if (this.reporting.screenshots.length > 100) {
        // Remove oldest screenshot if we exceed the limit
        const oldest = this.reporting.screenshots.shift();
        try {
          await fs.promises.unlink(oldest.path).catch(() => {});
        } catch (e) {
          // Ignore errors when cleaning up old screenshots
        }
      }
      
      // Update the last screenshot reference for quick access
      this.reporting.lastScreenshot = screenshotInfo;
      
      // Log the successful capture
      this._logAction('screenshot_captured', { 
        screenshotId: screenshotInfo.id,
        name,
        step: this.reporting.currentStep,
        path: screenshotInfo.relativePath,
        size: screenshotBuffer.length
      });
      
      return screenshotInfo;
      
    } catch (error) {
      const errorInfo = { 
        error: error.message, 
        name,
        step: this.reporting.currentStep,
        stack: error.stack,
        filePath
      };
      
      this._logAction('screenshot_failed', errorInfo, 'error');
      
      // Rethrow with more context
      const err = new Error(`Failed to capture screenshot: ${error.message}`);
      err.originalError = error;
      err.details = { name, step: this.reporting.currentStep };
      throw err;
    }
  }

  /**
   * Get detailed device information
   * @returns {Promise<Object>} Device information
   */
  async getDeviceInfo() {
    if (!this.device) {
      return null;
    }
    
    try {
      // Basic device info
      const info = {
        id: await this.device.getSerial(),
        model: await this.device.getModel(),
        manufacturer: await this.device.getManufacturer(),
        sdkVersion: await this.device.getSdkVersion(),
        androidVersion: await this.device.getAndroidVersion(),
        resolution: await this.device.getDisplayInfo(),
        // Add more device properties as needed
        timestamp: new Date()
      };
      
      // Store in reporting state
      this.reporting.deviceInfo = info;
      
      return info;
      
    } catch (error) {
      this._logAction('device_info_failed', { error: error.message }, 'error');
      return null;
    }
  }

  /**
   * Generate an HTML report for the current run
   * @param {Object} [options] - Report generation options
   * @param {boolean} [options.isFinal=false] - Whether this is the final report
   * @returns {Promise<Object>} Report metadata including path and URL
   */
  async generateReport(options = {}) {
    const { isFinal = false } = options;
    
    if (!this.reporting.currentRunId) {
      throw new Error('No active reporting session');
    }
    
    try {
      // Calculate performance metrics
      const endTime = this.reporting.endTime || new Date();
      const totalTime = endTime - this.reporting.startTime;
      const stepsCompleted = this.reporting.performanceMetrics.stepsCompleted || 0;
      const avgStepTime = stepsCompleted > 0 
        ? totalTime / stepsCompleted 
        : 0;
      
      // Prepare report data
      const reportData = {
        runId: this.reporting.currentRunId,
        startTime: this.reporting.startTime,
        endTime: endTime,
        status: isFinal ? 'completed' : this.reporting.status,
        deviceInfo: this.reporting.deviceInfo,
        actionLog: [...this.reporting.actionLog], // Create a copy of the log
        screenshots: [...this.reporting.screenshots], // Create a copy of screenshots
        commandHistory: [...this.reporting.commandHistory], // Create a copy of command history
        performanceMetrics: {
          totalTime,
          avgStepTime,
          stepsCompleted,
          memoryUsage: process.memoryUsage()
        },
        // Add replay functionality for final report
        canReplay: isFinal,
        replayUrl: isFinal ? `/api/android/replay/${this.reporting.currentRunId}` : null,
        // Add reference to the final report URL
        finalReportUrl: isFinal ? null : `/midscene_run/android/${this.reporting.currentRunId}/nexus_report.html`
      };
      
      // Generate HTML content
      const reportHtml = await this._generateHtmlReport(reportData);
      
      // Determine the output path based on whether this is the final report
      const outputPath = isFinal ? this.reporting.finalReport : this.reporting.initialReport;
      
      // Ensure the directory exists
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o755 });
      
      // Write the report file
      await fs.promises.writeFile(outputPath, reportHtml);
      
      // If this is the final report, update the status and end time
      if (isFinal) {
        this.reporting.status = 'completed';
        this.reporting.endTime = endTime;
      }
      
      // Prepare report info with both filesystem and web-accessible paths
      const reportInfo = {
        path: outputPath,
        // For initial reports, use the direct file path
        // For final reports, use the API endpoint
        url: isFinal 
          ? `/api/android/reports/${this.reporting.currentRunId}`
          : `/midscene_run/android/${this.reporting.currentRunId}/report.html`,
        timestamp: new Date(),
        runId: this.reporting.currentRunId,
        isFinal,
        // Include the final report path for reference
        finalReportPath: this.reporting.finalReport,
        finalReportUrl: `/midscene_run/android/${this.reporting.currentRunId}/nexus_report.html`
      };
      
      // Log the report generation
      this._logAction(
        isFinal ? 'final_report_generated' : 'initial_report_generated', 
        { 
          path: outputPath,
          url: reportInfo.url,
          isFinal
        }
      );
      
      return reportInfo;
      
    } catch (error) {
      const errorInfo = {
        error: error.message,
        stack: error.stack,
        isFinal,
        runId: this.reporting.currentRunId
      };
      
      this._logAction('report_generation_failed', errorInfo, 'error');
      
      // Rethrow with more context
      const err = new Error(
        `Failed to generate ${isFinal ? 'final' : 'initial'} report: ${error.message}`
      );
      err.originalError = error;
      err.details = errorInfo;
      throw err;
    }
  }
  
  /**
   * Generate the final report after processing is complete
   * This should be called after all automation steps are done
   * @returns {Promise<Object>} Final report metadata
   */
  async finalizeReport() {
    try {
      // Ensure we have the latest device info
      if (this.device) {
        this.reporting.deviceInfo = await this.getDeviceInfo();
      }
      
      // Generate the final report
      const finalReport = await this.generateReport({ isFinal: true });
      
      // Log completion
      this._logAction('report_finalized', {
        runId: this.reporting.currentRunId,
        reportPath: finalReport.path,
        reportUrl: finalReport.url,
        duration: finalReport.timestamp - this.reporting.startTime,
        steps: this.reporting.performanceMetrics.stepsCompleted,
        screenshots: this.reporting.screenshots.length
      });
      
      return finalReport;
      
    } catch (error) {
      const errorInfo = {
        error: error.message,
        stack: error.stack,
        runId: this.reporting.currentRunId
      };
      
      this._logAction('report_finalization_failed', errorInfo, 'error');
      
      // Rethrow with more context
      const err = new Error(`Failed to finalize report: ${error.message}`);
      err.originalError = error;
      err.details = errorInfo;
      throw err;
    }
  }

  /**
   * Generate HTML report content
   * @private
   * @param {Object} reportData - Report data
   * @returns {Promise<string>} HTML content
   */
  async _generateHtmlReport(reportData) {
    const { runId, status, startTime, endTime, deviceInfo, actionLog = [], screenshots = [], commandHistory = [], performanceMetrics = {} } = reportData;
    const isFinal = status === 'completed';
    const duration = performanceMetrics.totalTime ? (performanceMetrics.totalTime / 1000).toFixed(2) + 's' : 'N/A';
    const startTimeFormatted = startTime ? new Date(startTime).toLocaleString() : 'N/A';
    const endTimeFormatted = endTime ? new Date(endTime).toLocaleString() : 'In Progress';
    
    // Extract device info for display
    const deviceInfoDisplay = deviceInfo ? {
      'Model': deviceInfo.model || 'Unknown',
      'Brand': deviceInfo.brand || 'Unknown',
      'Android Version': deviceInfo.androidVersion || deviceInfo.version || 'Unknown',
      'SDK Version': deviceInfo.sdkVersion || 'Unknown',
      'CPU': deviceInfo.cpuAbi || deviceInfo.cpu || 'Unknown',
      'Resolution': deviceInfo.resolution || 'Unknown',
      'Serial': deviceInfo.serial || deviceInfo.udid || 'Unknown',
      'Manufacturer': deviceInfo.manufacturer || 'Unknown'
    } : {};

    // Generate the HTML head with styles
    const htmlHead = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Android Automation Report - ${runId}</title>
        <!-- Bootstrap 5 CSS -->
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
        <!-- Font Awesome for icons -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
        <style>
          :root {
            --primary-color: #4e73df;
            --success-color: #1cc88a;
            --danger-color: #e74a3b;
            --warning-color: #f6c23e;
            --info-color: #36b9cc;
            --dark-color: #5a5c69;
            --light-color: #f8f9fc;
            --border-color: #e3e6f0;
          }
          
          body {
            font-family: 'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f8f9fc;
            color: #5a5c69;
            line-height: 1.6;
          }
          
          .sidebar {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 250px;
            padding: 20px;
            background-color: #fff;
            box-shadow: 0 0.15rem 1.75rem 0 rgba(58, 59, 69, 0.15);
            overflow-y: auto;
            z-index: 1000;
          }
          
          .main-content {
            margin-left: 250px;
            padding: 20px 30px;
          }
          
          .card {
            border: none;
            border-radius: 0.35rem;
            box-shadow: 0 0.15rem 1.75rem 0 rgba(58, 59, 69, 0.1);
            margin-bottom: 1.5rem;
          }
          
          .card-header {
            background-color: #fff;
            border-bottom: 1px solid rgba(0,0,0,.125);
            padding: 1rem 1.25rem;
          }
          
          .log-entry {
            padding: 0.75rem 1rem;
            margin-bottom: 0.5rem;
            border-left: 3px solid #ddd;
            background-color: #fff;
            border-radius: 0.25rem;
            transition: all 0.2s;
          }
          
          .log-entry:hover {
            transform: translateX(5px);
            box-shadow: 0 0.125rem 0.25rem rgba(0,0,0,0.075);
          }
          
          .log-entry.log-info { border-left-color: var(--info-color); }
          .log-entry.log-warning { border-left-color: var(--warning-color); }
          .log-entry.log-error { border-left-color: var(--danger-color); }
          .log-entry.log-success { border-left-color: var(--success-color); }
          
          .screenshot-thumbnail {
            cursor: pointer;
            transition: transform 0.2s;
            margin-bottom: 1rem;
            border: 1px solid #e3e6f0;
            border-radius: 0.35rem;
            overflow: hidden;
          }
          
          .screenshot-thumbnail:hover {
            transform: scale(1.02);
            box-shadow: 0 0.5rem 1rem rgba(0,0,0,0.15);
          }
          
          .screenshot-thumbnail img {
            width: 100%;
            height: auto;
            display: block;
          }
          
          .screenshot-caption {
            padding: 0.5rem;
            background-color: #f8f9fc;
            font-size: 0.85rem;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          
          .command-item {
            padding: 0.75rem 1rem;
            border-bottom: 1px solid #e3e6f0;
            font-family: 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
            font-size: 0.9rem;
          }
          
          .command-item:last-child {
            border-bottom: none;
          }
          
          .command-timestamp {
            color: #6c757d;
            font-size: 0.8rem;
            margin-right: 0.5rem;
          }
          
          .badge {
            font-weight: 500;
            padding: 0.35em 0.65em;
          }
          
          .nav-link {
            color: #5a5c69;
            font-weight: 600;
            padding: 0.5rem 1rem;
            border-radius: 0.25rem;
          }
          
          .nav-link.active {
            color: var(--primary-color);
            background-color: rgba(78, 115, 223, 0.1);
          }
          
          .nav-link:hover {
            color: var(--primary-color);
          }
          
          .tab-content {
            padding: 1.5rem 0;
          }
          
          .device-info-table th {
            width: 30%;
          }
          
          @media (max-width: 768px) {
            .sidebar {
              width: 100%;
              position: static;
              height: auto;
              margin-bottom: 1rem;
              box-shadow: none;
            }
            
            .main-content {
              margin-left: 0;
              padding: 15px;
            }
          }
        </style>
      </head>
    `;

    // Generate the sidebar HTML
    const sidebarHtml = `
      <div class="sidebar">
        <div class="d-flex flex-column h-100">
          <div class="mb-4">
            <h4 class="mb-3">
              <i class="fas fa-robot me-2"></i>Android Automation
            </h4>
            
            <div class="card bg-light mb-3">
              <div class="card-body p-3">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="fw-bold small">Run ID:</span>
                  <span class="text-muted small">${runId.substring(0, 8)}...</span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="fw-bold small">Status:</span>
                  <span class="badge bg-${status === 'completed' ? 'success' : status === 'failed' ? 'danger' : 'warning'} text-uppercase">
                    ${status}
                  </span>
                </div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="fw-bold small">Duration:</span>
                  <span class="text-muted small">${duration}</span>
                </div>
                <div class="d-flex justify-content-between align-items-center">
                  <span class="fw-bold small">Started:</span>
                  <span class="text-muted small">${startTimeFormatted}</span>
                </div>
              </div>
            </div>
            
            <div class="d-grid gap-2">
              <button id="printReport" class="btn btn-outline-primary btn-sm mb-2">
                <i class="fas fa-print me-1"></i> Print Report
              </button>
              <button id="exportJson" class="btn btn-outline-secondary btn-sm mb-3">
                <i class="fas fa-file-export me-1"></i> Export JSON
              </button>
            </div>
            
            <div class="nav flex-column nav-pills" id="reportTabs" role="tablist">
              <a class="nav-link active" id="overview-tab" data-bs-toggle="pill" href="#overview" role="tab">
                <i class="fas fa-home me-2"></i>Overview
              </a>
              <a class="nav-link" id="screenshots-tab" data-bs-toggle="pill" href="#screenshots" role="tab">
                <i class="fas fa-camera me-2"></i>Screenshots (${screenshots.length})
              </a>
              <a class="nav-link" id="logs-tab" data-bs-toggle="pill" href="#logs" role="tab">
                <i class="fas fa-list me-2"></i>Action Log (${actionLog.length})
              </a>
              <a class="nav-link" id="commands-tab" data-bs-toggle="pill" href="#commands" role="tab">
                <i class="fas fa-terminal me-2"></i>Commands (${commandHistory.length})
              </a>
              <a class="nav-link" id="device-tab" data-bs-toggle="pill" href="#device" role="tab">
                <i class="fas fa-mobile-alt me-2"></i>Device Info
              </a>
            </div>
          </div>
          
          <div class="mt-auto pt-3 border-top">
            <div class="d-flex justify-content-between align-items-center small text-muted">
              <span>Generated by Nexus</span>
              <span>v${process.env.npm_package_version || '1.0.0'}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Generate the main content HTML
    const mainContentHtml = `
      <div class="main-content">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h1 class="h3 mb-0">Automation Report</h1>
          <div>
            <span class="badge bg-${status === 'completed' ? 'success' : status === 'failed' ? 'danger' : 'warning'} me-2">
              ${status.toUpperCase()}
            </span>
            <span class="text-muted small">${runId}</span>
          </div>
        </div>
        
        <div class="tab-content" id="reportTabContent">
          <!-- Overview Tab -->
          <div class="tab-pane fade show active" id="overview" role="tabpanel" aria-labelledby="overview-tab">
            <div class="row">
              <div class="col-md-8">
                <div class="card mb-4">
                  <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Test Summary</h5>
                    <span class="badge bg-primary">${new Date().toLocaleDateString()}</span>
                  </div>
                  <div class="card-body">
                    <div class="row mb-4">
                      <div class="col-md-4 text-center">
                        <div class="display-5 fw-bold text-primary">${performanceMetrics.stepsCompleted || 0}</div>
                        <div class="text-muted">Steps</div>
                      </div>
                      <div class="col-md-4 text-center">
                        <div class="display-5 fw-bold text-success">${screenshots.length}</div>
                        <div class="text-muted">Screenshots</div>
                      </div>
                      <div class="col-md-4 text-center">
                        <div class="display-5 fw-bold text-info">${duration}</div>
                        <div class="text-muted">Duration</div>
                      </div>
                    </div>
                    
                    ${status === 'failed' ? `
                      <div class="alert alert-danger">
                        <h5><i class="fas fa-exclamation-triangle me-2"></i>Test Failed</h5>
                        <p class="mb-0">${reportData.error?.message || 'An unknown error occurred during test execution.'}</p>
                      </div>
                    ` : ''}
                    
                    <h5 class="mt-4 mb-3">Timeline</h5>
                    <div class="timeline">
                      <div class="timeline-item">
                        <div class="timeline-badge bg-success"><i class="fas fa-play"></i></div>
                        <div class="timeline-content">
                          <h6>Test Started</h6>
                          <p class="text-muted small mb-0">${startTimeFormatted}</p>
                        </div>
                      </div>
                      
                      ${isFinal ? `
                        <div class="timeline-item">
                          <div class="timeline-badge ${status === 'completed' ? 'bg-success' : 'bg-danger'}">
                            <i class="fas ${status === 'completed' ? 'fa-check' : 'fa-times'}"></i>
                          </div>
                          <div class="timeline-content">
                            <h6>Test ${status === 'completed' ? 'Completed' : 'Failed'}</h6>
                            <p class="text-muted small mb-0">${endTimeFormatted}</p>
                            ${status === 'failed' ? `<p class="mb-0 small text-danger">${reportData.error?.message || 'Unknown error'}</p>` : ''}
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  </div>
                </div>
                
                <div class="card mb-4">
                  <div class="card-header">
                    <h5 class="mb-0">Recent Activity</h5>
                  </div>
                  <div class="card-body p-0">
                    ${actionLog.slice(-5).reverse().map(log => `
                      <div class="log-entry log-${log.level || 'info'} border-0 rounded-0 border-bottom">
                        <div class="d-flex justify-content-between align-items-center">
                          <strong>${log.action}</strong>
                          <small class="text-muted">${new Date(log.timestamp).toLocaleTimeString()}</small>
                        </div>
                        ${log.data ? `<pre class="mt-2 mb-0 small">${JSON.stringify(log.data, null, 2)}</pre>` : ''}
                      </div>
                    `).join('')}
                    ${actionLog.length === 0 ? '<p class="p-3 mb-0 text-muted text-center">No activity logged yet</p>' : ''}
                  </div>
                </div>
              </div>
              
              <div class="col-md-4">
                <div class="card mb-4">
                  <div class="card-header">
                    <h5 class="mb-0">Device Information</h5>
                  </div>
                  <div class="card-body">
                    ${deviceInfo ? `
                      <div class="text-center mb-3">
                        <i class="fas fa-mobile-alt fa-4x text-primary mb-2"></i>
                        <h5>${deviceInfo.model || 'Android Device'}</h5>
                        <p class="text-muted mb-0">${deviceInfo.manufacturer || 'Unknown Manufacturer'}</p>
                      </div>
                      <table class="table table-sm">
                        <tbody>
                          ${Object.entries(deviceInfoDisplay).map(([key, value]) => `
                            <tr>
                              <th class="text-muted">${key}</th>
                              <td class="text-end">${value}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    ` : '<p class="text-muted text-center mb-0">No device information available</p>'}
                  </div>
                </div>
                
                <div class="card">
                  <div class="card-header d-flex justify-content-between align-items-center">
                    <h5 class="mb-0">Quick Stats</h5>
                    <i class="fas fa-chart-pie text-primary"></i>
                  </div>
                  <div class="card-body">
                    <div class="mb-3">
                      <div class="d-flex justify-content-between mb-1">
                        <span>Test Progress</span>
                        <span>${isFinal ? '100%' : 'In Progress'}</span>
                      </div>
                      <div class="progress" style="height: 10px;">
                        <div class="progress-bar bg-primary" role="progressbar" 
                             style="width: ${isFinal ? 100 : 50}%" 
                             aria-valuenow="${isFinal ? 100 : 50}" 
                             aria-valuemin="0" 
                             aria-valuemax="100">
                        </div>
                      </div>
                    </div>
                    
                    <div class="list-group list-group-flush">
                      <div class="list-group-item d-flex justify-content-between align-items-center px-0 border-0">
                        <span><i class="fas fa-camera text-primary me-2"></i> Screenshots</span>
                        <span class="badge bg-primary rounded-pill">${screenshots.length}</span>
                      </div>
                      <div class="list-group-item d-flex justify-content-between align-items-center px-0">
                        <span><i class="fas fa-list text-success me-2"></i> Log Entries</span>
                        <span class="badge bg-success rounded-pill">${actionLog.length}</span>
                      </div>
                      <div class="list-group-item d-flex justify-content-between align-items-center px-0">
                        <span><i class="fas fa-terminal text-info me-2"></i> Commands</span>
                        <span class="badge bg-info rounded-pill">${commandHistory.length}</span>
                      </div>
                      <div class="list-group-item d-flex justify-content-between align-items-center px-0">
                        <span><i class="fas fa-clock text-warning me-2"></i> Duration</span>
                        <span class="badge bg-warning text-dark rounded-pill">${duration}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Screenshots Tab -->
          <div class="tab-pane fade" id="screenshots" role="tabpanel" aria-labelledby="screenshots-tab">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h5 class="mb-0">Captured Screenshots</h5>
              <div class="text-muted small">${screenshots.length} total</div>
            </div>
            
            ${screenshots.length > 0 ? `
              <div class="row g-4">
                ${screenshots.map((screenshot, index) => `
                  <div class="col-md-4 col-lg-3">
                    <div class="screenshot-thumbnail" data-bs-toggle="modal" data-bs-target="#screenshotModal" data-src="${screenshot.url || '#'}" data-title="Screenshot ${index + 1}">
                      <img src="${screenshot.thumbnailUrl || screenshot.url || '#'}" alt="Screenshot ${index + 1}" class="img-fluid">
                      <div class="screenshot-caption">
                        ${screenshot.name || `Screenshot ${index + 1}`}
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="text-center py-5">
                <i class="fas fa-camera fa-4x text-muted mb-3"></i>
                <h5>No Screenshots Captured</h5>
                <p class="text-muted">No screenshots were taken during this test run.</p>
              </div>
            `}
          </div>
          
          <!-- Logs Tab -->
          <div class="tab-pane fade" id="logs" role="tabpanel" aria-labelledby="logs-tab">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h5 class="mb-0">Action Log</h5>
              <div class="text-muted small">${actionLog.length} entries</div>
            </div>
            
            <div class="card">
              <div class="card-body p-0">
                ${actionLog.length > 0 ? `
                  ${actionLog.map(log => `
                    <div class="log-entry log-${log.level || 'info'}">
                      <div class="d-flex justify-content-between align-items-start">
                        <div>
                          <strong>${log.action}</strong>
                          <div class="text-muted small">${new Date(log.timestamp).toLocaleString()}</div>
                        </div>
                        <span class="badge bg-${log.level === 'error' ? 'danger' : log.level === 'warn' ? 'warning' : 'info'}">
                          ${log.level || 'info'}
                        </span>
                      </div>
                      ${log.data ? `
                        <div class="mt-2">
                          <button class="btn btn-sm btn-outline-secondary toggle-details" type="button" data-bs-toggle="collapse" data-bs-target="#log-details-${log.timestamp}">
                            Toggle Details <i class="fas fa-chevron-down"></i>
                          </button>
                          <div class="collapse mt-2" id="log-details-${log.timestamp}">
                            <pre class="bg-light p-2 rounded small mb-0">${JSON.stringify(log.data, null, 2)}</pre>
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  `).join('')}
                ` : `
                  <div class="text-center p-5">
                    <i class="fas fa-clipboard-list fa-3x text-muted mb-3"></i>
                    <h5>No Log Entries</h5>
                    <p class="text-muted">No log entries were recorded during this test run.</p>
                  </div>
                `}
              </div>
            </div>
          </div>
          
          <!-- Commands Tab -->
          <div class="tab-pane fade" id="commands" role="tabpanel" aria-labelledby="commands-tab">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h5 class="mb-0">Command History</h5>
              <div class="text-muted small">${commandHistory.length} commands executed</div>
            </div>
            
            <div class="card">
              <div class="card-body p-0">
                ${commandHistory.length > 0 ? `
                  ${commandHistory.map((cmd, index) => `
                    <div class="command-item">
                      <div class="d-flex justify-content-between align-items-center">
                        <div>
                          <span class="command-timestamp">${new Date(cmd.timestamp).toLocaleTimeString()}</span>
                          <code>${cmd.command}</code>
                        </div>
                        <span class="badge bg-${cmd.success ? 'success' : 'danger'}">
                          ${cmd.success ? 'Success' : 'Failed'}
                        </span>
                      </div>
                      ${cmd.output ? `
                        <div class="mt-2">
                          <button class="btn btn-sm btn-outline-secondary toggle-output" type="button" data-bs-toggle="collapse" data-bs-target="#cmd-output-${index}">
                            Toggle Output <i class="fas fa-chevron-down"></i>
                          </button>
                          <div class="collapse mt-2" id="cmd-output-${index}">
                            <pre class="bg-light p-2 rounded small mb-0">${cmd.output}</pre>
                          </div>
                        </div>
                      ` : ''}
                    </div>
                  `).join('')}
                ` : `
                  <div class="text-center p-5">
                    <i class="fas fa-terminal fa-3x text-muted mb-3"></i>
                    <h5>No Commands Executed</h5>
                    <p class="text-muted">No commands were executed during this test run.</p>
                  </div>
                `}
              </div>
            </div>
          </div>
          
          <!-- Device Info Tab -->
          <div class="tab-pane fade" id="device" role="tabpanel" aria-labelledby="device-tab">
            <div class="d-flex justify-content-between align-items-center mb-4">
              <h5 class="mb-0">Device Information</h5>
              <button id="refreshDeviceInfo" class="btn btn-sm btn-outline-primary">
                <i class="fas fa-sync-alt me-1"></i> Refresh
              </button>
            </div>
            
            <div class="row">
              <div class="col-md-6">
                <div class="card mb-4">
                  <div class="card-header">
                    <h5 class="mb-0">Device Details</h5>
                  </div>
                  <div class="card-body">
                    ${deviceInfo ? `
                      <table class="table table-sm device-info-table">
                        <tbody>
                          ${Object.entries(deviceInfoDisplay).map(([key, value]) => `
                            <tr>
                              <th class="text-muted">${key}</th>
                              <td>${value || 'N/A'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    ` : `
                      <div class="text-center py-4">
                        <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                        <h5>No Device Information</h5>
                        <p class="text-muted">No device information is available for this test run.</p>
                      </div>
                    `}
                  </div>
                </div>
              </div>
              
              <div class="col-md-6">
                <div class="card">
                  <div class="card-header">
                    <h5 class="mb-0">System Properties</h5>
                  </div>
                  <div class="card-body">
                    ${deviceInfo?.properties ? `
                      <div class="table-responsive">
                        <table class="table table-sm table-hover">
                          <thead>
                            <tr>
                              <th>Property</th>
                              <th>Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${Object.entries(deviceInfo.properties).map(([key, value]) => `
                              <tr>
                                <td class="text-muted">${key}</td>
                                <td><code>${value || ''}</code></td>
                              </tr>
                            `).join('')}
                          </tbody>
                        </table>
                      </div>
                    ` : `
                      <div class="text-center py-4">
                        <i class="fas fa-info-circle fa-3x text-info mb-3"></i>
                        <h5>No System Properties</h5>
                        <p class="text-muted">No system properties are available for this device.</p>
                      </div>
                    `}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Screenshot Modal -->
        <div class="modal fade" id="screenshotModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-xl modal-dialog-centered">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title" id="screenshotModalLabel">Screenshot</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body text-center">
                <img id="screenshotFull" src="" alt="Full size screenshot" class="img-fluid">
              </div>
              <div class="modal-footer">
                <a id="downloadScreenshot" href="#" class="btn btn-outline-primary" download>
                  <i class="fas fa-download me-1"></i> Download
                </a>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

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
      ANDROID_HOME: settings.ANDROID_HOME || (process.platform === 'win32' ? 'C:\\platform-tools' : '/opt/android-sdk'),
      ANDROID_SDK_ROOT: settings.ANDROID_SDK_ROOT || (process.platform === 'win32' ? 'C:\\platform-tools' : '/opt/android-sdk'),
      MIDSCENE_ADB_PATH: settings.customAdbPath || (process.platform === 'win32' ? 'C:\\platform-tools\\adb.exe' : '/usr/bin/adb'),
      MIDSCENE_ADB_REMOTE_HOST: settings.remoteAdbHost || '',
      MIDSCENE_ADB_REMOTE_PORT: settings.remoteAdbPort?.toString() || '5037'
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
      ? 'C:\\platform-tools\\adb.exe'  // Default Windows path
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
      const cleanError = this._getErrorMessage(error);
      console.error(`${this.logPrefix} Connection failed:`, cleanError);
      throw new Error(`Failed to connect to Android device: ${cleanError}`);
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
   * Capture a screenshot from the connected device
   * @param {string} runId - The current run ID
   * @param {string} stepName - Name or description of the current step
   * @returns {Promise<{path: string, url: string}>} Screenshot details
   */
  async captureScreenshot(runId, stepName = '') {
    if (!this.device) {
      throw new Error('Not connected to any Android device. Call connect() first.');
    }

    try {
      // Create screenshots directory if it doesn't exist
      const screenshotsDir = path.join(this.reporting.runDir, 'screenshots');
      if (!fs.existsSync(screenshotsDir)) {
        fs.mkdirSync(screenshotsDir, { recursive: true });
      }

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const safeStepName = (stepName || 'screenshot').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const filename = `screenshot-${safeStepName}-${timestamp}.png`;
      const filePath = path.join(screenshotsDir, filename);
      
      // Take screenshot
      await this.device.screenshot({ path: filePath });
      
      // Generate web-accessible URL
      const screenshotUrl = `/android-reports/${runId}/screenshots/${filename}`;
      
      // Add to screenshots array
      this.reporting.screenshots.push({
        path: filePath,
        url: screenshotUrl,
        step: this.reporting.currentStep,
        stepName,
        timestamp: new Date().toISOString()
      });

      return { path: filePath, url: screenshotUrl };
    } catch (error) {
      console.error('Error capturing screenshot:', error);
      throw new Error(`Failed to capture screenshot: ${error.message}`);
    }
  }

  /**
   * Log an action to the execution log
   * @param {string} message - Action description
   * @param {Object} [data] - Additional data to log
   * @param {string} [level=info] - Log level (info, warn, error, debug)
   */
  logAction(message, data = {}, level = 'info') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      step: this.reporting.currentStep,
      message,
      level,
      data
    };

    this.reporting.actionLog.push(logEntry);
    console[level] ? console[level](`[AndroidControl] [${level.toUpperCase()}]`, message, data) : 
                    console.log(`[AndroidControl] [${level.toUpperCase()}]`, message, data);
  }


  /**
   * Execute an AI-powered action on the device with comprehensive reporting
   * @param {string} instruction - Natural language instruction
   * @param {Object} [options] - Additional options
   * @param {string} [options.runId] - The current run ID for reporting
   * @param {string} [options.baseDir] - Base directory for reports
   * @returns {Promise<Object>} Execution result with report data
   */
  async executeAction(instruction, options = {}) {
    if (!this.agent) {
      throw new Error('Not connected to any Android device. Call connect() first.');
    }

    const sessionId = options.sessionId || uuidv4();
    const timeout = options.timeout || 30000; // 30 seconds default timeout
    const runId = options.runId || `android-${Date.now()}`;
    const baseDir = options.baseDir || path.join(process.cwd(), 'android-reports');

    // Initialize reporting if not already done
    if (!this.reporting.runDir) {
      this.initReporting(runId, baseDir);
    }

    // Increment step counter
    this.reporting.currentStep++;
    const currentStep = this.reporting.currentStep;
    
    // Log the action
    this.logAction(`Executing action: ${instruction}`, { step: currentStep });

    try {
      // Take initial screenshot
      const beforeScreenshot = await this.captureScreenshot(runId, `before-${currentStep}`);
      
      // Execute the action with timeout
      const result = await Promise.race([
        this.agent.aiAction(instruction),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Action timed out')), timeout)
        )
      ]);

      // Take after screenshot
      const afterScreenshot = await this.captureScreenshot(runId, `after-${currentStep}`);
      
      // Log success
      this.logAction('Action executed successfully', { 
        step: currentStep,
        result: result,
        screenshots: { before: beforeScreenshot.url, after: afterScreenshot.url }
      }, 'info');

      // Generate report
      const { reportPath, reportUrl } = await this.generateReport();

      return {
        success: true,
        message: 'Action executed successfully',
        sessionId,
        runId,
        reportPath,
        reportUrl,
        screenshots: {
          before: beforeScreenshot,
          after: afterScreenshot
        },
        result
      };
    } catch (error) {
      // Capture error screenshot
      const errorScreenshot = await this.captureScreenshot(runId, `error-${currentStep}`);
      
      // Log error
      this.logAction(`Action failed: ${error.message}`, { 
        step: currentStep,
        error: error.stack || error.message,
        screenshot: errorScreenshot.url
      }, 'error');

      // Generate error report
      let reportPath, reportUrl;
      try {
        const report = await this.generateReport();
        reportPath = report.reportPath;
        reportUrl = report.reportUrl;
      } catch (reportError) {
        console.error('Failed to generate error report:', reportError);
      }

      throw new Error({
        success: false,
        message: `Failed to execute action: ${error.message}`,
        sessionId,
        runId,
        reportPath,
        reportUrl,
        screenshot: errorScreenshot,
        error: error.stack || error.message
      });
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
   * @param {Error|string|any} error - The error to process
   * @returns {string} A clean error message
   */
  _getErrorMessage(error) {
    if (!error) return 'Unknown error occurred';
    
    // If it's already a string, return as is
    if (typeof error === 'string') return error;
    
    // Handle Error objects
    if (error instanceof Error) {
      // For ADB/connection errors, try to extract the most relevant part
      const message = error.message || 'Unknown error';
      
      // Clean up common ADB error patterns
      if (message.includes('original error:')) {
        return message.split('original error:').pop().trim();
      }
      
      // Remove stack trace if present
      return message.split('\n')[0].trim();
    }
    
    // Handle object errors
    if (typeof error === 'object') {
      // Try common error message properties
      return error.message || error.error || error.reason || 
             error.description || JSON.stringify(error);
    }
    
    // Fallback to string conversion
    return String(error);
  }
  
  // ... (rest of the class remains the same)
  /**
   * Clean up resources
   */
  async cleanup() {
    try {
      // Safely disconnect device if it exists and has a disconnect method
      if (this.device) {
        try {
          if (typeof this.device.disconnect === 'function') {
            await this.device.disconnect();
          } else if (this.device.connection && typeof this.device.connection.disconnect === 'function') {
            await this.device.connection.disconnect();
          }
        } catch (deviceError) {
          console.warn(`${this.logPrefix} Error disconnecting device:`, deviceError);
        } finally {
          this.device = null;
        }
      }
      
      // Safely disconnect agent if it exists
      if (this.agent) {
        try {
          if (typeof this.agent.disconnect === 'function') {
            await this.agent.disconnect();
          }
        } catch (agentError) {
          console.warn(`${this.logPrefix} Error disconnecting agent:`, agentError);
        } finally {
          this.agent = null;
        }
      }
      
      // Clear active sessions
      this.activeSessions.clear();
    } catch (error) {
      console.error(`${this.logPrefix} Error during cleanup:`, error);
      // Don't throw from cleanup to prevent masking the original error
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
