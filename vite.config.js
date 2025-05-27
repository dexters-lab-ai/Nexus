import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

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
      '^/api/.*': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true,
        secure: process.env.NODE_ENV === 'production',
        ws: true,
        headers: {
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-For': '::1',
          'X-Forwarded-Port': '443'
        }
      },
      '/external-report': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true
      },
      '/raw-report': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true
      },
      '/nexus_run': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true
      },
      '/midscene_run': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true
      },
      '/direct-report': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true
      },
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true,
        ws: true,
        configure: (proxy, options) => {
          // Handle proxy errors gracefully
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
            if (!res.headersSent && res.writeHead) {
              res.writeHead(500, {
                'Content-Type': 'application/json'
              });
              res.end(JSON.stringify({ error: 'Proxy error', message: 'The API server is not ready yet. Please wait...' }));
            }
          });
        }
      },
      '/settings': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true
      },
      '/bruno_demo_temp': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true
      },
      '/ws': {
        target: process.env.VITE_WS_URL || 'ws://localhost:3420',
        ws: true,
        changeOrigin: true
      },
      '/auth': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true,
        secure: process.env.NODE_ENV === 'production'
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
    },
    base: process.env.NODE_ENV === 'production' ? '/' : '/'
  },
  preview: {
    // Frontend preview server port
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true,
        ws: true
      },
      '/settings': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true
      },
      '/bruno_demo_temp': {
        target: process.env.VITE_API_URL || 'http://localhost:3420',
        changeOrigin: true
      },
      '/ws': {
        target: process.env.VITE_WS_URL || 'ws://localhost:3420',
        changeOrigin: true,
        ws: true
      }
    }
  },
  clearScreen: false,
  cacheDir: '.vite-cache',
  build: {
    cssCodeSplit: true,
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development', // Only generate sourcemaps in development
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production', // Remove console.log in production
      },
    },
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          vendor: ['axios', 'socket.io-client'],
          ui: ['@mantine/core', '@mantine/hooks', '@mantine/notifications']
        },
        entryFileNames: 'assets/js/[name]-[hash].js',
        chunkFileNames: 'assets/js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1].toLowerCase();
          
          // Handle different asset types
          if (/\.(png|jpe?g|gif|svg|webp|avif)$/i.test(assetInfo.name)) {
            return 'assets/images/[name]-[hash][extname]';
          }
          if (/\.(woff2?|eot|ttf|otf)$/i.test(assetInfo.name)) {
            return 'assets/fonts/[name]-[hash][extname]';
          }
          if (/\.css$/i.test(assetInfo.name)) {
            return 'assets/css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        }
      }
    }
  },
  define: {
    'process.env': {
      VITE_API_URL: JSON.stringify(process.env.VITE_API_URL || ''),
      VITE_WS_URL: JSON.stringify(process.env.VITE_WS_URL || ''),
      NODE_ENV: JSON.stringify(process.env.NODE_ENV || 'development')
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
    exclude: ['@babel/runtime']
  }
})
