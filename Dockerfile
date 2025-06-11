# Stage 1: Builder
FROM node:20.13.1-bullseye-slim AS builder

WORKDIR /usr/src/app

# Install build dependencies
RUN apt-get update && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Clean up any existing node_modules and lock files
RUN rm -rf node_modules package-lock.json pnpm-lock.yaml

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy app source
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20.13.1-bullseye-slim

WORKDIR /usr/src/app

# Install runtime dependencies
RUN apt-get update && apt-get install -y curl \
    && rm -rf /var/lib/apt/lists/*

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3420
ENV NEXUS_RUN_DIR=/usr/src/app/nexus_run

# Install production dependencies
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

# Copy built app and source files from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/server.js .
COPY --from=builder /usr/src/app/src ./src

# Copy public directory and other necessary files
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/bruno_demo_temp ./bruno_demo_temp
COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/patches ./patches

# Create necessary directories and set permissions
RUN mkdir -p nexus_run midscene_run public/assets public/models public/textures \
    && chown -R node:node /usr/src/app \
    && chmod +x /usr/src/app/server.js

# Copy environment files
COPY --from=builder /usr/src/app/.env* ./
RUN if [ ! -f ".env" ] && [ -f ".env.production" ]; then \
      cp .env.production .env; \
    fi

# Expose the app port
EXPOSE 3420

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3420/api/health || exit 1

# Switch to non-root user
USER node

# Start the application
CMD ["node", "--max-old-space-size=4096", "server.js"]
# Production stage is the default target (last stage in the file) did this for DigitalOcean deployment
# To build a specific stage, use: docker build --target <stage> -t <image> .