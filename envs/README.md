# Environment Backups

This directory contains backup copies of environment configuration files for different deployment environments.

## Files

- `.env.dev` - Development environment configuration backup
- `.env.prod` - Production environment configuration backup

## Purpose

These files serve as backups of the main `.env` file for different environments. They are automatically updated by the `backup-env.sh` script.

## Usage

To back up your current environment configuration:

```bash
# For development environment
./backup-env.sh dev

# For production environment
./backup-env.sh prod
```

## Security Notes

1. This directory is included in `.gitignore` to prevent accidental commits of sensitive data
2. Never commit these files to version control
3. These are just backups - the main `.env` file in the root directory is what's actually used by the application

## Restoring an Environment

To restore an environment from backup:

```bash
# For development
cp envs/.env.dev .env

# For production
cp envs/.env.prod .env
```

## Related Files

- `backup-env.sh` - Script to back up the current environment
- `ENVIRONMENT-SWITCHING.md` - Documentation about environment management
