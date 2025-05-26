# Use Node.js LTS
FROM node:18-alpine AS builder

# Create app directory
WORKDIR /usr/src/app

# Install system dependencies
RUN apk --no-cache add --virtual .gyp python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies)
RUN npm install

# Copy app source
COPY . .

# Build the application if needed
RUN if [ -f "package.json" ] && [ -d "main-site" ]; then \
      cd main-site && \
      npm install && \
      npm run build && \
      cp -r dist/* ../public/; \
    fi

# Production stage
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install production dependencies only
COPY --from=builder /usr/src/app/package*.json ./
RUN npm install --production

# Copy built files and required directories
COPY --from=builder /usr/src/app/server.js .
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/main-site ./main-site
COPY --from=builder /usr/src/app/nexus_run ./nexus_run

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3420

# Expose the app port
EXPOSE 3420

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

# Command to run the application
CMD ["node", "server.js"]
