# GuardianX — Deployment Guide

## Free Tier Stack
- **Frontend + API**: Vercel (free forever)
- **Database**: Supabase (free forever — 500MB PostgreSQL)
- **AI**: Z.AI SDK (auto-configured)

## Step 1: Create Supabase Project
1. Go to https://supabase.com → Sign up (free)
2. Create new project → name it "guardianx"
3. Choose a strong database password
4. Wait for provisioning (~2 min)
5. Go to: Project Settings → Database → Connection string
6. Copy the **Connection string** (URI format)
   - Looks like: `postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
7. Replace `[YOUR-PASSWORD]` with your actual password

## Step 2: Push Code to GitHub
```bash
cd /home/z/my-project

# Initialize git (if not already)
git init

# Create .gitignore (already exists — verify it excludes .env, node_modules, .next)
cat .gitignore

# Add all files
git add .

# Commit
git commit -m "GuardianX — production ready (Supabase + Vercel)"

# Create a new GitHub repo:
# 1. Go to https://github.com/new
# 2. Name: guardianx
# 3. Private (recommended)
# 4. Don't initialize with README
# 5. Click "Create repository"

# Push to GitHub
git remote add origin https://github.com/YOUR_USERNAME/guardianx.git
git branch -M main
git push -u origin main
```

## Step 3: Deploy to Vercel
1. Go to https://vercel.com → Sign up with GitHub
2. Click "Add New Project"
3. Import the `guardianx` repository
4. Configure:
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `bun run build` (or `npm run build`)
   - **Output Directory**: `.next` (auto-detected)
   - **Install Command**: `bun install` (or `npm install`)
5. **Environment Variables** — add ALL of these:
   ```
   DATABASE_URL = postgresql://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
   SENTINEL_ENC_KEY = (generate with: openssl rand -base64 32)
   NODE_ENV = production
   ```
6. Click "Deploy" — wait ~3-5 minutes for build
7. Vercel gives you a URL: `https://guardianx-xxxx.vercel.app`

## Step 4: Initialize Database
After the first deploy succeeds:

### Option A: Run locally against Supabase
```bash
# Set the Supabase URL in your local .env
export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres"

# Push the schema to Supabase
bun run db:push

# Seed initial data
bun run scripts/seed.ts
```

### Option B: Use Vercel CLI
```bash
npm i -g vercel
vercel login
vercel link  # link to your project
vercel env pull .env  # get production env vars

# Push schema
DATABASE_URL="your-supabase-url" bun run db:push

# Seed
DATABASE_URL="your-supabase-url" bun run scripts/seed.ts
```

## Step 5: Create Admin Account
1. Visit your Vercel URL
2. Click "Enter Lab Console"
3. Click "Create Account"
4. Fill in name, email, password
5. First account = Admin role
6. You're in the console!

## Step 6: Add Custom Domain (Optional)
1. In Vercel: Project Settings → Domains
2. Add `guardianx.in` (or your domain)
3. Add the DNS record Vercel shows you
4. SSL is automatic

## Architecture
```
User Browser
    │
    ▼
Vercel (Next.js)
├── Frontend (React + Tailwind)
├── API Routes (30+ endpoints)
├── AI Pipeline (Z.AI SDK)
├── Socket.io (bundled in Next.js)
├── Python Scraper (serverless function)
└── Prisma ORM
        │
        ▼
Supabase (PostgreSQL)
├── Codebases, Patches, Scans
├── Findings, Engagements, Targets
├── Users, Credentials, Attestations
├── Canaries, ApiAccessLogs, HoneypotHits
└── AttackChains, Webhooks, Alerts, etc.
```

## Troubleshooting

### Build fails on Vercel
- Ensure `NODE_ENV=production` is set
- Check that `SENTINEL_ENC_KEY` is set (32-byte base64)
- The `typescript.ignoreBuildErrors: true` in next.config.ts handles TS issues

### Database connection fails
- Ensure `DATABASE_URL` uses the Supabase connection string
- Format: `postgresql://postgres:PASSWORD@db.REF.supabase.co:5432/postgres`
- Test: `psql "your-connection-string" -c "SELECT 1"`

### AI features don't work
- The Z.AI SDK auto-configures in the sandbox
- For external deployment, you need to set `ZAI_API_KEY` (contact Z.AI for access)

### Socket.io doesn't connect
- The socket.io relay is bundled into the Next.js app
- It uses the same port (3000) — no separate service needed
- Vercel supports WebSocket connections on serverless functions

## What's Included
- 30+ API endpoints
- 29 React components
- 6 Prisma models → 20+ tables
- Python audit scraper engine
- Socket.io real-time events
- Full authentication system
- VAPT PDF report generator (Python + ReportLab)
- Sci-fi themed UI (matrix rain, holographic cards, HUD)
