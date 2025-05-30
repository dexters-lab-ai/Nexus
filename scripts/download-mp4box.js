import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { pipeline } from 'stream/promises';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create the public/assets/mp4box directory if it doesn't exist
const mp4boxDir = path.join(__dirname, '..', 'public', 'assets', 'mp4box');
await fs.ensureDir(mp4boxDir);

// URL of the MP4Box library
const mp4boxVersion = '0.5.3';
const mp4boxUrl = `https://cdn.jsdelivr.net/npm/mp4box@${mp4boxVersion}/dist/mp4box.all.min.js`;
const outputPath = path.join(mp4boxDir, 'mp4box.all.min.js');

console.log('Downloading MP4Box library...');

async function downloadFile(url, outputPath) {
  const file = fs.createWriteStream(outputPath);
  
  try {
    const response = await new Promise((resolve, reject) => {
      https.get(url, resolve).on('error', reject);
    });
    
    await pipeline(response, file);
    console.log(`✅ Successfully downloaded MP4Box library to ${outputPath}`);
    return true;
  } catch (error) {
    console.error('❌ Error downloading MP4Box library:', error);
    try {
      await fs.unlink(outputPath);
    } catch (e) {
      // Ignore error if file doesn't exist
    }
    return false;
  }
}

// Download the file
const success = await downloadFile(mp4boxUrl, outputPath);
if (!success) {
  console.error('❌ Failed to download MP4Box library');
  process.exit(1);
}
