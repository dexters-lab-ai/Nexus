#!/bin/bash

# Create Chrome sandbox directory with correct permissions
mkdir -p /tmp/chrome-sandbox
chmod 755 /tmp/chrome-sandbox
chown node:node /tmp/chrome-sandbox

# Create Chrome sandbox wrapper
echo '#!/bin/sh
exec /usr/bin/chromium-browser --no-sandbox "$@"' > /tmp/chrome-sandbox/chrome
chmod +x /tmp/chrome-sandbox/chrome
export PATH="/tmp/chrome-sandbox:$PATH"

# Start Xvfb on display :99
Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &

# Small delay to ensure Xvfb is ready
sleep 2

# Verify Xvfb is running
if ! xdpyinfo -display :99 >/dev/null 2>&1; then
  echo "Xvfb failed to start"
  exit 1
fi

echo "Xvfb is running on :99"

# Set display for the application
export DISPLAY=:99

# Make sure the sandbox is accessible
export CHROME_DEVEL_SANDBOX=/tmp/chrome-sandbox/chrome

# Start the application
exec "$@"
