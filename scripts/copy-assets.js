import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure the assets directory exists
const assetsDir = path.join('public', 'assets');
fs.ensureDirSync(assetsDir);

// Copy environment.hdr to assets directory
const hdrSource = path.join('public', 'models', 'environment.hdr');
const hdrDest = path.join(assetsDir, 'environment.hdr');

if (fs.existsSync(hdrSource) && !fs.existsSync(hdrDest)) {
  console.log(`Copying ${hdrSource} to ${hdrDest}`);
  fs.copyFileSync(hdrSource, hdrDest);
}

// Copy all GLB files from models to assets
const modelsDir = path.join('public', 'models');
const modelFiles = fs.readdirSync(modelsDir).filter(file => file.endsWith('.glb'));

modelFiles.forEach(file => {
  const source = path.join(modelsDir, file);
  const dest = path.join(assetsDir, file);
  
  if (!fs.existsSync(dest)) {
    console.log(`Copying ${source} to ${dest}`);
    fs.copyFileSync(source, dest);
  }
});

console.log('Asset copy complete!');
