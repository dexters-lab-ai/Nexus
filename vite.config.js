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
    publicDir: 'public',
    logLevel: 'info',
    plugins: [
      react(),
      visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      })
    ],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: mode !== 'production',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: false, // Keep console logs in production
        },
      },
      // Show build info
      reportCompressedSize: true,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            mantine: ['@mantine/core', '@mantine/hooks', '@mantine/notifications'],
            three: ['three', '@react-three/fiber', '@react-three/drei'],
            vendor: ['axios', 'socket.io-client']
          },
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const ext = assetInfo.name.split('.').pop();
            if (ext === 'css') return 'assets/css/[name]-[hash][extname]';
            if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) return 'assets/fonts/[name]-[hash][extname]';
            if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'assets/images/[name]-[hash][extname]';
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
        '@fortawesome/fontawesome-free/webfonts': path.resolve(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts'),
        // Ensure Mantine uses the correct Floating UI version
        '@floating-ui/react': path.resolve(__dirname, 'node_modules/@floating-ui/react'),
        '@floating-ui/react-dom': path.resolve(__dirname, 'node_modules/@floating-ui/react-dom')
      },
      dedupe: ['@mantine/core', '@mantine/hooks', '@mantine/notifications', '@floating-ui/react', '@floating-ui/react-dom']
    },
    server: {
      port: 3000,
      strictPort: true,
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
        '@mantine/notifications',
        '@floating-ui/react',
        '@floating-ui/react/dom'
      ],
      exclude: ['@babel/runtime']
    }
  };
});
