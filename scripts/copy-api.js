import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the current module's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function copyApiFile() {
  try {
    // Ensure the public/js/utils directory exists
    const publicJsDir = join(__dirname, '../public/js/utils');
    if (!existsSync(publicJsDir)) {
      mkdirSync(publicJsDir, { recursive: true });
      console.log(`Created directory: ${publicJsDir}`);
    }

    // Define source and destination paths
    const srcPath = join(__dirname, '../src/utils/api.js');
    const destPath = join(publicJsDir, 'api.js');

    console.log(`Copying from: ${srcPath}`);
    console.log(`Destination: ${destPath}`);

    // Check if source file exists
    if (!existsSync(srcPath)) {
      throw new Error(`Source file not found: ${srcPath}`);
    }

    // Read the source file
    let content = readFileSync(srcPath, 'utf8');

    // Update any imports that might be using the wrong path
    content = content.replace(/from ['"]\.\.\/src\//g, 'from "');

    // Ensure the destination directory exists
    const destDir = dirname(destPath);
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }

    // Write to destination
    writeFileSync(destPath, content, 'utf8');
    console.log(`Successfully copied to: ${destPath}`);
    
    return true;
  } catch (error) {
    console.error('Error copying API file:', error.message);
    process.exit(1);
  }
}

// Execute the function
copyApiFile();
