# Stage 1: Builder
FROM node:20.13.1-bullseye-slim AS builder

WORKDIR /usr/src/app

# Install system dependencies including Chrome and Android tools
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
    # Android tools
    udev \
    ttf-freefont \
    # For network tools
    iproute2 \
    net-tools \
    # For debugging
    procps \
    htop \
    vim \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    # Create Android SDK directory
    && mkdir -p /opt/android-sdk/platform-tools \
    && mkdir -p /etc/udev/rules.d \
    # Add udev rules for Android devices
    && echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="18d1", MODE="0666", GROUP="plugdev"' > /etc/udev/rules.d/51-android.rules \
    && echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="0bb4", MODE="0666", GROUP="plugdev"' >> /etc/udev/rules.d/51-android.rules \
    && echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="22b8", MODE="0666", GROUP="plugdev"' >> /etc/udev/rules.d/51-android.rules \
    && echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="0fce", MODE="0666", GROUP="plugdev"' >> /etc/udev/rules.d/51-android.rules \
    && chmod a+r /etc/udev/rules.d/51-android.rules \
    # Create plugdev group and add node user
    && groupadd -r plugdev || true \
    && usermod -aG plugdev node || true \
    # Set permissions for node user
    && chown -R node:node /home/node \
    && chmod -R 755 /home/node

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

# Install Chromium and dependencies
RUN set -x \
    # Update package lists
    && apt-get update \
    # Install required packages
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        wget \
    # Add Debian repository configuration
    && echo 'deb http://deb.debian.org/debian bullseye main' > /etc/apt/sources.list.d/bullseye.list \
    && echo 'deb http://deb.debian.org/debian-security bullseye-security main' >> /etc/apt/sources.list.d/bullseye.list \
    && echo 'deb http://deb.debian.org/debian bullseye-updates main' >> /etc/apt/sources.list.d/bullseye.list \
    # Update package lists again
    && apt-get update \
    # Install Chromium and dependencies
    && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcups2 \
        libdbus-1-3 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libx11-6 \
        libxcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxrandr2 \
        xdg-utils \
        xvfb \
        x11vnc \
        x11-xkb-utils \
        xfonts-100dpi \
        xfonts-75dpi \
        xfonts-scalable \
        xfonts-cyrillic \
        xserver-xorg-core \
        x11-xserver-utils \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /tmp/* /var/tmp/* \
    && rm -rf /var/cache/apt/archives/*.deb \
    && find /var/log -type f -exec truncate -s 0 {} \;

# Create necessary directories and set permissions
RUN mkdir -p /tmp/chrome-user-data /tmp/chrome /home/node/.cache/puppeteer/chrome/linux-* \
    && chmod -R 777 /tmp/chrome-user-data /tmp/chrome /home/node/.cache/puppeteer \
    && chown -R node:node /tmp/chrome-user-data /tmp/chrome /home/node/.cache/puppeteer

# Set environment variables for Puppeteer and Chromium
ENV CHROME_BIN=/usr/bin/chromium \
    CHROME_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_CACHE_DIR=/home/node/.cache/puppeteer \
    NODE_ENV=production \
    # X11 and display settings
    DISPLAY=:99 \
    SCREEN_WIDTH=1280 \
    SCREEN_HEIGHT=720 \
    SCREEN_DEPTH=24 \
    SCREEN_DPI=96 \
    # Chromium settings
    CHROME_DEVEL_SANDBOX=/tmp/chrome-sandbox \
    CHROME_EXTRA_LAUNCH_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage \
    CHROME_REMOTE_DEBUGGING_PORT=9222 \
    CHROME_REMOTE_DEBUGGING_ADDRESS=0.0.0.0 \
    # System settings
    DBUS_SESSION_BUS_ADDRESS=/dev/null \
    NO_AT_BRIDGE=1 \
    XDG_RUNTIME_DIR=/tmp/chrome \
    # Node.js settings
    NODE_OPTIONS=--max-old-space-size=2048 \
    # Debug flags
    DEBUG=* \
    # Disable GPU and other problematic features
    LIBGL_ALWAYS_SOFTWARE=1 \
    GPU_SINGLE_ALLOC_PERCENT=100 \
    GPU_MAX_ALLOC_PERCENT=100 \
    # Disable various warnings and popups
    NO_PROXY=* \
    no_proxy=* \
    # Force English output for error messages
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

# Create necessary directories and set permissions
RUN mkdir -p /tmp/chrome-user-data /tmp/chrome /home/node/.cache/puppeteer/chrome/linux-* \
    && chmod -R 777 /tmp/chrome-user-data /tmp/chrome /home/node/.cache/puppeteer \
    && chown -R node:node /tmp/chrome-user-data /tmp/chrome /home/node/.cache/puppeteer

# Install production dependencies only
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./

ENV NODE_ENV=production
ENV PORT=3420
ENV NEXUS_RUN_DIR=/usr/src/app/nexus_run

# Set Puppeteer environment variables to use the installed Chrome
ENV CHROME_BIN=/usr/src/app/node_modules/puppeteer/.local-chromium/linux-*/chrome-linux/chrome
ENV PUPPETEER_EXECUTABLE_PATH=/usr/src/app/node_modules/puppeteer/.local-chromium/linux-*/chrome-linux/chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

# Ensure the Chrome binary is executable
RUN chmod +x ${CHROME_BIN} || true

# Install npm packages
COPY package*.json ./
# Install all dependencies including devDependencies for @midscene/android
RUN npm config set legacy-peer-deps true && \
    npm install && \
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

# Create and set up the startup script
RUN echo '#!/bin/bash' > /usr/local/bin/startup.sh && \
    echo 'set -e' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '### Environment Setup ###' >> /usr/local/bin/startup.sh && \
    echo '# Set display and Chromium paths' >> /usr/local/bin/startup.sh && \
    echo 'export DISPLAY=":99"' >> /usr/local/bin/startup.sh && \
    echo 'export CHROME_BIN=/usr/bin/chromium' >> /usr/local/bin/startup.sh && \
    echo 'export PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium' >> /usr/local/bin/startup.sh && \
    echo 'export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true' >> /usr/local/bin/startup.sh && \
    echo 'export NODE_ENV=production' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '### Directory Setup ###' >> /usr/local/bin/startup.sh && \
    echo 'echo "[Startup] Creating and setting up directories..."' >> /usr/local/bin/startup.sh && \
    echo 'mkdir -p /tmp/chrome-user-data /tmp/chrome /home/node/.config/chromium/Default /home/node/.pki/nssdb' >> /usr/local/bin/startup.sh && \
    echo 'chmod -R 777 /tmp/chrome-user-data /tmp/chrome /home/node/.config/chromium /home/node/.pki' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '### Chrome Sandbox Setup ###' >> /usr/local/bin/startup.sh && \
    echo 'echo "[Startup] Setting up Chrome sandbox..."' >> /usr/local/bin/startup.sh && \
    echo 'echo "#!/bin/sh" > /tmp/chrome-sandbox' >> /usr/local/bin/startup.sh && \
    echo 'echo "exec \$@ --no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage \$CHROME_EXTRA_ARGS" >> /tmp/chrome-sandbox' >> /usr/local/bin/startup.sh && \
    echo 'chmod +x /tmp/chrome-sandbox' >> /usr/local/bin/startup.sh && \
    echo 'export CHROME_DEVEL_SANDBOX=/tmp/chrome-sandbox' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '### Xvfb Startup ###' >> /usr/local/bin/startup.sh && \
    echo 'echo "[Startup] Starting Xvfb..."' >> /usr/local/bin/startup.sh && \
    echo 'Xvfb :99 -screen 0 ${SCREEN_WIDTH}x${SCREEN_HEIGHT}x${SCREEN_DEPTH} -ac +extension RANDR +render -noreset >/tmp/xvfb.log 2>&1 &' >> /usr/local/bin/startup.sh && \
    echo 'Xvfb_PID=$!' >> /usr/local/bin/startup.sh && \
    echo 'echo "Xvfb started with PID: $Xvfb_PID"' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '# Wait for Xvfb to be ready' >> /usr/local/bin/startup.sh && \
    echo 'echo "[Startup] Waiting for Xvfb to be ready..."' >> /usr/local/bin/startup.sh && \
    echo 'for i in {1..30}; do' >> /usr/local/bin/startup.sh && \
    echo '  xdpyinfo -display :99 >/dev/null 2>&1' >> /usr/local/bin/startup.sh && \
    echo '  if [ $? -eq 0 ]; then' >> /usr/local/bin/startup.sh && \
    echo '    echo "[Startup] Xvfb is ready after $i attempts";' >> /usr/local/bin/startup.sh && \
    echo '    break;' >> /usr/local/bin/startup.sh && \
    echo '  fi' >> /usr/local/bin/startup.sh && \
    echo '  if [ $i -eq 30 ]; then' >> /usr/local/bin/startup.sh && \
    echo '    echo "[ERROR] Xvfb failed to start after 30 seconds"' >> /usr/local/bin/startup.sh && \
    echo '    echo "=== Xvfb Process Status ==="' >> /usr/local/bin/startup.sh && \
    echo '    ps aux | grep -i xvfb | grep -v grep' >> /usr/local/bin/startup.sh && \
    echo '    echo ""' >> /usr/local/bin/startup.sh && \
    echo '    echo "=== Xvfb Log ==="' >> /usr/local/bin/startup.sh && \
    echo '    cat /tmp/xvfb.log' >> /usr/local/bin/startup.sh && \
    echo '    echo ""' >> /usr/local/bin/startup.sh && \
    echo '    echo "=== Display Info ==="' >> /usr/local/bin/startup.sh && \
    echo '    xdpyinfo -display :99 2>&1 || echo "Failed to get display info"' >> /usr/local/bin/startup.sh && \
    echo '    exit 1' >> /usr/local/bin/startup.sh && \
    echo '  fi' >> /usr/local/bin/startup.sh && \
    echo '  sleep 1' >> /usr/local/bin/startup.sh && \
    echo 'done' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '### System Information ###' >> /usr/local/bin/startup.sh && \
    echo 'echo ""' >> /usr/local/bin/startup.sh && \
    echo 'echo "=== System Information ==="' >> /usr/local/bin/startup.sh && \
    echo 'echo "Hostname: $(hostname)"' >> /usr/local/bin/startup.sh && \
    echo 'echo "User: $(whoami)"' >> /usr/local/bin/startup.sh && \
    echo 'echo "Working directory: $(pwd)"' >> /usr/local/bin/startup.sh && \
    echo 'uname -a' >> /usr/local/bin/startup.sh && \
    echo 'echo ""' >> /usr/local/bin/startup.sh && \
    echo 'echo "=== Environment Variables ==="' >> /usr/local/bin/startup.sh && \
    echo 'env | grep -E "CHROME|PUPPETEER|DISPLAY|SCREEN|XVFB|XDG|NODE" | sort' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo 'echo "=== Chromium Information ==="' >> /usr/local/bin/startup.sh && \
    echo 'echo "Chromium version: $(/usr/bin/chromium --version 2>&1 || echo "Chromium not found")"' >> /usr/local/bin/startup.sh && \
    echo 'echo "Chromium path: $(which chromium) ($(readlink -f $(which chromium) 2>/dev/null || echo 'not found'))"' >> /usr/local/bin/startup.sh && \
    echo 'echo "Chromium capabilities: $(ls -l $(which chromium) 2>/dev/null)"' >> /usr/local/bin/startup.sh && \
    echo 'echo ""' >> /usr/local/bin/startup.sh && \
    echo 'echo "=== Xvfb Status ==="' >> /usr/local/bin/startup.sh && \
    echo 'ps aux | grep -i "[x]vfb" || echo "No Xvfb process found"' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo 'echo "=== Display Info ==="' >> /usr/local/bin/startup.sh && \
    echo 'xdpyinfo -display :99 >/dev/null 2>&1 && (echo "X server is available"; xdpyinfo -display :99 | grep -A 8 "^name") || echo "X server not available"' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '# Add a small delay to ensure Xvfb is fully ready' >> /usr/local/bin/startup.sh && \
    echo 'echo "Waiting 2 seconds to ensure Xvfb is fully ready..."' >> /usr/local/bin/startup.sh && \
    echo 'sleep 2' >> /usr/local/bin/startup.sh && \
    echo '' >> /usr/local/bin/startup.sh && \
    echo '# Start the application' >> /usr/local/bin/startup.sh && \
    echo 'echo ""' >> /usr/local/bin/startup.sh && \
    echo 'echo "=== Starting Application ==="' >> /usr/local/bin/startup.sh && \
    echo 'echo "Current directory: $(pwd)"' >> /usr/local/bin/startup.sh && \
    echo 'echo "Running: node --max-old-space-size=4096 server.js $@"' >> /usr/local/bin/startup.sh && \
    echo 'echo ""' >> /usr/local/bin/startup.sh && \
    echo 'exec node --max-old-space-size=4096 server.js "$@"' >> /usr/local/bin/startup.sh && \
    chmod +x /usr/local/bin/startup.sh && \
    chown node:node /usr/local/bin/startup.sh

# Switch to non-root user
USER node

# Start the application using the startup script
CMD ["/bin/sh", "/usr/local/bin/startup.sh"]

# Production stage is the default target (last stage in the file) did this for DigitalOcean deployment
# To build a specific stage, use: docker build --target <stage> -t <image> .