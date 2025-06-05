# Environment Switching Guide

This project includes scripts to easily switch between development and production environments.

## Available Scripts

### 1. Switch Environment

```bash
# Switch to development environment
./switch-env.sh dev

# Switch to production environment
./switch-env.sh prod
```

### 2. Backup Current Environment

```bash
# Backup current .env as development config
./backup-env.sh dev

# Backup current .env as production config
./backup-env.sh prod
```

## How It Works

### Development Mode (`./switch-env.sh dev`)
- Uses `Dockerfile.dev`
- Enables hot reloading
- Mounts local source code into container
- Runs in development mode with verbose logging
- Accessible at http://localhost:3000 (frontend) and http://localhost:3420 (backend)

### Production Mode (`./switch-env.sh prod`)
- Uses `Dockerfile`
- Optimized for production
- Uses production environment variables
- Includes health checks and resource limits
- Runs in detached mode (`-d`)

## Production Deployment

1. Switch to production mode:
   ```bash
   ./switch-env.sh prod
   ```

2. Build and start the containers:
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
   ```

3. View logs:
   ```bash
   docker-compose logs -f
   ```

## Environment Files

- `.env` - Active environment configuration
- `.env.production` - Production environment template
- `envs/.env.dev` - Development environment backup
- `envs/.env.prod` - Production environment backup

## Tips

- Always run `./backup-env.sh` before making changes to save your current configuration
- The `envs/` directory is in `.gitignore` to prevent committing sensitive data
- Production builds are optimized for performance and security
