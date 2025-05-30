import fs from 'fs';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Promisify fs methods
const mkdir = promisify(fs.mkdir);
const exists = promisify(fs.exists);
const unlink = promisify(fs.unlink);

async function downloadHdri() {
  try {
    // Create the public/assets/hdri directory if it doesn't exist
    const hdriDir = path.join(__dirname, '..', 'public', 'assets', 'hdri');
    if (!await exists(hdriDir)) {
      await mkdir(hdriDir, { recursive: true });
    }

    // URL of the HDR file to download
    const hdriUrl = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/venice_sunset_1k.hdr';
    const outputPath = path.join(hdriDir, 'venice_sunset_1k.hdr');

    // Download the file
    console.log('Downloading HDR environment map...');
    
    const file = fs.createWriteStream(outputPath);
    
    return new Promise((resolve, reject) => {
      https.get(hdriUrl, (response) => {
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          console.log(`Successfully downloaded HDR environment map to ${outputPath}`);
          resolve();
        });
      }).on('error', async (err) => {
        try {
          await unlink(outputPath); // Delete the file if there's an error
        } catch (e) {
          // Ignore errors during cleanup
        }
        console.error('Error downloading HDR environment map:', err);
        reject(err);
      });
    });
  } catch (err) {
    console.error('Error in downloadHdri:', err);
    process.exit(1);
  }
}

// Run the download
await downloadHdri();
