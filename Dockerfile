# Stage 1: Build the application
FROM node:18.20.3-bullseye-slim AS builder

# Create app directory
WORKDIR /usr/src/app

# Install system dependencies with non-interactive frontend
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    git \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libperl4-corelibs-perl \
    perl-modules-5.32 \
    && rm -rf /var/lib/apt/lists/*

# Install global build tools
RUN npm install -g --force \
    rollup \
    @rollup/rollup-linux-x64-gnu \
    rollup-plugin-visualizer@5.9.2 \
    typescript \
    ts-node \
    prisma \
    @prisma/client

# Copy package files first for better layer caching
COPY package*.json ./
COPY yarn.lock .
COPY prisma ./prisma/

# Install dependencies
RUN yarn install --frozen-lockfile --network-timeout 1000000

# Copy application code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build arguments with defaults
ARG VITE_API_URL=https://operator-io236.ondigitalocean.app
ARG VITE_WS_URL=wss://operator-io236.ondigitalocean.app
ARG FRONTEND_URL=https://operator-io236.ondigitalocean.app
ARG APP_DOMAIN=operator-io236.ondigitalocean.app

# Set environment variables for build
ENV NODE_ENV=production
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
ENV FRONTEND_URL=${FRONTEND_URL}
ENV APP_DOMAIN=${APP_DOMAIN}

# Build the application
RUN echo "Building with environment:" && \
    echo "VITE_API_URL=${VITE_API_URL}" && \
    echo "VITE_WS_URL=${VITE_WS_URL}" && \
    echo "FRONTEND_URL=${FRONTEND_URL}" && \
    echo "APP_DOMAIN=${APP_DOMAIN}" && \
    yarn build

# Stage 2: Production image
FROM node:18.20.3-bullseye-slim

# Set working directory
WORKDIR /usr/src/app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    wget \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Rollup and other build tools
RUN npm install -g rollup @rollup/rollup-linux-x64-gnu rollup-plugin-visualizer@5.9.2

# Copy package files
COPY package*.json ./
COPY yarn.lock .
COPY prisma ./prisma/

# Install production dependencies only
RUN yarn install --production --frozen-lockfile --network-timeout 1000000

# Copy built application from build stage
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma

# Copy only necessary files for production
COPY --chown=node:node server.js .
COPY --chown=node:node next.config.js .
COPY --chown=node:node config ./config

# Create necessary directories with proper permissions
RUN mkdir -p /usr/src/app/nexus_run \
    && chown -R node:node /usr/src/app

# Switch to non-root user
USER node

# Expose the application port
EXPOSE 3420

# Set environment variables for runtime
ENV NODE_ENV=production
ENV PORT=3420
ENV NEXUS_RUN_DIR=/usr/src/app/nexus_run

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3420/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
