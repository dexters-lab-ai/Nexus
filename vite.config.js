// vite.config.js
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { visualizer } from 'rollup-plugin-visualizer';
import { mkdirSync, writeFileSync } from 'fs';

// Plugin to inject environment variables into HTML
function injectEnvPlugin() {
  return {
    name: 'inject-env',
    transformIndexHtml(html, { env = {} }) {
      // Get all environment variables that start with VITE_ or are specifically needed
      const envVars = {};
      for (const [key, value] of Object.entries(env)) {
        if (key.startsWith('VITE_') || ['MODE', 'PROD', 'DEV'].includes(key)) {
          envVars[key] = value;
        }
      }

      // Inject environment variables as a script tag
      const envScript = `
        <script>
          // Injected environment variables
          window.ENV = ${JSON.stringify(envVars, null, 2)};
          
          // Debug logging
          console.log('[ENV] Injected environment variables:', window.ENV);
        </script>
      `;
      
      // Inject before the closing head tag
      if (html.includes('</head>')) {
        return html.replace('</head>', `${envScript}\n</head>`);
      }
      
      // Fallback: inject at the end of the body if no head tag found
      console.warn('No </head> tag found in HTML, injecting at end of body');
      return html.replace('</body>', `${envScript}\n</body>`);
    }
  };
}

// Plugin to copy auth and events utilities to assets
function copyUtilsPlugin() {
  return {
    name: 'copy-utils',
    buildStart() {
      // Ensure assets directory exists
      const assetsDir = path.resolve(__dirname, 'public/assets/js');
      mkdirSync(assetsDir, { recursive: true });
      
      // Copy auth.js
      const authContent = `
        // Simple auth state management
        export const AUTH_TOKEN_KEY = 'authToken';
        export const USER_ID_KEY = 'userId';
        
        export function setAuthState(userId, token) {
          if (userId && token) {
            localStorage.setItem(USER_ID_KEY, userId);
            localStorage.setItem(AUTH_TOKEN_KEY, token);
            return true;
          }
          return false;
        }
        
        export function clearAuthState() {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(USER_ID_KEY);
        }
        
        export function isAuthenticated() {
          return !!localStorage.getItem(AUTH_TOKEN_KEY);
        }
      `;
      
      // Write auth.js
      writeFileSync(
        path.join(assetsDir, 'auth.js'),
        authContent.trim()
      );
      
      // Copy events.js
      const eventsContent = `
        // Simple event bus
        const events = new Map();
        
        export const eventBus = {
          on(event, callback) {
            if (!events.has(event)) {
              events.set(event, new Set());
            }
            events.get(event).add(callback);
            return () => this.off(event, callback);
          },
          
          off(event, callback) {
            if (!events.has(event)) return;
            events.get(event).delete(callback);
          },
          
          emit(event, data) {
            if (!events.has(event)) return;
            for (const callback of events.get(event)) {
              try {
                callback(data);
              } catch (e) {
                console.error('Error in event handler:', e);
              }
            }
          }
        };
      `;
      
      // Write events.js
      writeFileSync(
        path.join(assetsDir, 'events.js'),
        eventsContent.trim()
      );
    }
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = {
    ...process.env,
    ...loadEnv(mode, process.cwd(), '')
  };
  
  const isDev = mode === 'development';
  const isDocker = env.DOCKER === 'true';
  const isProduction = mode === 'production';

  // Network configuration
  const host = '0.0.0.0';
  const hmrHost = 'localhost';
  const protocol = isProduction ? 'https' : 'http';
  const wsProtocol = isProduction ? 'wss' : 'ws';

  // Base URL configuration
  const appDomain = env.VITE_APP_DOMAIN || 'localhost';
  const port = 3000;

  // API and WebSocket URLs
  const apiUrl = env.VITE_API_URL || (isDev ? 'http://localhost:3420' : `${protocol}://${appDomain}`);
  const wsUrl = env.VITE_WS_URL || (isDev ? 'ws://localhost:3420' : `${wsProtocol}://${appDomain}/ws`);
  
  // Define global constants for the client
  const define = {
    'process.env.NODE_ENV': JSON.stringify(mode),
    'process.env.VITE_API_URL': JSON.stringify(apiUrl),
    'process.env.VITE_WS_URL': JSON.stringify(wsUrl),
    'process.env.FRONTEND_URL': JSON.stringify(env.FRONTEND_URL || ''),
    'process.env.APP_DOMAIN': JSON.stringify(env.APP_DOMAIN || ''),
  };

  return {
    plugins: [
      react(),
      injectEnvPlugin(),
      copyUtilsPlugin(),
      visualizer({
        open: isDev,
        gzipSize: true,
        brotliSize: true,
      }),
      {
        name: 'configure-server',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
            res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
            next();
          });
        }
      }
    ],
    
    define,
    
    server: {
      host: true,
      port: 3000,
      strictPort: true,
      hmr: {
        host: hmrHost,
        protocol: wsProtocol,
        port: 3000,
      },
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
    
    preview: {
      port: 3000,
      strictPort: true,
    },
    
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: isDev ? 'inline' : false,
      minify: isDev ? false : 'esbuild',
      target: 'esnext',
      cssCodeSplit: true,
      
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        output: {
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const name = assetInfo.name || '';
            const ext = name.split('.').pop() || '';
            
            // Handle CSS files - ensure consistent paths for components
            if (ext === 'css') {
              if (name.includes('src/styles/components/')) {
                return 'css/components/[name][extname]';
              } else if (name.includes('src/styles/')) {
                return 'css/[name][extname]';
              }
            }
            
            // Other assets
            return 'assets/[name]-[hash][extname]';
          }
        },
      },
    },
    
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json', '.css'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@components': path.resolve(__dirname, 'src/components'),
        '@store': path.resolve(__dirname, 'src/store'),
        '/models': path.resolve(__dirname, 'public/models'),
        '/assets': path.resolve(__dirname, 'public/assets'),
        '/draco': path.resolve(__dirname, 'public/draco'),
        '@styles': path.resolve(__dirname, 'src/styles'),
        '@styles/components': path.resolve(__dirname, 'src/styles/components'),
      },
    },
    
    optimizeDeps: {
      include: [
        'react', 'react-dom', 'react-router-dom',
        'three', '@react-three/fiber', '@react-three/drei',
        '@mantine/core', '@mantine/hooks', '@mantine/notifications',
        '@headlessui/react', '@heroicons/react',
      ],
      exclude: ['@babel/runtime'],
      esbuildOptions: {
        target: 'es2020',
      },
    },
  };
});
