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

    build: {
      outDir:            'dist',
      assetsDir:         'assets',
      emptyOutDir:       true,
      sourcemap:         isDev ? 'inline' : false,
      minify:            isDev ? false : 'esbuild',
      target:            'esnext',
      chunkSizeWarningLimit: 1600,
      reportCompressedSize: true,
      cssCodeSplit:      true,
      commonjsOptions: {
        include:               /node_modules/,
        transformMixedEsModules:true,
        sourceMap:             isDev,
        exclude:               [],
      },
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        onwarn(warning, warn) {
          const ignored = ['MODULE_LEVEL_DIRECTIVE', 'SOURCEMAP_ERROR', 'THIS_IS_UNDEFINED'];
          if (ignored.includes(warning.code)) return;
          warn(warning);
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.match(/react|react-dom|react-router-dom/))       return 'vendor-react';
              if (id.match(/@mantine|@tabler\/icons/))              return 'vendor-mantine';
              if (id.match(/three|@react-three/))                   return 'vendor-three';
              if (id.match(/@headlessui|@heroicons/))               return 'vendor-ui';
              return 'vendor';
            }
          },
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: ({ name }) => {
            const ext = name?.split('.').pop();
            if (ext === 'css') {
              // Handle CSS files from styles/components/
              if (name.includes('/styles/components/')) {
                return 'assets/css/components/[name]-[hash][extname]';
              }
              return 'assets/css/[name]-[hash][extname]';
            }
            if (['png', 'jpg', 'jpeg', 'svg', 'gif'].includes(ext)) {
              return 'assets/img/[name]-[hash][extname]';
            }
            return `assets/${ext}/[name]-[hash][extname]`;
          },
        },
        // Add CSS loading optimization
        plugins: [
          {
            name: 'css-loader',
            generateBundle(_, bundle) {
              Object.entries(bundle).forEach(([name, file]) => {
                if (file.type === 'asset' && name.endsWith('.css')) {
                  file.fileName = name.replace(/\/src\//, '/assets/css/');
                }
              });
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
