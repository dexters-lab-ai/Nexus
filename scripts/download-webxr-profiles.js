import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import got from 'got';
import * as tar from 'tar';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const VERSION = '1.0.0';
const TEMP_DIR = path.join(__dirname, '..', 'temp-webxr-profiles');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'assets', 'webxr-input-profiles');

// GitHub repository details
const GITHUB_REPO = 'immersive-web/webxr-input-profiles';
const GITHUB_RELEASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${VERSION}`;
// Use the main branch instead of a specific release
const GITHUB_TARBALL_URL = `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.tar.gz`;

async function downloadFile(url, outputPath) {
  console.log(`Downloading from ${url}...`);
  const response = await got(url, { responseType: 'buffer' });
  await fs.writeFile(outputPath, response.body);
  return outputPath;
}

async function extractTarGz(tarPath, outputDir) {
  console.log('Extracting files...');
  await fs.ensureDir(outputDir);
  await tar.x({
    file: tarPath,
    cwd: outputDir,
    strip: 1
  });
}

async function copyProfiles(sourceDir, targetDir) {
  console.log(`Copying profiles to ${targetDir}...`);
  
  // Try different possible paths where the profiles might be located
  const possiblePaths = [
    // Main branch structure
    path.join(sourceDir, 'webxr-input-profiles-main', 'packages', 'assets', 'profiles'),
    // Release tag structure
    path.join(sourceDir, `webxr-input-profiles-${VERSION}`, 'packages', 'assets', 'profiles'),
    // Nested structure
    path.join(sourceDir, 'packages', 'assets', 'profiles')
  ];

  let profilesSource = null;
  for (const possiblePath of possiblePaths) {
    if (await fs.pathExists(possiblePath)) {
      profilesSource = possiblePath;
      break;
    }
  }

  if (!profilesSource) {
    console.error('Could not find profiles in any of the expected locations:');
    possiblePaths.forEach(p => console.error(`- ${p}`));
    throw new Error('Failed to locate WebXR input profiles in the downloaded archive');
  }

  console.log(`Found profiles at: ${profilesSource}`);
  await fs.ensureDir(targetDir);
  await fs.copy(profilesSource, targetDir);
}

async function createPatchFile() {
  const patchContent = `--- a/public/vendors/three/examples/jsm/webxr/XRControllerModelFactory.js
+++ b/public/vendors/three/examples/jsm/webxr/XRControllerModelFactory.js
@@ -8,7 +8,7 @@ import {
 	Object3D
 } from 'three';
 
-const DEFAULT_PROFILES_PATH = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles';
+const DEFAULT_PROFILES_PATH = '/assets/webxr-input-profiles';
 const DEFAULT_PROFILE = 'generic-trigger';
 
 class XRControllerModelFactory {
`;

  const patchDir = path.join(__dirname, '..', 'patches');
  await fs.ensureDir(patchDir);
  
  const patchPath = path.join(patchDir, 'xr-controller-model-factory.patch');
  await fs.writeFile(patchPath, patchContent);
  console.log(`Created patch file at ${patchPath}`);
}

async function main() {
  try {
    // Create necessary directories
    await fs.ensureDir(TEMP_DIR);
    await fs.ensureDir(OUTPUT_DIR);

    // Download the tarball
    const tarPath = path.join(TEMP_DIR, 'profiles.tar.gz');
    await downloadFile(GITHUB_TARBALL_URL, tarPath);
    
    // Extract the tarball
    await extractTarGz(tarPath, TEMP_DIR);
    
    // Copy the profiles to the output directory
    await copyProfiles(TEMP_DIR, OUTPUT_DIR);
    
    // Create the patch file
    await createPatchFile();
    
    console.log('Successfully downloaded and processed WebXR input profiles');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    // Clean up
    try {
      await fs.remove(TEMP_DIR);
    } catch (error) {
      console.error('Error cleaning up temporary directory:', error);
    }
  }
}

// Run the main function
await main();
