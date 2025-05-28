import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function copyDracoFiles() {
  try {
    const sourceDir = join(__dirname, '../node_modules/three/examples/jsm/libs/draco/gltf');
    const destDir = join(__dirname, '../public/draco');
    
    // Ensure destination directory exists
    await fs.ensureDir(destDir);
    
    // Copy Draco files
    await fs.copy(sourceDir, destDir);
    
    console.log('✅ Successfully copied Draco files to public directory');
  } catch (error) {
    console.error('❌ Error copying Draco files:', error);
    process.exit(1);
  }
}

copyDracoFiles();
