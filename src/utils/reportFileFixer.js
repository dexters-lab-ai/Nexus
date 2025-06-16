// reportFileFixer.js
import fs from 'fs';
import path from 'path';
import express from 'express';
import { styleRawReport } from './reportGenerator.js';

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
 * Set up report serving middleware that bypasses Vite HTML parsing
 * @param {Object} app - Express app instance
 */
export function setupReportServing(app) {
  // Route for downloading reports as files
  app.get('/download-report/:reportName', async (req, res, next) => {
    try {
      const { reportName } = req.params;
      // Validate report name to prevent directory traversal
      if (!/^[a-zA-Z0-9_.\-]+\.html$/.test(reportName)) {
        console.warn(`[ReportServer] Invalid report name attempted for download: ${reportName}`);
        return res.status(400).send('Invalid report name');
      }
      
      // Look for report in nexus_run/report directory
      const reportPath = path.join(process.cwd(), 'nexus_run', 'report', reportName);
      const reportFound = fs.existsSync(reportPath);
      
      if (!reportFound) {
        console.warn(`[ReportServer] Report not found at: ${reportPath}`);
        return res.status(404).send(`Report "${reportName}" not found.`);
      }
      
      // Set appropriate headers for file download
      res.setHeader('Content-Disposition', `attachment; filename="${reportName}"`);
      res.setHeader('Content-Type', 'text/html');
      
      // Stream the file directly to the client
      const fileStream = fs.createReadStream(reportPath);
      fileStream.pipe(res);
    } catch (error) {
      console.error(`[ReportServer] Error downloading report: ${error.message}`);
      res.status(500).send(`Error downloading report: ${error.message}`);
    }
  });
  
  // Route for processed/external reports
  // Single robust /external-report/:reportName route
  app.get('/external-report/:reportName', async (req, res, next) => {
    try {
      const { reportName } = req.params;
      // Validate report name to prevent directory traversal
      if (!/^[a-zA-Z0-9_.\-]+\.html$/.test(reportName)) {
        console.warn(`[ReportServer] Invalid report name attempted: ${reportName}`);
        return res.status(400).send('Invalid report name');
      }
      // Look for report in nexus_run/report directory
      const reportPath = path.join(process.cwd(), 'nexus_run', 'report', reportName);
      const reportFound = fs.existsSync(reportPath);
      if (!reportFound) {
        console.warn(`[ReportServer] Report not found at: ${reportPath}`);
        return res.status(404).send(`Report "${reportName}" not found.`);
      }
      // Set security headers (CSP is now handled in server.js)
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');

      // For HTML, we need to serve it as-is with minimal processing to avoid breaking scripts
      if (reportPath.endsWith('.html')) {
        // Check if we have a cached version
        const cachedContent = getWithTTL(reportPath);
        if (!cachedContent) {
          console.log(`[ReportServer] Reading and processing report: ${reportPath}`);
          const content = fs.readFileSync(reportPath, 'utf8');

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
          const finalHtml = hasDoctype ? processed : `<!DOCTYPE html>\n${processed}`;

          // Cache the processed HTML with TTL
          setWithTTL(reportPath, finalHtml);
        } else {
          console.log(`[ReportServer] Serving cached report: ${reportPath}`);
        }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(getWithTTL(reportPath));
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
      // Validate report name to prevent directory traversal
      if (!/^[a-zA-Z0-9_.\-]+\.html$/.test(reportName)) {
        console.warn(`[ReportServer] Invalid raw report name attempted: ${reportName}`);
        return res.status(400).send('Invalid report name');
      }

      // Look for the report in nexus_run/report directory
      const reportPath = path.join(process.cwd(), 'nexus_run', 'report', reportName);
      const reportFound = fs.existsSync(reportPath);

      if (!reportFound) {
        console.warn(`[ReportServer] Raw report not found at: ${reportPath}`);
        return res.status(404).send(`Raw report "${reportName}" not found.`);
      }

      // Set security headers (CSP is now handled in server.js)
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');

      // Read the file content
      const rawContent = fs.readFileSync(reportPath, 'utf8');

      // Detect if content is JSON to apply appropriate styling
      let content;
      try {
        content = JSON.parse(rawContent);
        console.log(`[ReportServer] Detected JSON content in raw report: ${reportName}`);
      } catch (e) {
        content = rawContent;
      }

      // Apply futuristic theme styling
      const styledReport = styleRawReport(content, `Raw Report - ${reportName}`);
      let finalContent = styledReport;

      // Set proper headers
      res.removeHeader('X-Frame-Options'); // Allow framing for reports
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
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