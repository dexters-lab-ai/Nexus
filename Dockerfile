# Stage 1: Builder
FROM node:20.13.1-bullseye-slim AS builder

WORKDIR /usr/src/app

# Install system dependencies including Chrome
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer environment variables
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy package files first for better layer caching
COPY package*.json ./

# Clean up any existing node_modules and lock files
RUN rm -rf node_modules package-lock.json pnpm-lock.yaml

# Install dependencies with the correct Rollup binary
RUN echo "Installing dependencies..." && \
    npm install --legacy-peer-deps && \
    npm install @rollup/rollup-linux-x64-gnu rollup-plugin-visualizer@5.9.2 --save-dev && \
    echo "Dependency installation complete"

# Create necessary directories
RUN mkdir -p nexus_run && \
    mkdir -p public/assets && \
    mkdir -p public/models && \
    mkdir -p public/textures

# Copy environment files (after creating directories to avoid permission issues)
COPY .env* ./

# Copy app source
COPY . .

# Set environment to use the correct Rollup binary
ENV ROLLUP_INLINE_RUN=1

# Build the application
RUN npm run build

# Development stage
FROM node:20.13.1-bullseye-slim AS development

# Set working directory
WORKDIR /usr/src/app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set environment to development
ENV NODE_ENV=development

# Copy only package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm install --legacy-peer-deps

# Copy the rest of the application
COPY . .

# Create necessary directories
RUN mkdir -p nexus_run && \
    mkdir -p public/assets && \
    mkdir -p public/models && \
    mkdir -p public/textures

# Set ownership and permissions
RUN chown -R node:node /usr/src/app

# Switch to non-root user
USER node

# Expose ports
EXPOSE 3420 3000

# Start the development server
# CMD ["npm", "run", "dev"]

# Production stage
FROM node:20.13.1-bullseye-slim AS production
WORKDIR /usr/src/app

# Set environment variables for Puppeteer
ENV CHROME_BIN=/usr/bin/chromium-browser \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser \
    NODE_ENV=production \
    DISPLAY=:99 \
    CHROME_DEVEL_SANDBOX=/tmp/chrome-sandbox \
    DBUS_SESSION_BUS_ADDRESS=/dev/null \
    NO_AT_BRIDGE=1 \
    XDG_RUNTIME_DIR=/tmp/chrome

# Install production dependencies only
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./

# Install Chromium and all its dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Core dependencies
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxshmfence1 \
    wget \
    xdg-utils \
    # Virtual framebuffer and windowing
    xvfb \
    x11vnc \
    x11-xkb-utils \
    xfonts-100dpi \
    xfonts-75dpi \
    xfonts-scalable \
    xfonts-cyrillic \
    x11-apps \
    # Additional fonts
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    # Clean up
    && rm -rf /var/lib/apt/lists/* \
    # Install latest stable Chromium
    && apt-get update && apt-get install -y --no-install-recommends chromium \
    # Create necessary symlinks
    && ln -s /usr/bin/chromium /usr/bin/chromium-browser \
    && ln -s /usr/bin/chromium /usr/bin/google-chrome-stable \
    # Create Chrome user data directory and temp directories
    && mkdir -p /home/node/.config/chromium/Default \
    && mkdir -p /tmp/chrome-user-data \
    && mkdir -p /tmp/chrome \
    # Create Chrome sandbox wrapper
    && echo '#!/bin/sh\nexec "$@" --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage' > /tmp/chrome-sandbox \
    && chmod 755 /tmp/chrome-sandbox \
    # Set permissions
    && chown -R node:node /home/node/.config \
    && chown -R node:node /tmp/chrome-user-data \
    && chown -R node:node /tmp/chrome

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3420
ENV NEXUS_RUN_DIR=/usr/src/app/nexus_run

# Set Puppeteer environment variables to use the installed Chrome
ENV CHROME_BIN=/usr/src/app/node_modules/puppeteer/.local-chromium/linux-*/chrome-linux/chrome
ENV PUPPETEER_EXECUTABLE_PATH=/usr/src/app/node_modules/puppeteer/.local-chromium/linux-*/chrome-linux/chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

# Ensure the Chrome binary is executable
RUN chmod +x ${CHROME_BIN} || true

# Install production dependencies
COPY package*.json ./
# Clean npm cache and install production deps
RUN npm cache clean --force && \
    npm install --omit=dev --legacy-peer-deps && \
    npm cache clean --force

# Copy built app from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/server.js .

# Copy public directory and its contents
COPY --from=builder /usr/src/app/public ./public

# Copy bruno_demo_temp assets and set permissions
COPY --from=builder /usr/src/app/bruno_demo_temp ./bruno_demo_temp
RUN chown -R node:node /usr/src/app/bruno_demo_temp && \
    chmod -R 755 /usr/src/app/bruno_demo_temp

# Copy source files and other necessary directories
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/config ./config
COPY --from=builder /usr/src/app/scripts ./scripts
COPY --from=builder /usr/src/app/patches ./patches

# Copy and set up environment files
COPY --from=builder /usr/src/app/.env* ./
RUN if [ ! -f ".env" ] && [ -f ".env.production" ]; then \
      cp .env.production .env; \
    fi

# Create necessary runtime directories and set permissions
RUN mkdir -p /usr/src/app/nexus_run && \
    mkdir -p /usr/src/app/midscene_run && \
    chown -R node:node /usr/src/app && \
    chmod +x /usr/src/app/server.js

# Expose the app port
EXPOSE 3420

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3420/api/health || exit 1

# Create a startup script to initialize Xvfb and start the application
RUN echo '#!/bin/bash' > /usr/local/bin/startup.sh && \
    echo 'set -e' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '# Start Xvfb in the background' >> /usr/local/bin/startup.sh && \
    echo 'Xvfb :99 -screen 0 1280x720x16 -ac -nolisten tcp -nolisten unix &' >> /usr/local/bin/startup.sh && \
    echo 'export DISPLAY=:99' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '# Set environment variables for Chromium' >> /usr/local/bin/startup.sh && \
    echo 'export CHROME_DEVEL_SANDBOX=/tmp/chrome-sandbox' >> /usr/local/bin/startup.sh && \
    echo 'export DBUS_SESSION_BUS_ADDRESS=/dev/null' >> /usr/local/bin/startup.sh && \
    echo 'export NO_AT_BRIDGE=1' >> /usr/local/bin/startup.sh && \
    echo 'export XDG_RUNTIME_DIR=/tmp/chrome' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '# Create necessary directories' >> /usr/local/bin/startup.sh && \
    echo 'mkdir -p /tmp/chrome-user-data' >> /usr/local/bin/startup.sh && \
    echo 'chmod -R 777 /tmp/chrome-user-data' >> /usr/local/bin/startup.sh && \
    echo 'chown -R node:node /tmp/chrome-user-data' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '# Set permissions for Chrome sandbox' >> /usr/local/bin/startup.sh && \
    echo 'chmod 4755 /tmp/chrome-sandbox' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '# Debug information' >> /usr/local/bin/startup.sh && \
    echo 'echo "=== Environment Variables ==="' >> /usr/local/bin/startup.sh && \
    echo 'env | grep -E "CHROME|PUPPETEER|DISPLAY"' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo 'echo "=== Chromium Version ==="' >> /usr/local/bin/startup.sh && \
    echo '/usr/bin/chromium-browser --version || echo "Chromium not found"' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '# Start the application' >> /usr/local/bin/startup.sh && \
    echo 'echo "Starting application..."' >> /usr/local/bin/startup.sh && \
    echo 'exec node --max-old-space-size=4096 server.js "$@"' >> /usr/local/bin/startup.sh && \
    chmod +x /usr/local/bin/startup.sh && \
    chown node:node /usr/local/bin/startup.sh

# Switch to non-root user
USER node

# Start the application using the startup script
CMD ["/bin/sh", "/usr/local/bin/startup.sh"]

# Production stage is the default target (last stage in the file) did this for DigitalOcean deployment
# To build a specific stage, use: docker build --target <stage> -t <image> .