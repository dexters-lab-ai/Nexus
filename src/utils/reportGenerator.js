// src/utils/reportGenerator.js

import fs from 'fs';
import path from 'path';

/**
 * Generate a static HTML “landing” report for a finished task.
 *
 * @param {string} prompt        - The user’s original prompt/command.
 * @param {Array<Object>} results - Array of per-step results (error, screenshotPath, summary, etc.).
 * @param {string|null} screenshotPath - Final screenshot URL or path (optional).
 * @param {string} runId         - Unique run identifier (used in filenames/URLs).
 * @param {string} reportDir     - Filesystem directory where to write the report.
 * @returns {string}             - Absolute path to the written HTML report file.
 */
/**
 * Generate an error report for a failed task.
 *
 * @param {string} prompt - The user's original prompt/command.
 * @param {Error} error - The error object that caused the task to fail.
 * @param {Object} plan - The task plan object with execution logs.
 * @param {string} runId - Unique run identifier (used in filenames/URLs).
 * @param {string} reportDir - Filesystem directory where to write the report.
 * @returns {string} - Absolute path to the written HTML report file.
 */
export async function generateErrorReport(prompt, error, plan, runId, reportDir) {
  console.log(`[ErrorReport] Generating error report for failed run ${runId}`);
  
  // Create a filename for the error report
  const currentDate = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const currentTime = new Date().toISOString().split('T')[1].substring(0, 8).replace(/:/g, '');
  const errorReportFile = `error-${currentDate}-${currentTime}-${runId}.html`;
  const errorReportPath = path.join(reportDir, errorReportFile);
  
  // Format the plan logs for display
  const planLogs = plan?.planLog || [];
  const formattedLogs = planLogs.map(log => {
    if (typeof log === 'string') return log;
    try {
      return typeof log === 'object' ? JSON.stringify(log, null, 2) : String(log);
    } catch (e) {
      return 'Error formatting log entry';
    }
  }).join('\n');
  
  // Generate HTML content for the error report
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error Report - ${runId}</title>
  <style>
    body { 
      font-family: Arial, sans-serif; 
      max-width: 1000px; 
      margin: 0 auto; 
      padding: 20px; 
      line-height: 1.6; 
    }
    h1, h2 { color: #d32f2f; }
    .error-message { 
      background-color: #ffebee; 
      border-left: 5px solid #d32f2f; 
      padding: 15px; 
      margin: 15px 0; 
    }
    .prompt {
      background-color: #e3f2fd;
      border-left: 5px solid #2196f3;
      padding: 15px;
      margin: 15px 0;
    }
    .log-container {
      background-color: #f5f5f5;
      padding: 15px;
      border-radius: 4px;
      overflow-x: auto;
      font-family: monospace;
      white-space: pre-wrap;
    }
    .error-stack {
      font-family: monospace;
      white-space: pre-wrap;
      background-color: #f8f8f8;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>Task Error Report</h1>
  <p>Task ID: ${runId}</p>
  <p>Time: ${new Date().toISOString()}</p>
  
  <h2>Original Prompt</h2>
  <div class="prompt">${prompt.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  
  <h2>Error Details</h2>
  <div class="error-message">
    <strong>Message:</strong> ${error.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
  </div>
  
  ${error.stack ? `<div class="error-stack">${error.stack.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ''}
  
  <h2>Execution Logs</h2>
  <div class="log-container">${formattedLogs.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
</body>
</html>`;
  
  // Write the HTML content to the file
  fs.writeFileSync(errorReportPath, htmlContent);
  console.log(`[ErrorReport] Error report saved to ${errorReportPath}`);
  
  return errorReportPath;
}

/**
 * Save and optimize screenshot
 * @param {string} screenshotBase64 - Base64-encoded screenshot
 * @param {string} directory - Directory to save to
 * @param {string} filename - Filename (without extension)
 * @returns {string} - Path to saved screenshot
 */
async function saveOptimizedScreenshot(screenshotBase64, directory, runId) {
  try {
    // Skip the data:image prefix if present
    if (screenshotBase64.startsWith('data:image')) {
      screenshotBase64 = screenshotBase64.split(',')[1];
    }
    
    // Generate a unique filename with timestamp
    const timestamp = Date.now();
    const screenshotPath = path.join(directory, `screenshot-${runId}-${timestamp}.png`);
    
    // Basic image saving without optimization
    fs.writeFileSync(screenshotPath, Buffer.from(screenshotBase64, 'base64'));
    console.log(`[Screenshot] Saved screenshot to ${screenshotPath}`);
    
    return screenshotPath;
  } catch (error) {
    console.error(`[Screenshot] Error saving screenshot:`, error);
    return null;
  }
}

/**
 * Generate a landing report that links to the existing midscene report.
 *
 * @param {string} prompt - The user's original prompt/command.
 * @param {Array<Object>} results - Array of per-step results.
 * @param {string|null} screenshotPath - Final screenshot URL/path.
 * @param {string} runId - Unique run identifier.
 * @param {string} reportDir - Directory to write the report.
 * @param {string|null} nexusReportUrl - URL to the processed Nexus/Midscene report.
 * @param {string|null} rawReportUrl - URL to the raw/unprocessed report.
 * @returns {Object} - Object containing report paths and URLs.
 */
/**
 * Generate a styled raw report with futuristic theme
 * 
 * @param {string} content - Raw content to style
 * @param {string} title - Report title
 * @returns {string} - Styled HTML string
 */
export function styleRawReport(content, title) {
  // Convert content to string and escape HTML
  const safeContent = typeof content === 'string' 
    ? content.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : JSON.stringify(content, null, 2).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Detect if content is JSON to apply syntax highlighting
  let formattedContent = safeContent;
  try {
    // If it parses as JSON, format it with syntax highlighting
    if (typeof content !== 'string') {
      formattedContent = highlightJson(JSON.stringify(content, null, 2));
    } else if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      const json = JSON.parse(content);
      formattedContent = highlightJson(JSON.stringify(json, null, 2));
    }
  } catch (e) {
    // Not JSON or invalid JSON, use as is
    console.log('Content is not valid JSON, using plain text');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'Raw Report'}</title>
  <style>
    :root {
      --primary: #4e6fff;
      --secondary: #8a4fff;
      --accent: #ff4b8a;
      --background: #0a0c14;
      --card-bg: #1a1d2d;
      --text: #e3e5fc;
      --text-secondary: #a9adc7;
      --border: #2a2d3d;
      --glow-primary: 0 0 15px rgba(78, 111, 255, 0.5);
      --glow-accent: 0 0 15px rgba(255, 75, 138, 0.5);
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      background: linear-gradient(135deg, var(--background), #141b29);
      color: var(--text);
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.6;
      padding: 0;
      margin: 0;
      min-height: 100vh;
    }
    
    .container {
      width: 90%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      background: rgba(10, 12, 20, 0.8);
      border-bottom: 1px solid var(--border);
      padding: 15px 0;
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(10px);
    }
    
    header .container {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .header-title {
      display: flex;
      align-items: center;
      gap: 15px;
    }
    
    .logo {
      height: 40px;
      filter: drop-shadow(0 0 5px var(--primary));
    }
    
    h1 {
      font-size: 24px;
      margin: 0;
      background: linear-gradient(90deg, var(--primary), var(--secondary));
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
    .timestamp {
      color: var(--text-secondary);
      font-size: 14px;
    }
    
    .content {
      margin-top: 30px;
      padding: 20px;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.25);
    }
    
    h2 {
      font-size: 20px;
      margin-bottom: 15px;
      color: var(--primary);
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
      text-shadow: var(--glow-primary);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    h2::before {
      content: '💡';
      font-size: 20px;
    }
    
    pre {
      background: rgba(0, 0, 0, 0.2);
      padding: 15px;
      border-radius: 8px;
      border-left: 4px solid var(--primary);
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 14px;
      color: var(--text);
      overflow-x: auto;
      max-height: 600px;
      overflow-y: auto;
      scrollbar-width: thin;
      white-space: pre-wrap;
    }
    
    pre::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    pre::-webkit-scrollbar-thumb {
      background-color: var(--primary);
      border-radius: 4px;
    }
    
    pre::-webkit-scrollbar-track {
      background-color: rgba(15, 20, 30, 0.5);
    }
    
    .details {
      margin-bottom: 20px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 15px;
    }
    
    .detail-item {
      padding: 10px;
      background: rgba(15, 20, 30, 0.6);
      border: 1px solid var(--border);
      border-radius: 8px;
      backdrop-filter: blur(5px);
    }
    
    .detail-label {
      color: var(--primary);
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    
    .detail-value {
      color: var(--text-secondary);
      font-size: 14px;
    }
    
    /* JSON syntax highlighting */
    .json-key {
      color: var(--primary);
      font-weight: 500;
    }
    
    .json-string {
      color: #98c379;
    }
    
    .json-number {
      color: #d19a66;
    }
    
    .json-boolean {
      color: #c678dd;
    }
    
    .json-null {
      color: #e06c75;
    }
    
    /* For nested code blocks within JSON */
    .code-block {
      background: rgba(15, 20, 30, 0.7);
      padding: 10px;
      border-radius: 5px;
      margin: 5px 0;
      border: 1px solid var(--border);
    }
    
    footer {
      text-align: center;
      padding: 20px 0;
      margin-top: 30px;
      color: var(--text-secondary);
      font-size: 12px;
      border-top: 1px solid var(--border);
    }
    
    .badge {
      display: inline-block;
      background: linear-gradient(90deg, var(--primary), var(--secondary));
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      color: white;
      margin-left: 10px;
      box-shadow: var(--glow-primary);
    }
    
    @media (max-width: 768px) {
      .container {
        width: 95%;
        padding: 10px;
      }
      
      h1 {
        font-size: 20px;
      }
      
      .details {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="container">
      <div class="header-title">
        <img src="/favicon.ico" alt="OPERATOR Logo" class="logo">
        <h1>${title || 'Raw Report'}</h1>
      </div>
      <div class="timestamp">${new Date().toLocaleString()}</div>
    </div>
  </header>
  
  <div class="container">
    <div class="content">
      <h2>System Data <span class="badge">RAW</span></h2>
      <pre>${formattedContent}</pre>
    </div>
    
    <footer>
      O.P.E.R.A.T.O.R – Nexus | Generated on ${new Date().toISOString()}
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Highlight JSON syntax with color coding
 * @param {string} json - JSON string to highlight
 * @returns {string} - HTML with syntax highlighting
 */
function highlightJson(json) {
  if (!json) return '';
  
  // Replace with HTML and color coding
  return json
    .replace(/"(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?/g, match => {
      const isKey = /:$/.test(match);
      return `<span class="${isKey ? 'json-key' : 'json-string'}">${match}</span>`;
    })
    .replace(/\b(\d+)([.,]\d+)?\b/g, '<span class="json-number">$&</span>')
    .replace(/\b(true|false)\b/g, '<span class="json-boolean">$&</span>')
    .replace(/\bnull\b/g, '<span class="json-null">$&</span>')
    .replace(/\n/g, '<br>')
    .replace(/\s{2}/g, '&nbsp;&nbsp;'); // Preserve indentation
}

/**
 * Generate a landing report that links to the existing midscene report.
 *
 * @param {string} prompt - The user's original prompt/command.
 * @param {Array<Object>} results - Array of per-step results.
 * @param {string|null} screenshotPath - Final screenshot URL/path.
 * @param {string} runId - Unique run identifier.
 * @param {string} reportDir - Directory to write the report.
 * @param {string|null} nexusReportUrl - URL to the processed Nexus/Midscene report.
 * @param {string|null} rawReportUrl - URL to the raw/unprocessed report.
 * @returns {Object} - Object containing report paths and URLs.
 */
/**
 * Convert a local file path to a web-accessible URL
 * @param {string} filePath - Local file path
 * @param {string} runId - Run ID for context
 * @returns {string} - Web-accessible URL
 */
function convertToWebPath(filePath, runId) {
  if (!filePath) return '';
  
  // If it's already a web URL, return as is
  if (filePath.startsWith('/') || filePath.startsWith('http')) {
    return filePath;
  }
  
  // Handle Windows absolute paths
  if (filePath.match(/^[a-zA-Z]:\\/)) {
    // Look for nexus_run in the path
    const nexusRunIndex = filePath.indexOf('nexus_run');
    if (nexusRunIndex !== -1) {
      return '/' + filePath.substring(nexusRunIndex).replace(/\\/g, '/');
    }
    
    // Extract UUID and filename
    const uuidMatch = filePath.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch) {
      const uuid = uuidMatch[1];
      const fileName = filePath.substring(filePath.lastIndexOf('\\') + 1);
      return `/nexus_run/${uuid}/${fileName}`;
    }
    
    // Default: use the runId and basename
    return `/nexus_run/${runId}/${path.basename(filePath)}`;
  }
  
  // Return the original path if we couldn't process it
  return filePath;
}

export async function generateReport(prompt, results, screenshotPath, runId, reportDir, nexusReportUrl = null, rawReportUrl = null) {
  
  // Process any base64 screenshots in results to save them as files
  if (Array.isArray(results)) {
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      // Check if the result has a base64 screenshot
      if (result && result.screenshot && result.screenshot.startsWith('data:image')) {
        try {
          // Save the screenshot as a file
          const savedPath = await saveOptimizedScreenshot(
            result.screenshot, 
            reportDir, 
            `${runId}-step${i+1}`
          );
          
          if (savedPath) {
            // Replace the base64 data with the file path
            const relativePath = `/nexus_run/report/${path.basename(savedPath)}`;
            result.screenshotPath = relativePath;
            result.screenshot = relativePath;
            console.log(`[LandingReport] Converted base64 screenshot to file: ${relativePath}`);
          }
        } catch (err) {
          console.error(`[LandingReport] Error processing screenshot in result ${i}:`, err);
        }
      }
    }
  }
  
  // We DON'T need to search for old report files - we already have the current run's report
  // Use the provided URLs if available, otherwise generate new ones
  let reportRawUrl = rawReportUrl || '';
  let reportNexusUrl = nexusReportUrl || '';
  
  // Only generate URLs if they weren't provided as parameters
  if (!reportRawUrl || !reportNexusUrl) {
    try {
      console.log('[LandingReport] No URLs provided, generating new ones');
      // Format the date as used by midscene reports for this run
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const hours = String(today.getHours()).padStart(2, '0');
      const minutes = String(today.getMinutes()).padStart(2, '0');
      const seconds = String(today.getSeconds()).padStart(2, '0');
      const ms = Date.now() % 1000;
      
      // Use the actual timestamp from the run for the report filename
      const currentDate = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}-${ms}`;
      const reportFilename = `web-${currentDate}.html`;
      
      // Create consistent URLs for both raw and nexus reports
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      
      // Raw URL (unprocessed report) - use absolute URL with protocol and host
      reportRawUrl = `${baseUrl}/raw-report/${reportFilename}`;
      
      // Nexus URL (processed report) - use relative URL for consistency
      reportNexusUrl = `/external-report/${reportFilename}`;
      
      console.log(`[LandingReport] Generated fresh URLs for current run:`);
    } catch (error) {
      console.error('[LandingReport] Error creating report URLs:', error);
      // Create fallback URLs with current timestamp
      const timestamp = Date.now();
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      reportRawUrl = `${baseUrl}/raw-report/web-fallback-${timestamp}.html`;
      reportNexusUrl = `/external-report/web-fallback-${timestamp}.html`;
    }
  } else {
    console.log(`[LandingReport] Using provided URLs:`);
    console.log(`[LandingReport] Raw report URL: ${reportRawUrl}`);
    console.log(`[LandingReport] Nexus report URL: ${reportNexusUrl}`);
  }

  // Compose the HTML in a template literal with updated futuristic styling:
  const reportHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>O.P.E.R.A.T.O.R Report</title>
  <link rel="icon" href="/favicon.ico">
  <style>
    :root {
      --primary: #4e6fff;
      --secondary: #8a4fff;
      --accent: #ff4b8a;
      --background: #0a0c14;
      --card-bg: #1a1d2d;
      --text: #e3e5fc;
      --text-secondary: #a9adc7;
      --border: #2a2d3d;
      --glow-primary: 0 0 15px rgba(78, 111, 255, 0.5);
      --glow-accent: 0 0 15px rgba(255, 75, 138, 0.5);
    }
    
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body { 
      background: linear-gradient(135deg, var(--background), #141b29); 
      color: var(--text); 
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      line-height: 1.6;
      min-height: 100vh;
      padding: 0;
      margin: 0;
    }
    
    .container { 
      max-width: 1200px; 
      margin: 0 auto; 
      padding: 30px; 
      animation: fadeIn 0.5s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .header { 
      display: flex; 
      align-items: center; 
      margin-bottom: 40px; 
      position: relative;
      padding-bottom: 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    
    .header::after {
      content: '';
      position: absolute;
      bottom: -1px;
      left: 0;
      width: 200px;
      height: 2px;
      background: linear-gradient(90deg, var(--primary), var(--accent));
      box-shadow: var(--glow-primary);
    }
    
    .logo { 
      width: 60px; 
      height: 60px;
      margin-right: 20px; 
      filter: drop-shadow(0 0 8px rgba(78, 111, 255, 0.6));
    }
    
    .action-buttons {
      display: flex;
      gap: 12px;
      margin-left: auto;
    }
    
    .btn {
      padding: 12px 24px; 
      text-decoration: none; 
      border-radius: 8px; 
      font-weight: 600; 
      letter-spacing: 0.5px;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #fff;
    }
    
    .primary-btn {
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      box-shadow: var(--glow-primary);
      border: none;
    }
    
    .secondary-btn {
      background: rgba(78, 111, 255, 0.15);
      border: 1px solid var(--primary);
      color: var(--primary);
    }
    
    .primary-btn::before {
      content: '⟲';
      font-size: 18px;
    }
    
    .secondary-btn::before {
      content: '📄';
      font-size: 18px;
    }
    
    .btn:hover { 
      transform: translateY(-2px);
      box-shadow: 0 5px 15px rgba(78, 111, 255, 0.7); 
    }
    
    .content { 
      background: var(--card-bg); 
      padding: 30px; 
      border-radius: 16px; 
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      margin-bottom: 30px;
      animation: slideUp 0.5s ease-out;
    }
    
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .screenshot { 
      max-width: 100%; 
      border-radius: 8px;
      margin: 15px 0;
      border: 1px solid var(--border);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .screenshot:hover {
      transform: scale(1.02);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
    }
    
    /* Modal Styles */
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(10, 12, 20, 0.95);
      z-index: 1000;
      opacity: 0;
      transition: opacity 0.3s ease;
      backdrop-filter: blur(5px);
    }
    
    .modal.open {
      display: flex;
      opacity: 1;
      animation: modalFadeIn 0.3s forwards;
    }
    
    @keyframes modalFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    .modal-content {
      position: relative;
      width: 90%;
      max-width: 1200px;
      max-height: 90vh;
      margin: auto;
      background: var(--card-bg);
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
      overflow: hidden;
      transform: translateY(20px);
      opacity: 0;
      animation: modalContentFadeIn 0.4s forwards 0.1s;
    }
    
    @keyframes modalContentFadeIn {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      background: linear-gradient(135deg, var(--primary), var(--secondary));
      color: white;
      border-bottom: 1px solid var(--border);
    }
    
    .modal-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }
    
    .close-modal {
      font-size: 28px;
      font-weight: bold;
      color: white;
      cursor: pointer;
      transition: color 0.2s;
      line-height: 24px;
    }
    
    .close-modal:hover {
      color: var(--accent);
    }
    
    .modal-body {
      flex: 1;
      overflow-y: auto;
      padding: 10px 5px;
      background: #1a1a27;
      border-radius: 8px;
      margin: 0 -15px;
      padding: 15px;
    }
    
    /* Ensure content inside modal is properly styled */
    .modal-body pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: 'Fira Code', 'Courier New', monospace;
      font-size: 0.9em;
      line-height: 1.5;
      color: #e0e0e0;
      margin: 0;
      padding: 0;
    }
    
    /* Responsive images in modal */
    .modal-body img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      margin: 10px 0;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }
    
    /* Scrollbar styling */
    .modal-body::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    
    .modal-body::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }
    
    .modal-body::-webkit-scrollbar-thumb {
      background: rgba(100, 120, 250, 0.5);
      border-radius: 4px;
    }
    
    .modal-body::-webkit-scrollbar-thumb:hover {
      background: rgba(100, 120, 250, 0.7);
    }
    
    /* Image Modal */
    .img-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      z-index: 1100;
      opacity: 0;
      transition: opacity 0.3s ease;
    }
    
    .img-modal.open {
      display: flex;
      opacity: 1;
      animation: modalFadeIn 0.3s forwards;
    }
    
    .img-modal-content {
      max-width: 90%;
      max-height: 90vh;
      margin: auto;
      border-radius: 8px;
      box-shadow: 0 0 25px rgba(78, 111, 255, 0.5);
      transform: scale(0.9);
      transition: transform 0.3s ease;
      animation: imgZoomIn 0.3s forwards;
    }
    
    @keyframes imgZoomIn {
      from { transform: scale(0.9); }
      to { transform: scale(1); }
    }
    
    .img-modal-close {
      position: absolute;
      top: 20px;
      right: 20px;
      color: white;
      font-size: 40px;
      font-weight: bold;
      cursor: pointer;
      opacity: 0.8;
      transition: opacity 0.2s, transform 0.2s;
    }
    
    .img-modal-close:hover {
      opacity: 1;
      transform: rotate(90deg);
    }
    
    .task { 
      background: rgba(255, 255, 255, 0.05); 
      padding: 20px; 
      margin-bottom: 20px; 
      border-radius: 12px; 
      border-left: 3px solid var(--primary);
      animation-delay: calc(0.1s * var(--idx));
      animation: fadeIn 0.5s ease-out;
    }
    
    .task.error {
      border-left-color: var(--accent);
    }
    
    .task-header { 
      font-weight: 600; 
      margin-bottom: 12px; 
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .task-header::before {
      content: '📊';
      font-size: 20px;
    }
    
    .error .task-header::before {
      content: '⚠️';
    }
    
    .detail-content { 
      background: linear-gradient(135deg, rgba(78, 111, 255, 0.1), rgba(138, 79, 255, 0.1)); 
      border-radius: 12px; 
      padding: 20px; 
      color: var(--text); 
      margin-top: 20px;
      border: 1px solid rgba(78, 111, 255, 0.2);
    }
    
    h1 {
      font-size: 28px;
      font-weight: 600;
      background: linear-gradient(90deg, #fff, #a9adc7);
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;
      letter-spacing: 0.5px;
    }
    
    h2 {
      font-size: 24px;
      margin-bottom: 20px;
      font-weight: 600;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    h2::before {
      content: '💡';
      font-size: 24px;
    }
    
    pre {
      background: rgba(0, 0, 0, 0.2);
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 14px;
      margin-top: 10px;
      border: 1px solid var(--border);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="/favicon.ico" alt="OPERATOR_logo" class="logo"/>
      <h1>O.P.E.R.A.T.O.R – Sentinel Report</h1>
      <div class="action-buttons">
        <a id="replayButton" href="javascript:void(0)" onclick="window.open('${nexusReportUrl}', '_blank')" class="btn primary-btn">Replay</a>
      </div>
      
      <!-- Image Modal for viewing screenshots in full size -->
      <div id="imageModal" class="img-modal">
        <span class="img-modal-close">&times;</span>
        <img class="img-modal-content" id="modalImage">
      </div>
    </div>
    <div class="content">
      <h2>Task Details</h2>
      <div class="detail-content">
        <p><strong>Command:</strong> ${prompt}</p>
        <p><strong>Run ID:</strong> ${runId}</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
      </div>
      <h2>Execution Results</h2>
      ${results.slice(0, 10).map((result, i) => {
        if (result.error) {
          return `
            <div class="task error">
              <div class="task-header">Step ${i+1} – Error</div>
              <pre>${JSON.stringify(result, null, 2).substring(0,500)}</pre>
            </div>`;
        } else if (result.screenshotPath) {
          return `
            <div class="task">
              <div class="task-header">Step ${i+1} – Screenshot</div>
              <img src="${convertToWebPath(result.screenshotPath, runId)}" class="screenshot" alt="Step ${i+1} Screenshot"/>
              ${result.summary ? `<p>${result.summary.substring(0,300)}…</p>` : ''}
            </div>`;
        } else {
          return `
            <div class="task">
              <div class="task-header">Step ${i+1}</div>
              <pre>${JSON.stringify(result, null, 2).substring(0,500)}</pre>
            </div>`;
        }
      }).join('')}
      ${screenshotPath
        ? `<h2>Final State</h2><img src="${convertToWebPath(screenshotPath, runId)}" class="screenshot" alt="Final Screenshot"/>`
        : ''}
    </div>
  </div>
  
  <script>
    // This function safely extracts body content from HTML
    function extractBodyContent(htmlString) {
      var content = htmlString;
      
      if (typeof htmlString === 'string' && htmlString.indexOf('<body') !== -1) {
        var bodyStartIndex = htmlString.indexOf('<body');
        if (bodyStartIndex !== -1) {
          var bodyContentStartIndex = htmlString.indexOf('>', bodyStartIndex) + 1;
          var bodyEndIndex = htmlString.indexOf('</body>', bodyContentStartIndex);
          
          if (bodyContentStartIndex > 0 && bodyEndIndex !== -1) {
            content = htmlString.substring(bodyContentStartIndex, bodyEndIndex);
          }
        }
      }
      
      return content;
    }
    
    // Function to open the raw report modal
    function openRawReportModal(url) {
      var modal = document.getElementById('rawReportModal');
      var contentDiv = document.getElementById('rawReportContent');
      
      if (!modal || !contentDiv) {
        console.error('Modal elements not found');
        return;
      }
      
      // Show loading state
      contentDiv.textContent = 'Loading raw report data...';
      modal.style.display = 'flex';
      
      // Force reflow to ensure animation plays
      void modal.offsetWidth;
      modal.classList.add('open');
      
      // Fetch the report content
      fetch(url)
        .then(function(response) {
          // Check if the response is HTML
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('text/html')) {
            return response.text()
              .then(html => {
                // Parse the HTML to extract the body content
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                // Return the body's innerHTML for rendering
                return doc.body.innerHTML;
              });
          }
          // For non-HTML content, return as text
          return response.text();
        })
        .then(function(processedContent) {
          // Clear container and add content safely
          while (contentDiv.firstChild) {
            contentDiv.removeChild(contentDiv.firstChild);
          }
          
          // Create a container for the content
          const container = document.createElement('div');
          container.style.maxHeight = '80vh';
          container.style.overflowY = 'auto';
          container.style.padding = '1rem';
          container.style.background = '#fff';
          container.style.borderRadius = '4px';
          container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
          
          // Check if the content is HTML or plain text
          if (typeof processedContent === 'string' && 
              (processedContent.trim().startsWith('<') || 
               processedContent.includes('</') || 
               processedContent.includes('/>'))) {
            // It's HTML, so set it as innerHTML
            container.innerHTML = processedContent;
          } else {
            // It's plain text, create a pre element
            const pre = document.createElement('pre');
            pre.style.whiteSpace = 'pre-wrap';
            pre.textContent = processedContent;
            container.appendChild(pre);
          }
          
          contentDiv.appendChild(container);
          
          // Make sure images and other resources load properly
          container.querySelectorAll('img').forEach(img => {
            if (img.src.startsWith('/')) {
              // Convert relative URLs to absolute
              img.src = window.location.origin + img.src;
            }
            // Ensure images are responsive
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
          });
        })
        .catch(function(error) {
          // Handle errors safely
          while (contentDiv.firstChild) {
            contentDiv.removeChild(contentDiv.firstChild);
          }
          
          var errorDiv = document.createElement('div');
          errorDiv.className = 'error';
          errorDiv.textContent = 'Error loading report: ' + 
            (error && typeof error.message === 'string' ? error.message : 'Unknown error');
          contentDiv.appendChild(errorDiv);
        });
      
      // Setup close functionality
      var closeBtn = modal.querySelector('.close-modal');
      if (closeBtn) {
        closeBtn.onclick = function() {
          closeModal(modal);
        };
      }
      
      // Close when clicking outside content
      modal.onclick = function(event) {
        if (event.target === modal) {
          closeModal(modal);
        }
      };
    }
    
    // Helper function to close any modal
    function closeModal(modalElement) {
      if (!modalElement) return;
      
      modalElement.classList.remove('open');
      setTimeout(function() {
        modalElement.style.display = 'none';
      }, 300);
    }
    
    // Initialize image modal functionality when page loads
    document.addEventListener('DOMContentLoaded', function() {
      var imgModal = document.getElementById('imageModal');
      var modalImg = document.getElementById('modalImage');
      var closeImgBtn = document.querySelector('.img-modal-close');
      
      if (!imgModal || !modalImg || !closeImgBtn) {
        console.error('Image modal elements not found');
        return;
      }
      
      // Make all screenshots interactive
      var screenshots = document.querySelectorAll('.screenshot');
      for (var i = 0; i < screenshots.length; i++) {
        screenshots[i].addEventListener('click', function() {
          modalImg.src = this.src;
          imgModal.style.display = 'flex';
          
          // Force reflow to ensure animation plays
          void imgModal.offsetWidth;
          imgModal.classList.add('open');
        });
      }
      
      // Close image modal functionality
      closeImgBtn.addEventListener('click', function() {
        closeModal(imgModal);
      });
      
      imgModal.addEventListener('click', function(event) {
        if (event.target === imgModal) {
          closeModal(imgModal);
        }
      });
    });
  </script>
</body>
</html>`.trim();

  // Ensure the report directory exists
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Write out the file
  const filename = `landing-report-${Date.now()}.html`;
  const outPath  = path.join(reportDir, filename);
  fs.writeFileSync(outPath, reportHTML, 'utf8');
  console.log(`[LandingReport] Saved landing report to ${outPath}`);

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const landingReportWebPath = path.join('nexus_run', runId, 'report', filename).replace(/\\/g, '/');
  const currentLandingReportUrl = `${baseUrl}/${landingReportWebPath}`;

  // nexusReportUrl is already determined earlier in the function.
  // The 'reportPath' should ideally be the primary report if one exists, or fallback to landing.
  // For now, let's make reportPath specific to the landing page generated by this function.

  return {
    reportPath: outPath, 
    reportUrl: currentLandingReportUrl, 
    generatedReportUrl: currentLandingReportUrl, 
    landingReportUrl: currentLandingReportUrl, 
    nexusReportUrl: reportNexusUrl, 
    rawReportUrl: reportRawUrl, 
    rawNexusPath: reportNexusUrl ? path.join(reportDir, reportNexusUrl.substring(reportNexusUrl.lastIndexOf('/') + 1)) : null 
  };
}
