#!/bin/bash
set -e

echo "=== Starting Build Process ==="

# Clean up previous installations
echo "=== Cleaning up previous installations ==="
rm -rf node_modules package-lock.json

# Install all dependencies
echo "=== Installing dependencies ==="
npm install --legacy-peer-deps

# Explicitly install Vite and plugin
echo "=== Installing Vite and React plugin ==="
npm install vite@6.3.3 @vitejs/plugin-react@4.3.1 --save-exact

# Build the application
echo "=== Building application ==="
npm run build

echo "=== Build completed successfully! ==="

exit 0
