import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // Set NODE_ENV based on mode
  process.env.NODE_ENV = mode;
  
  return {
    mode,
    root: __dirname,
    publicDir: 'public',
    plugins: [react()],
    logLevel: 'warn',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 1000, // Increase chunk size warning limit
      rollupOptions: {
        output: {
          manualChunks: {
            // Split vendor chunks for better caching
            react: ['react', 'react-dom', 'react-router-dom'],
            // Group Mantine components
            mantine: ['@mantine/core', '@mantine/hooks', '@mantine/notifications'],
            // Group Three.js related packages
            three: ['three', '@react-three/fiber', '@react-three/drei'],
            // Vendor chunks
            vendor: ['axios', 'socket.io-client']
          },
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const ext = assetInfo.name.split('.').pop();
            
            if (ext === 'css') {
              return 'assets/css/[name]-[hash][extname]';
            }
            
            if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) {
              return 'assets/fonts/[name]-[hash][extname]';
            }
            
            if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
              return 'assets/images/[name]-[hash][extname]';
            }
            
            return 'assets/[name]-[hash][extname]';
          }
        }
      }
    },
    
    css: {
      devSourcemap: mode !== 'production',
      modules: false,
      preprocessorOptions: {
        scss: {
          additionalData: `@import "@/styles/theme.css";`
        }
      },
      // Suppress CSS syntax warnings
      postcss: {
        plugins: [
          {
            postcssPlugin: 'internal:charset-removal',
            AtRule: {
              charset: (atRule) => {
                if (atRule.name === 'charset') {
                  atRule.remove();
                }
              }
            }
          }
        ]
      }
    },
    
    resolve: { 
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@utils': path.resolve(__dirname, 'src/utils'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@store': path.resolve(__dirname, 'src/store'),
        '@fortawesome/fontawesome-free/webfonts': path.resolve(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts')
      }
    },
    
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: process.env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true,
          secure: false,
          ws: true
        },
        '/ws': {
          target: process.env.VITE_WS_URL || 'ws://localhost:3420',
          ws: true,
          changeOrigin: true,
          secure: false
        },
        '/settings': {
          target: process.env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true
        },
        '/auth': {
          target: process.env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true
        },
        '/uploads': {
          target: process.env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true
        }
      }
    },
    
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3420'),
      'process.env.VITE_WS_URL': JSON.stringify(process.env.VITE_WS_URL || 'ws://localhost:3420')
    },
    
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        '@mantine/core',
        '@mantine/hooks',
        '@mantine/notifications'
      ],
      exclude: ['@babel/runtime']
    }
  };
});
