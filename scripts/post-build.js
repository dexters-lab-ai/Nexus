import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const publicDir = path.join(rootDir, 'public');

async function copyPublicAssets() {
  try {
    // Create necessary directories if they don't exist
    await fs.ensureDir(path.join(distDir, 'assets'));
    await fs.ensureDir(path.join(distDir, 'models'));
    await fs.ensureDir(path.join(distDir, 'draco'));
    
    // Copy Draco files
    await fs.copy(
      path.join(publicDir, 'draco'),
      path.join(distDir, 'draco'),
      { overwrite: true }
    );
    
    // Copy models
    await fs.copy(
      path.join(publicDir, 'models'),
      path.join(distDir, 'models'),
      { overwrite: true }
    );
    
    // Copy assets
    await fs.copy(
      path.join(publicDir, 'assets'),
      path.join(distDir, 'assets'),
      { overwrite: true }
    );
    
    console.log('✅ Successfully copied public assets to dist directory');
  } catch (error) {
    console.error('❌ Error copying public assets:', error);
    process.exit(1);
  }
}

// Run the copy function
copyPublicAssets();
