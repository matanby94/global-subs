# Server Infrastructure

Production infrastructure running on Hetzner Cloud.

## Server Specifications

| Property | Value |
|----------|-------|
| Provider | Hetzner Cloud |
| IP | `178.104.8.231` |
| Arch | ARM64 (aarch64) |
| OS | Ubuntu 24.04 LTS (kernel 6.8.0) |
| SSH | `root@178.104.8.231` via key auth |
| App Directory | `/app` |

## Domain & DNS

**Domain**: `globalsubs-ai.com` (registered with GoDaddy)

### DNS Records

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | `@` | `178.104.8.231` | 600s |
| A | `api` | `178.104.8.231` | 600s |
| A | `addon` | `178.104.8.231` | 600s |
| CNAME | `www` | `globalsubs-ai.com.` | 1h |

### URL Routing

| URL | Service | Internal Port |
|-----|---------|---------------|
| `https://globalsubs-ai.com` | Next.js Web App | 3010 |
| `https://api.globalsubs-ai.com` | Fastify REST API | 3011 |
| `https://addon.globalsubs-ai.com` | Stremio Add-on | 3012 |

## Nginx Reverse Proxy

Nginx serves as the TLS-terminating reverse proxy for all three domains.

### Configuration

Config file: `/etc/nginx/sites-available/globalsubs` (symlinked to `sites-enabled`)

```nginx
# globalsubs-ai.com → Web (Next.js on port 3010)
server {
    listen 443 ssl;
    server_name globalsubs-ai.com www.globalsubs-ai.com;

    ssl_certificate /etc/letsencrypt/live/globalsubs-ai.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/globalsubs-ai.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# api.globalsubs-ai.com → API (Fastify on port 3011)
server {
    listen 443 ssl;
    server_name api.globalsubs-ai.com;
    client_max_body_size 50M;
    # ... same proxy config to 127.0.0.1:3011
}

# addon.globalsubs-ai.com → Stremio Addon (port 3012)
server {
    listen 443 ssl;
    server_name addon.globalsubs-ai.com;
    # ... same proxy config to 127.0.0.1:3012
}

# HTTP → HTTPS redirects (auto-configured by certbot)
server {
    listen 80;
    server_name globalsubs-ai.com www.globalsubs-ai.com api.globalsubs-ai.com addon.globalsubs-ai.com;
    return 301 https://$host$request_uri;
}
```

### Common Nginx Commands

```bash
# Test configuration
nginx -t

# Reload (graceful)
systemctl reload nginx

# View error logs
tail -f /var/log/nginx/error.log

# View access logs
tail -f /var/log/nginx/access.log
```

## SSL/TLS Certificates

Certificates are managed by **Let's Encrypt** via **certbot** with the Nginx plugin.

| Property | Value |
|----------|-------|
| Certificate path | `/etc/letsencrypt/live/globalsubs-ai.com/` |
| Domains covered | `globalsubs-ai.com`, `www.globalsubs-ai.com`, `api.globalsubs-ai.com`, `addon.globalsubs-ai.com` |
| Expiry | Auto-renews (certbot timer) |
| Renewal command | `certbot renew` (runs automatically) |

### Manual certificate renewal

```bash
certbot renew --dry-run   # Test renewal
certbot renew             # Actually renew
```

### Re-issue certificates

If domains change:

```bash
certbot --nginx \
  -d globalsubs-ai.com \
  -d www.globalsubs-ai.com \
  -d api.globalsubs-ai.com \
  -d addon.globalsubs-ai.com \
  --non-interactive --agree-tos \
  -m matanby94@gmail.com --redirect
```

## Docker Setup

### Installed Software

| Software | Version |
|----------|---------|
| Docker | 28.2.2 |
| Docker Compose | v2.37.1 |
| Nginx | 1.24.0 |
| Certbot | 2.9.0 |
| Git | (system) |

### Docker DNS

Docker is configured with public DNS servers because the host uses systemd-resolved (127.0.0.53) which doesn't work inside containers:

```json
// /etc/docker/daemon.json
{
  "dns": ["1.1.1.1", "8.8.8.8"]
}
```

### Docker Compose Services

All 7 services run via `infra/docker-compose.prod.yml`:

```
globalsubs-postgres   ─ PostgreSQL 16 (healthcheck, persistent volume)
globalsubs-redis      ─ Redis 7 (password-protected, 256MB max)
globalsubs-api        ─ Fastify REST API (port 3011→3001)
globalsubs-workers    ─ BullMQ translation workers (no port)
globalsubs-addon      ─ Stremio addon (port 3012→7000)
globalsubs-scrapers   ─ Subtitle scrapers (no port)
globalsubs-web        ─ Next.js web app (port 3010→3000)
```

### ARM64 Notes

The server runs on ARM64 (aarch64). Key considerations:

- **pnpm installation**: `corepack` fails on ARM64 — all Dockerfiles use `npm install -g pnpm@8.15.0` instead
- **Docker images**: All images use `node:20-alpine` which has native ARM64 support
- **Native builds**: Images are built directly on the server (no cross-compilation)

## Firewall

Ensure these ports are open in Hetzner firewall:

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH |
| 80 | TCP | HTTP (redirects to HTTPS) |
| 443 | TCP | HTTPS |

Docker container ports (3010-3012) do NOT need to be exposed externally — Nginx proxies to them on localhost.

## Server Maintenance

### View running containers

```bash
docker compose --env-file .env -f infra/docker-compose.prod.yml ps
```

### View resource usage

```bash
docker stats --no-stream
```

### Disk cleanup

```bash
docker system prune -af    # Remove unused images, networks, build cache
docker volume prune -f      # Remove unused volumes (CAREFUL: may delete data)
```

### System updates

```bash
apt update && apt upgrade -y
# Reboot if kernel was updated
reboot
```

### Backup PostgreSQL

```bash
docker exec globalsubs-postgres pg_dump -U stremio stremio_ai_subs > backup_$(date +%Y%m%d).sql
```

### Restore PostgreSQL

```bash
cat backup_20260228.sql | docker exec -i globalsubs-postgres psql -U stremio -d stremio_ai_subs
```
