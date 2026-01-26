# AITAS Self-Hosted Deployment Guide

This guide explains how to deploy AITAS (AI Test Automation System) on your own infrastructure, enabling you to test applications behind your network firewall.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start with Docker](#quick-start-with-docker)
3. [Configuration](#configuration)
4. [Database Setup](#database-setup)
5. [LLM Configuration](#llm-configuration)
6. [Production Deployment](#production-deployment)
7. [Scaling with Selenium Grid](#scaling-with-selenium-grid)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Minimum Requirements

- **OS**: Linux (Ubuntu 20.04+, CentOS 8+, or similar)
- **CPU**: 4 cores
- **RAM**: 8 GB minimum, 16 GB recommended
- **Storage**: 50 GB SSD
- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher

### Network Requirements

- Outbound internet access for:
  - AI/LLM API calls (OpenAI or custom LLM)
  - Browser automation (downloading browser binaries on first run)
- Internal network access to applications you want to test

---

## Quick Start with Docker

### 1. Clone or Download the Application

```bash
# Clone the repository or extract the downloaded archive
git clone <your-repo-url> aitas
cd aitas
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env

# Edit the configuration
nano .env
```

**Required settings to change:**

```bash
# Security: Generate a secure session secret
SESSION_SECRET=$(openssl rand -base64 32)

# Database: Set a secure password
POSTGRES_PASSWORD=your_secure_database_password

# AI: Add your OpenAI API key
OPENAI_API_KEY=sk-your-api-key-here
```

### 3. Start the Application

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f aitas
```

### 4. Access AITAS

Open your browser and navigate to:
```
http://your-server-ip:5000
```

**Default Admin Credentials:**
- Email: `admin@aitas.com`
- Password: `AitasMaster2024!`

> ⚠️ **Important**: Change the admin password immediately after first login!

---

## Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | Auto-configured |
| `SESSION_SECRET` | Secret for session encryption | Yes | - |
| `OPENAI_API_KEY` | OpenAI API key for AI features | Yes* | - |
| `LLM_API_URL` | Custom LLM endpoint | No | - |
| `LLM_BEARER_TOKEN` | Custom LLM authentication | No | - |
| `APP_PORT` | Application port | No | 5000 |
| `NODE_ENV` | Environment mode | No | production |

*Required unless using a custom LLM

### Using a Custom LLM

If you're using Azure OpenAI, a local LLM, or another OpenAI-compatible API:

```bash
# In your .env file
LLM_API_URL=https://your-llm-endpoint.com/v1/chat/completions
LLM_BEARER_TOKEN=your-bearer-token

# Leave OPENAI_API_KEY empty or unset
OPENAI_API_KEY=
```

---

## Database Setup

### Using Docker (Recommended)

The PostgreSQL database is automatically provisioned by docker-compose. Data is persisted in a Docker volume.

### Using External PostgreSQL

If you prefer to use an existing PostgreSQL server:

1. Create the database:
```sql
CREATE DATABASE aitas;
CREATE USER aitas WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE aitas TO aitas;
```

2. Update your `.env`:
```bash
DATABASE_URL=postgresql://aitas:your_password@your-db-host:5432/aitas
```

3. Comment out the postgres service in `docker-compose.yml`

### Database Migrations

Migrations run automatically on application startup. To manually run migrations:

```bash
docker-compose exec aitas npm run db:push
```

---

## LLM Configuration

AITAS requires an LLM for AI-powered test generation and self-healing capabilities.

### Option 1: OpenAI (Recommended)

```bash
OPENAI_API_KEY=sk-your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
```

### Option 2: Azure OpenAI

```bash
LLM_API_URL=https://your-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-02-01
LLM_BEARER_TOKEN=your-azure-api-key
```

### Option 3: Local LLM (Ollama, LM Studio, etc.)

```bash
LLM_API_URL=http://localhost:11434/v1/chat/completions
LLM_BEARER_TOKEN=not-needed
```

> **Note**: For best results, use a capable model like GPT-4o, Claude 3, or Llama 3 70B+

---

## Health Checks

AITAS provides two endpoints for container orchestration:

### Liveness Probe (`/api/health`)

Lightweight check that the application process is running. Does not check database connectivity.

```bash
curl http://localhost:5000/api/health
# {"status":"healthy","timestamp":"...","version":"1.0.0"}
```

**Kubernetes example:**
```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 5000
  initialDelaySeconds: 10
  periodSeconds: 10
```

### Readiness Probe (`/api/ready`)

Verifies the application is ready to accept traffic, including database connectivity.

```bash
curl http://localhost:5000/api/ready
# {"status":"ready","timestamp":"..."}
```

**Kubernetes example:**
```yaml
readinessProbe:
  httpGet:
    path: /api/ready
    port: 5000
  initialDelaySeconds: 30
  periodSeconds: 10
```

---

## Production Deployment

### HTTPS with Reverse Proxy

For production, use a reverse proxy like Nginx or Traefik:

**Nginx Example:**

```nginx
server {
    listen 443 ssl http2;
    server_name aitas.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Backup and Recovery

**Backup the database:**
```bash
docker-compose exec postgres pg_dump -U aitas aitas > backup_$(date +%Y%m%d).sql
```

**Restore from backup:**
```bash
docker-compose exec -T postgres psql -U aitas aitas < backup_20240101.sql
```

### Updating AITAS

```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## Scaling with Selenium Grid

For high-volume testing or distributed execution, enable Selenium Grid:

```bash
# Start with Selenium Grid profile
docker-compose --profile selenium up -d
```

This starts:
- Selenium Hub on port 4444
- Chrome and Firefox nodes (4 sessions each)

Access Grid console: `http://your-server:4444`

### Connecting to External Selenium Grid

If you have an existing Selenium Grid:

```bash
SELENIUM_GRID_URL=http://your-grid-hub:4444/wd/hub
```

---

## Troubleshooting

### Container Won't Start

Check logs:
```bash
docker-compose logs aitas
```

Common issues:
- Database connection failed: Verify `DATABASE_URL`
- Port already in use: Change `APP_PORT` in `.env`

### Browser Automation Fails

The container needs special permissions for browser automation:
```yaml
# Already configured in docker-compose.yml
cap_add:
  - SYS_ADMIN
security_opt:
  - seccomp:unconfined
```

> **Security Note**: These permissions are required for Playwright to run browsers in Docker. In production environments with strict security requirements, consider:
> 1. Running browser automation on dedicated worker nodes
> 2. Using the optional Selenium Grid profile instead (external containers handle browsers)
> 3. Isolating the AITAS container in its own network segment

### AI Features Not Working

1. Verify your API key is correct
2. Check outbound connectivity to the LLM API
3. Review logs for API error messages:
```bash
docker-compose logs aitas | grep -i "openai\|llm\|api"
```

### Performance Issues

- Increase container resources in `docker-compose.yml`
- Add more Selenium nodes for parallel execution
- Use SSD storage for the database

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Network Firewall                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │              │    │              │    │              │  │
│  │  AITAS App   │───▶│  PostgreSQL  │    │ Selenium Grid│  │
│  │  (Port 5000) │    │  (Port 5432) │    │ (Port 4444)  │  │
│  │              │    │              │    │              │  │
│  └──────┬───────┘    └──────────────┘    └──────────────┘  │
│         │                                                    │
│         ▼                                                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │         Internal Applications Under Test              │   │
│  │     (Behind firewall, accessible from AITAS)          │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         │
         │ Outbound only (for AI/LLM API calls)
         ▼
    ┌──────────────┐
    │  OpenAI API  │
    │  or Custom   │
    │     LLM      │
    └──────────────┘
```

---

## Support

For issues and feature requests:
- Check the [Troubleshooting](#troubleshooting) section
- Review application logs
- Contact your system administrator

---

**Version**: 1.0.0  
**Last Updated**: January 2026
