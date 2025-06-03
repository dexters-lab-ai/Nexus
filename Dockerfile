# Use Node.js 18 LTS
FROM node:18.20.3-bullseye-slim

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

# Install all dependencies including devDependencies
RUN npm install --legacy-peer-deps

# Copy environment files
COPY .env.development .env

# Create necessary directories
RUN mkdir -p nexus_run public/{assets,models,textures}

# Copy app source
COPY . .

# Expose ports (Vite + API)
EXPOSE 3000 3420

# Health check
HEALTHCHECK --interval=60s --timeout=3s \
  CMD curl -f http://localhost:3420/api/health || exit 1

# Start the application in development mode
CMD ["npm", "run", "dev"]
