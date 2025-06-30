// src/utils/midsceneReportEditor.js

import fs from 'fs';
import path from 'path';
import { Parser } from 'htmlparser2';
import { fileURLToPath } from 'url';

// Get version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../..', 'package.json'), 'utf8'));
const APP_VERSION = packageJson.version || '1.3.4';

// Custom CSS to inject into every report's `<head>`
const customCss = `
/* General styling overrides - Futuristic Theme with Purple-Blue Gradient */
:root {
  --primary-gradient: linear-gradient(135deg, #6e45e2 0%, #88d3ce 100%);
  --glass-bg: rgba(30, 20, 60, 0.7);
  --glass-border: rgba(138, 58, 185, 0.3);
  --text-primary: #e0e0ff;
  --text-secondary: #b8c1ec;
  --accent-color: #8a3ab9;
  --accent-hover: #9d4edd;
}

/* Base styles */
body { 
  background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%); 
  color: var(--text-primary);
  font-family: 'Inter', 'Roboto', 'Arial', sans-serif;
  line-height: 1.6;
  min-height: 100vh;
}

/* Glass panels and containers */
.side-bar, .page-nav, .panel-title,
.main-right .main-content-container, .detail-panel,
.detail-side .meta-kv, .timeline-wrapper {
  background: var(--glass-bg) !important;
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  border: 1px solid var(--glass-border) !important;
  border-radius: 0px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  transition: all 0.3s ease;
}

/* Glass effect on hover */
.main-right .main-content-container:hover,
.detail-side .meta-kv:hover,
.timeline-wrapper:hover {
  background: rgba(40, 30, 70, 0.8) !important;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

/* Page container color */
.page-container {
  color: #e0f0ff !important;
}

/* Remove background from main content */
.main-right .main-content {
  background: none !important;
}

/* Set timeline color */
.ant-timeline {
  color: #e0f0ff !important;
}

/* Button styles - Glassy effect */
.ant-btn {
  background: rgba(138, 58, 185, 0.25) !important;
  border: 1px solid rgba(138, 58, 185, 0.5) !important;
  color: var(--text-primary) !important;
  backdrop-filter: blur(5px);
  padding: 6px 16px !important;
  transition: all 0.3s ease !important;
  position: relative;
  overflow: hidden;
  z-index: 1;
}

.view-switcher .ant-btn {
  display: none !important;
}

/* Replay All button specific */
.ant-btn-text:has(.anticon-caret-right) {
  background: linear-gradient(135deg, rgba(138, 58, 185, 0.3), rgba(76, 0, 255, 0.3)) !important;
  border: 1px solid rgba(138, 58, 185, 0.5) !important;
  box-shadow: 0 4px 15px rgba(138, 58, 185, 0.2);
  font-weight: 500;
  padding: 8px 20px !important;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ant-btn-text:has(.anticon-caret-right):hover {
  background: linear-gradient(135deg, rgba(138, 58, 185, 0.5), rgba(76, 0, 255, 0.5)) !important;
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(138, 58, 185, 0.3);
}

.ant-btn-text:has(.anticon-caret-right)::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05));
  z-index: -1;
}

/* Logo handling - Completely remove Midscene logo during load */
.page-nav .logo {
  display: none !important;
}

/* Add our custom logo */
.page-nav::before {
  content: '';
  display: inline-block;
  width: 50px;
  height: 50px;
  background-image: url("/assets/images/dail-fav.png");
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  margin-right: 12px;
  filter: drop-shadow(0 0 8px rgba(0, 120, 255, 0.7));
  transition: all 0.3s ease;
}

.page-nav:hover::before {
  transform: scale(1.05);
  filter: drop-shadow(0 0 12px rgba(0, 120, 255, 0.9));
}

/* Text and link colors */
a, .side-item-name, .meta-key {
  color: #b388ff !important;
  transition: color 0.2s ease;
}

a:hover, .side-item-name:hover {
  color: #82b1ff !important;
  text-decoration: none !important;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: linear-gradient(135deg, #6e45e2, #8a3ab9);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(135deg, #8a3ab9, #6e45e2);
}

a, .side-item-name, .meta-key { 
  color: #4db7ff!important;
  transition: color 0.2s, text-shadow 0.2s;
}

a:hover, .side-item-name:hover {
  color: #70cfff!important;
  text-shadow: 0 0 8px rgba(78, 196, 255, 0.3);
}

.meta-value { 
  color: #e0f0ff!important; 
}

/* Branding/logo replacers */
img[src*="Midscene.png" i], img[alt*="midscene" i], img[class*="logo" i], img[src*="logo" i] {
  content: url("/assets/images/dail-fav.png")!important; 
  width: 50px!important; 
  height: 50px!important;
  filter: drop-shadow(0 0 5px rgba(0, 120, 255, 0.5));
}

/* Version update */
.task-list-sub-name { visibility: hidden; position: relative; }
.task-list-sub-name::after {
  content: "v${APP_VERSION}, Nexus model"; 
  visibility: visible; 
  position: absolute; 
  left: 0; 
  color: #4db7ff;
  text-shadow: 0 0 10px rgba(0, 120, 255, 0.4);
}

/* Download button styles */
#nexus-download-btn {
  background: linear-gradient(135deg, #4e6fff, #8a4fff);
  color: white;
  border: none;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  box-shadow: 0 4px 12px rgba(78, 111, 255, 0.3);
  transition: all 0.2s ease;
  margin-left: 15px;
}

#nexus-download-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(78, 111, 255, 0.5);
}

#nexus-download-btn .download-icon {
  font-size: 16px;
}

/* Checkbox styling */
:where(.css-dev-only-do-not-override-14qiums).ant-checkbox-wrapper {
  color: whitesmoke!important;
}

/* Timeline styling */
.ant-timeline.css-dev-only-do-not-override-14qiums {
  border-left: 1px solid rgba(0, 150, 255, 0.3);
  padding-left: 15px;
}

/* Additional futuristic elements */
button, .button {
  background: linear-gradient(to bottom, #1a4d80, #0a2c50);
  border: 1px solid rgba(0, 150, 255, 0.3);
  color: #e0f0ff;
  border-radius: 3px;
  transition: all 0.2s;
}

button:hover, .button:hover {
  background: linear-gradient(to bottom, #1a5590, #0a3060);
  box-shadow: 0 0 10px rgba(0, 150, 255, 0.3);
}
`;

/**
 * Edit an existing Midscene SDK–generated HTML report file in place:
 *   - Replace title, favicon, logos
 *   - Update any embedded JSON dump (sdkVersion/groupName)
 *   - Inject our `customCss` into <head>
 *
 * @param {string} reportPath  - Path to the Midscene report HTML.
 * @returns {Promise<string>}  - Resolves to same path after writing.
 */
export async function editMidsceneReport(reportPath) {
  // Convert midscene_run paths to nexus_run if needed
  const nexusReportPath = reportPath.replace('midscene_run', 'nexus_run');
  const originalReportPath = reportPath;
  
  // If the original path was different, log the redirection
  if (nexusReportPath !== reportPath) {
    console.log(`[NexusReportEditor] Redirecting report path from ${reportPath} to ${nexusReportPath}`);
    reportPath = nexusReportPath;
    
    // Check if the file exists in the original midscene_run path but not in nexus_run path
    if (fs.existsSync(originalReportPath) && !fs.existsSync(reportPath)) {
      // Create the nexus_run directory if it doesn't exist
      const reportDir = path.dirname(reportPath);
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
        console.log(`[NexusReportEditor] Created directory ${reportDir}`);
      }
      
      // Copy the file from midscene_run to nexus_run
      fs.copyFileSync(originalReportPath, reportPath);
      console.log(`[NexusReportEditor] Copied report from ${originalReportPath} to ${reportPath}`);
    }
  }
  
  console.log(`[NexusReportEditor] Editing report at ${reportPath}`);

  // Check if file exists in nexus_run path
  if (!fs.existsSync(reportPath)) {
    console.error(`[NexusReportEditor] Report file not found at ${reportPath}`);
    throw new Error(`Report file not found at ${reportPath}`);
  }

  const tempPath   = `${reportPath}.tmp`;
  const readStream  = fs.createReadStream(reportPath, 'utf8');
  const writeStream = fs.createWriteStream(tempPath,  'utf8');

  let insideTitle   = false;
  let insideScript  = false;
  let scriptContent = '';
  let insideHead    = false;
  let cssInjected   = false;

  const parser = new Parser({
    onopentag(name, attrs) {
      if (name === 'title') {
        writeStream.write('<title>Report - Nexus</title>');
        insideTitle = true;

      } else if (name === 'link' && attrs.rel === 'icon') {
        writeStream.write('<link rel="icon" href="/assets/images/dail-fav.png" type="image/png" sizes="32x32">');

      } else if (
        name === 'img' &&
        (
          (attrs.src?.toLowerCase().includes('midscene.png')) ||
          (attrs.alt?.toLowerCase().includes('midscene'))   ||
          (attrs.class?.toLowerCase().includes('logo'))     ||
          (attrs.src?.toLowerCase().includes('logo'))
        )
      ) {
        writeStream.write(
          '<img src="/assets/images/dail-fav.png" alt="OPERATOR_logo" class="logo" width="50" height="50">'
        );

      } else if (name === 'script' && attrs.type === 'midscene_web_dump') {
        insideScript  = true;
        scriptContent = '';
        writeStream.write('<script type="midscene_web_dump" application/json>');

      } else {
        // Write tag + all attributes
        const attrString = Object.entries(attrs || {})
          .map(([k,v]) => ` ${k}="${v}"`)
          .join('');
        writeStream.write(`<${name}${attrString}>`);
      }

      if (name === 'head') {
        insideHead = true;
      }
    },

    ontext(text) {
      if (insideTitle) {
        // Skip writing the original title text since we already wrote our custom title
        return;
      } else if (text.includes('Midscene')) {
        // Replace any Midscene references with Nexus
        writeStream.write(text
          .replace(/Report - Midscene(\.js)?/g, 'O.P.E.R.A.T.O.R – Sentinel Report')
          .replace(/Midscene(\.js)? Report/g, 'O.P.E.R.A.T.O.R – Sentinel Report')
          .replace(/Midscene/g, 'Nexus')
        );
        return;
      }
      writeStream.write(text);
    },

    onclosetag(name) {
      if (name === 'title') {
        insideTitle = false;

      } else if (name === 'script' && insideScript) {
        // Try to parse & patch the JSON dump
        try {
          // First clean up the JSON string
          let jsonStr = scriptContent.trim();
          
          // Fix common JSON issues
          if (!jsonStr.endsWith('}') && !jsonStr.endsWith(']')) {
            // Try to properly close the JSON structure
            const openBraces = (jsonStr.match(/\{/g) || []).length;
            const closeBraces = (jsonStr.match(/\}/g) || []).length;
            const openBrackets = (jsonStr.match(/\[/g) || []).length;
            const closeBrackets = (jsonMsg.match(/\]/g) || []).length;
            
            // Add missing closing brackets/braces
            while (openBraces > closeBraces) { jsonStr += '}'; }
            while (openBrackets > closeBrackets) { jsonStr += ']'; }
            
            // If still not properly closed, add a minimal valid structure
            if (!jsonStr.endsWith('}') && !jsonStr.endsWith(']')) {
              jsonStr = jsonStr.replace(/,\s*$/, '') + '}'; // Remove trailing comma and close
            }
          }
          
          // Parse the JSON
          const data = JSON.parse(jsonStr);
          
          // Update the data structure
          if (Array.isArray(data.executions)) {
            data.executions.forEach(exec => { 
              exec.sdkVersion = APP_VERSION;
              // Store engine information if available
              if (exec.engine) {
                exec.engineInfo = exec.engine;
              }
              
              // Update any Midscene references in the execution data
              if (exec.name) exec.name = exec.name.replace(/Midscene/g, 'Nexus');
              if (exec.title) exec.title = exec.title.replace(/Midscene/g, 'Nexus');
              // Add any other fields that might contain Midscene references
            });
          }
          
          // Set the group name and ensure no Midscene references
          data.groupName = 'O.P.E.R.A.T.O.R – Sentinel Report';
          if (data.name) data.name = data.name.replace(/Midscene/g, 'Nexus');
          if (data.title) data.title = data.title.replace(/Midscene/g, 'Nexus');
          
          // Stringify with proper formatting
          writeStream.write(JSON.stringify(data, null, 2));

        } catch (err) {
          console.error('[NexusReportEditor] JSON parse error, writing raw dump:', err);
          writeStream.write(scriptContent);
        }

        writeStream.write('</script>');
        insideScript = false;

      } else if (name === 'head' && insideHead) {
        if (!cssInjected) {
          // Inject our custom CSS
          writeStream.write(`\n<style>${customCss}</style>\n`);
          
          // Add inline JavaScript to inject the download button
          const downloadButtonScript = `
          <script>
            // Wait for DOM to be fully loaded
            document.addEventListener('DOMContentLoaded', function() {
              // Get the current URL pathname
              const pathname = window.location.pathname;
              
              // Extract the report filename from the URL
              const reportFilename = pathname.split('/').pop();
              
              // Create the download button
              const downloadBtn = document.createElement('a');
              downloadBtn.id = 'nexus-download-btn';
              downloadBtn.href = '/download-report/' + reportFilename;
              downloadBtn.download = reportFilename;
              downloadBtn.innerHTML = '<span class="download-icon">⬇️</span> Download Report';
              downloadBtn.setAttribute('title', 'Download this report as HTML');
              
              // Find the page-nav div to append the button
              const interval = setInterval(() => {
                const pageNav = document.querySelector('.page-nav');
                if (pageNav) {
                  clearInterval(interval);
                  pageNav.appendChild(downloadBtn);
                  console.log('Download button injected into Nexus report');
                }
              }, 500);
              
              // Timeout after 10 seconds if page-nav is never found
              setTimeout(() => clearInterval(interval), 10000);
            });
          </script>`;
          
          writeStream.write(downloadButtonScript);
          cssInjected = true;
        }
        writeStream.write('</head>');
        insideHead = false;

      } else {
        writeStream.write(`</${name}>`);
      }
    },

    onerror(err) {
      console.error('[NexusReportEditor] Parser error:', err);
    }
  }, { decodeEntities: true });

  // Pipe through parser
  readStream.on('data', chunk => parser.write(chunk));
  readStream.on('end',  ()    => { parser.end(); writeStream.end(); });
  readStream.on('error', err  => { console.error('[NexusReportEditor] Read error:', err); writeStream.end(); });

  // Replace original when done
  return new Promise((resolve, reject) => {
    writeStream.on('finish', () => {
      try {
        // Try to rename the file (this is the operation that fails with EPERM)
        fs.renameSync(tempPath, reportPath);
        console.log(`[NexusReportEditor] Updated report at ${reportPath}`);
      } catch (renameError) {
        console.error(`[NexusReportEditor] Rename error, trying alternative approach:`, renameError);
        
        try {
          // Alternative approach 1: Try to copy the file content instead of renaming
          const tempContent = fs.readFileSync(tempPath, 'utf8');
          
          // Try to delete the original file first if it exists
          try {
            if (fs.existsSync(reportPath)) {
              fs.unlinkSync(reportPath);
            }
          } catch (unlinkError) {
            console.warn(`[NexusReportEditor] Could not delete original report:`, unlinkError);
          }
          
          // Write content directly
          fs.writeFileSync(reportPath, tempContent, 'utf8');
          console.log(`[NexusReportEditor] Updated report via copy method at ${reportPath}`);
          
          // Try to clean up temp file
          try {
            fs.unlinkSync(tempPath);
          } catch (cleanupError) {
            console.warn(`[NexusReportEditor] Could not clean up temp file:`, cleanupError);
          }
        } catch (copyError) {
          console.error(`[NexusReportEditor] Copy method also failed:`, copyError);
          // Return success anyway - we don't want the report error to fail the whole task
          console.warn(`[NexusReportEditor] Will continue task execution despite report generation failure`);
        }
      }
      
      // Always resolve with the report path, even if we had errors
      // This prevents the report generation error from failing the entire task
      resolve(reportPath);
    });
    writeStream.on('error', (err) => {
      console.error(`[NexusReportEditor] Write stream error:`, err);
      // Also resolve here instead of rejecting - don't let report errors fail the task
      resolve(reportPath);
    });
  });
}