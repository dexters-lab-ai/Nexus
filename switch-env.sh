#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ENV=$1

if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    echo "Usage: ./switch-env.sh [dev|prod]"
    echo "  dev  - Switch to development environment"
    echo "  prod - Switch to production environment"
    exit 1
fi

echo -e "${YELLOW}Switching to $ENV environment...${NC}"

# Create envs directory if it doesn't exist
mkdir -p envs

if [ "$ENV" = "dev" ]; then
    # Development environment
    echo "Setting up development environment..."
    
    # Create docker-compose.override.yml for development
    cat > docker-compose.override.yml << 'EOL'
version: '3.8'

services:
  app:
    build:
      dockerfile: Dockerfile.dev
    environment:
      - NODE_ENV=development
      - VITE_API_URL=http://localhost:3420
      - VITE_WS_URL=ws://localhost:3420
      - FRONTEND_URL=http://localhost:3000
      - APP_DOMAIN=localhost
      - DOCKER=false
    ports:
      - "3000:3000"  # Vite dev server
      - "3420:3420"  # Backend server
    volumes:
      - .:/usr/src/app
      - /usr/src/app/node_modules
EOL

    # Create .env file for development
    cp -f .env.example .env
    
    echo -e "${GREEN}✓ Development environment configured${NC}"
    echo -e "Run ${YELLOW}docker-compose up --build${NC} to start the development server"

else
    # Production environment
    echo "Setting up production environment..."
    
    # Remove development overrides
    rm -f docker-compose.override.yml
    
    # Ensure .env.production exists
    if [ ! -f ".env.production" ]; then
        echo -e "${YELLOW}Warning: .env.production not found. Creating from example...${NC}"
        cp -n .env.example .env.production
        echo -e "${YELLOW}Please update .env.production with your production values${NC}"
    fi
    
    # Create .env file for production
    cp -f .env.production .env
    
    echo -e "${GREEN}✓ Production environment configured${NC}"
    echo -e "Run ${YELLOW}docker-compose up --build -d${NC} to start in production mode"
fi

echo -e "\nCurrent environment: ${GREEN}$ENV${NC}"
