import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { visualizer } from 'rollup-plugin-visualizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  const isDev = mode === 'development';
  const isDocker = process.env.DOCKER === 'true';
  const host = isDocker ? '0.0.0.0' : 'localhost';
  const hmrHost = isDev ? 'localhost' : process.env.APP_DOMAIN || 'localhost';

  console.log('Vite Env:', {
    mode,
    isDocker,
    VITE_API_URL: env.VITE_API_URL,
    VITE_WS_URL: env.VITE_WS_URL,
    FRONTEND_URL: env.FRONTEND_URL
  });

  process.env.NODE_ENV = mode;

  return {
    root: __dirname,
    publicDir: 'public',
    base: '/',
    logLevel: 'info',

    // Development server configuration
    server: {
      host,
      port: 3000,
      strictPort: true,
      open: !isDocker, // Don't open browser in Docker
      fs: {
        strict: true,
        allow: [
          __dirname,
          path.join(__dirname, 'src'),
          path.join(__dirname, 'public'),
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
          target: env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true,
          secure: false,
          ws: true
        },
        '/ws': {
          target: env.VITE_WS_URL || 'ws://localhost:3420',
          ws: true,
          changeOrigin: true,
          secure: false
        },
        '/uploads': {
          target: env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true
        },
        '/nexus_run': {
          target: env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true,
          rewrite: (path) => path
        },
        '/external-report': {
          target: env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true,
          rewrite: (path) => path
        }
      },
      hmr: {
        protocol: isDev ? 'ws' : 'wss',
        host: hmrHost,
        port: isDev ? 24678 : 443,
        clientPort: isDev ? 24678 : 443
      }
    },

    // Build configuration
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: isDev,
      minify: !isDev ? 'terser' : false,
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
      'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'http://localhost:3420'),
      'process.env.VITE_WS_URL': JSON.stringify(env.VITE_WS_URL || 'ws://localhost:3420')
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