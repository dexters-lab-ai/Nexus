# Use Node.js 18 LTS for better compatibility
FROM node:18.20.3-bullseye-slim AS builder

# Create app directory
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

# Verify Rollup installation
RUN ls -la node_modules/@rollup/

# Copy environment files
COPY .env.development .env

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
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --only=production --legacy-peer-deps

# Copy built app from builder
COPY --from=builder /usr/src/app/dist ./dist

# Copy server files
COPY server.js .

# Copy public directory and its contents
COPY --from=builder /usr/src/app/public ./public

# Copy bruno_demo_temp assets
COPY --from=builder /usr/src/app/bruno_demo_temp ./bruno_demo_temp

# Ensure proper permissions for bruno_demo_temp
RUN chown -R node:node /usr/src/app/bruno_demo_temp && \
    chmod -R 755 /usr/src/app/bruno_demo_temp

# Copy source files
COPY --from=builder /usr/src/app/src ./src

# Ensure the server has the correct permissions
RUN chmod +x server.js

# Set environment variables
ENV NODE_ENV=development
ENV PORT=3420

# Expose the app port
EXPOSE 3420

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3420/api/health || exit 1

# Start the application
CMD ["npm", "run", "dev", "--max-old-space-size=4096", "server.js"]