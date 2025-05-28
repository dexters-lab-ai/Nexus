import * as THREE from 'three';

/**
 * Extended TextureLoader with middleware support and cache busting
 */
export class TextureLoader extends THREE.TextureLoader {
  constructor(manager) {
    super(manager);
    this.setPath('/models/textures/');
    this.crossOrigin = 'anonymous';
  }
  
  load(url, onLoad, onProgress, onError) {
    // Add cache busting for development
    const timestamp = new Date().getTime();
    const finalUrl = process.env.NODE_ENV === 'development' 
      ? `${url}${url.includes('?') ? '&' : '?'}v=${timestamp}`
      : url;
    
    // Create a new image element to handle loading with middleware
    const image = new Image();
    
    // Set cross-origin attribute if needed
    if (this.crossOrigin !== undefined) {
      image.crossOrigin = this.crossOrigin;
    }

    // Create texture immediately to return
    const texture = new THREE.Texture();
    
    // Set up loading handlers
    image.onload = () => {
      texture.image = image;
      texture.needsUpdate = true;
      
      // Call the original onLoad with the texture
      if (onLoad) onLoad(texture);
      
      // Clean up
      image.onload = null;
      image.onerror = null;
    };
    
    image.onerror = (error) => {
      console.error(`[TextureLoader] Failed to load texture: ${url}`, error);
      if (onError) onError(error);
      
      // Clean up
      image.onload = null;
      image.onerror = null;
    };
    
    // Start loading the image
    image.src = finalUrl;
    
    // Return the texture immediately
    return texture;
  }
}
