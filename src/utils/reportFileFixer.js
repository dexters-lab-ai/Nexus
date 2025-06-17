// reportFileFixer.js
import fs from 'fs';
import path from 'path';
import express from 'express';
import { styleRawReport } from './reportGenerator.js';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

// Get the current directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Promisify fs functions
const fsExists = promisify(fs.exists);
const fsReadFile = promisify(fs.readFile);
const fsReadDir = promisify(fs.readdir);

// Retry configuration
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 300; // ms

// Helper function to delay execution
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Cache to store processed reports for quick serving
 */

// Cache to store processed reports with TTL
const reportCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

// Helper function to set cache entry with TTL
function setWithTTL(key, value) {
  reportCache.set(key, { value, timestamp: Date.now() });
}

// Helper function to get cache entry and check TTL
function getWithTTL(key) {
  const entry = reportCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    reportCache.delete(key);
    console.log(`[ReportServer] Cache entry expired for: ${key}`);
    return null;
  }
  return entry.value;
}

/**
 * Find a report file in the standard locations with retry logic
 * @param {string} reportName - Name of the report file to find
 * @param {number} [attempt=1] - Current attempt number
 * @returns {Promise<{found: boolean, path: string, error: string|null}>}
 */
async function locateReportFile(reportName, attempt = 1) {
  // Validate report name to prevent directory traversal
  if (!/^[a-zA-Z0-9_.\-]+\.html$/.test(reportName)) {
    return { found: false, path: '', error: 'Invalid report name' };
  }

  // Try to find the report in standard locations
  const possibleLocations = [
    // Production location
    path.join(process.cwd(), 'nexus_run', 'report', reportName),
    // Fallback location
    path.join(process.cwd(), 'midscene_run', 'report', reportName),
    // Development location (relative to this file)
    path.join(__dirname, '..', '..', 'nexus_run', 'report', reportName),
    path.join(__dirname, '..', '..', 'midscene_run', 'report', reportName),
  ];

  try {
    // Check each location with retry logic
    for (const location of possibleLocations) {
      try {
        // Try to access the file with retries
        let lastError;
        for (let i = 0; i < RETRY_ATTEMPTS; i++) {
          try {
            const exists = await fsExists(location);
            if (exists) {
              // Verify the file is readable and not empty
              const stats = await fs.promises.stat(location);
              if (stats.size > 0) {
                console.log(`[ReportServer] Found report at: ${location} (attempt ${i + 1})`);
                return { found: true, path: location, error: null };
              } else {
                console.warn(`[ReportServer] Empty report file at: ${location}`);
              }
            }
            await delay(RETRY_DELAY);
          } catch (error) {
            lastError = error;
            console.warn(`[ReportServer] Attempt ${i + 1} failed for ${location}:`, error.message);
            if (i < RETRY_ATTEMPTS - 1) {
              await delay(RETRY_DELAY * (i + 1)); // Exponential backoff
            }
          }
        }
        
        if (lastError) {
          console.warn(`[ReportServer] All attempts failed for ${location}:`, lastError.message);
        }
      } catch (error) {
        console.warn(`[ReportServer] Error checking location ${location}:`, error.message);
      }
    }
  } catch (error) {
    console.error(`[ReportServer] Error in locateReportFile:`, error);
    return { found: false, path: '', error: `Error locating report: ${error.message}` };
  }

  return { found: false, path: '', error: 'Report not found after multiple attempts' };
}

/**
 * Set up report serving middleware that bypasses Vite HTML parsing
 * @param {Object} app - Express app instance
 */
export function setupReportServing(app) {
  // Route for downloading reports as files
  app.get('/download-report/:reportName', async (req, res, next) => {
    try {
      const { reportName } = req.params;
      console.log(`[ReportServer] Download request for: ${reportName}`);
      
      // Find the report file with retry logic
      const { found, path: reportPath, error } = await locateReportFile(reportName);
      
      if (!found) {
        console.warn(`[ReportServer] Report not found for download: ${reportName} - ${error}`);
        return res.status(404).json({
          success: false,
          error: `Report "${reportName}" not found after multiple attempts. Please check the report name and try again.`
        });
      }
      
      // Set appropriate headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${reportName}"`);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-store');
      
      console.log(`[ReportServer] Serving report for download: ${reportPath}`);
      
      // Stream the file directly to the client
      const fileStream = fs.createReadStream(reportPath);
      
      // Handle stream errors
      fileStream.on('error', (error) => {
        console.error(`[ReportServer] Stream error for ${reportName}:`, error.message);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: `Error reading report: ${error.message}`
          });
        }
      });
      
      fileStream.pipe(res);
      
    } catch (error) {
      console.error(`[ReportServer] Error in download handler:`, error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: `Internal server error: ${error.message}`
        });
      }
    }
  });
  
  // Route for processed/external reports
  app.get('/external-report/:reportName', async (req, res, next) => {
    try {
      const { reportName } = req.params;
      console.log(`[ReportServer] External report request for: ${reportName}`);
      
      // Find the report file with retry logic
      const { found, path: reportPath, error } = await locateReportFile(reportName);
      
      if (!found) {
        console.warn(`[ReportServer] Report not found: ${reportName} - ${error}`);
        // Set headers to prevent caching of error responses
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.status(404);
        
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Report Not Found</title>
            <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
            <meta http-equiv="Pragma" content="no-cache">
            <meta http-equiv="Expires" content="0">
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              h1 { color: #dc3545; }
              .container { max-width: 600px; margin: 0 auto; }
              .retry-btn { 
                margin-top: 20px; 
                padding: 10px 20px; 
                background: #007bff; 
                color: white; 
                border: none; 
                border-radius: 4px; 
                cursor: pointer;
              }
              .retry-btn:hover { background: #0056b3; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Report Not Found</h1>
              <p>The report "${reportName}" could not be found after multiple attempts.</p>
              <p>${error || 'The report may not exist or is currently being generated.'}</p>
              <button class="retry-btn" onclick="window.location.reload(true)">Retry Loading</button>
            </div>
          </body>
          </html>
        `);
      }
      
      // Set security headers (CSP is now handled in server.js)
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');

      // For HTML, we need to serve it as-is with minimal processing to avoid breaking scripts
      if (reportPath.endsWith('.html')) {
        try {
          // Check if we have a cached version that's not an error
          let cachedContent = getWithTTL(reportPath);
          let shouldCache = true;
          
          if (!cachedContent) {
            console.log(`[ReportServer] Reading and processing report: ${reportPath}`);
            let content;
            
            // Try to read the file with retries
            for (let i = 0; i < RETRY_ATTEMPTS; i++) {
              try {
                content = await fsReadFile(reportPath, 'utf8');
                // Verify content is valid HTML before proceeding
                if (!content || content.trim().length === 0) {
                  throw new Error('Empty file content');
                }
                break; // Success, exit retry loop
              } catch (readError) {
                if (i === RETRY_ATTEMPTS - 1) throw readError; // Last attempt failed
                await delay(RETRY_DELAY * (i + 1)); // Wait before retry
              }
            }

            // Only rewrite the anchor links, but leave all scripts intact
            const processed = content.replace(
              /<a\s+href=(['"])(?:\/?)((?:nexus_run\/report\/|external-report\/|direct-report\/)?[^'"]+)\1([^>]*)>/gi,
              (match, quote, linkReportName, attrs) => {
                if (linkReportName.endsWith('.html')) {
                  const baseName = path.basename(linkReportName);
                  const absoluteUrl = `${req.protocol}://${req.get('host')}/external-report/${baseName}`;
                  return `<a href="${absoluteUrl}" target="_blank"${attrs}>`;
                }
                return match;
              }
            );

            // Add DOCTYPE if missing
            const hasDoctype = processed.trim().startsWith('<!DOCTYPE') || processed.trim().startsWith('<!doctype');
            cachedContent = hasDoctype ? processed : `<!DOCTYPE html>\n${processed}`;

            // Only cache successful responses with valid content
            if (shouldCache) {
              console.log(`[ReportServer] Caching processed report: ${reportPath}`);
              setWithTTL(reportPath, cachedContent);
            } else {
              console.log(`[ReportServer] Not caching due to error state: ${reportPath}`);
            }
          } else {
            console.log(`[ReportServer] Serving cached report: ${reportPath}`);
          }

          // Set appropriate headers to prevent caching of errors
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          
          return res.send(cachedContent);
        } catch (processError) {
          console.error(`[ReportServer] Error processing report ${reportPath}:`, processError);
          // Ensure we don't cache error states
          reportCache.delete(reportPath);
          
          // Return error response with retry option
          res.status(500);
          return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Error Loading Report</title>
              <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
              <meta http-equiv="Pragma" content="no-cache">
              <meta http-equiv="Expires" content="0">
              <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                h1 { color: #dc3545; }
                .container { max-width: 600px; margin: 0 auto; }
                .retry-btn { 
                  margin-top: 20px; 
                  padding: 10px 20px; 
                  background: #007bff; 
                  color: white; 
                  border: none; 
                  border-radius: 4px; 
                  cursor: pointer;
                }
                .retry-btn:hover { background: #0056b3; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Error Loading Report</h1>
                <p>There was an error loading the report. Please try again.</p>
                <p>${processError.message || 'Unknown error'}</p>
                <button class="retry-btn" onclick="window.location.reload(true)">Retry Loading</button>
              </div>
            </body>
            </html>
          `);
        }
      } else {
        // For non-HTML, just send file
        return res.sendFile(reportPath);
      }
    } catch (error) {
      console.error('[ReportServer] Error serving external report:', error);
      next(error);
    }
  });

  // Route for raw report files (unprocessed HTML)
  app.get('/raw-report/:reportName', async (req, res, next) => {
    try {
      const { reportName } = req.params;
      console.log(`[ReportServer] Raw report request for: ${reportName}`);
      
      // Find the report file with retry logic
      const { found, path: reportPath, error } = await locateReportFile(reportName);
      
      if (!found) {
        console.warn(`[ReportServer] Raw report not found: ${reportName} - ${error}`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        return res.status(404).send('Report not found');
      }
      
      // Set appropriate headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${reportName}"`);
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Cache-Control', 'no-store');
      
      console.log(`[ReportServer] Serving raw report content directly for: ${reportName}`);

      // Detect if content is JSON to apply appropriate styling
      let content;
      try {
        content = JSON.parse(await fsReadFile(reportPath, 'utf8'));
      } catch (e) {
        content = await fsReadFile(reportPath, 'utf8');
      }

      // Set appropriate content type based on file extension
      const ext = path.extname(reportPath).toLowerCase();
      const contentType = {
        '.html': 'text/html',
        '.json': 'application/json',
        '.txt': 'text/plain',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.css': 'text/css',
        '.js': 'application/javascript',
      }[ext] || 'application/octet-stream';

      // Set appropriate headers with cache control
      res.setHeader('Content-Type', contentType);
      // Only cache successful responses for non-HTML files
      if (ext !== '.html') {
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      } else {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }

      res.setHeader('X-Content-Type-Options', 'nosniff');

      console.log(`[ReportServer] Serving raw report content directly for: ${reportName}`);

      // Create a base tag to help with relative URLs
      const baseUrl = `${req.protocol}://${req.get('host')}/`;
      const baseTag = `<base href="${baseUrl}" target="_blank">`;

      let processedReport = finalContent;
      if (processedReport.includes('<head>')) {
        processedReport = processedReport.replace('<head>', `<head>\n  ${baseTag}`);
      }

      // Debug logging for image path issues
      const imageMatches = processedReport.match(/<img[^>]+src=["'][^"']+["'][^>]*>/gi) || [];
      console.log(`[ReportServer] Found ${imageMatches.length} image tags in the report`);
      if (imageMatches.length > 0) {
        imageMatches.forEach((img) => console.log(`[ReportServer] Image tag: ${img}`));
      }

      // Handle Windows-style absolute paths
      processedReport = processedReport.replace(
        /<img[^>]+src=["']([a-zA-Z]:\\[^"']*nexus_run[^"']+)["'][^>]*>/gi,
        (match, path) => {
          console.log(`[ReportServer] Processing Windows path: ${path}`);
          const nexusRunIndex = path.indexOf('nexus_run');
          if (nexusRunIndex !== -1) {
            const webPath = '/' + path.substring(nexusRunIndex).replace(/\\/g, '/');
            console.log(`[ReportServer] Converted to web path: ${webPath}`);
            return match.replace(path, webPath);
          }
          return match;
        }
      );

      // Handle Unix-style absolute paths
      processedReport = processedReport.replace(
        /<img[^>]+src=["']\/?((?:Users|home)[^"']*\/nexus_run[^"']+)["'][^>]*>/gi,
        (match, path) => {
          console.log(`[ReportServer] Processing Unix path: ${path}`);
          const nexusRunIndex = path.indexOf('nexus_run');
          if (nexusRunIndex !== -1) {
            const webPath = '/' + path.substring(nexusRunIndex);
            console.log(`[ReportServer] Converted to web path: ${webPath}`);
            return match.replace(path, webPath);
          }
          return match;
        }
      );

      // Handle screenshot paths
      processedReport = processedReport.replace(
        /<img[^>]+src=["']([^"']*(?:final-screenshot|screenshot-\d+)[^"']+)["'][^>]*>/gi,
        (match, path) => {
          console.log(`[ReportServer] Processing screenshot path: ${path}`);
          if (path.startsWith('/') || path.startsWith('http')) {
            return match;
          }

          if (path.match(/^[a-zA-Z]:\\/)) {
            console.log(`[ReportServer] Found Windows absolute path: ${path}`);
            const nexusRunIndex = path.indexOf('nexus_run');
            if (nexusRunIndex !== -1) {
              const webPath = '/' + path.substring(nexusRunIndex).replace(/\\/g, '/');
              console.log(`[ReportServer] Converted to web path: ${webPath}`);
              return match.replace(path, webPath);
            }

            const uuidMatch = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
            if (uuidMatch) {
              const uuid = uuidMatch[1];
              const fileName = path.substring(path.lastIndexOf('\\') + 1);
              const webPath = `/nexus_run/${uuid}/${fileName}`;
              console.log(`[ReportServer] Extracted UUID and created web path: ${webPath}`);
              return match.replace(path, webPath);
            }
          }

          const nexusRunIndex = path.indexOf('nexus_run');
          if (nexusRunIndex !== -1) {
            const webPath = '/' + path.substring(nexusRunIndex);
            console.log(`[ReportServer] Converted to web path: ${webPath}`);
            return match.replace(path, webPath);
          }

          return match.replace(path, `/nexus_run/${path.replace(/^[.\/]*/, '')}`);
        }
      );

      return res.send(processedReport);
    } catch (error) {
      console.error('[ReportServer] Error serving raw report:', error);
      next(error);
    }
  });
  console.log('[ReportServer] Raw report route /raw-report/:reportName enabled');
  console.log('[ReportServer] Single robust /external-report/:reportName route enabled');
}

/**
 * Create report redirector middleware - intercepts and redirects report URLs
 * @param {Object} app - Express app instance
 */
export function setupReportRedirector(app) {
  app.use((req, res, next) => {
    const isHtmlFile = req.path.endsWith('.html');
    const isImageFile = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(req.path);
    const isReportPath = req.path.startsWith('/nexus_run/report/') || req.path.includes('/nexus_run/nexus_run/');

    if (isReportPath && isHtmlFile && !isImageFile) {
      const reportName = path.basename(req.path);
      console.log(`[Report Redirector] Redirecting ${req.path} to raw report server`);
      return res.redirect(`/raw-report/${reportName}`);
    }
    next();
  });

  console.log('[Report Redirector] Report redirection middleware enabled');
}

export default {
  setupReportServing,
  setupReportRedirector,
};