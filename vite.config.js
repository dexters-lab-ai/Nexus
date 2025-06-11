// vite.config.js
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { visualizer } from 'rollup-plugin-visualizer';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export default defineConfig(({ mode }) => {
  // load .env and system env
  const env = {
    ...process.env,
    ...loadEnv(mode, process.cwd(), ''),
  };

  const isDev    = mode === 'development';
  const isDocker = env.DOCKER === 'true';

  const host    = '0.0.0.0';
  const hmrHost = isDocker ? '0.0.0.0' : 'localhost';

  const apiUrl = isDocker
    ? 'http://localhost:3420'
    : (env.VITE_API_URL || (isDev ? 'http://localhost:3420' : ''));
  const wsUrl = isDocker
    ? 'ws://localhost:3420'
    : (env.VITE_WS_URL || (isDev ? 'ws://localhost:3420' : `wss://${env.APP_DOMAIN}`));

  // debug dump
  if (isDev || env.DEBUG === 'true') {
    const info = { mode, isDev, isDocker, host, hmrHost, apiUrl, wsUrl };
    console.log('vite env:', JSON.stringify(info, null, 2));
    if (isDev) {
      try {
        fs.writeFileSync('vite-debug-env.json', JSON.stringify(info, null, 2));
      } catch (e) {
        console.warn('could not write debug file:', e.message);
      }
    }
  }

  process.env.NODE_ENV = mode;

  return {
    root: __dirname,
    publicDir: 'public',
    base: '/',
    logLevel: 'warn',

    server: {
      host,
      port: 3000,
      strictPort: true,
      open: !isDocker,
      cors: {
        origin: true,
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
        preflightContinue: false,
        optionsSuccessStatus: 204,
        credentials: true,
        allowedHeaders: [
          'Content-Type',
          'Authorization',
          'X-Requested-With',
          'Accept',
          'Origin',
          'X-CSRF-Token',
          'X-Socket-ID',
        ],
      },
      hmr: {
        protocol: 'ws',
        host:    hmrHost,
        port:    24678,
        clientPort: isDocker ? 80 : 24678,
        path:    '/__vite_ws',
        timeout: 60000,
        overlay: true,
        reconnectTries:    5,
        reconnectInterval: 1000,
        onError:   (err) => console.error('WebSocket HMR Error:', err),
        onClose:   ()   => console.log('WebSocket HMR connection closed'),
      },
      errorOverlay: {
        showSource:     true,
        showLinkToFile: true,
        position: 'top',
        message:  'An error occurred',
        style: {
          fontSize:   '14px',
          padding:    '10px',
          fontWeight: 'bold',
          background: 'rgba(255, 0, 0, 0.1)',
          border:     '1px solid rgba(255, 0, 0, 0.2)',
        },
      },
      watch: {
        usePolling:     true,
        interval:       100,
        binaryInterval: 300,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          '**/.next/**',
          '**/dist/**',
          '**/build/**',
          '**/nexus_run/**',
          '**/midscene_run/**',
          '**/cypress/**',
          '**/coverage/**',
          '**/logs/**',
          '**/temp/**',
          '**/tmp/**',
          '**/.cache/**',
          '**/.vscode/**',
          '**/.idea/**',
          '**/test-results/**',
          '**/test-results-dev/**',
        ],
      },
      proxy: {
        '/ws': {
          target:      wsUrl,
          ws:          true,
          changeOrigin:true,
          secure:      false,
          xfwd:        true,
          logLevel:    'debug',
          rewrite:     p => p.replace(/^\/ws/, ''),
        },
        '/api': {
          target:       apiUrl,
          changeOrigin: true,
          secure:       false,
          ws:           true,
          xfwd:         true,
          logLevel:     'debug',
          headers: {
            'Access-Control-Allow-Origin':  '*',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
            'Access-Control-Allow-Headers': 'X-Requested-With,content-type,Authorization',
          },
          rewrite: p => p.replace(/^\/api/, ''),
        },
        '/uploads': {
          target:       apiUrl,
          changeOrigin: true,
          secure:       false,
          xfwd:         true,
          logLevel:     'debug',
          rewrite:      p => p.replace(/^\/uploads/, '/uploads'),
        },
        '/nexus_run': {
          target:       apiUrl,
          changeOrigin: true,
          secure:       false,
          xfwd:         true,
          logLevel:     'debug',
          rewrite:      p => p.replace(/^\/nexus_run/, '/nexus_run'),
        },
        '/external-report': {
          target:       apiUrl,
          changeOrigin: true,
          secure:       false,
          xfwd:         true,
          logLevel:     'debug',
          rewrite:      p => p.replace(/^\/external-report/, '/external-report'),
        },
      },
      onError: (err, req, res, next) => {
        console.error('Vite Dev Server Error:', err);
        next(err);
      },
      ws: {
        reconnect:      { retries: 3, delay: 1000 },
        clientTracking: true,
      },
      sourcemapIgnoreList: () => true,
      fs: {
        strict: false,
        allow: [
          process.cwd(),
          path.join(process.cwd(), 'src'),
          path.join(process.cwd(), 'public'),
          path.join(process.cwd(), 'node_modules'),
          path.join(__dirname, 'public'),
          path.join(__dirname, 'node_modules'),
          path.join(__dirname, 'bruno_demo_temp'),
        ],
        deny: [
          '**/node_modules/.vite',
          '**/.git',
          '**/nexus_run/report/**',
          '**/midscene_run/report/**',
        ],
      },
      headers: {
        'Cross-Origin-Opener-Policy':   'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      },
    },

    // Build configuration to copy the entire src/styles directory to dist/css
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: isDev ? 'inline' : false,
      minify: isDev ? false : 'esbuild',
      target: 'esnext',
      cssCodeSplit: true,
      
      // Copy all files from src/styles to dist/css
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        output: {
          // JavaScript files
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
          
          // Asset file naming
          assetFileNames: (assetInfo) => {
            const name = assetInfo.name || '';
            const ext = name.split('.').pop() || '';
            
            // Handle CSS files - ensure consistent paths for components
            if (ext === 'css') {
              if (name.includes('src/styles/components/')) {
                return name.replace('src/styles/', 'css/');
              } else if (name.includes('src/styles/')) {
                return name.replace('src/styles/', 'css/');
              }
            }
            
            // Other assets
            return 'assets/[name]-[hash][extname]';
          }
        },
        plugins: [
          // Plugin to ensure all files from src/styles are included
          {
            name: 'copy-styles',
            async generateBundle() {
              const fs = await import('fs/promises');
              const path = await import('path');
              const { glob } = await import('glob');
              
              // Find all files in src/styles
              const files = await glob('src/styles/**/*', { nodir: true });
              
              for (const file of files) {
                const content = await fs.readFile(file, 'utf-8');
                const relativePath = path.relative('src/styles', file);
                
                // Only process CSS files that don't start with _ (Sass partials)
                if (!file.endsWith('.css') || path.basename(file).startsWith('_')) {
                  continue;
                }
                
                // For component CSS, ensure they go to the components directory
                let outputPath;
                if (file.includes('src/styles/components/')) {
                  const fileName = path.basename(file);
                  outputPath = `css/components/${fileName}`;
                } else {
                  outputPath = `css/${path.basename(file)}`;
                }
                
                // Add file to the bundle
                this.emitFile({
                  type: 'asset',
                  fileName: outputPath,
                  source: content
                });
              }
            }
          }
        ]
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

    resolve: {
      extensions: ['.js','.jsx','.ts','.tsx','.json','.css'],
      alias: {
        '@'                                   : path.resolve(__dirname, 'src'),
        '@components'                         : path.resolve(__dirname, 'src/components'),
        '@store'                              : path.resolve(__dirname, 'src/store'),
        '/models'                             : path.resolve(__dirname, 'public/models'),
        '/assets'                             : path.resolve(__dirname, 'public/assets'),
        '/draco'                              : path.resolve(__dirname, 'public/draco'),
        '@floating-ui/react'                  : path.resolve(__dirname, 'node_modules/@floating-ui/react'),
        '@fortawesome/fontawesome-free/webfonts': path.resolve(__dirname, 'node_modules/@fortawesome/fontawesome-free/webfonts'),
        '@floating-ui/react-dom'              : path.resolve(__dirname, 'node_modules/@floating-ui/react-dom'),
        '@styles'                            : path.resolve(__dirname, 'src/styles'),
        '@styles/components'                 : path.resolve(__dirname, 'src/styles/components'),
      },
      dedupe: [
        'react', 'react-dom',
        'three', '@mantine/core', '@mantine/hooks', '@mantine/notifications',
      ],
    },

    define: {
      'process.env.NODE_ENV' : JSON.stringify(mode),
      'process.env.VITE_API_URL': JSON.stringify(apiUrl),
      'process.env.VITE_WS_URL' : JSON.stringify(wsUrl),
      'process.env.FRONTEND_URL': JSON.stringify(env.FRONTEND_URL || ''),
      'process.env.APP_DOMAIN' : JSON.stringify(env.APP_DOMAIN || ''),
    },

    plugins: [
      react({ fastRefresh: true }),
      visualizer({ open: false, gzipSize: true, brotliSize: true }),
    ],
  };
});
