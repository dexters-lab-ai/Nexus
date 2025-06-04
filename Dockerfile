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
    libperl4-corelibs-perl \
    perl-modules-5.32 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --legacy-peer-deps --production=false && \
    npm install @rollup/rollup-linux-x64-gnu rollup-plugin-visualizer@5.9.2 --save-dev

# Copy app source (excluding node_modules and other unnecessary files)
COPY . .

# Set build arguments with defaults
ARG VITE_API_URL=https://operator-io236.ondigitalocean.app
ARG VITE_WS_URL=wss://operator-io236.ondigitalocean.app
ARG FRONTEND_URL=https://operator-io236.ondigitalocean.app
ARG APP_DOMAIN=operator-io236.ondigitalocean.app

# Set environment variables for Vite build
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
FROM node:18-alpine

# Set working directory
WORKDIR /usr/src/app

# Install system dependencies
RUN apk add --no-cache \
    perl \
    libperl4-corelibs-perl \
    perl-modules-5.32 \
    wget \
    ca-certificates

# Copy package files
COPY package*.json ./
COPY yarn.lock .
COPY prisma ./prisma/

# Install production dependencies only
RUN yarn install --production --frozen-lockfile --network-timeout 1000000

# Copy built application from build stage
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/.next ./.next
COPY --from=build /usr/src/app/public ./public
COPY --from=build /usr/src/app/node_modules/.prisma ./node_modules/.prisma

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

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3420/api/health || exit 1

# Start the application
CMD ["node", "server.js"]
