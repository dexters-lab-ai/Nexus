import * as THREE from 'three';
import { GUI } from 'https://cdn.jsdelivr.net/npm/lil-gui@0.17.0/dist/lil-gui.esm.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import gsap from 'https://cdn.jsdelivr.net/npm/gsap@3.12.7/index.js';
import { eventBus } from '../utils/events.js';
import { stores } from '../store/index.js';
import Screen from './experience/Screen.js';
import { EventEmitter } from '../utils/events.js';

// Baked room shaders
const BAKED_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BAKED_FRAGMENT_SHADER = `
uniform sampler2D uBakedDayTexture;
uniform sampler2D uBakedNightTexture;
uniform sampler2D uBakedNeutralTexture;
uniform sampler2D uLightMapTexture;
uniform float uNightMix;
uniform float uNeutralMix;
uniform vec3 uLightTvColor;
uniform float uLightTvStrength;
uniform vec3 uLightDeskColor;
uniform float uLightDeskStrength;
uniform vec3 uLightPcColor;
uniform float uLightPcStrength;
varying vec2 vUv;
void main() {
    vec3 day = texture2D(uBakedDayTexture, vUv).rgb;
    vec3 night = texture2D(uBakedNightTexture, vUv).rgb;
    vec3 neutral = texture2D(uBakedNeutralTexture, vUv).rgb;
    vec3 color = mix(mix(day, night, uNightMix), neutral, uNeutralMix);
    vec3 lm = texture2D(uLightMapTexture, vUv).rgb;

    // TV lighten blend
    float tvStr = lm.r * uLightTvStrength;
    vec3 ltTv = max(color, uLightTvColor);
    color = mix(color, ltTv, tvStr);

    // PC lighten blend
    float pcStr = lm.b * uLightPcStrength;
    vec3 ltPc = max(color, uLightPcColor);
    color = mix(color, ltPc, pcStr);

    // Desk lighten blend
    float deskStr = lm.g * uLightDeskStrength;
    vec3 ltDesk = max(color, uLightDeskColor);
    color = mix(color, ltDesk, deskStr);

    gl_FragColor = vec4(color, 1.0);
}
`;

const MODEL_PATHS = {
  room: { primary: '/assets/roomModel.glb', fallback: '/assets/room-low.glb' },
  googleLeds: { primary: '/assets/googleHomeLedsModel.glb', fallback: '/assets/googleHomeLeds-low.glb' },
  loupedeck: { primary: '/assets/loupedeckButtonsModel.glb', fallback: '/assets/loupedeckButtons-low.glb' },
  topChair: { primary: '/assets/topChairModel.glb', fallback: '/assets/topChair-low.glb' },
  elgatoLight: { primary: '/assets/elgatoLightModel.glb', fallback: '/assets/elgatoLight-low.glb' },
  pcScreen: { primary: '/assets/pcScreenModel.glb', fallback: '/assets/pcScreen-low.glb' },
  macScreen: { primary: '/assets/macScreenModel.glb', fallback: '/assets/macScreen-low.glb' }
};

export default class RoomExperience extends EventEmitter {
  constructor(props = {}) {
    super();
    this.props = {

      },
      ...props
    };
    
    // Initialize loadingManager, textureLoader, dracoLoader, gltfLoader
    // Use external LoadingManager if provided (from RoomEntryPoint), else create new
    this.loadingManager = this.props.loadingManager || new THREE.LoadingManager();
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);
    this.textureLoader.crossOrigin = 'anonymous';
    this.dracoLoader = new DRACOLoader(this.loadingManager);
    this.dracoLoader.setDecoderPath('/public/draco/');
    this.dracoLoader.setDecoderConfig({ type: 'wasm' });
    this.loader = new GLTFLoader(this.loadingManager);
    this.gltfLoader = this.loader;
    this.gltfLoader.setDRACOLoader(this.dracoLoader);

    // Prepare core members
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.composer = null;
    this.controls = null;

    // Bind methods
    this.initialize = this.initialize.bind(this);
    this.loadGLB = this.loadGLB.bind(this);
    this.handleResize = this.handleResize.bind(this);
    // bind interaction methods and state
    this.isTransitioning = false;
    this.isAppLaunched = false;
    this.transitionDuration = this.props.transitionDuration || 2000;
    this.addScreenInteraction = this.addScreenInteraction.bind(this);
    this.disableControls = this.disableControls.bind(this);
    this.enableControls = this.enableControls.bind(this);
    this.moveToComputer = this.moveToComputer.bind(this);
    this.moveToScreen = this.moveToScreen.bind(this);
    this.launchApplication = this.launchApplication.bind(this);
    this.exitApplication = this.exitApplication.bind(this);
    this.moveToInitialPosition = this.moveToInitialPosition.bind(this);
  }

  async initialize() {
    const { container = document.body, transitionDuration = 2000, enableOrbitControls = true, initialState = null } = this.props;
    console.log('[Room] Initializing with props:', this.props);
    let canvasContainer = container;
    if (typeof canvasContainer === 'string') canvasContainer = document.querySelector(canvasContainer);
    if (!canvasContainer) throw new Error('Container element is required');
    eventBus.emit('room-loading-start');
    this.setupRenderer(canvasContainer);
    if (enableOrbitControls) {
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.minPolarAngle = 0.2;
      this.controls.maxPolarAngle = Math.PI / 2.2;
      this.controls.screenSpacePanning = true;
      this.controls.enableKeys = false;
      this.controls.zoomSpeed = 0.25;
    }
    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    // Set initial camera position (respect saved state or Bruno's default)
    if (initialState) {
      this.camera.position.copy(initialState.initial);
      this.camera.lookAt(initialState.lookAt || new THREE.Vector3(0, 1.2, 0));
    } else {
      this.initializeCamera();
    }
    this.camera.updateProjectionMatrix();

    // Create container that will always exist
    this.roomContainer = new THREE.Group();
    this.roomContainer.name = 'RoomContainer';
    this.scene.add(this.roomContainer);
    
    // Initialize empty arrays for dynamic elements
    this.accentLights = [];
    this.interactiveElements = [];

    // Then load models and setup model-dependent lighting
    // Robust fully loaded experience: wait for all models, environment, screens, videos, and first render
    const fullyLoaded = async () => {
      await Promise.all([
        this.loadMainModel(),
        this.loadEnvironment(),
        this.loadScreens ? this.loadScreens() : Promise.resolve()
      ]);
      // Wait for all screen videos to be playing
      const screenVideos = [];
      if (this.pcScreen && this.pcScreen.video) screenVideos.push(this.pcScreen.video);
      if (this.macScreen && this.macScreen.video) screenVideos.push(this.macScreen.video);
      await Promise.all(screenVideos.map(video => {
        return new Promise(resolve => {
          if (video.readyState >= 3 && !video.paused) return resolve();
          video.onplaying = () => resolve();
          video.play().catch(() => resolve());
        });
      }));
      // Wait for first frame rendered
      await new Promise(resolve => {
        let resolved = false;
        const handler = () => {
          if (!resolved) {
            resolved = true;
            this.renderer.domElement.removeEventListener('render', handler);
            resolve();
          }
        };
        // Fallback: resolve after 100ms if no render event
        setTimeout(() => { if (!resolved) resolve(); }, 100);
        this.renderer.domElement.addEventListener('render', handler);
        // Also trigger a render
        this.renderer.render(this.scene, this.camera);
      });
    };
    fullyLoaded().then(() => {
      this.setupPostProcessing();
      // Accent spotlights are disabled to use pure baked lighting
      // this.setupAccentLights();
      // --- RE-APPLY renderer settings after all setup! ---
      this.renderer.outputColorSpace = THREE.SRGBColorSpace; // Updated from outputEncoding = sRGBEncoding
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.3; // Ensure starting exposure = 0.3

      // --- Bruno's baked material defaults for richer look ---
      if (this.bakedMaterial) {
        this.bakedMaterial.uNightMix = 0.75;   // Updated starting nightMix
        this.bakedMaterial.uNeutralMix = 0;    // Always start at 0
        this.bakedMaterial.uNeutralMixMax = 0.5; // Define max unconditionally
      }
      // Debug log for final settings
      console.log('[DEBUG] Renderer settings:', {
        outputColorSpace: this.renderer.outputColorSpace ?? THREE.SRGBColorSpace, // Updated from outputEncoding
        toneMapping: this.renderer.toneMapping,
        toneMappingExposure: this.renderer.toneMappingExposure,
        uNightMix: this.bakedMaterial?.uNightMix ?? 0,
        uNeutralMix: this.bakedMaterial?.uNeutralMix ?? 0,
        uNeutralMixMax: this.bakedMaterial?.uNeutralMixMax ?? 0
      });
      // Hide loader and run camera intro only after everything is loaded and visible
      this.finishLoadingUI();
      this.disableControls();
      this.animateIntroCamera();
      this.startAnimationLoop();
    }).catch(error => {
      console.error('Model loading failed:', error);
      this.finishLoadingUI();
    });
  }

  setupRenderer(container) {
    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });
    container.appendChild(this.renderer.domElement);
    this.renderer.setClearColor(0x010101, 1);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    // --- Bruno's defaults: world-class fidelity ---
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.4; 
    this.renderer.physicallyCorrectLights = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // NEVER override these settings after this point!

    // Create the Three.js scene
    this.scene = new THREE.Scene();
    const containerEl = container || document.body;
    // Camera is created here, but position/target is set in initializeCamera()
    this.camera = new THREE.PerspectiveCamera(60, containerEl.clientWidth / containerEl.clientHeight, 0.1, 100);
    // Do not set position or lookAt here! This is handled in initializeCamera().

    // Initialize GUI controls (starts closed by default)
    this.gui = new GUI({ 
      title: 'Room Controls', 
      width: 300,
      closeOnTop: true,  // Show close button on top
      autoPlace: false   // We'll handle placement manually
    });
    
    // Create a container for the GUI to control its visibility
    const guiContainer = document.createElement('div');
    guiContainer.style.position = 'absolute';
    guiContainer.style.top = '10px';
    guiContainer.style.right = '10px';
    guiContainer.style.zIndex = '1000';
    document.body.appendChild(guiContainer);
    
    // Add the GUI to our container
    guiContainer.appendChild(this.gui.domElement);
    
    // Create toggle button for the GUI with improved styling
    this.toggleButton = document.createElement('button');
    this.toggleButton.textContent = '☰ Controls';
    this.toggleButton.id = 'room-controls-toggle';
    this.toggleButton.style.position = 'absolute';
    this.toggleButton.style.top = '10px';
    this.toggleButton.style.right = '10px';
    this.toggleButton.style.zIndex = '1001';
    this.toggleButton.style.padding = '4px 8px';
    this.toggleButton.style.borderRadius = '4px';
    this.toggleButton.style.border = '1px solid rgba(255,255,255,0.1)';
    this.toggleButton.style.background = 'rgba(0,0,0,0.3)';
    this.toggleButton.style.color = '#ccc';
    this.toggleButton.style.fontFamily = 'var(--font-mono)';
    this.toggleButton.style.fontSize = '12px';
    this.toggleButton.style.cursor = 'pointer';
    this.toggleButton.style.transition = 'all 0.2s ease';
    document.body.appendChild(this.toggleButton);
    
    // Store GUI elements for cleanup
    this.guiContainer = guiContainer;
    
    // Toggle GUI visibility
    this.toggleButton.addEventListener('click', () => {
      this.guiVisible = !this.guiVisible;
      this.guiContainer.style.display = this.guiVisible ? 'block' : 'none';
      this.toggleButton.textContent = this.guiVisible ? '×' : '☰ Controls';
      
      // Update button style based on state
      if (this.guiVisible) {
        this.toggleButton.style.padding = '4px 8px';
        this.toggleButton.style.background = 'var(--dark-medium)';
        this.toggleButton.style.color = 'white';
      } else {
        this.toggleButton.style.padding = '4px 8px';
        this.toggleButton.style.background = 'rgba(0,0,0,0.3)';
        this.toggleButton.style.color = '#ccc';
      }
    });
    
    // Start with GUI hidden
    this.guiVisible = false;
    this.guiContainer.style.display = 'none';
    
    // Add controls
    const ppFolder = this.gui.addFolder('Post Processing');
    this.ppFolder = ppFolder;
    
    // Always sync slider to renderer, never the other way!
    const exposureCtrl = ppFolder.add(this.renderer, 'toneMappingExposure', 0.1, 1.5, 0.01)
      .name('Exposure')
      .onChange(val => {
        this.renderer.toneMappingExposure = val;
        this.renderer.resetState();
        // Clamp exposure to Bruno's max (optional)
        if (this.renderer.toneMappingExposure > 1.5) this.renderer.toneMappingExposure = 1.5;
        // Force immediate re-render so user sees update instantly
        if (this.composer) {
          this.composer.render();
        } else {
          this.renderer.render(this.scene, this.camera);
        }
      });
    exposureCtrl.setValue(this.renderer.toneMappingExposure);
    
    // Initialize baked materials with Bruno's defaults if not set
    this.bakedMaterial = this.bakedMaterial || {
      uNightMix: 0.75, // Updated default for nightMix
      uNeutralMix: 0 // Always start at 0
    };
    // Clamp uNeutralMix to max 0.5
    if (this.bakedMaterial.uNeutralMix > 0.5) this.bakedMaterial.uNeutralMix = 0.5;
    // Always ensure uNeutralMix starts at 0
    this.bakedMaterial.uNeutralMix = 0;
    
    // Close the Post Processing folder by default
    ppFolder.close();
    
    // Configure renderer to match Bruno's settings
    // this.renderer.setSize(containerEl.clientWidth, containerEl.clientHeight);
    // this.renderer.setPixelRatio(window.devicePixelRatio);
    
    // containerEl.appendChild(this.renderer.domElement);
    // initialCamera call moved to initialize() to respect intro sequence
  }

  initializeCamera() {
    // Bruno's original camera position and FOV (start further out, centered)
    this.camera.position.set(-40, 50, 7); // Start far and high, from the left, facing desk
    this.camera.lookAt(1, 3, 0);
    this.camera.fov = 40;
    this.camera.updateProjectionMatrix();
    // No lighting adjustments needed (handled by baked/HDR)
  }

  async loadEnvironment() {
    // Try loading from the new path first
    const paths = [
      '/assets/environment.hdr',
      '/bruno_demo_temp/static/assets/environment.hdr'  // Fallback to old path
    ];
    
    let envMap = null;
    
    for (const path of paths) {
      try {
        console.log(`[Environment] Attempting to load HDR from: ${path}`);
        const hdrEquirect = await new RGBELoader().loadAsync(path);
        const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        pmremGenerator.compileEquirectangularShader();
        envMap = pmremGenerator.fromEquirectangular(hdrEquirect).texture;
        
        this.scene.environment = envMap;
        this.scene.background = null;
        
        hdrEquirect.dispose();
        pmremGenerator.dispose();
        
        console.log(`✅ Loaded HDR environment from ${path}`);
        return; // Success, exit the function
      } catch (err) {
        console.warn(`⚠️ Could not load HDR from ${path}:`, err.message);
        // Continue to next path or fallback
      }
    }
    
    // If we get here, all HDR loads failed
    console.warn('❌ All HDR load attempts failed, using fallback color');
    this.scene.background = new THREE.Color(0x111111);
    this.scene.environment = null;
  }

  async loadAsset(asset) {
    try {
      const assetPath = this.props.assetPaths[asset];
      console.log(`[Model] Loading ${asset} from ${assetPath}`);
      
      // Check if this is a required asset
      const requiredAssets = ['room', 'pcScreen'];
      const isRequired = requiredAssets.includes(asset);
      
      try {
        const gltf = await this.loadGLB(assetPath);
        return gltf;
      } catch (error) {
        if (isRequired) {
          console.error(`[Model] Failed to load required asset ${asset}:`, error);
          throw error;
        } else {
          console.warn(`[Model] Non-critical asset ${asset} failed to load, continuing without it`);
          return null;
        }
      }
    } catch (error) {
      console.error(`[Model] Error in loadAsset for ${asset}:`, error);
      // Only throw if this is a required asset
      if (requiredAssets.includes(asset)) {
        throw error;
      }
      return null;
    }
  }

  async loadMainModel() {
    console.group('[Model] Loading Main Room');
    
    try {
      // Load main room
      const roomGLTF = await this.loadAsset('room');
      if (roomGLTF?.scene) {
        this.room = roomGLTF.scene;
        this.roomContainer.add(this.room);
        
        // Try to load baked textures
        try {
          const texturePaths = [
            '/assets/bakedDay.jpg',
            '/assets/bakedNight.jpg',
            '/assets/bakedNeutral.jpg',
            '/assets/lightMap.jpg'
          ];
          
          // Fallback to old paths if needed
          const fallbackPaths = [
            '/bruno_demo_temp/static/assets/bakedDay.jpg',
            '/bruno_demo_temp/static/assets/bakedNight.jpg',
            '/bruno_demo_temp/static/assets/bakedNeutral.jpg',
            '/bruno_demo_temp/static/assets/lightMap.jpg'
          ];
          
          const textures = [];
          
          // Try to load each texture with fallback
          for (let i = 0; i < texturePaths.length; i++) {
            try {
              const texture = await this.textureLoader.loadAsync(texturePaths[i]);
              textures.push(texture);
              console.log(`✅ Loaded texture ${texturePaths[i]}`);
            } catch (error) {
              console.warn(`⚠️ Could not load texture ${texturePaths[i]}, trying fallback`);
              try {
                const fallbackTexture = await this.textureLoader.loadAsync(fallbackPaths[i]);
                textures.push(fallbackTexture);
                console.log(`✅ Loaded fallback texture ${fallbackPaths[i]}`);
              } catch (fallbackError) {
                // Create a solid color texture as final fallback
                console.warn(`⚠️ Could not load fallback texture, using solid color`);
                const color = [0x333333, 0x111111, 0x222222, 0x000000][i];
                const canvas = document.createElement('canvas');
                canvas.width = 4;
                canvas.height = 4;
                const context = canvas.getContext('2d');
                context.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
                context.fillRect(0, 0, 4, 4);
                const texture = new THREE.CanvasTexture(canvas);
                textures.push(texture);
              }
            }
          }
          
          this.bakedTextures = textures;
          this.applyBakedMaterials(...textures);
        } catch (error) {
          console.error('Error loading baked textures:', error);
          // Continue without baked textures if they can't be loaded
        }
      }
      
      // Load interactive elements via dedicated loaders
      await Promise.all([
        this.loadGoogleLeds(),
        this.loadLoupedeck(),
        this.loadTopChair(),
        this.loadElgatoLight(),
        this.loadCoffeeSteam(),
        this.loadScreens()
      ]);

      // Add bouncing logo plane to TV screen
      (async () => {
        // Integrate Bruno's bouncing logo plane
        // Setup group at TV face
        const logoGroup = new THREE.Group();
        logoGroup.position.set(4.2, 2.717, 1.63);
        this.scene.add(logoGroup);

        // Logo background: small black plane behind logo
        const bgGeo = new THREE.PlaneGeometry(4, 1);
        bgGeo.rotateY(-Math.PI * 0.5);
        const bgMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5 });
        const bgMesh = new THREE.Mesh(bgGeo, bgMat);
        // Increase size & adjust overlay: height *7, width *2.7; crop top by 3%, shift right by 3%
        const heightScale = 0.359 * 7;
        const widthScale = 0.424 * 2.7 * 0.93; // reduce width by 5%
        bgMesh.scale.y = heightScale * 0.965;  // reduce top by 3.5%
        bgMesh.scale.z = widthScale;           // set new width
        bgMesh.position.y -= heightScale * 0.035 / 2; // move down to keep bottom aligned
        bgMesh.position.z = widthScale * 0.17; // shift overlay 5% to the right
        bgMesh.position.x = 0;
        bgMesh.renderOrder = 0;
        bgMesh.material.depthTest = true;
        bgMesh.material.depthWrite = false;
        console.log('[DEBUG] Logo bgMesh values:', {
          heightScale,
          widthScale,
          scaleY: bgMesh.scale.y,
          posX: bgMesh.position.x,
          posY: bgMesh.position.y,
          posZ: bgMesh.position.z
        });
        logoGroup.add(bgMesh);

        // Load logo texture
        const logoTexture = await this.textureLoader.loadAsync('/bruno_demo_temp/static/assets/dail-fav.png');
        logoTexture.colorSpace = THREE.SRGBColorSpace; // Updated from encoding

        // Geometry and material
        const logoSize = 0.7; // Adjust for desired size
        const geometry = new THREE.PlaneGeometry(1, 1); // Square
        geometry.rotateY(-Math.PI * 0.5);
        const material = new THREE.MeshBasicMaterial({
          transparent: true,
          premultipliedAlpha: true,
          map: logoTexture
        });

        // Mesh and scale
        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.y = logoSize;
        mesh.scale.z = logoSize;
        mesh.renderOrder = 1;
        logoGroup.add(mesh);

        // Bounce params
        let z = 0, y = 0;
        const limits = {
  z: { min: -1.076 * 1.15, max: 1.454 * 1.15 }, // increase horizontal bounce by 15%
  y: { min: -1.055 * 0.85, max: 0.947 * 0.85 } // reduce vertical bounce by 15%
};
        const speed = { z: 0.00061, y: 0.00037 };
        const clock = new THREE.Clock();

        const animateLogo = () => {
          const delta = clock.getDelta() * 1000;
          z += speed.z * delta;
          y += speed.y * delta;
          if (z > limits.z.max) { z = limits.z.max; speed.z *= -1; }
          if (z < limits.z.min) { z = limits.z.min; speed.z *= -1; }
          if (y > limits.y.max) { y = limits.y.max; speed.y *= -1; }
          if (y < limits.y.min) { y = limits.y.min; speed.y *= -1; }
          mesh.position.z = z;
          mesh.position.y = y;
          requestAnimationFrame(animateLogo);
        };
        animateLogo();
      })();
    } catch (error) {
      console.error('[Model] Failed to load:', error);
    } finally {
      console.groupEnd();
    }
  }

  /**
   * Recursively log all mesh/group names in a given object3D (for debugging model hierarchy)
   */
  logAllMeshNames(object, depth = 0) {
    if (!object) return;
    const pad = '  '.repeat(depth);
    if (object.name) {
      console.log(`${pad}${object.type}: ${object.name}`);
    }
    if (object.children && object.children.length > 0) {
      object.children.forEach(child => this.logAllMeshNames(child, depth + 1));
    }
  }

  async loadGLB(name) {
    // Exact filenames from our assets folder
    const modelMap = {
      room: 'roomModel',
      googleLeds: 'googleHomeLedsModel',
      loupedeck: 'loupedeckButtonsModel',
      topChair: 'topChairModel',
      elgatoLight: 'elgatoLightModel',
      pcScreen: 'pcScreenModel',
      macScreen: 'macScreenModel'
    };
    
    const paths = [
      `/assets/${modelMap[name]}.glb`
    ];
    
    for (const path of paths) {
      try {
        const gltf = await this.gltfLoader.loadAsync(path);
        console.log(`✅ Loaded ${name} from ${path}`);
        return gltf;
      } catch (err) {
        console.log(`❌ Failed ${name} from ${path}`);
      }
    }
    
    console.error(`💥 Could not load ${name}`);
    return null;
  }

  async loadGoogleLeds() {
    const gltf = await this.loadGLB('googleLeds');
    if (!gltf) return;
    
    this.googleLeds = gltf.scene;
    this.scene.add(this.googleLeds);
    
    const maskTexture = await this.textureLoader.loadAsync('/bruno_demo_temp/static/assets/googleHomeLedMask.png');
    this.googleLeds.traverse(child => {
      if (child.isMesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          alphaMap: maskTexture,
          transparent: true
        });
      }
    });
  }

  async loadLoupedeck() {
    const gltf = await this.loadGLB('loupedeck');
    if (!gltf) return;
    
    this.loupedeck = gltf.scene;
    // Render buttons behind other objects, static gray color
    this.loupedeck.traverse(child => {
      if (child.isMesh) {
        child.renderOrder = -1;
        child.frustumCulled = false;
        child.material = new THREE.MeshBasicMaterial({ color: 0x333333 });
      }
    });
    this.scene.add(this.loupedeck);
    
    // Find and store button meshes for animation
    this.loupedeckButtons = [];
    gltf.scene.traverse(child => {
      if (child.isMesh && child.name.includes('Button')) {
        this.loupedeckButtons.push(child);
      }
    });
  }

  async loadCoffeeSteam() {
    this.coffeeSteam = {
      particles: new THREE.Group(),
      count: 30,
      speed: 0.2
    };
    
    // Create particle system
    for (let i = 0; i < this.coffeeSteam.count; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.01, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
      );
      
      // Randomize initial position
      particle.position.set(
        Math.random() * 0.06 - 0.03,
        Math.random() * 0.06,
        Math.random() * 0.06 - 0.03
      );
      
      particle.userData = {
        speed: Math.random() * 0.1 + 0.05,
        offset: Math.random() * Math.PI * 2
      };
      
      this.coffeeSteam.particles.add(particle);
    }
    
    this.coffeeSteam.particles.position.set(0.5, 0.75, 0.3); // Adjusted for cup alignment
    this.scene.add(this.coffeeSteam.particles);
  }


    // Accent spotlights are disabled to use pure baked lighting
  }

  applyBakedMaterials(bakedDayTex, bakedNightTex, bakedNeutralTex, lightMapTex) {
    // Encode and orient textures
    bakedDayTex.colorSpace = THREE.SRGBColorSpace; bakedDayTex.flipY = false; // Updated from encoding
    bakedNightTex.colorSpace = THREE.SRGBColorSpace; bakedNightTex.flipY = false; // Updated from encoding
    bakedNeutralTex.colorSpace = THREE.SRGBColorSpace; bakedNeutralTex.flipY = true; //default false - fun dev // Updated from encoding
    lightMapTex.flipY = false;

    // Create material with tone mapping enabled
    this.bakedMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uBakedDayTexture: { value: bakedDayTex },
        uBakedNightTexture: { value: bakedNightTex },
        uBakedNeutralTexture: { value: bakedNeutralTex },
        uLightMapTexture: { value: lightMapTex },
        uNightMix: { value: 0.75 }, // Updated starting nightMix
        uNeutralMix: { value: 0 },
        uLightTvColor: { value: new THREE.Color('#8000ff') }, // vivid purple behind TV
        uLightTvStrength: { value: 1.5 },
        uLightDeskColor: { value: new THREE.Color('#ff6700') }, // Bruno's orange
        uLightDeskStrength: { value: 1.5 },
        uLightPcColor: { value: new THREE.Color('#0082ff') }, // Bruno's blue
        uLightPcStrength: { value: 1.4 }
      },
      vertexShader: BAKED_VERTEX_SHADER,
      fragmentShader: BAKED_FRAGMENT_SHADER,
      toneMapped: true, // Restore tone mapping
      transparent: false,
      depthWrite: true,
      depthTest: true
    });
    // Expose uniforms for GUI binding
    this.bakedMaterial.uNightMix = this.bakedMaterial.uniforms.uNightMix;
    this.bakedMaterial.uNeutralMix = this.bakedMaterial.uniforms.uNeutralMix;
    // Add GUI controls for baked material here (after ShaderMaterial creation)
    if (this.gui) {
      // Remove previous folder if it exists to avoid duplicates
      if (this.bakedMatFolder) {
        this.gui.removeFolder(this.bakedMatFolder);
      }
      this.bakedMatFolder = this.gui.addFolder('Baked Material');
      this.bakedMatFolder.add(this.bakedMaterial.uniforms.uNightMix, 'value', 0, 2, 0.01).name('Night Mix').onChange(() => { this.bakedMaterial.needsUpdate = true; });
      this.bakedMatFolder.add(this.bakedMaterial.uniforms.uNeutralMix, 'value', 0, 0.5, 0.01).name('Neutral Mix').onChange(() => { this.bakedMaterial.needsUpdate = true; });
    }

    // Only apply baked shader to main room mesh (not screens, chairs, laptops, or props)
    this.room.traverse(child => {
      if (!child.isMesh) return;

      // Enhanced screen exclusion check
      let parent = child.parent;
      while (parent) {
        if (parent === this.pcScreen || parent === this.macScreen || 
            parent.name.includes('Screen')) {
          console.warn('Skipping baked material for screen element:', child.name);
          return;
        }
        parent = parent.parent;
      }
      if (child.name.includes('Wall')) {
        const wallMat = this.bakedMaterial.clone();
        wallMat.side = THREE.DoubleSide;
        wallMat.onBeforeCompile = shader => {
          shader.fragmentShader = 'uniform vec3 uBackColor;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            'gl_FragColor = vec4(color, 1.0);\n if (!gl_FrontFacing) gl_FragColor = vec4(uBackColor, 1.0);'
          );
          shader.uniforms.uBackColor = { value: new THREE.Color('#8000ff') };
        };
        child.material = wallMat;
      } else {
        child.material = this.bakedMaterial;
      }
      console.log('[BakedMaterial] Assigned baked material to mesh:', child.name);
    });
    // Ensure room meshes render at default layer
    this.room.traverse(child => { if (child.isMesh) child.renderOrder = 0; });
  }

  setupPostProcessing() {
    // Setup post-processing pipeline
    // Always preserve renderer outputEncoding/toneMapping!
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Set initial bloom strength and exposure as per user requirements
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.renderer.domElement.width, this.renderer.domElement.height),
      0.1, // strength
      0.8, // radius (unchanged)
      0.2  // threshold (unchanged)
    );
    this.composer.addPass(this.bloomPass);
    // Bloom controls under Post Processing
    if (this.ppFolder) {
      if (this.bloomFolder) this.gui.removeFolder(this.bloomFolder);
      this.bloomFolder = this.ppFolder.addFolder('Bloom');
      const strengthCtrl = this.bloomFolder.add(this.bloomPass, 'strength', 0, 3, 0.01).name('Strength')
        .onChange(() => this.composer.render());
      strengthCtrl.setValue(this.bloomPass.strength);
      const radiusCtrl = this.bloomFolder.add(this.bloomPass, 'radius', 0, 1, 0.01).name('Radius')
        .onChange(() => this.composer.render());
      radiusCtrl.setValue(this.bloomPass.radius);
      const thresholdCtrl = this.bloomFolder.add(this.bloomPass, 'threshold', 0, 1, 0.01).name('Threshold')
        .onChange(() => this.composer.render());
      thresholdCtrl.setValue(this.bloomPass.threshold);
    }
    // DO NOT add GammaCorrectionShader if renderer.outputColorSpace = SRGBColorSpace
    // Double check: NEVER override renderer.outputEncoding or toneMapping here!
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.4; // Starting exposure = 0.4 (user requirement)
  }

  finishLoadingUI() {
    const loader = document.getElementById('app-loader');
    const webgl = this.props.container instanceof HTMLElement
      ? this.props.container
      : document.getElementById('webgl-container');
    if (loader) {
      loader.style.opacity = '0';
      loader.style.pointerEvents = 'none';
      setTimeout(() => { loader.style.display = 'none'; }, 2000);
      console.log('[UI] Loader hidden');
    }
    if (webgl) {
      webgl.style.opacity = '1';
      webgl.style.pointerEvents = 'auto';
      webgl.style.display = 'block';
      console.log('[UI] 3D room container shown');
    }
  }

  startAnimationLoop() {
    const animate = () => {
      this._animationFrameId = requestAnimationFrame(animate);
      
      if (this.controls) this.controls.update();
      this.composer ? this.composer.render() : this.renderer.render(this.scene, this.camera);
      
      // Google LEDs animation (TV 'DAIL' bouncing)
      if (this.googleLeds?.items) {
        const time = Date.now() * 0.002;
        this.googleLeds.items.forEach(item => {
          item.material.opacity = Math.sin(time - item.index * 0.5) * 0.5 + 0.5;
        });
      }
      
      // Coffee steam animation
      if (this.coffeeSteam && typeof this.coffeeSteam.update === 'function') {
        this.coffeeSteam.update();
      }
      
      // Top Chair physics
      if (this.topChair) {
        this.topChair.group.rotation.y = Math.sin(Date.now() * 0.001 * this.topChair.swingSpeed) * this.topChair.swingAmount;
      }
      
      // Bouncing Logo physics
      if (this.bouncingLogo) {
        // Apply gravity
        this.bouncingLogo.velocity.y -= 0.01;
        this.bouncingLogo.position.add(this.bouncingLogo.velocity);
        
        // Floor collision
        if (this.bouncingLogo.position.y < 0.1) {
          this.bouncingLogo.position.y = 0.1;
          this.bouncingLogo.velocity.y *= -0.8; // Bounce with energy loss
          this.bouncingLogo.velocity.x += (Math.random() - 0.5) * 0.02; // Random horizontal push
        }
        
        this.bouncingLogo.mesh.position.copy(this.bouncingLogo.position);
      }
    };
    animate();
  }

  handleResize() {
    const container = this.props.container || document.body;
    const width = container.clientWidth;
    const height = container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    if (this.composer) this.composer.setSize(width, height);
  }

  /**
   * Add click interaction to the computer screen
   */
  addScreenInteraction() {
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    this.renderer.domElement.addEventListener('click', (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, this.camera);
      const intersects = raycaster.intersectObject(this.computerScreen, true);
      if (intersects.length > 0) {
        if (!this.isAppLaunched) {
          this.moveToScreen();
        } else {
          this.exitApplication();
        }
      }
    });
  }

  /**
   * Disable orbit controls
   */
  disableControls() {
    if (this.controls) this.controls.enabled = false;
  }

  /**
   * Enable orbit controls
   */
  enableControls() {
    if (this.controls) this.controls.enabled = true;
  }

  /**
   * Move camera to view the computer
   */
  moveToComputer() {
    if (this.isTransitioning) return;
    this.disableControls();
    this.isTransitioning = true;
    this.animateCamera(
      this.props.cameraPositions.computer,
      new THREE.Vector3(0, 1.6, 0),
      this.transitionDuration,
      () => {
        this.isTransitioning = false;
        eventBus.emit('camera-at-computer');
      }
    );
  }

  /**
   * Move camera closer to the screen
   */
  moveToScreen() {
    if (this.isTransitioning) return;
    this.disableControls();
    this.isTransitioning = true;
    this.animateCamera(
      this.props.cameraPositions.screen,
      new THREE.Vector3(0, 1.6, 0),
      this.transitionDuration,
      () => {
        this.isTransitioning = false;
        this.launchApplication();
      }
    );
  }

  /**
   * Launch the OPERATOR application
   */
  launchApplication() {
    this.isAppLaunched = true;
    this.showLoadingAnimation && this.showLoadingAnimation();
    this.dispose();
    // Reveal the modern UI container
    const appContainer = document.querySelector('#app-container') || document.querySelector('#app-root');
    if (appContainer) appContainer.style.display = 'block';
    // Trigger UI initialization via eventBus
    eventBus.emit('initialize-application');
  }

  /**
   * Dispose of all resources, assets, videos, controls, and event listeners for maximum memory efficiency
   */
  dispose() {
    console.log('[RoomExperience] dispose() called: starting cleanup');
    // Stop animation loop
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      console.log('[RoomExperience] Animation loop stopped');
      this._animationFrameId = null;
    }
    // Dispose of videos and textures (screens, etc)
    const screens = [this.pcScreen, this.macScreen];
    screens.forEach(screen => {
      if (screen && typeof screen.dispose === 'function') {
        if (screen.video) {
          try {
            screen.video.pause();
            screen.video.removeAttribute('src'); // Prevents browser from re-requesting
            screen.video.load(); // Reset the video element
            if (screen.video.parentNode) {
              screen.video.parentNode.removeChild(screen.video);
              console.log('[RoomExperience] Video element removed from DOM');
            }
          } catch (e) {
            console.warn('[RoomExperience] Error cleaning up video element:', e);
          }
        }
        screen.dispose();
        console.log('[RoomExperience] Screen disposed:', screen);
      }
    });
    // Dispose of all scene meshes/materials/geometries
    if (this.scene) {
      let meshCount = 0;
      this.scene.traverse(obj => {
        // Dispose geometry
        if (obj.geometry) {
          obj.geometry.dispose && obj.geometry.dispose();
        }
        // Dispose material(s)
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose && m.dispose());
          } else {
            obj.material.dispose && obj.material.dispose();
          }
        }
        // Dispose textures
        if (obj.material && obj.material.map) {
          obj.material.map.dispose && obj.material.map.dispose();
        }
        if (obj.isMesh) meshCount++;
      });
      console.log(`[RoomExperience] Disposed scene meshes/materials/geometries (total meshes: ${meshCount})`);
    }
    // Dispose of renderer
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }
    
    // Clean up GUI elements
    if (this.gui) {
      this.gui.destroy();
    }
    
    // Remove toggle button and container
    if (this.toggleButton && this.toggleButton.parentNode) {
      this.toggleButton.parentNode.removeChild(this.toggleButton);
    }
    
    if (this.guiContainer && this.guiContainer.parentNode) {
      this.guiContainer.parentNode.removeChild(this.guiContainer);
    }
    
    // Dispose of controls
    if (this.controls && this.controls.dispose) {
      this.controls.dispose();
      this.controls = null;
      console.log('[RoomExperience] Controls disposed');
    }
    // Dispose of postprocessing composer
    if (this.composer && this.composer.dispose) {
      this.composer.dispose();
      this.composer = null;
      console.log('[RoomExperience] Composer disposed');
    }
    // Remove event listeners
    window.removeEventListener('resize', this.handleResize);
    console.log('[RoomExperience] Resize event listener removed');
    // Remove any launch/app buttons
    const launchBtn = document.getElementById('launch-btn');
    if (launchBtn && launchBtn.parentNode) {
      launchBtn.parentNode.removeChild(launchBtn);
      console.log('[RoomExperience] Launch button removed');
    }
    // Dispose of GUI (Tweakpane/lil-gui) if present
    if (this.gui) {
      if (typeof this.gui.dispose === 'function') {
        this.gui.dispose();
      }
      // Remove from DOM if present
      if (this.gui.domElement && this.gui.domElement.parentNode) {
        this.gui.domElement.parentNode.removeChild(this.gui.domElement);
      }
      this.gui = null;
      console.log('[RoomExperience] GUI disposed and removed from DOM');
    }
    // Null out references
    this.scene = null;
    this.camera = null;
    this.roomContainer = null;
    this.accentLights = null;
    this.interactiveElements = null;
    this.bakedMaterial = null;
    this.googleLeds = null;
    this.topChair = null;
    this.coffeeSteam = null;
    this.bouncingLogo = null;
    this.pcScreen = null;
    this.macScreen = null;
    // Defensive: remove all remaining properties that are objects
    Object.keys(this).forEach(key => {
      if (typeof this[key] === 'object' && this[key] !== null) {
        this[key] = null;
      }
    });
    console.log('[RoomExperience] dispose() finished: all resources released');
  }

  /**
   * Exit the OPERATOR application and return to room view
   */
  exitApplication() {
    this.isAppLaunched = false;
    this.fadeIn && this.fadeIn();
    this.moveToInitialPosition();
  }

  /**
   * Move camera back to its initial position
   */
  moveToInitialPosition() {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    this.animateCamera(
      this.props.cameraPositions.initial,
      new THREE.Vector3(0, 1.6, 0),
      this.transitionDuration,
      () => {
        this.isTransitioning = false;
        this.enableControls();
      }
    );
    const el = this.renderer.domElement;
    el.style.transition = 'opacity 0.5s';
    el.style.opacity = '0';
    el.addEventListener('transitionend', () => callback && callback(), { once: true });
  }

  /**
   * Fade in the 3D view
   */
  fadeIn(callback) {
    const el = this.renderer.domElement;
    el.style.transition = 'opacity 0.5s';
    el.style.opacity = '1';
    el.addEventListener('transitionend', () => callback && callback(), { once: true });
  }

  playIntro() {
    this.controls.enabled = false;
    const tl = gsap.timeline({
      onComplete: () => {
        this.controls.enabled = true;
        this.showLaunchButton();
      }
    });
    const compMesh = this.scene.getObjectByName('pcScreenMesh');
    const compPos = compMesh ? compMesh.position.clone() : new THREE.Vector3();
    tl.to(this.camera.position, { x: compPos.x+2, y: compPos.y+2, z: compPos.z+5, duration: 2 });
    tl.to(this.controls.target, { x: compPos.x, y: compPos.y, z: compPos.z, duration: 2 }, '<');
  }

  showLaunchButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'launch-btn';
    btn.innerText = 'Launch O.P.E.R.A.T.O.R';
    btn.className = 'cyberpunk-launch-btn';
    document.body.appendChild(btn);
    btn.addEventListener('click', () => eventBus.emit('launch-application'));
  }

  // Generic camera animation utility for all transitions
  animateCamera(targetPosition, lookAtTarget, duration = 3000, onComplete = null) {
    const start = this.camera.position.clone();
    const end = targetPosition ? targetPosition.clone() : this.camera.position.clone();
    const lookAt = lookAtTarget ? lookAtTarget.clone() : new THREE.Vector3(0, 1.6, 0);
    const startTime = performance.now();
    if (this.controls) this.controls.enabled = false;
    const animate = () => {
      const now = performance.now();
      const t = Math.min((now - startTime) / duration, 1);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const currentPos = new THREE.Vector3().lerpVectors(start, end, ease);
      this.camera.position.copy(currentPos);
      this.camera.lookAt(lookAt);
      this.camera.updateProjectionMatrix();
      if (this.controls) {
        this.controls.target.copy(lookAt);
        this.controls.update();
      }
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        if (this.controls) {
          this.controls.enabled = true;
          this.controls.target.copy(lookAt);
          this.controls.update();
        }
        if (onComplete) onComplete();
      }
    };
    animate();
  }

  // World-class cinematic intro animation with improved easing and angles
  animateIntroCamera() {
    // GSAP-based smooth intro pan
    this.controls.enabled = false;
    const lookAt = new THREE.Vector3(1.4, 3, -1.1);
    // Set camera to match controls' pan start position and target
    if (this.controls) {
      this.camera.position.copy(this.controls.object.position);
      this.camera.lookAt(this.controls.target);
    } else {
      this.camera.position.set(10, 3, 7);
      this.camera.lookAt(1, 2, 0);
    }
    this.camera.updateProjectionMatrix();
    // Cinematic move: further from desk and turned left (z: 5.5, x: -4.5), keep height
    gsap.to(this.camera.position, {
      x: -5.5, // more negative = more to the left
      y: 3,  // unchanged height
      z: 6,  // further away from desk
      duration: 3.5,
      ease: 'power3.inOut',
      duration: 3.5,
      ease: 'power3.inOut',
      onUpdate: () => {
        this.camera.lookAt(lookAt);
        this.camera.updateProjectionMatrix();
        if (this.controls) {
          this.controls.target.copy(lookAt);
          this.controls.update();
        }
      },
      onComplete: () => {
        if (this.controls) this.controls.enabled = true;
        this.showLaunchButton?.();
      }
    });
  }

  createVideoTexture(videoPath) {
    const video = document.createElement('video');
    video.src = videoPath;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.autoplay = true;
    video.play().catch(e => console.error('Video play failed:', e));
    
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace; // Updated from encoding = sRGBEncoding
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    return texture;
  }
}

// Helper to create and initialize
export async function createRoomExperience(props = {}) {
  const exp = new RoomExperience(props);
  await exp.initialize();
  return exp;
}
