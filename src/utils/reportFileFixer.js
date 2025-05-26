// reportFileFixer.js
import fs from 'fs';
import path from 'path';
import express from 'express';
import { styleRawReport } from './reportGenerator.js';

/**
 * Cache to store processed reports for quick serving
 */
const reportCache = new Map();

/**
 * Set up report serving middleware that bypasses Vite HTML parsing
 * @param {Object} app - Express app instance
 */
export function setupReportServing(app) {
  
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
      // Prefer nexus_run, fallback to midscene_run
      let reportPath = path.join(process.cwd(), 'nexus_run', 'report', reportName);
      let reportFound = fs.existsSync(reportPath);
      if (!reportFound) {
        const fallbackPath = path.join(process.cwd(), 'midscene_run', 'report', reportName);
        if (fs.existsSync(fallbackPath)) {
          reportPath = fallbackPath;
          reportFound = true;
          console.log(`[ReportServer] Found report in fallback location: ${fallbackPath}`);
        }
      }
      if (!reportFound) {
        console.warn(`[ReportServer] Report not found: ${reportName}`);
        return res.status(404).send(`Report "${reportName}" not found. Please check the report name and try again.`);
      }
      // Set security headers - more permissive for reports
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', "default-src 'self' blob: data:; \
                                             connect-src 'self' blob: data:; \
                                             img-src 'self' data: https: http:; \
                                             style-src 'self' 'unsafe-inline'; \
                                             script-src 'self' 'unsafe-inline' blob: data:; \
                                             worker-src 'self' blob: data:; \
                                             media-src 'self' blob: data:; \
                                             child-src 'self' blob: data:");
      // For HTML, we need to serve it as-is with minimal processing to avoid breaking scripts
      if (reportPath.endsWith('.html')) {
        // Check if we have a cached version
        if (!reportCache.has(reportPath)) {
          console.log(`[ReportServer] Reading and processing report: ${reportPath}`);
          const content = fs.readFileSync(reportPath, 'utf8');
          
          // Only rewrite the anchor links, but leave all scripts intact
          // This is a much more targeted replacement that won't break JavaScript
          const processed = content.replace(
            /<a\s+href=(['"])(?:\/?)((?:nexus_run\/report\/|external-report\/|direct-report\/)?[^'"]+)\1([^>]*)>/gi,
            (match, quote, linkReportName, attrs) => {
              // Make sure we only rewrite links to other reports
              if (linkReportName.endsWith('.html')) {
                const baseName = path.basename(linkReportName);
                const absoluteUrl = `${req.protocol}://${req.get('host')}/external-report/${baseName}`;
                return `<a href="${absoluteUrl}" target="_blank"${attrs}>`;
              }
              // Leave other links alone
              return match;
            }
          );
          
          // Add DOCTYPE if missing
          const hasDoctype = processed.trim().startsWith('<!DOCTYPE') || processed.trim().startsWith('<!doctype');
          const finalHtml = hasDoctype ? processed : `<!DOCTYPE html>\n${processed}`;
          
          // Cache the processed HTML
          reportCache.set(reportPath, finalHtml);
        } else {
          console.log(`[ReportServer] Serving cached report: ${reportPath}`);
        }
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(reportCache.get(reportPath));
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
      let reportPath = path.join(process.cwd(), 'nexus_run', 'report', reportName);
      let reportFound = fs.existsSync(reportPath);
      
      if (!reportFound) {
        // Fallback to midscene_run directory
        const fallbackPath = path.join(process.cwd(), 'midscene_run', 'report', reportName);
        if (fs.existsSync(fallbackPath)) {
          reportPath = fallbackPath;
          reportFound = true;
          console.log(`[ReportServer] Found raw report in fallback location: ${fallbackPath}`);
        }
      }
      
      if (!reportFound) {
        console.warn(`[ReportServer] Raw report not found: ${reportName}`);
        return res.status(404).send(`Raw report "${reportName}" not found. Please check the report name and try again.`);
      }
      
      // Set security headers
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      res.setHeader('Content-Security-Policy', "default-src 'self' blob: data:; \
                                           connect-src 'self' blob: data:; \
                                           img-src 'self' data: https: http:; \
                                           style-src 'self' 'unsafe-inline'; \
                                           script-src 'self' 'unsafe-inline' blob: data:; \
                                           worker-src 'self' blob: data:; \
                                           media-src 'self' blob: data:; \
                                           child-src 'self' blob: data:");
      
      // Read the file content
      const rawContent = fs.readFileSync(reportPath, 'utf8');
      
      // Detect if content is JSON to apply appropriate styling
      let content;
      try {
        // Try to parse as JSON
        content = JSON.parse(rawContent);
        console.log(`[ReportServer] Detected JSON content in raw report: ${reportName}`);
      } catch (e) {
        // Not JSON, use as text
        content = rawContent;
      }
      
      // Apply futuristic theme styling
      const styledReport = styleRawReport(content, `Raw Report - ${reportName}`);
      
      // Use styledReport as our finalContent for consistency with the rest of the function
      let finalContent = styledReport;
      
      // For raw reports, we need to make sure they're served directly as HTML content, not as a file
      // Set proper headers to ensure content is treated as HTML
      res.removeHeader('X-Frame-Options'); // Allow framing for reports
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, max-age=0'); // Prevent caching
      res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME type sniffing
      
      // Log that we're serving raw report content directly
      console.log(`[ReportServer] Serving raw report content directly for: ${reportName}`);
      
      // Create a base tag to help with relative URLs
      const baseUrl = `${req.protocol}://${req.get('host')}/`;
      const baseTag = `<base href="${baseUrl}" target="_blank">`;
      
      // Add base tag and fix image paths to convert any local file paths to web URLs
      let processedReport = finalContent;
      
      // Only add the base tag if it's HTML content
      if (processedReport.includes('<head>')) {
        processedReport = processedReport.replace('<head>', `<head>\n  ${baseTag}`);
      }
      
      // Debug logging for image path issues
      const imageMatches = processedReport.match(/<img[^>]+src=["'][^"']+["'][^>]*>/gi) || [];
      console.log(`[ReportServer] Found ${imageMatches.length} image tags in the report`);
      if (imageMatches.length > 0) {
        imageMatches.forEach(img => console.log(`[ReportServer] Image tag: ${img}`));
      }

      // First, replace Windows-style absolute paths that include nexus_run
      processedReport = processedReport.replace(/<img[^>]+src=["']([a-zA-Z]:\\[^"']*nexus_run[^"']+)["'][^>]*>/gi, (match, path) => {
        console.log(`[ReportServer] Processing Windows path: ${path}`);
        const nexusRunIndex = path.indexOf('nexus_run');
        if (nexusRunIndex !== -1) {
          const webPath = '/' + path.substring(nexusRunIndex).replace(/\\/g, '/');
          console.log(`[ReportServer] Converted to web path: ${webPath}`);
          return match.replace(path, webPath);
        }
        return match;
      });
      
      // Second, handle Unix-style absolute paths that might still be problematic
      processedReport = processedReport.replace(/<img[^>]+src=["']\/?((?:Users|home)[^"']*\/nexus_run[^"']+)["'][^>]*>/gi, (match, path) => {
        console.log(`[ReportServer] Processing Unix path: ${path}`);
        const nexusRunIndex = path.indexOf('nexus_run');
        if (nexusRunIndex !== -1) {
          const webPath = '/' + path.substring(nexusRunIndex);
          console.log(`[ReportServer] Converted to web path: ${webPath}`);
          return match.replace(path, webPath);
        }
        return match;
      });

      // Special case for final-screenshot files which might have a different format
      processedReport = processedReport.replace(/<img[^>]+src=["']([^"']*(?:final-screenshot|screenshot-\d+)[^"']+)["'][^>]*>/gi, (match, path) => {
        console.log(`[ReportServer] Processing screenshot path: ${path}`);
        // If it's already a web path (starts with / or http), leave it alone
        if (path.startsWith('/') || path.startsWith('http')) {
          return match;
        }
        
        // Handle Windows absolute paths (C:\Users\...)  
        if (path.match(/^[a-zA-Z]:\\/)) {
          console.log(`[ReportServer] Found Windows absolute path: ${path}`);
          // First try to find nexus_run in the path
          const nexusRunIndex = path.indexOf('nexus_run');
          if (nexusRunIndex !== -1) {
            const webPath = '/' + path.substring(nexusRunIndex).replace(/\\/g, '/');
            console.log(`[ReportServer] Converted to web path: ${webPath}`);
            return match.replace(path, webPath);
          }
          
          // Extract UUID folder from path if present
          const uuidMatch = path.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
          if (uuidMatch) {
            const uuid = uuidMatch[1];
            const fileName = path.substring(path.lastIndexOf('\\') + 1);
            const webPath = `/nexus_run/${uuid}/${fileName}`;
            console.log(`[ReportServer] Extracted UUID and created web path: ${webPath}`);
            return match.replace(path, webPath);
          }
        }
        
        // If it contains nexus_run, extract that part
        const nexusRunIndex = path.indexOf('nexus_run');
        if (nexusRunIndex !== -1) {
          const webPath = '/' + path.substring(nexusRunIndex);
          console.log(`[ReportServer] Converted to web path: ${webPath}`);
          return match.replace(path, webPath);
        }
        
        // Otherwise, assume it's a relative path and make it absolute to nexus_run
        return match.replace(path, `/nexus_run/${path.replace(/^[.\/]*/, '')}`);
      });
      
      // Send the complete HTML content with fixed image paths
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
  // Middleware to redirect report links to our direct server
  app.use((req, res, next) => {
    // Only redirect HTML files, allow images and other files to be served normally
    const isHtmlFile = req.path.endsWith('.html');
    const isImageFile = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(req.path);
    const isReportPath = req.path.startsWith('/nexus_run/report/') || req.path.includes('/nexus_run/nexus_run/');
    
    // Only redirect HTML files, not images or other assets
    if (isReportPath && isHtmlFile && !isImageFile) {
      const reportName = path.basename(req.path);
      // For direct browser requests, redirect to the raw report
      console.log(`[Report Redirector] Redirecting ${req.path} to raw report server`);
      return res.redirect(`/raw-report/${reportName}`);
    }
    next()
  });
  
  console.log('[Report Redirector] Report redirection middleware enabled');
}

export default {
  setupReportServing,
  setupReportRedirector
};