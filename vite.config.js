import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { visualizer } from 'rollup-plugin-visualizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // Load env files based on mode
  const env = loadEnv(mode, process.cwd(), '');
  
  // Debug env loading
  console.log('Vite Env:', {
    mode,
    VITE_API_URL: env.VITE_API_URL,
    VITE_WS_URL: env.VITE_WS_URL,
    FRONTEND_URL: env.FRONTEND_URL
  });

  process.env.NODE_ENV = mode;
  
  return {
    mode,
    root: __dirname,
    // Serve static files from public directory
    publicDir: 'public',
    // Base public path when served in production
    base: '/',
    logLevel: 'info',
    // Configure how static assets are handled
    assetsInclude: ['**/*.glb', '**/*.hdr', '**/*.wasm', '**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg', '**/*.mp4'],
    // Server configuration
    server: {
      port: 3000,
      strictPort: true,
      cors: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin'
      },
      // Enable HMR with custom host
      hmr: {
        host: 'localhost',
        port: 24678
      },
      // Proxy configuration
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
        '/settings': { 
          target: env.VITE_API_URL || 'http://localhost:3420', 
          changeOrigin: true 
        },
        '/auth': { 
          target: env.VITE_API_URL || 'http://localhost:3420', 
          changeOrigin: true 
        },
        '/uploads': { 
          target: env.VITE_API_URL || 'http://localhost:3420', 
          changeOrigin: true 
        },
        '/external-report': {
          target: 'http://localhost:3420',
          changeOrigin: true,
          rewrite: (path) => path, // No rewriting needed
        },
        '/nexus_run': {
          target: 'http://localhost:3420',
          changeOrigin: true,
          rewrite: (path) => path, // No rewriting needed
        },
      }
    },
    // Build configuration for production
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      target: 'es2020',
      sourcemap: mode !== 'production',
      minify: mode === 'production' ? 'terser' : false,
      terserOptions: {
        compress: {
          drop_console: mode === 'production', // Remove console logs in production
          drop_debugger: true,
        },
      },
      // Show build info
      reportCompressedSize: true,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (id.includes('node_modules')) {
              if (id.includes('three') || id.includes('@react-three')) {
                return 'vendor_three';
              }
              if (id.includes('@mantine')) {
                return 'vendor_mantine';
              }
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
                return 'vendor_react';
              }
              return 'vendor';
            }
          },
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
          }
        }
      },
      // Copy public directory to dist
      copyPublicDir: true
    },
    optimizeDeps: {
      include: [
        'lil-gui',
        'react',
        'react-dom',
        'react-router-dom',
        '@mantine/core',
        '@mantine/hooks',
        '@mantine/notifications',
        '@floating-ui/react',
        '@floating-ui/react/dom'
      ],
      exclude: ['@babel/runtime'],
      esbuildOptions: {
        target: 'es2020',
      },
    },
    plugins: [
      react(),
      visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      })
    ],
    css: {
      devSourcemap: mode !== 'production',
      modules: false,
      preprocessorOptions: {
        scss: {
          additionalData: `@import "@/styles/theme.css";`
        }
      },
      postcss: {
        plugins: [
          {
            postcssPlugin: 'internal:charset-removal',
            AtRule: {
              charset: (atRule) => {
                if (atRule.name === 'charset') atRule.remove();
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
        '@components': path.resolve(__dirname, 'src/components'),
        '@store': path.resolve(__dirname, 'src/store'),
        // Static assets
        '/models': path.resolve(__dirname, 'public/models'),
        '/assets': path.resolve(__dirname, 'public/assets'),
        '/draco': path.resolve(__dirname, 'public/draco'),
        // Ensure Mantine uses the correct Floating UI version
        '@floating-ui/react': path.resolve(__dirname, 'node_modules/@floating-ui/react'),
        '@fortawesome/fontawesome-free/webfonts': path.resolve(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts'),
        '@floating-ui/react-dom': path.resolve(__dirname, 'node_modules/@floating-ui/react-dom')
      },
      dedupe: ['@mantine/core', '@mantine/hooks', '@mantine/notifications', '@floating-ui/react', '@floating-ui/react-dom']
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || 'http://localhost:3420'),
      'process.env.VITE_WS_URL': JSON.stringify(process.env.VITE_WS_URL || 'ws://localhost:3420')
    },
    // OptimizeDeps configuration is now at the top of the config
  };
});
