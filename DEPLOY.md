# Assetro Platform – Production Deployment Guide

## Architecture Overview

```
Internet
   │
   ▼
Nginx (443 / 80)
   ├── api.demo.assetro.com     → Unified API  (port 3000)
   ├── app.demo.assetro.com      → web-platform (port 3001)
   │      ├── /        investor portal
   │      └── /issuer  issuer portal
   └── admin.demo.assetro.com    → web-admin    (port 3003)
```

The backend is a **single unified NestJS API** (all modules combined).
Investor and issuer are served by **one** Next.js app (`web-platform`);
the admin console stays separate.
All services run via **PM2** on a single VPS — 3 processes total.

> **Migrating from the split deployment:** the old `investor.demo` and
> `issuer.demo` hosts both now point at `web-platform`. Keep them as 301
> redirects — `investor.demo/*` → `app.demo/*` and `issuer.demo/*` →
> `app.demo/issuer/*` — so existing links keep working.

---

## Recommended Server

| Provider | Plan | Specs | Cost |
|---|---|---|---|
| DigitalOcean Droplet | Basic | 4 GB RAM, 2 vCPU, 80 GB SSD | ~$24/mo |
| AWS EC2 | t3.medium | 4 GB RAM, 2 vCPU | ~$30/mo |
| Hetzner Cloud | CX21 | 4 GB RAM, 2 vCPU | ~$6/mo |

OS: **Ubuntu 22.04 LTS**

---

## Step 1 — Provision the Server

### DNS Setup
Point these DNS records at your server IP:
```
A  demo.assetro.com          → <SERVER_IP>
A  api.demo.assetro.com      → <SERVER_IP>
A  app.demo.assetro.com      → <SERVER_IP>
A  investor.demo.assetro.com → <SERVER_IP>   # 301 → app.demo.assetro.com
A  issuer.demo.assetro.com   → <SERVER_IP>   # 301 → app.demo.assetro.com/issuer
A  admin.demo.assetro.com    → <SERVER_IP>
```

---

## Step 2 — Initial Server Setup

```bash
ssh root@<SERVER_IP>

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Install PM2 globally
npm install -g pm2

# Install Nginx
apt install -y nginx

# Install Certbot (SSL)
apt install -y certbot python3-certbot-nginx

# Install PostgreSQL 15
apt install -y postgresql postgresql-contrib

# Install Git
apt install -y git
```

---

## Step 3 — Configure PostgreSQL

```bash
sudo -u postgres psql

# Inside psql:
CREATE USER assetro WITH PASSWORD 'your_strong_password_here';
CREATE DATABASE assetro OWNER assetro;
GRANT ALL PRIVILEGES ON DATABASE assetro TO assetro;

\c assetro
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS tenant_demo AUTHORIZATION assetro;
\q
```

> **Generate a strong DB password:** `openssl rand -base64 20`

---

## Step 4 — Clone & Build

```bash
# Create app directory
mkdir -p /opt/assetro
cd /opt/assetro

# Clone from GitHub
git clone https://github.com/abhishekbed/Assetro.git .

# Install all dependencies
pnpm install

# Build the unified API
cd apps/api
npx tsc --project tsconfig.json --outDir ./dist --noEmit false
cd ../..

# Build Next.js frontends
cd apps/web-platform && pnpm run build && cd ../..
cd apps/web-admin    && pnpm run build && cd ../..

# Create logs directory
mkdir -p logs
```

---

## Step 5 — Configure Environment Variables

### API (.env in project root)
```bash
cat > /opt/assetro/.env << 'EOF'
NODE_ENV=production
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=assetro
DB_PASSWORD=your_strong_password_here
DB_NAME=assetro
DB_SCHEMA=tenant_demo

# JWT
JWT_SECRET=your_32_char_random_secret_here
JWT_EXPIRES_IN=86400s

# CORS — list all frontend domains
CORS_ORIGINS=https://app-assetro.appworkdemo.com,https://admin-assetro.appworkdemo.com

# Stripe (optional — for payments)
STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_REAL_KEY
STRIPE_WEBHOOK_SECRET=whsec_REPLACE_WITH_REAL_SECRET

# Blockchain mode
BLOCKCHAIN_MODE=local
EOF
```

> **Generate JWT_SECRET:** `openssl rand -hex 32`

### Frontend .env files
```bash
# web-platform (investor + issuer)
cat > /opt/assetro/apps/web-platform/.env.production << 'EOF'
NEXT_PUBLIC_API_URL=https://api.demo.assetro.com/api/v1
EOF

# web-admin
cat > /opt/assetro/apps/web-admin/.env.production << 'EOF'
NEXT_PUBLIC_API_URL=https://api.demo.assetro.com/api/v1
EOF
```

> After creating `.env.production` files, rebuild the frontends so Next.js picks up the env vars.

---

## Step 6 — Start All Services with PM2

```bash
cd /opt/assetro

# Start all services (1 API + 2 frontends)
pm2 start ecosystem.config.js --env production

# Check status
pm2 status

# View logs
pm2 logs

# Save process list (auto-restart on reboot)
pm2 save

# Register PM2 as system service
pm2 startup
# Run the command it prints (sudo env PATH=...)
```

Expected PM2 output:
```
┌──────────────┬────┬──────┬───────┬────────┬─────────┐
│ name         │ id │ mode │ pid   │ status │ cpu/mem │
├──────────────┼────┼──────┼───────┼────────┼─────────┤
│ assetro-api   │ 0  │ fork │ ...   │ online │ ...     │
│ web-platform │ 1  │ fork │ ...   │ online │ ...     │
│ web-admin    │ 2  │ fork │ ...   │ online │ ...     │
└──────────────┴────┴──────┴───────┴────────┴─────────┘
```

---

## Step 7 — Configure Nginx

`infrastructure/nginx/nginx.conf` proxies:

| Host | Upstream | Serves |
|---|---|---|
| `api.demo.assetro.com` | `127.0.0.1:3000` | unified API |
| `app.demo.assetro.com` | `127.0.0.1:3001` | investor at `/`, issuer at `/issuer` |
| `admin.demo.assetro.com` | `127.0.0.1:3003` | admin console |

The retired `investor.demo` and `issuer.demo` hosts are 301 redirects to
`app.demo.assetro.com` and `app.demo.assetro.com/issuer` respectively, so old
bookmarks keep working. Nothing listens on port 3002 any more.

```bash
# Copy Nginx config
cp /opt/assetro/infrastructure/nginx/nginx.conf /etc/nginx/sites-available/assetro

# Enable the site
ln -s /etc/nginx/sites-available/assetro /etc/nginx/sites-enabled/assetro

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Test config
nginx -t

# Get SSL certificates
certbot --nginx -d demo.assetro.com \
        -d api.demo.assetro.com \
        -d app.demo.assetro.com \
        -d investor.demo.assetro.com \
        -d issuer.demo.assetro.com \
        -d admin.demo.assetro.com

# Restart Nginx
systemctl restart nginx
systemctl enable nginx
```

---

## Step 8 — Seed Initial Data

The API uses TypeORM with `synchronize: true`, so tables are auto-created on first start.

To create demo users, use the API's register endpoint:
```bash
# Register admin
curl -X POST https://api.demo.assetro.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@assetro.com","password":"Admin@12345","name":"Platform Admin","role":"admin"}'

# Register issuer
curl -X POST https://api.demo.assetro.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"issuer@assetro.com","password":"Issuer@1234","name":"Priya Patel","role":"issuer"}'

# Register investor
curl -X POST https://api.demo.assetro.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"investor@assetro.com","password":"Investor@123","name":"Rahul Sharma","role":"investor"}'
```

---

## Step 9 — Verify Everything Works

```bash
# Check API health
curl https://api.demo.assetro.com/health

# Test login
curl -X POST https://api.demo.assetro.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@assetro.com","password":"Admin@12345"}'

# Check frontends (should return HTML)
curl -I https://app.demo.assetro.com
curl -I https://app.demo.assetro.com/issuer
curl -I https://admin.demo.assetro.com

# Legacy hosts should answer 301 to the combined app
curl -I https://investor.demo.assetro.com
curl -I https://issuer.demo.assetro.com
```

Then sign in once per portal to confirm role routing:

| Check | Expected |
|---|---|
| `/launch` | shows both Investor and Issuer options |
| issuer credentials at `/login` | rejected, told to use the Issuer sign-in |
| investor credentials at `/issuer/login` | rejected, told to use the Investor sign-in |
| issuer visits `/dashboard` directly | redirected to `/issuer/dashboard` |

---

## Deploy Updates

```bash
cd /opt/assetro

# Pull latest code
git pull origin main

# Rebuild API
cd apps/api
npx tsc --project tsconfig.json --outDir ./dist --noEmit false
cd ../..

# Rebuild frontends (only if frontend code changed)
cd apps/web-platform && pnpm run build && cd ../..
cd apps/web-admin    && pnpm run build && cd ../..

# Restart all services
pm2 restart all

# Or restart only the API
pm2 restart assetro-api
```

---

## Useful PM2 Commands

```bash
pm2 status                  # List all processes
pm2 logs                    # Tail all logs
pm2 logs assetro-api         # Logs for API only
pm2 restart all             # Restart everything
pm2 restart assetro-api      # Restart just API
pm2 stop all                # Stop everything
pm2 monit                   # Live CPU/RAM dashboard
pm2 reload ecosystem.config.js --env production  # Zero-downtime reload
```

---

## Firewall Rules

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'      # ports 80 and 443
ufw deny 3000:3003/tcp      # block direct access (Nginx handles it; 3002 now unused)
ufw enable
```

---

## URLs After Deployment

| Portal | URL |
|---|---|
| Investor Portal | https://app.demo.assetro.com |
| Issuer Portal | https://app.demo.assetro.com/issuer |
| Admin Console | https://admin.demo.assetro.com |
| API | https://api.demo.assetro.com/api/v1 |
| Health Check | https://api.demo.assetro.com/health |

---

## Demo Login Credentials

| Role | Email | Password |
|---|---|---|
| Admin | admin@assetro.com | Admin@12345 |
| Issuer | issuer@assetro.com | Issuer@1234 |
| Investor | investor@assetro.com | Investor@123 |

---

## Troubleshooting

**API crashes on start:**
```bash
pm2 logs assetro-api --err --lines 50
```

**Database connection refused:**
```bash
sudo systemctl status postgresql
sudo -u postgres psql -c "\l"
```

**Nginx 502 Bad Gateway:**
```bash
pm2 status                    # check if service is online
curl http://localhost:3000/health   # test API directly
nginx -t && systemctl reload nginx
```

**Port already in use:**
```bash
lsof -i :3000
pm2 delete assetro-api && pm2 start ecosystem.config.js --only assetro-api --env production
```
