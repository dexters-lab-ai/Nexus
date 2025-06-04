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

# Copy environment files (will be overridden by build args if provided)
COPY .env* ./

# Copy app source
COPY . .

# Set build arguments with defaults
ARG VITE_API_URL=https://operator-io236.ondigitalocean.app
ARG VITE_WS_URL=wss://operator-io236.ondigitalocean.app
ARG FRONTEND_URL=https://operator-io236.ondigitalocean.app
ARG APP_DOMAIN=operator-io236.ondigitalocean.app

# Set environment variables for Vite build
ENV NODE_ENV=production \
    VITE_API_URL=${VITE_API_URL} \
    VITE_WS_URL=${VITE_WS_URL} \
    FRONTEND_URL=${FRONTEND_URL} \
    APP_DOMAIN=${APP_DOMAIN} \
    DOCKER=true \
    DEBUG=true

# Build the application
RUN echo "Building with environment:" && \
    echo "VITE_API_URL=${VITE_API_URL}" && \
    echo "VITE_WS_URL=${VITE_WS_URL}" && \
    echo "FRONTEND_URL=${FRONTEND_URL}" && \
    echo "APP_DOMAIN=${APP_DOMAIN}" && \
    npm run build

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
