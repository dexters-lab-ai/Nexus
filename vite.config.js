import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { visualizer } from 'rollup-plugin-visualizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // Load environment variables with proper prefix filtering
  const env = {
    ...process.env, // Include system environment variables
    ...loadEnv(mode, process.cwd(), '') // Load .env files with VITE_* prefix
  };

  const isDev = mode === 'development';
  const isDocker = env.DOCKER === 'true';
  const host = '0.0.0.0';
  const hmrHost = isDocker ? '0.0.0.0' : 'localhost';
  
  // In Docker, the backend is on the same container, so use localhost
  // For development outside Docker, use localhost
  const apiUrl = isDocker ? 'http://localhost:3420' : (env.VITE_API_URL || (isDev ? 'http://localhost:3420' : ''));
  const wsUrl = isDocker ? 'ws://localhost:3420' : (env.VITE_WS_URL || (isDev ? 'ws://localhost:3420' : `wss://${env.APP_DOMAIN}`));

  // Log environment for debugging (only in development or when explicitly enabled)
  if (isDev || env.DEBUG === 'true') {
    console.log('Vite Environment:', {
      mode,
      isDocker,
      isDev,
      host,
      hmrHost,
      VITE_API_URL: apiUrl,
      VITE_WS_URL: wsUrl,
      FRONTEND_URL: env.FRONTEND_URL,
      NODE_ENV: env.NODE_ENV
    });
  }

  process.env.NODE_ENV = mode;

  // Custom logger to filter out noisy logs
  const customLogger = {
    ...console,
    info: (msg, ...args) => {
      // Filter out specific noisy logs
      if (typeof msg === 'string' && (
        // Vite internal logs
        msg.includes('vite:') ||
        // WebSocket connection logs
        msg.includes('ws:') ||
        msg.includes('WebSocket connection') ||
        // File watching logs
        msg.includes('files in') ||
        // HMR logs
        msg.includes('hmr:') ||
        // Cache logs
        msg.includes('cache:') ||
        // Build logs
        msg.includes('built in')
      )) {
        return;
      }
      console.info(msg, ...args);
    },
    // Also filter debug logs
    debug: () => {}, // Completely disable debug logs
    // Keep error and warn logs
    error: console.error,
    warn: console.warn,
  };

  return {
    root: __dirname,
    publicDir: 'public',
    base: '/',
    logLevel: 'warn', // Reduce default log level
    customLogger,

    // Development server configuration
    server: {
      host,
      port: 3000,
      strictPort: true,
      // Disable server info output
      open: false,
      // File system watcher configuration
      watch: {
        usePolling: true,
        // Ignore common directories
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/dist/**',
          '**/build/**'
        ]
      },
      // Don't open browser in Docker
      open: !isDocker,
      // Enable CORS for development
      cors: true,
      // Disable pre-bundling logs
      force: true,
      // Disable sourcemap warnings
      sourcemapIgnoreList: () => true,
      // File system configuration
      fs: {
        strict: false,
        allow: [
          __dirname,
          path.join(__dirname, 'src'),
          path.join(__dirname, 'public'),
          path.join(__dirname, 'node_modules'),
          path.join(__dirname, 'bruno_demo_temp')
        ],
        deny: [
          '**/node_modules/.vite',
          '**/.git',
          '**/nexus_run/report/**',
          '**/midscene_run/report/**'
        ]
      },
      cors: {
        origin: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        preflightContinue: false,
        optionsSuccessStatus: 204,
        credentials: true
      },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      },
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: !isDev,
          ws: true
        },
        '/ws': {
          target: wsUrl.replace('wss://', 'https://').replace('ws://', 'http://'),
          ws: true,
          changeOrigin: true,
          secure: !isDev
        },
        '/uploads': {
          target: apiUrl,
          changeOrigin: true,
          secure: !isDev
        },
        '/nexus_run': {
          target: apiUrl,
          changeOrigin: true,
          secure: !isDev,
          rewrite: (path) => path
        },
        '/external-report': {
          target: apiUrl,
          changeOrigin: true,
          secure: !isDev,
          rewrite: (path) => path
        }
      },
      hmr: {
        protocol: isDev ? 'ws' : 'wss',
        host: hmrHost,
        port: 24678,
        clientPort: 24678,
        overlay: !isDocker // Disable overlay in Docker to prevent connection issues
      }
    },

    // Build configuration
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: isDev,
      minify: !isDev ? 'terser' : false,
      // Don't write files to disk in development
      write: !isDev,
      target: 'esnext',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        output: {
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const ext = assetInfo.name.split('.').pop().toLowerCase();
            if (ext === 'css') return 'assets/css/[name]-[hash][extname]';
            if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) return 'assets/fonts/[name]-[hash][extname]';
            if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'assets/images/[name]-[hash][extname]';
            if (['glb', 'gltf', 'hdr', 'bin', 'wasm'].includes(ext)) return 'assets/models/[name]-[hash][extname]';
            if (['mp4', 'webm', 'ogg'].includes(ext)) return 'assets/media/[name]-[hash][extname]';
            return 'assets/[name]-[hash][extname]';
          },
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('three') || id.includes('@react-three')) return 'vendor_three';
              if (id.includes('@mantine')) return 'vendor_mantine';
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) return 'vendor_react';
              return 'vendor';
            }
          }
        }
      }
    },

    // Dependency optimization
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@mantine/core',
        '@mantine/hooks',
        '@mantine/notifications',
        '@floating-ui/react',
        '@floating-ui/react/dom',
        'lil-gui'
      ],
      exclude: ['@babel/runtime'],
      esbuildOptions: {
        target: 'es2020'
      }
    },

    // Path resolution
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@store': path.resolve(__dirname, 'src/store'),
        '/models': path.resolve(__dirname, 'public/models'),
        '/assets': path.resolve(__dirname, 'public/assets'),
        '/draco': path.resolve(__dirname, 'public/draco'),
        '@floating-ui/react': path.resolve(__dirname, 'node_modules/@floating-ui/react'),
        '@fortawesome/fontawesome-free/webfonts': path.resolve(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts'),
        '@floating-ui/react-dom': path.resolve(__dirname, 'node_modules/@floating-ui/react-dom')
      },
      dedupe: ['@mantine/core', '@mantine/hooks', '@mantine/notifications']
    },

    // Global constants
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.VITE_API_URL': JSON.stringify(apiUrl),
      'process.env.VITE_WS_URL': JSON.stringify(wsUrl),
      'process.env.FRONTEND_URL': JSON.stringify(env.FRONTEND_URL || ''),
      'process.env.APP_DOMAIN': JSON.stringify(env.APP_DOMAIN || '')
    },

    // Plugins
    plugins: [
      react({
        fastRefresh: true
      }),
      visualizer({
        open: false, // Changed to false to prevent auto-opening in Docker
        gzipSize: true,
        brotliSize: true
      })
    ]
  };
});