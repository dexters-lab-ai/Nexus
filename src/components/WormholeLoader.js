/**
 * Wormhole Loading Animation
 * A sophisticated threejs wormhole effect with "Loading" text
 */

import * as THREE from 'three';

export default class WormholeLoader {
  constructor() {
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.animationFrameId = null;
    this.wormhole = null;
    this.particles = null;
    this.text = null;
    this.startTime = Date.now();
    this.isReady = false;
    this.hideTriggered = false;       // Flag to track if hide was triggered
    this.triggerSource = null;        // Track what triggered the hide
    this.hidingTimestamp = null;      // When hide was initiated
    this.hideTransitionComplete = false; // Track if transition finished
  }

  init() {
    // Create container - ensure it's styled as a true overlay
    this.container = document.createElement('div');
    this.container.id = 'wormhole-loader';
    this.container.style.position = 'fixed';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100vw';
    this.container.style.height = '100vh';
    this.container.style.zIndex = '9999';
    this.container.style.backgroundColor = '#000';
    this.container.style.transition = 'opacity 1.5s ease-out'; // Slower fade for better visibility
    this.container.style.pointerEvents = 'none'; // Ensure it doesn't block interaction

    // Setup threejs
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 5;

    // Setup renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);
    
    // Add the agent loading text with animated dots
    this.createAgentLoadingText();

    // Create wormhole
    this.createWormhole();
    
    // Add window resize handler
    window.addEventListener('resize', this.onResize.bind(this));

    // Start animation immediately without blocking
    this.animate();

    // Attach to DOM
    document.body.appendChild(this.container);
    this.isReady = true;

    // Register for application events
    document.addEventListener('app-initialized', this.handleAppInitialized.bind(this));
    
    // PRIMARY TRIGGER: Listen for settings initialization
    // This ensures the app is fully ready before transitioning away from the loading screen
    document.addEventListener('settings-initialized', () => {
      console.log('[WormholeLoader] Settings modal initialized - hiding wormhole');
      this.hide('settings-ready');
    });
    
    // Ultimate safety timeout - hide after 35 seconds no matter what
    // Extended to give Settings.jsx enough time to initialize
    setTimeout(() => {
      if (!this.container.classList.contains('hidden')) {
        console.log('[WormholeLoader] Final safety timeout reached - hiding wormhole');
        this.hide('final-timeout');
      }
    }, 35000);

    return this.container;
  }

  createWormhole() {
    // Create wormhole tunnel
    const geometry = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, -10),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, 10),
      ]),
      64,  // tubular segments
      2,   // radius
      16,  // radial segments
      true // closed
    );

    // Custom shader material for the wormhole effect
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        color1: { value: new THREE.Color(0x9D71EA) }, // Purple
        color2: { value: new THREE.Color(0x2a3b8f) }  // Dark blue
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
          vUv = uv;
          vPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color1;
        uniform vec3 color2;
        varying vec2 vUv;
        varying vec3 vPosition;
        
        void main() {
          float distortion = sin(vUv.x * 10.0 + time) * 0.1 + sin(vUv.y * 8.0 - time * 0.5) * 0.1;
          float ripple = sin(vUv.x * 20.0 + vUv.y * 20.0 + time * 2.0) * 0.05;
          
          float pattern = sin(vUv.x * 40.0 + time) * sin(vUv.y * 40.0 + time) * 0.5 + 0.5;
          pattern += ripple;
          
          vec3 finalColor = mix(color1, color2, pattern + distortion);
          
          // Add glow effect
          float glow = 0.5 * (1.0 + sin(time + vUv.x * 5.0));
          finalColor += color1 * glow * 0.3;
          
          // Add radial gradient for tunnel effect
          float center = length(vUv - vec2(0.5, 0.5));
          float vignette = smoothstep(0.6, 0.2, center);
          
          gl_FragColor = vec4(finalColor * vignette, 1.0);
        }
      `,
      side: THREE.BackSide
    });

    this.wormhole = new THREE.Mesh(geometry, material);
    this.scene.add(this.wormhole);

    // Add some particles for depth effect
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 800; // Slightly fewer particles
    const posArray = new Float32Array(particlesCount * 3);
    
    for (let i = 0; i < particlesCount * 3; i++) {
      // Create particles in a cylindrical pattern
      const i3 = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.5 + Math.random() * 0.5;
      const z = (Math.random() - 0.5) * 20;
      
      posArray[i3] = Math.sin(angle) * radius;
      posArray[i3 + 1] = Math.cos(angle) * radius;
      posArray[i3 + 2] = z;
    }
    
    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    
    // Create a more subtle particle material
    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.02, // Smaller size
      color: 0xffffff,
      transparent: true,
      opacity: 0.4, // More transparent
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true
    });
    
    this.particles = new THREE.Points(particlesGeometry, particlesMaterial);
    this.scene.add(this.particles);
  }

  // Create agent loading text with animated dots
  createAgentLoadingText() {
    // Create a text overlay div
    const textOverlay = document.createElement('div');
    textOverlay.className = 'agent-loading-text';
    textOverlay.innerHTML = 'agent loading<span class="dot-1">.</span><span class="dot-2">.</span><span class="dot-3">.</span>';
    
    // Check if mobile view
    const isMobile = window.innerWidth <= 768; // Standard mobile breakpoint
    
    // Style the text overlay
    textOverlay.style.position = 'absolute';
    textOverlay.style.left = '50%';
    textOverlay.style.transform = 'translateX(-50%)';
    
    // Adjust vertical position based on device
    if (isMobile) {
      textOverlay.style.top = '47%'; // Higher position for mobile
      textOverlay.style.fontSize = '0.8rem';
    } else {
      textOverlay.style.top = '50%';
      textOverlay.style.transform = 'translate(-50%, -50%)';
      textOverlay.style.fontSize = '0.9rem';
    }
    
    // Common styles
    textOverlay.style.color = 'rgba(255, 255, 255, 0.7)';
    textOverlay.style.fontFamily = '"Roboto Mono", monospace';
    textOverlay.style.letterSpacing = '2px';
    textOverlay.style.textTransform = 'lowercase';
    textOverlay.style.fontWeight = '300';
    textOverlay.style.textAlign = 'center';
    textOverlay.style.zIndex = '10000';
    textOverlay.style.pointerEvents = 'none';
    textOverlay.style.userSelect = 'none';
    textOverlay.style.mixBlendMode = 'screen';
    
    // Create and inject CSS for the dot animation
    const style = document.createElement('style');
    style.textContent = `
      .agent-loading-text .dot-1,
      .agent-loading-text .dot-2,
      .agent-loading-text .dot-3 {
        animation-name: dot-fade;
        animation-duration: 1.4s;
        animation-iteration-count: infinite;
        animation-fill-mode: both;
      }
      
      .agent-loading-text .dot-1 {
        animation-delay: 0s;
      }
      
      .agent-loading-text .dot-2 {
        animation-delay: 0.2s;
      }
      
      .agent-loading-text .dot-3 {
        animation-delay: 0.4s;
      }
      
      @keyframes dot-fade {
        0%, 20%, 100% {
          opacity: 0.3;
        }
        50%, 70% {
          opacity: 1;
        }
      }
    `;
    
    document.head.appendChild(style);
    this.container.appendChild(textOverlay);
    
    // Store reference for later access
    this.agentLoadingText = textOverlay;
  }

  animate() {
    const elapsedTime = (Date.now() - this.startTime) / 1000;
    
    // Update wormhole shader
    if (this.wormhole && this.wormhole.material.uniforms) {
      this.wormhole.material.uniforms.time.value = elapsedTime;
    }
    
    // Update particles
    if (this.particles) {
      // Rotate particles for effect
      this.particles.rotation.z += 0.001;
      
      // Move particles through the wormhole
      const positions = this.particles.geometry.attributes.position.array;
      
      for (let i = 0; i < positions.length; i += 3) {
        // Move particles along z-axis
        positions[i + 2] -= 0.03;
        
        // Reset if particle moved too far
        if (positions[i + 2] < -10) {
          positions[i + 2] = 10;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }
    
    // Render
    this.renderer.render(this.scene, this.camera);
    
    // Continue animation loop
    this.animationId = requestAnimationFrame(this.animate.bind(this));
  }

  onResize() {
    // Update camera
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    
    // Update renderer
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  show() {
    if (!this.isReady) {
      this.init();
    }
    this.container.style.opacity = '1';
    this.container.style.display = 'block';
  }

  /**
   * Hide the loader with a smooth fade-out transition
   * @param {string} trigger - What triggered the hide (event name, timeout, etc)
   */
  hide(trigger = 'manual') {
    // Exit early if container is missing
    if (!this.container) return;
    
    if (this.hideTriggered) {
      // Special case: allow settings-ready trigger to override other triggers
      // This ensures we always record the settings initialization as the trigger when possible
      if (trigger !== this.triggerSource) {
        console.log(`[WormholeLoader] Updating trigger source from ${this.triggerSource} to ${trigger}`);
        this.triggerSource = trigger;
      } else {
        console.log(`[WormholeLoader] Already hiding (triggered by: ${this.triggerSource}), ignoring new trigger: ${trigger}`);
      }
      return;
    }
    
    // Update loading text
    if (this.agentLoadingText) {
      this.agentLoadingText.innerHTML = 'agent loaded<span class="dot-1">.</span><span class="dot-2">.</span><span class="dot-3">.</span>';
    }
    
    // Set state flags
    this.hideTriggered = true;
    this.triggerSource = trigger;
    this.hidingTimestamp = Date.now();
    this.hideTransitionComplete = false;
    
    console.log(`[WormholeLoader] Hiding wormhole, triggered by: ${trigger}`);
    
    // Start the fade out transition - with slightly longer duration for visual smoothness
    this.container.style.transition = 'opacity 2s cubic-bezier(0.19, 1, 0.22, 1)';
    this.container.style.opacity = '0';
    this.container.classList.add('hiding');
    
    // Set a safety timeout to ensure it gets hidden even if transition fails
    // Has to be longer than the transition duration to ensure animation completes
    const hideTimeout = setTimeout(() => {
      if (this.container && !this.hideTransitionComplete) {
        this.container.style.display = 'none';
        this.container.classList.remove('hiding');
        this.container.classList.add('hidden');
        this.hideTransitionComplete = true;
        console.log(`[WormholeLoader] Hidden via safety timeout after ${Date.now() - this.hidingTimestamp}ms, trigger was: ${trigger}`);
      }
    }, 3000); // 3 second safety timeout (longer than transition)
    
    // Also listen for the transition end event
    const handleTransitionEnd = () => {
      if (this.container && !this.hideTransitionComplete) {
        this.container.style.display = 'none';
        this.container.classList.remove('hiding');
        this.container.classList.add('hidden');
        this.hideTransitionComplete = true;
        
        console.log(`[WormholeLoader] Transition complete after ${Date.now() - this.hidingTimestamp}ms, trigger was: ${trigger}`);
        
        // Clean up the timeout
        clearTimeout(hideTimeout);
        
        // Remove the event listener
        this.container.removeEventListener('transitionend', handleTransitionEnd);
      }
    };
    
    // Add the transition end listener
    this.container.addEventListener('transitionend', handleTransitionEnd);
  }
  
  /**
   * Handle the app-initialized event
   * This is called when the application has loaded and is ready
   * @param {Event} event - The app-initialized event
   */
  handleAppInitialized(event) {
    // We're no longer using this as a trigger - the init-modern-operator event is preferred
    // as it provides better timing for a smooth user experience
    console.log('[WormholeLoader] Application initialized event received, but ignored in favor of init-modern-operator');
  }

  /**
   * Force-hide the loader immediately without transitions
   * Used as a fallback when normal hiding fails
   */
  forceHide() {
    if (!this.container) return;
    
    // Set state flags even if we're already hiding
    // This will override any ongoing hide transition
    this.hideTriggered = true;
    this.triggerSource = 'force-hide';
    this.hidingTimestamp = Date.now();
    this.hideTransitionComplete = true; // Mark as complete immediately
    
    console.warn('[WormholeLoader] Force-hiding the loader');
    
    // Immediately hide without transition
    this.container.style.transition = 'none';
    this.container.style.opacity = '0';
    this.container.style.display = 'none';
    this.container.classList.remove('hiding'); // Remove any hiding class
    this.container.classList.add('hidden');
    
    // Log debug info
    console.debug('[WormholeLoader] Current container state:', {
      display: this.container.style.display,
      opacity: this.container.style.opacity,
      parentNode: !!this.container.parentNode,
      classes: this.container.className,
      hideTriggered: this.hideTriggered,
      triggerSource: this.triggerSource
    });
    
    // Stop animation loop if running
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  destroy() {
    if (this.scene) {
      // Clean up the scene
      if (this.wormhole) {
        this.wormhole.geometry.dispose();
        this.wormhole.material.dispose();
        this.scene.remove(this.wormhole);
      }
      
      // Remove agent loading text
      if (this.agentLoadingText && this.agentLoadingText.parentNode) {
        this.agentLoadingText.parentNode.removeChild(this.agentLoadingText);
        this.agentLoadingText = null;
      }
    }
    
    if (this.particles) {
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.scene.remove(this.particles);
    }
    
    if (this.text) {
      this.text.material.map.dispose();
      this.text.material.dispose();
      this.scene.remove(this.text);
    }
    
    // Remove event listeners
    window.removeEventListener('resize', this.onResize);
    
    // Remove from DOM
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    
    // Clear references
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.wormhole = null;
    this.particles = null;
    this.text = null;
  }
}

// Create singleton instance
const loader = new WormholeLoader();
export { loader };
