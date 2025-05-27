# Use Node.js LTS with slim variant for better compatibility
FROM node:18-slim AS builder

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

# Install all dependencies (including devDependencies)
RUN npm install

# Copy app source
COPY . .

# Fix Rollup issue by forcing the correct binary
RUN npm rebuild @rollup/rollup-linux-x64-gnu --update-binary

# Build the application
RUN npm run build

# Production stage
FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Install production dependencies only
COPY --from=builder /usr/src/app/package*.json ./
RUN npm install --production

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
