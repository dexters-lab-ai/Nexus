import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define directories
const publicDir = path.join('public');
const assetsDir = path.join(publicDir, 'assets');
const vendorsDir = path.join(publicDir, 'vendors');

// Ensure directories exist
fs.ensureDirSync(assetsDir);
fs.ensureDirSync(vendorsDir);

// 1. Copy Three.js examples
const threeExamplesSrc = path.join('node_modules', 'three', 'examples');
const threeExamplesDest = path.join(vendorsDir, 'three', 'examples');

if (fs.existsSync(threeExamplesSrc)) {
  console.log(`Copying Three.js examples to ${threeExamplesDest}`);
  fs.copySync(threeExamplesSrc, threeExamplesDest, { overwrite: true });
}

// 2. Copy Font Awesome fonts
const faFontsSrc = path.join('node_modules', '@fortawesome', 'fontawesome-free', 'webfonts');
const faFontsDest = path.join(publicDir, 'webfonts');

if (fs.existsSync(faFontsSrc)) {
  console.log(`Copying Font Awesome fonts to ${faFontsDest}`);
  fs.copySync(faFontsSrc, faFontsDest, { overwrite: true });
}

// 3. Copy environment.hdr to assets directory
const hdrSource = path.join('public', 'models', 'environment.hdr');
const hdrDest = path.join(assetsDir, 'environment.hdr');

if (fs.existsSync(hdrSource) && !fs.existsSync(hdrDest)) {
  console.log(`Copying ${hdrSource} to ${hdrDest}`);
  fs.copyFileSync(hdrSource, hdrDest);
}

// 4. Copy all GLB files from models to assets
const modelsDir = path.join('public', 'models');
if (fs.existsSync(modelsDir)) {
  const modelFiles = fs.readdirSync(modelsDir).filter(file => file.endsWith('.glb'));
  
  modelFiles.forEach(file => {
    const source = path.join(modelsDir, file);
    const dest = path.join(assetsDir, file);
    
    if (!fs.existsSync(dest)) {
      console.log(`Copying ${source} to ${dest}`);
      fs.copyFileSync(source, dest);
    }
  });
}

// 5. Copy any other required assets from node_modules
const assetMappings = [
  {
    src: path.join('node_modules', 'gsap', 'dist', 'gsap.min.js'),
    dest: path.join(vendorsDir, 'gsap', 'gsap.min.js')
  },
  {
    src: path.join('node_modules', 'lil-gui', 'dist', 'lil-gui.umd.js'),
    dest: path.join(vendorsDir, 'lil-gui', 'lil-gui.umd.js')
  }
];

assetMappings.forEach(({ src, dest }) => {
  if (fs.existsSync(src)) {
    fs.ensureDirSync(path.dirname(dest));
    console.log(`Copying ${src} to ${dest}`);
    fs.copyFileSync(src, dest);
  } else {
    console.warn(`Source file not found: ${src}`);
  }
});

// Copy Bruno demo assets to dist
const brunoSrc = 'bruno_demo_temp';
const brunoDest = path.join('dist', 'bruno_demo_temp');

if (fs.existsSync(brunoSrc)) {
  console.log(`Copying Bruno demo assets to ${brunoDest}`);
  fs.copySync(brunoSrc, brunoDest, { 
    overwrite: true,
    filter: (src) => !src.includes('node_modules') && 
                    !src.includes('.git') &&
                    !src.includes('src')
  });
} else {
  console.warn('Bruno demo assets directory not found:', brunoSrc);
}

console.log('Asset copy complete!');
