#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ENV=$1

if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    echo "Usage: ./backup-env.sh [dev|prod]"
    echo "  dev  - Backup current .env as dev environment"
    echo "  prod - Backup current .env as production environment"
    exit 1
fi

# Create envs directory if it doesn't exist
mkdir -p envs

if [ "$ENV" = "dev" ]; then
    if [ -f ".env" ]; then
        cp .env "envs/.env.dev"
        echo -e "${GREEN}✓ Development environment configuration saved to envs/.env.dev${NC}"
    else
        echo -e "${YELLOW}No .env file found to back up${NC}"
    fi
else
    if [ -f ".env" ]; then
        cp .env "envs/.env.prod"
        echo -e "${GREEN}✓ Production environment configuration saved to envs/.env.prod${NC}"
    else
        echo -e "${YELLOW}No .env file found to back up${NC}"
    fi
fi
