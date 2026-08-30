# GuardianX — Local Setup Guide (Windows)

## Quick Start (5 minutes)

### Step 1: Install Prerequisites

**Install Git** (if not already installed):
- Download from: https://git-scm.com/download/win
- Install with default settings
- This gives you **Git Bash** (you'll use this to run commands)

**Install Bun** (JavaScript runtime):
- Open **PowerShell** (search "PowerShell" in Start menu)
- Run this command:
  ```powershell
  irm bun.sh/install.ps1 | iex
  ```
- Close PowerShell after it finishes

**Verify both are installed:**
- Open **Git Bash** (search "Git Bash" in Start menu)
- Type: `git --version` → should show a version number
- Type: `bun --version` → should show a version number

### Step 2: Clone GuardianX to D: Drive

Open **Git Bash** and run:
```bash
cd /d/
git clone https://github.com/ayanalidar/GuardianX.git
cd GuardianX
```

This creates `D:\GuardianX` with all the source code.

### Step 3: Install Dependencies

In Git Bash (still in D:\GuardianX):
```bash
bun install
```

Wait for it to finish (about 30 seconds).

### Step 4: Create Environment File

In Git Bash:
```bash
cat > .env.local << 'EOF'
SUPABASE_URL=https://ekjsieovspkuqdjhxwct.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER
NEXT_PUBLIC_SUPABASE_URL=https://ekjsieovspkuqdjhxwct.supabase.co
JWT_SECRET=guardianx-dev-secret-change-in-production
ENGINE_URL=http://localhost:3003
EOF
```

Also create `.env` (for Next.js to load JWT_SECRET):
```bash
cat > .env << 'EOF'
DATABASE_URL=file:D:/GuardianX/db/custom.db
JWT_SECRET=guardianx-dev-secret-change-in-production
EOF
```

### Step 5: Set Up the Sentinel Engine

In Git Bash:
```bash
cd mini-services/sentinel-engine
bun install
cat > .env << 'EOF'
SUPABASE_URL=https://ekjsieovspkuqdjhxwct.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER
NEXT_PUBLIC_SUPABASE_URL=https://ekjsieovspkuqdjhxwct.supabase.co
JWT_SECRET=guardianx-dev-secret-change-in-production
ZAI_API_KEY=placeholder
EOF
cd ../..
```

### Step 6: Start GuardianX

**Option A: Use the .bat file (easiest)**

Double-click `start.bat` in `D:\GuardianX\` (from File Explorer)

This opens two command windows:
- One for the app (port 3000)
- One for the engine (port 3003)

And opens your browser to `http://localhost:3000`

**Option B: Start manually (two Git Bash windows)**

Window 1 (App):
```bash
cd /d/GuardianX
bun run dev
```

Window 2 (Engine):
```bash
cd /d/GuardianX/mini-services/sentinel-engine
bun run dev
```

Then open `http://localhost:3000` in your browser.

### Step 7: Login

- Email: `ayanalidar@gmail.com`
- Password: `AdminPass123!`

---

## Daily Workflow

### Start GuardianX
Double-click `D:\GuardianX\start.bat`

### Stop GuardianX
Close both command windows (or press Ctrl+C in each)

### Update from GitHub
Double-click `D:\GuardianX\update.bat`

### Push Your Changes to GitHub
Double-click `D:\GuardianX\push.bat`

### Open in VS Code
```bash
code D:\GuardianX
```

---

## File Structure

```
D:\GuardianX\
├── start.bat          ← Double-click to start both servers
├── update.bat         ← Double-click to pull latest from GitHub
├── push.bat           ← Double-click to push changes to GitHub
├── .env.local         ← Your credentials (don't share this)
├── .env               ← Next.js config
├── package.json       ← Dependencies
├── src/               ← All source code
│   ├── app/           ← Pages + API routes
│   │   ├── api/       ← 138 API endpoints
│   │   └── page.tsx   ← Main dashboard
│   ├── components/    ← UI components
│   └── lib/           ← Core libraries
│       ├── siem/      ← SIEM engine
│       ├── ai-ops/    ← AI Ops agent
│       └── integrations/ ← 42 connectors
├── mini-services/
│   └── sentinel-engine/  ← SAST/DAST engine (port 3003)
├── prisma/
│   └── schema.prisma  ← Database schema (31 tables)
└── public/            ← Logo, manifest, etc.
```

---

## Troubleshooting

### "bun: command not found"
- Close Git Bash, reopen it, try again
- If still not found: open PowerShell, run `irm bun.sh/install.ps1 | iex`, then restart Git Bash

### "git: command not found"
- Install Git from https://git-scm.com/download/win
- Restart your computer after installation

### Port 3000 already in use
- Another program is using port 3000
- Find and kill it: `netstat -ano | findstr :3000` then `taskkill /PID <number> /F`
- Or change the port: edit `package.json` and change `3000` to `3001`

### Database not working
- Check `.env.local` has the correct Supabase URL and key
- Verify: `curl https://ekjsieovspkuqdjhxwct.supabase.co/rest/v1/User?select=id&limit=1 -H "apikey: YOUR_KEY"`

### Engine not working
- Make sure you're in `mini-services/sentinel-engine` when starting it
- Check `.env` exists in that directory
- Verify: `curl http://localhost:3003/healthz`

### Login fails
- Email: `ayanalidar@gmail.com`
- Password: `AdminPass123!`
- If password doesn't work, reset it via Supabase dashboard

---

## Production vs Local

| | Local (D:\GuardianX) | Production (www.guardianx.in) |
|---|---|---|
| **URL** | http://localhost:3000 | https://www.guardianx.in |
| **Hosting** | Your computer | Vercel |
| **Database** | Supabase (same) | Supabase (same) |
| **Engine** | localhost:3003 | Railway |
| **Purpose** | Development & testing | Live for clients |

Changes flow: Local → `push.bat` → GitHub → Vercel auto-deploys → www.guardianx.in
