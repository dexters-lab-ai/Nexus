#!/bin/bash
set -e

# This script sets up the Android environment for the Nexus application
# It should be called during container startup

echo "[setup-android-env] Setting up Android environment..."

# Default paths
ANDROID_HOME="/opt/android-sdk"
ANDROID_SDK_ROOT="${ANDROID_HOME}"
PLATFORM_TOOLS="${ANDROID_HOME}/platform-tools"
TOOLS="${ANDROID_HOME}/tools"
TOOLS_BIN="${ANDROID_HOME}/tools/bin"
EMULATOR="${ANDROID_HOME}/emulator"

# Create required directories if they don't exist
mkdir -p "${ANDROID_HOME}" "${PLATFORM_TOOLS}" "${TOOLS}" "${TOOLS_BIN}" "${EMULATOR}"

# Export environment variables
export ANDROID_HOME
export ANDROID_SDK_ROOT
export PATH="${PLATFORM_TOOLS}:${TOOLS}:${TOOLS_BIN}:${EMULATOR}:${PATH}"

# Create a profile.d script to ensure the environment is loaded in all shells
cat > /etc/profile.d/android-env.sh << 'EOL'
#!/bin/sh
# Android environment variables
export ANDROID_HOME="/opt/android-sdk"
export ANDROID_SDK_ROOT="${ANDROID_HOME}"
export PATH="${ANDROID_HOME}/platform-tools:${ANDROID_HOME}/tools:${ANDROID_HOME}/tools/bin:${ANDROID_HOME}/emulator:${PATH}"

# Debug output
if [ "${DEBUG:-0}" = "1" ]; then
    echo "[android-env] ANDROID_HOME=${ANDROID_HOME}"
    echo "[android-env] ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT}"
    echo "[android-env] PATH=${PATH}"
fi
EOL

# Make the profile script executable
chmod +x /etc/profile.d/android-env.sh

# Source the environment to make it available in the current shell
. /etc/profile.d/android-env.sh

# Verify environment setup
echo "[setup-android-env] Environment verification:"
echo "  ANDROID_HOME=${ANDROID_HOME}"
echo "  ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT}"
echo "  PATH=${PATH}"

# Verify ADB is available
if ! command -v adb >/dev/null 2>&1; then
    echo "[setup-android-env] WARNING: ADB not found in PATH"
    echo "  Current PATH: ${PATH}"
    exit 1
else
    echo "[setup-android-env] ADB found: $(which adb)"
    adb version
fi

echo "[setup-android-env] Android environment setup complete"
