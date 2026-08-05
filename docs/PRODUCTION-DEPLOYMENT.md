# GuardianX Production Deployment Guide

## Prerequisites

- A VPS with 8GB+ RAM (Hetzner CX32 ₹2K/mo, DigitalOcean 4GB+ ₹3K/mo, Hostinger VPS)
- Docker + Docker Compose installed
- A domain name pointing to your server (A record → server IP)
- Supabase project (free tier works)

## Quick Start (5 minutes)

### 1. Clone the repo
```bash
git clone https://github.com/ayanalidar/GuardianX.git
cd GuardianX
```

### 2. Create .env.production
```bash
cp .env.example .env.production
nano .env.production
```

### 3. Generate strong secrets
```bash
openssl rand -hex 32  # → JWT_SECRET
openssl rand -hex 32  # → BREAK_GLASS_KEY
```

### 4. Update Caddyfile.production
Replace `guardianx.in` with your actual domain.

### 5. Start everything
```bash
docker compose up -d --build
```

### 6. Initialize the database
```bash
curl -X POST https://your-domain.com/api/db-init
```

### 7. Create your admin account
Open `https://your-domain.com` → "Enter Lab" → "Create Account". First user = admin.

## Server Requirements

| RAM | What works |
|---|---|
| 4GB | Web app only (no recon-tools) |
| 8GB | Full stack (recommended) |
| 16GB | Production with concurrent scans |

## Managing the Deployment

### View logs
```bash
docker compose logs -f guardianx      # web app
docker compose logs -f sentinel-engine # engine
docker compose logs -f recon-tools     # nmap/nuclei
docker compose logs -f caddy           # proxy
```

### Update to latest version
```bash
git pull origin main
docker compose up -d --build
```

### Stop everything
```bash
docker compose down
```

## SSL Certificate
Caddy auto-provisions Let's Encrypt SSL. No manual setup needed.

## Backup
```bash
# Daily cron (add to crontab: 0 2 * * *)
cd /path/to/GuardianX && bun run backup >> logs/backup.log 2>&1
```

## Security Checklist
- [ ] JWT_SECRET is 64+ chars
- [ ] BREAK_GLASS_KEY is set
- [ ] .env.production NOT in git
- [ ] Firewall: only 80, 443, 22 open
- [ ] SSH key auth (no password)
- [ ] Daily backups configured
