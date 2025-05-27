import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Starting build process...');

try {
  // Ensure dist directory exists
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    console.log('Creating dist directory...');
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Copy index.html to dist if it doesn't exist
  const indexPath = path.join(__dirname, 'index.html');
  const distIndexPath = path.join(distDir, 'index.html');
  
  if (fs.existsSync(indexPath) && !fs.existsSync(distIndexPath)) {
    console.log('Copying index.html to dist...');
    fs.copyFileSync(indexPath, distIndexPath);
  }

  // Run Vite build
  console.log('Running Vite build...');
  execSync('npx vite build', { stdio: 'inherit' });

  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
