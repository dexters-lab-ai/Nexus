# Use Node.js LTS
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY server.js .

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Build the app (if needed)
# RUN npm run build

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD [ "node", "server.js" ]
