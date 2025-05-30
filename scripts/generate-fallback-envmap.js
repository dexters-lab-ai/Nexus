import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateFallbackEnvMap() {
  try {
    // Create the public/assets/hdri directory if it doesn't exist
    const hdriDir = path.join(__dirname, '..', 'public', 'assets', 'hdri');
    await fs.ensureDir(hdriDir);

    // Create a simple gradient cube map
    const size = 16;
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Function to create a gradient texture
    function createGradientTexture(color1, color2) {
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      
      return canvas.toBuffer();
    }

    // Create and save the cube map faces
    const sides = [
      { name: 'px.png', color1: '#1a1a2e', color2: '#16213e' },  // right
      { name: 'nx.png', color1: '#1a1a2e', color2: '#16213e' },  // left
      { name: 'py.png', color1: '#0f3460', color2: '#1a1a2e' },  // top
      { name: 'ny.png', color1: '#0f3460', color2: '#1a1a2e' },  // bottom
      { name: 'pz.png', color1: '#16213e', color2: '#0f3460' },  // front
      { name: 'nz.png', color1: '#16213e', color2: '#0f3460' }   // back
    ];

    console.log('Generating fallback environment map...');

    // Save each face of the cube map
    for (const { name, color1, color2 } of sides) {
      const buffer = createGradientTexture(color1, color2);
      await fs.writeFile(path.join(hdriDir, name), buffer);
    }

    console.log('Successfully generated fallback environment map in', hdriDir);
  } catch (error) {
    console.error('Error generating fallback environment map:', error);
    process.exit(1);
  }
}

// Run the function
await generateFallbackEnvMap();
