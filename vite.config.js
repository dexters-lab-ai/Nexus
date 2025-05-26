import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

// Configure environment for production build
process.env.NODE_ENV = 'production';

// Configure for better compatibility
process.env.VITE_APP_BUILD_AT = new Date().toISOString();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({

  plugins: [react()],
  css: {
    devSourcemap: true,
    modules: false,
    preprocessorOptions: {
      scss: {
        additionalData: `@import "@/styles/theme.css";`
      }
    }
  },
  // Support .js/.jsx files containing JSX
  resolve: { 
    extensions: ['.js', '.jsx', 'ts', 'tsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@fortawesome/fontawesome-free/webfonts': path.resolve(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts')
    }
  },
  root: __dirname,  // Project root (not /public)
  publicDir: 'public',  // Static files (old interface)
  server: {
    port: 3000,
    strictPort: true,
    // Show a custom error when a proxy request fails
    proxy: {
      '/external-report': {
        target: 'http://localhost:3420',
        changeOrigin: true
      },
      '/raw-report': {
        target: 'http://localhost:3420',
        changeOrigin: true
      },
      '/nexus_run': {
        target: 'http://localhost:3420',
        changeOrigin: true
      },
      '/midscene_run': {
        target: 'http://localhost:3420',
        changeOrigin: true
      },
      '/direct-report': {
        target: 'http://localhost:3420',
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:3420',
        changeOrigin: true,
        ws: true,
        configure: (proxy, options) => {
          // Handle proxy errors gracefully
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
            if (!res.headersSent) {
              res.writeHead(500, {
                'Content-Type': 'application/json'
              });
              res.end(JSON.stringify({ error: 'Proxy error', message: 'The API server is not ready yet. Please wait...' }));
            }
          });
        }
      },
      '/settings': {
        target: 'http://localhost:3420',
        changeOrigin: true
      },
      '/bruno_demo_temp': {
        target: 'http://localhost:3420',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3420',
        ws: true,
        changeOrigin: true
      },
      '/auth': {
        target: 'http://localhost:3420',
        changeOrigin: true,
        secure: false
      }
    },
    hmr: {
      overlay: false
    },
    watch: {
      usePolling: true,
      interval: 100
    },
    mimeTypes: {
      'application/javascript': ['jsx', 'tsx']
    }
  },
  preview: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3420',
        changeOrigin: true,
        ws: true
      },
      '/settings': {
        target: 'http://localhost:3420',
        changeOrigin: true
      },
      '/bruno_demo_temp': {
        target: 'http://localhost:3420',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://localhost:3420',
        changeOrigin: true,
        ws: true
      }
    }
  },
  clearScreen: false,
  cacheDir: '.vite-cache',
  optimizeDeps: {
    include: ['three/examples/jsm/loaders/DRACOLoader'],
    exclude: ['three/examples/js/libs/draco/draco_decoder.js']
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    minify: 'terser',
    ssr: false,
    rollupOptions: {
      // Ensure we don't try to use platform-specific binaries
      external: [
        /^@rollup\/.*-x64-gnu$/,
        /^@rollup\/.*-x64-musl$/,
        /^@rollup\/.*-arm64/,
        /^@rollup\/.*-arm-gnueabihf$/,
        /^@rollup\/.*-linux-x64/,
        /^@rollup\/.*-win32-x64/,
        /^@rollup\/.*-darwin-x64/,
        /^@esbuild\/.*/,
        'fsevents'
      ],
      plugins: []
    },
    commonjsOptions: {
      include: /node_modules/,
      transformMixedEsModules: true
    },
    rollupOptions: {
      external: ['@rollup/rollup-linux-x64-gnu'],
      plugins: []
    },
    rollupOptions: {
      input: {
        modern: path.resolve(__dirname, 'src/modern.html')  // New entry
      },
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.includes('Room') || 
              assetInfo.name.includes('3d') ||
              assetInfo.name.match(/\.(glb|gltf)$/)) {
            return 'assets/[name].[hash][extname]';
          }
          return 'assets/[name][extname]';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js'
      }
    }
  }
})
