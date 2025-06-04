# Stage 1: Build the application
FROM node:18.20.3-bullseye-slim AS builder

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

# Install dependencies
RUN npm ci --legacy-peer-deps --production=false && \
    npm install @rollup/rollup-linux-x64-gnu rollup-plugin-visualizer@5.9.2 --save-dev

# Copy app source
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production image
FROM node:18.20.3-bullseye-slim

# Create app directory
WORKDIR /usr/src/app

# Install production dependencies only
COPY --from=builder /usr/src/app/package*.json ./
RUN npm ci --only=production

# Copy built assets and server files
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/server.js .
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/nexus_run ./nexus_run

# Create necessary directories
RUN mkdir -p public/{assets,models,textures} nexus_run

# Copy production environment file
COPY .env.production .env

# Expose the application port
EXPOSE 3420

# Health check
HEALTHCHECK --interval=60s --timeout=3s \
  CMD curl -f http://localhost:3420/api/health || exit 1

# Start the application in production mode
CMD ["node", "server.js"]
