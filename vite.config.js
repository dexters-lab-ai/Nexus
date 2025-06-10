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

  return {
    root: __dirname,
    publicDir: 'public',
    base: '/',
    logLevel: 'warn', // Only show warnings and errors

    // Development server configuration
    server: {
      // Always bind to all network interfaces in Docker
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      // Disable auto-opening browser in Docker
      open: !isDocker,
      // Enable CORS for development
      // CORS configuration
      cors: {
        origin: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        preflightContinue: false,
        optionsSuccessStatus: 204,
        credentials: true
      },
      // File system watcher configuration
      watch: {
        // Required for Docker on Windows
        usePolling: true,
        // Ignore common directories
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/dist/**',
          '**/build/**',
          '**/nexus_run/**',
          '**/midscene_run/**'
        ]
      },
      // Configure sourcemap ignore list
      sourcemapIgnoreList: () => true,
      // File system access configuration
      fs: {
        strict: false,
        allow: [
          // Allow serving files from these directories
          process.cwd(),
          path.join(process.cwd(), 'src'),
          path.join(process.cwd(), 'public'),
          path.join(process.cwd(), 'node_modules'),
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
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      },
      proxy: [
        // WebSocket proxy - must come first
        {
          target: isDocker ? 'http://localhost:3420' : apiUrl,
          ws: true,
          changeOrigin: true,
          secure: false,
          logLevel: 'warn',
          pathRewrite: { '^/ws': '' },
          router: () => isDocker ? 'ws://localhost:3420' : wsUrl
        },
        // API proxy
        {
          target: isDocker ? 'http://localhost:3420' : apiUrl,
          changeOrigin: true,
          secure: false,
          logLevel: 'warn',
          pathRewrite: { '^/api': '' },
        },
        // Static files and uploads
        {
          target: isDocker ? 'http://localhost:3420' : apiUrl,
          changeOrigin: true,
          secure: false,
          logLevel: 'warn',
          pathRewrite: { '^/uploads': '/uploads' },
        },
        // Nexus run files
        {
          target: isDocker ? 'http://localhost:3420' : apiUrl,
          changeOrigin: true,
          secure: false,
          logLevel: 'warn',
          pathRewrite: { '^/nexus_run': '/nexus_run' },
        },
        // External reports
        {
          target: isDocker ? 'http://localhost:3420' : apiUrl,
          changeOrigin: true,
          secure: false,
          logLevel: 'warn',
          pathRewrite: { '^/external-report': '/external-report' },
        }
      ],
      hmr: {
        protocol: isDev ? 'ws' : 'wss',
        host: '0.0.0.0',
        port: 24678,
        // For Docker, we need to tell the client to connect to the host machine
        clientPort: isDocker ? 24678 : 24678,
        // Disable overlay in Docker to prevent connection issues
        overlay: !isDocker,
        // This is important for Docker networking
        path: '/ws',
        // Disable host check for Docker
        disableHostCheck: true
      }
    },

    // Build configuration
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: isDev,
      minify: isDev ? false : 'terser',
      cssCodeSplit: true,
      cssTarget: 'es2015',
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        output: {
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const ext = assetInfo.name.split('.').pop().toLowerCase();
            const name = assetInfo.name.split('/').pop();
            
            // Handle CSS files from src/styles/components
            if (ext === 'css') {
              if (assetInfo.name.includes('src/styles/components/')) {
                return `css/${name}`;
              }
              return 'assets/css/[name]-[hash][extname]';
            }
            
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