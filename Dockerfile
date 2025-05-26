# Use Node.js LTS
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install system dependencies
RUN apk --no-cache add --virtual .gyp python3 make g++

# Copy package files
COPY package*.json ./

# Install app dependencies
RUN npm install --production

# Copy app source
COPY . .

# Set environment to production
ENV NODE_ENV=production
ENV PORT=3420

# Expose the app port
EXPOSE 3420

# Command to run the application
CMD ["node", "server.js"]
