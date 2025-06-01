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

  console.log('Vite Env:', {
    mode,
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
      port: 3000,
      strictPort: true,
      open: true,
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
        origin: (origin) => {
          // Allow requests with no origin (like mobile apps or curl requests)
          if (!origin) return true;
          
          const allowedOrigins = [
            /^https?:\/\/localhost(?:\:\d+)?$/,  // Localhost with any port
            /^https?:\/\/127\.0\.0\.1(?:\:\d+)?$/, // 127.0.0.1 with any port
            /^https?:\/\/\S+\.operator-344ej\.ondigitalocean\.app$/, // Your production domain
            /^https?:\/\/operator-344ej\.ondigitalocean\.app$/ // Your production domain without subdomain
          ];
          
          // Check if the origin matches any of the allowed patterns
          return allowedOrigins.some(regex => regex.test(origin));
        },
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
        allowedHeaders: 'Content-Type, Authorization',
        credentials: true,
        optionsSuccessStatus: 204
      },
      // Proxy configuration for development
      proxy: {
        '/api': { 
          target: env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true,
          secure: false,
          ws: true,
          xfwd: true,
          cookieDomainRewrite: {
            '*': '' // Remove domain from cookies
          }
        },
        '/ws': { 
          target: env.VITE_WS_URL || 'ws://localhost:3420',
          ws: true,
          changeOrigin: true,
          secure: false,
          xfwd: true
        },
        '/uploads': { 
          target: env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true,
          xfwd: true
        },
        '/nexus_run': {
          target: env.VITE_API_URL || 'http://localhost:3420',
          changeOrigin: true,
          xfwd: true,
          cookieDomainRewrite: {
            '*': '' // Remove domain from cookies
          }
        }
      },
      // Enable HMR with custom host
      hmr: {
        host: 'localhost',
        port: 24678
      }
    },

    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: isDev,
      minify: !isDev ? 'terser' : false,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        input: path.resolve(__dirname, 'index.html'),
        output: {
          entryFileNames: 'assets/js/[name]-[hash].js',
          chunkFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const ext = assetInfo.name.split('.').pop().toLowerCase();
            if (ext === 'css') return 'assets/css/[name][extname]';
            if (['woff', 'woff2', 'ttf', 'eot'].includes(ext)) return 'assets/fonts/[name][extname]';
            if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return 'assets/images/[name][extname]';
            if (['glb', 'gltf', 'hdr', 'bin', 'wasm'].includes(ext)) return 'assets/models/[name][extname]';
            if (['mp4', 'webm', 'ogg'].includes(ext)) return 'assets/media/[name][extname]';
            return 'assets/[name][extname]';
          }
        }
      }
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
        '@floating-ui/react/dom',
        'lil-gui'
      ],
      exclude: ['@babel/runtime'],
      esbuildOptions: {
        target: 'es2020'
      }
    },

    // Resolve configuration
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
      dedupe: ['@mantine/core', '@mantine/hooks', '@mantine/notifications']
    },

    // Define global constants
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || 'http://localhost:3420'),
      'process.env.VITE_WS_URL': JSON.stringify(env.VITE_WS_URL || 'ws://localhost:3420')
    },

    plugins: [
      react(),
      visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      })
    ]
  };
});