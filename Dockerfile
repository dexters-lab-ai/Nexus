# Use full Node.js LTS image for build stage
FROM node:18 AS builder

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

# Create a script to handle lock files and install dependencies
RUN echo '#!/bin/sh\n\
# Check for lock files\
if [ -f "package-lock.json" ]; then\
  echo "Found package-lock.json, using npm ci"\
  npm ci --legacy-peer-deps\
elif [ -f "pnpm-lock.yaml" ]; then\
  echo "Found pnpm-lock.yaml, using pnpm install"\
  npm install -g pnpm\
  pnpm install --frozen-lockfile\
else\
  echo "No lock file found, using npm install"\
  npm install --legacy-peer-deps\
fi' > /tmp/install-deps.sh && \
  chmod +x /tmp/install-deps.sh

# Run the installation script
RUN /tmp/install-deps.sh

# Copy app source
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Install production dependencies only
COPY --from=builder /usr/src/app/package*.json ./
RUN npm ci --only=production

# Copy built files and required directories
COPY --from=builder /usr/src/app/server.js .
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/nexus_run ./nexus_run

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3420

# Expose the app port
EXPOSE 3420

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Command to run the application
CMD ["node", "server.js"]
