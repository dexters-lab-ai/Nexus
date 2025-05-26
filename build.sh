#!/bin/bash
set -e

# Clean up any previous installations
rm -rf node_modules
rm -f package-lock.json

# Install with legacy peer deps to avoid dependency conflicts
npm install --legacy-peer-deps

# Build the application
npm run build

echo "Build completed successfully!"
