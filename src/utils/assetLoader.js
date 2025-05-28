import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function loadAsset(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      credentials: 'omit', // This prevents cookies from being sent
      headers: {
        ...options.headers,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to load ${url}: ${response.statusText}`);
    }
    
    return await response.blob();
  } catch (error) {
    console.error(`Error loading asset: ${url}`, error);
    throw error;
  }
}

export function createTextureLoader() {
  const loader = new THREE.TextureLoader();
  const originalLoad = loader.load;
  
  // Override the load method to use our custom loader
  loader.load = function(url, onLoad, onProgress, onError) {
    return originalLoad.call(
      this,
      url,
      onLoad,
      onProgress,
      function(err) {
        console.error(`Failed to load texture: ${url}`, err);
        if (onError) onError(err);
      }
    );
  };
  
  return loader;
}

// For GLB/GLTF models
export function createGLTFLoader() {
  const loader = new GLTFLoader();
  const originalLoad = loader.load;
  
  loader.load = function(url, onLoad, onProgress, onError) {
    return originalLoad.call(
      this,
      url,
      onLoad,
      onProgress,
      function(err) {
        console.error(`Failed to load GLB/GLTF: ${url}`, err);
        if (onError) onError(err);
      }
    );
  };
  
  return loader;
}
