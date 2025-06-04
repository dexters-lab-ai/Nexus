# Use Node.js 18 LTS
FROM node:18.20.3-bullseye-slim

# Create app directory
WORKDIR /usr/src/app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better layer caching
COPY package*.json ./


# Clean up any existing node_modules and lock files
RUN rm -rf node_modules package-lock.json pnpm-lock.yaml

# Install dependencies with the correct Rollup binary
RUN echo "Installing dependencies..." && \
    npm install --legacy-peer-deps && \
    npm install @rollup/rollup-linux-x64-gnu rollup-plugin-visualizer@5.9.2 --save-dev && \
    echo "Dependency installation complete"

# Verify Rollup installation
RUN ls -la node_modules/@rollup/

# Copy environment files
COPY .env.development .env

# Create necessary directories
RUN mkdir -p nexus_run public/{assets,models,textures}

# Copy app source
COPY . .

# Ensure static directories exist
RUN mkdir -p public/{assets,models,textures} nexus_run

# Set environment to use the correct Rollup binary
ENV ROLLUP_INLINE_RUN=1

# Expose ports (Vite + API)
EXPOSE 3000 3420

# Health check
HEALTHCHECK --interval=60s --timeout=3s \
  CMD curl -f http://localhost:3420/api/health || exit 1

# Start the application in development mode
CMD ["npm", "run", "dev"]
