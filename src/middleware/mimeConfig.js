// src/middleware/mimeConfig.js
import mime from 'mime';

// Configure MIME types for static assets
export default function configureMime() {
  // JavaScript and TypeScript
  mime.define({
    'application/javascript': ['js', 'mjs', 'cjs', 'jsx'],
    'application/typescript': ['ts', 'tsx'],
    'text/jsx': ['jsx'],
    'text/typescript': ['ts', 'tsx']
  }, true);

  // Stylesheets
  mime.define({
    'text/css': ['css'],
    'text/less': ['less'],
    'text/scss': ['scss'],
    'text/sass': ['sass']
  }, true);

  // Images
  mime.define({
    'image/avif': ['avif'],
    'image/webp': ['webp'],
    'image/apng': ['apng'],
    'image/gif': ['gif'],
    'image/jpeg': ['jpg', 'jpeg', 'jfif', 'pjpeg', 'pjp'],
    'image/png': ['png'],
    'image/svg+xml': ['svg', 'svgz'],
    'image/x-icon': ['ico', 'cur'],
    'image/bmp': ['bmp'],
    'image/tiff': ['tif', 'tiff']
  }, true);

  // Fonts
  mime.define({
    'font/woff': ['woff'],
    'font/woff2': ['woff2'],
    'font/ttf': ['ttf', 'ttc'],
    'font/otf': ['otf'],
    'font/collection': ['ttc'],
    'font/sfnt': ['otf', 'ttc']
  }, true);

  // Media
  mime.define({
    'audio/mpeg': ['mp3'],
    'audio/ogg': ['oga', 'ogg', 'spx'],
    'audio/wav': ['wav'],
    'audio/webm': ['weba'],
    'video/mp4': ['mp4', 'mp4v', 'mpg4'],
    'video/ogg': ['ogv'],
    'video/webm': ['webm'],
    'video/x-flv': ['flv'],
    'video/x-msvideo': ['avi'],
    'video/x-ms-wmv': ['wmv']
  }, true);

  // 3D Models and Assets
  mime.define({
    'model/gltf+json': ['gltf'],
    'model/gltf-binary': ['glb'],
    'model/obj': ['obj'],
    'model/mtl': ['mtl'],
    'model/stl': ['stl'],
    'model/3mf': ['3mf']
  }, true);

  // Documents
  mime.define({
    'application/pdf': ['pdf'],
    'application/msword': ['doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
    'application/vnd.ms-excel': ['xls'],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
    'application/vnd.ms-powerpoint': ['ppt'],
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['pptx'],
    'text/plain': ['txt', 'text', 'conf', 'def', 'list', 'log', 'in', 'ini']
  }, true);

  // Archives
  mime.define({
    'application/zip': ['zip'],
    'application/x-rar-compressed': ['rar'],
    'application/x-7z-compressed': ['7z'],
    'application/x-tar': ['tar'],
    'application/gzip': ['gz'],
    'application/x-bzip2': ['bz2'],
    'application/x-lzma': ['lzma'],
    'application/x-xz': ['xz']
  }, true);

  // WebAssembly
  mime.define({
    'application/wasm': ['wasm'],
    'application/wat': ['wat'],
    'text/webassembly': ['wat']
  }, true);

  // Other common web files
  mime.define({
    'application/json': ['json', 'map'],
    'application/ld+json': ['jsonld'],
    'application/manifest+json': ['webmanifest'],
    'application/xml': ['xml'],
    'text/csv': ['csv'],
    'text/markdown': ['md', 'markdown'],
    'text/yaml': ['yaml', 'yml']
  }, true);

  // Override any problematic defaults
  mime.define({
    'text/plain': ['txt', 'md', 'markdown', 'yaml', 'yml', 'ini', 'conf', 'log']
  }, true);
}
