# Stage 1: Builder stage
FROM node:18.20.3-bullseye-slim AS builder

WORKDIR /usr/src/app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
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

# Copy environment files
COPY .env* ./

# Create necessary directories
RUN mkdir -p nexus_run && \
    mkdir -p public/assets && \
    mkdir -p public/models && \
    mkdir -p public/textures

# Copy app source
COPY . .

# Set environment to use the correct Rollup binary
ENV ROLLUP_INLINE_RUN=1

# Build the application
RUN npm run build

# Production stage
FROM node:18.20.3-bullseye-slim

WORKDIR /usr/src/app

# Install system dependencies
RUN npm install -g rollup @rollup/rollup-linux-x64-gnu rollup-plugin-visualizer@5.9.2
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --only=production --legacy-peer-deps

# Copy built app from builder
COPY --from=builder /usr/src/app/dist ./dist

# Copy all necessary files and directories
COPY --from=builder /usr/src/app/server.js .
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/patches ./patches
COPY --from=builder /usr/src/app/.env* ./

# Copy package files for production dependencies
COPY --from=builder /usr/src/app/package*.json ./

# Create necessary directories and set permissions
RUN mkdir -p /usr/src/app/nexus_run && \
    mkdir -p /usr/src/app/midscene_run && \
    chown -R node:node /usr/src/app/nexus_run /usr/src/app/midscene_run /usr/src/app/src /usr/src/app/config /usr/src/app/scripts /usr/src/app/patches

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3420
ENV NEXUS_RUN_DIR=/usr/src/app/nexus_run

# Expose the app port
EXPOSE 3420

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3420/api/health || exit 1

# Switch to non-root user
USER node

# Start the application with increased memory limit
CMD ["node", "--max-old-space-size=4096", "server.js"]
