import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { pipeline } from 'stream/promises';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create the public/assets/jolt directory if it doesn't exist
const joltDir = path.join(__dirname, '..', 'public', 'assets', 'jolt');
await fs.ensureDir(joltDir);

// URL of the Jolt physics library
const joltUrl = 'https://cdn.jsdelivr.net/npm/jolt-physics@0.23.0/dist/jolt-physics.wasm-compat.js';
const outputPath = path.join(joltDir, 'jolt-physics.wasm-compat.js');

console.log('Downloading Jolt Physics library...');

async function downloadFile(url, outputPath) {
  const file = fs.createWriteStream(outputPath);
  
  try {
    const response = await new Promise((resolve, reject) => {
      https.get(url, resolve).on('error', reject);
    });
    
    await pipeline(response, file);
    console.log(`✅ Successfully downloaded Jolt Physics library to ${outputPath}`);
    return true;
  } catch (error) {
    console.error('❌ Error downloading Jolt Physics library:', error);
    try {
      await fs.unlink(outputPath);
    } catch (e) {
      // Ignore error if file doesn't exist
    }
    return false;
  }
}

// Download the file
const success = await downloadFile(joltUrl, outputPath);
if (!success) {
  console.error('❌ Failed to download Jolt Physics library');
  process.exit(1);
}
