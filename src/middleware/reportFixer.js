import fs from 'fs';
import path from 'path';
import { fixReportHtml, applyFixedReportTemplate } from '../utils/reportTemplates.js';

/**
 * Middleware to fix Nexus report HTML files
 * This ensures reports are HTML5 compliant and have the proper styling
 */
export function fixReportMiddleware(req, res, next) {
  // Only process HTML files in the nexus_run/report directory
  const requestPath = req.path;
  
  if ((requestPath.startsWith('/nexus_run/report/')) && requestPath.endsWith('.html')) {
    const filePath = path.join(process.cwd(), requestPath);
    
    // Check if the file exists
    if (fs.existsSync(filePath)) {
      try {
        // Read the file content
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Always assume HTML reports might need fixing
        console.log(`Fixing HTML in report: ${requestPath}`);
        
        // Fix the HTML
        const fixedContent = fixReportHtml(content);
        
        // Write the fixed content back to the file
        fs.writeFileSync(filePath, fixedContent, 'utf8');
        
        // Also apply the template for serving
        const templatedContent = applyFixedReportTemplate(fixedContent);
        
        // Serve the fixed content
        res.setHeader('Content-Type', 'text/html');
        return res.send(templatedContent);
      } catch (error) {
        console.error(`Error fixing report file ${filePath}:`, error);
        // Continue to next middleware if there's an error
      }
    }
  }
  
  next();
}

/**
 * Patch the Nexus report generation process
 * This function monkey patches the Midscene functions to use our HTML5 compliant templates
 */
export function patchMidsceneReportGeneration() {
  try {
    // This is a comprehensive patch that does two things:
    // 1. Intercepts writes to redirect midscene_run to nexus_run
    // 2. Fixes HTML files to ensure they are compliant
    
    // Define paths 
    const NEXUS_RUN_DIR = path.join(process.cwd(), 'nexus_run');
    const REPORT_DIR = path.join(NEXUS_RUN_DIR, 'report');
    
    // Ensure directory exists
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    
    // Monkey patch fs.* functions
    const originalWriteFile = fs.writeFile;
    const originalWriteFileSync = fs.writeFileSync;
    const originalExistsSync = fs.existsSync;
    const originalReadFileSync = fs.readFileSync;
    const originalReadFile = fs.readFile;
    const originalMkdirSync = fs.mkdirSync;
    
    // Pattern to match midscene_run paths
    const isMidsceneRunPath = (filepath) => {
      return typeof filepath === 'string' && filepath.includes('midscene_run');
    };
    
    // Convert midscene_run paths to nexus_run
    const convertToNexusPath = (filepath) => {
      if (!isMidsceneRunPath(filepath)) return filepath;
      
      const newPath = filepath.replace('midscene_run', 'nexus_run');
      console.log(`Redirecting path: ${filepath} → ${newPath}`);
      return newPath;
    };
    
    // Patch writeFile (async version)
    fs.writeFile = function(file, data, options, callback) {
      const originalFile = file;
      file = convertToNexusPath(file);
      
      // Ensure directory exists
      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });
      
      // Fix HTML content if needed
      if (typeof file === 'string' && file.endsWith('.html')) {
        if (typeof data === 'string' && 
            (data.includes('</meta>') || data.includes('</link>') || data.includes('</input>'))) {
          console.log(`Patching HTML in report: ${path.basename(file)}`);
          data = fixReportHtml(data);
        }
      }
      
      // If this is a report being created, log it
      if (typeof file === 'string' && file.includes('report') && file.endsWith('.html')) {
        if (isMidsceneRunPath(originalFile)) {
          console.log(`Nexus - report file redirected and updated: ${file}`);
        } else {
          console.log(`Nexus - report file updated: ${file}`);
        }
      }
      
      // Call the original function with the new path
      return originalWriteFile(file, data, options, callback);
    };
    
    // Patch writeFileSync (sync version)
    fs.writeFileSync = function(file, data, options) {
      const originalFile = file;
      file = convertToNexusPath(file);
      
      // Ensure directory exists
      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });
      
      // Fix HTML content if needed
      if (typeof file === 'string' && file.endsWith('.html')) {
        if (typeof data === 'string' && 
            (data.includes('</meta>') || data.includes('</link>') || data.includes('</input>'))) {
          console.log(`Patching HTML in report (sync): ${path.basename(file)}`);
          data = fixReportHtml(data);
        }
      }
      
      // If this is a report being created, log it
      if (typeof file === 'string' && file.includes('report') && file.endsWith('.html')) {
        if (isMidsceneRunPath(originalFile)) {
          console.log(`Nexus - report file redirected and updated: ${file}`);
        } else {
          console.log(`Nexus - report file updated: ${file}`);
        }
      }
      
      // Call the original function with the new path
      return originalWriteFileSync(file, data, options);
    };
    
    // Patch existsSync to handle midscene_run paths
    fs.existsSync = function(path) {
      const originalPath = path;
      path = convertToNexusPath(path);
      
      // If we're checking for midscene_run directory itself,
      // return true to prevent unnecessary creation attempts
      if (isMidsceneRunPath(originalPath) && originalPath.endsWith('midscene_run')) {
        return true;
      }
      
      return originalExistsSync(path);
    };
    
    // Patch readFileSync to handle midscene_run paths
    fs.readFileSync = function(path, options) {
      path = convertToNexusPath(path);
      return originalReadFileSync(path, options);
    };
    
    // Patch readFile to handle midscene_run paths
    fs.readFile = function(path, options, callback) {
      path = convertToNexusPath(path);
      
      // Handle different argument patterns
      if (typeof options === 'function') {
        callback = options;
        return originalReadFile(path, callback);
      }
      
      return originalReadFile(path, options, callback);
    };
    
    // Patch mkdir to ensure redirected directories are created
    fs.mkdirSync = function(dir, options) {
      dir = convertToNexusPath(dir);
      return originalMkdirSync(dir, options);
    };
    
    console.log('Nexus report generation patched successfully - redirecting midscene_run to nexus_run');
    return true;
  } catch (error) {
    console.error('Failed to patch Nexus report generation:', error);
    return false;
  }
}

export default {
  fixReportMiddleware,
  patchMidsceneReportGeneration
};
