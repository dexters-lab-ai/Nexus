import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function copyThreeJsAssets() {
  const srcDir = path.join(__dirname, '..', 'node_modules', 'three');
  const destDir = path.join(__dirname, '..', 'public', 'vendors', 'three');
  
  try {
    // Ensure destination directory exists
    await fs.ensureDir(destDir);
    
    // Copy the entire three module
    await fs.copy(srcDir, destDir, {
      filter: (src) => {
        // Skip unnecessary files to reduce size
        const exclude = [
          '/docs/',
          '/examples/jsm/loaders/3DMLoader.js', // Has CDN reference
          '/examples/jsm/webxr/XRControllerModelFactory.js', // Has CDN reference
          '/examples/jsm/webxr/XRHandMeshModel.js', // Has CDN reference
          '/examples/jsm/physics/JoltPhysics.js', // Has CDN reference
          '/examples/jsm/physics/RapierPhysics.js', // Has CDN reference
          '/examples/jsm/libs/ecsy.module.js', // Has CDN reference
          '/examples/jsm/libs/demuxer_mp4.js', // Has CDN reference
          '/examples/jsm/libs/chevrotain.module.min.js' // Has CDN reference
        ];
        
        return !exclude.some(pattern => src.includes(pattern));
      }
    });
    
    console.log('Successfully copied Three.js assets to public/vendors/three');
  } catch (err) {
    console.error('Error copying Three.js assets:', err);
    process.exit(1);
  }
}

// Run the function
await copyThreeJsAssets();
