import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { pipeline } from 'stream/promises';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create the public/assets/rhino3dm directory if it doesn't exist
const rhinoDir = path.join(__dirname, '..', 'public', 'assets', 'rhino3dm');
await fs.ensureDir(rhinoDir);

// URL of the rhino3dm library
const rhinoVersion = '8.0.1';
const rhinoUrl = `https://cdn.jsdelivr.net/npm/rhino3dm@${rhinoVersion}/rhino3dm.min.js`;
const wasmUrl = `https://cdn.jsdelivr.net/npm/rhino3dm@${rhinoVersion}/rhino3dm.wasm`;

const jsOutputPath = path.join(rhinoDir, 'rhino3dm.min.js');
const wasmOutputPath = path.join(rhinoDir, 'rhino3dm.wasm');

console.log('Downloading rhino3dm library...');

// Helper function to download a file
async function downloadFile(url, outputPath) {
  const file = fs.createWriteStream(outputPath);
  
  try {
    const response = await new Promise((resolve, reject) => {
      https.get(url, resolve).on('error', reject);
    });
    
    await pipeline(response, file);
    console.log(`✅ Downloaded ${path.basename(url)}`);
    return true;
  } catch (error) {
    console.error(`❌ Error downloading ${url}:`, error.message);
    try {
      await fs.unlink(outputPath);
    } catch (e) {
      // Ignore error if file doesn't exist
    }
    return false;
  }
}

async function downloadRhino3DM() {
  try {
    // Download the JavaScript file
    const jsSuccess = await downloadFile(rhinoUrl, jsOutputPath);
    
    // Download the WASM file
    const wasmSuccess = await downloadFile(wasmUrl, wasmOutputPath);
    
    if (jsSuccess && wasmSuccess) {
      console.log('✅ Successfully downloaded rhino3dm library');
    } else {
      console.error('❌ Failed to download rhino3dm library');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the download
await downloadRhino3DM();
