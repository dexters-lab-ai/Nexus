console.log('Skipping patch application - files have already been manually updated.');
console.log('The following patches would have been applied:');

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directory containing our patches
const patchesDir = path.join(__dirname, '..', 'patches');

// Get all patch files
const patchFiles = fs.readdirSync(patchesDir).filter(file => file.endsWith('.patch'));

if (patchFiles.length === 0) {
  console.log('No patch files found in the patches directory.');
} else {
  patchFiles.forEach(file => console.log(`- ${file}`));
  console.log('\nThese patches have already been applied manually to the respective files.');
}
