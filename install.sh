#!/bin/bash
# GuardianX — Local Development Setup Script
# Installs everything needed to run GuardianX on your local machine
# Usage: Save this file and run: bash install.sh
#
# This will:
#   1. Install Bun (if not installed)
#   2. Install Git (if not installed)
#   3. Clone GuardianX to D:\GuardianX (or chosen drive)
#   4. Install all dependencies
#   5. Create .env.local with your Supabase credentials
#   6. Set up the sentinel-engine
#   7. Start both servers (app + engine)
#
# Works on: Windows (Git Bash / WSL), macOS, Linux

set -e

# ── Colors ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_step() { echo -e "${CYAN}[GuardianX]${NC} $1"; }
print_ok()   { echo -e "${GREEN}[OK]${NC} $1"; }
print_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_err()  { echo -e "${RED}[ERROR]${NC} $1"; }

# ── Configuration ──────────────────────────────────────────────────────────

# Default install location — change this to your preferred drive
# Windows examples: "D:/GuardianX"  "C:/GuardianX"  "E:/GuardianX"
# macOS/Linux:      "$HOME/GuardianX"  "/opt/GuardianX"
DEFAULT_INSTALL_DIR="D:/GuardianX"

# Your Supabase credentials (already configured)
SUPABASE_URL="https://ekjsieovspkuqdjhxwct.supabase.co"
SUPABASE_KEY="SUPABASE_SERVICE_ROLE_KEY_PLACEHOLDER"
JWT_SECRET="guardianx-dev-secret-change-in-production"

# GitHub repo
REPO_URL="https://github.com/ayanalidar/GuardianX.git"

echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo "  GuardianX — Local Development Setup"
echo "  Autonomous Security Operations Platform"
echo "  www.guardianx.in | hello@guardianx.in"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Choose install directory ────────────────────────────────────────
echo "Where do you want to install GuardianX?"
echo "  Default: $DEFAULT_INSTALL_DIR"
echo "  Press Enter for default, or type a different path:"
read -r INSTALL_DIR
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

# Normalize path (remove trailing slash)
INSTALL_DIR="${INSTALL_DIR%/}"
INSTALL_DIR="${INSTALL_DIR%\\}"

print_step "Installing to: $INSTALL_DIR"

# Create directory if it doesn't exist
if [ ! -d "$INSTALL_DIR" ]; then
  print_step "Creating directory..."
  mkdir -p "$INSTALL_DIR"
  print_ok "Directory created"
else
  print_warn "Directory already exists. Files will be merged/overwritten."
fi

cd "$INSTALL_DIR" || { print_err "Cannot access $INSTALL_DIR"; exit 1; }

# ── Step 2: Check / Install Bun ─────────────────────────────────────────────
print_step "Checking for Bun runtime..."

if command -v bun &> /dev/null; then
  BUN_VERSION=$(bun --version)
  print_ok "Bun $BUN_VERSION is installed"
else
  print_step "Bun not found. Installing Bun..."
  if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OS" == "Windows_NT" ]]; then
    # Windows
    print_step "On Windows — using PowerShell to install Bun..."
    powershell -Command "irm bun.sh/install.ps1 | iex" 2>/dev/null || {
      print_warn "Automatic install failed. Please install Bun manually:"
      echo "  PowerShell: irm bun.sh/install.ps1 | iex"
      echo "  Or download from: https://bun.sh"
      echo ""
      echo "After installing Bun, re-run this script."
      exit 1
    }
  else
    # macOS / Linux
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi
  
  if command -v bun &> /dev/null; then
    BUN_VERSION=$(bun --version)
    print_ok "Bun $BUN_VERSION installed successfully"
  else
    print_err "Bun installation failed. Please install manually from https://bun.sh"
    exit 1
  fi
fi

# ── Step 3: Check / Install Git ─────────────────────────────────────────────
print_step "Checking for Git..."

if command -v git &> /dev/null; then
  GIT_VERSION=$(git --version)
  print_ok "$GIT_VERSION is installed"
else
  print_err "Git not found. Please install Git from https://git-scm.com"
  exit 1
fi

# ── Step 4: Clone or Update the Repository ──────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  print_step "Repository exists. Pulling latest changes..."
  git pull --rebase origin main 2>/dev/null || git pull origin main 2>/dev/null || print_warn "Could not pull. Continuing with existing code."
  print_ok "Repository updated"
else
  print_step "Cloning GuardianX from GitHub..."
  git clone "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || {
    print_err "Failed to clone. Check your internet connection."
    exit 1
  }
  print_ok "Repository cloned"
fi

cd "$INSTALL_DIR"

# ── Step 5: Install Dependencies ────────────────────────────────────────────
print_step "Installing dependencies (this may take a minute)..."
bun install 2>/dev/null || {
  print_err "Failed to install dependencies. Try: bun install --force"
  exit 1
}
print_ok "Dependencies installed"

# ── Step 6: Create .env.local ───────────────────────────────────────────────
print_step "Setting up environment variables..."

ENV_FILE="$INSTALL_DIR/.env.local"

if [ -f "$ENV_FILE" ]; then
  print_warn ".env.local already exists. Skipping creation."
  print_warn "If something doesn't work, delete it and re-run this script."
else
  cat > "$ENV_FILE" << EOF
# GuardianX Environment Variables
# Generated by install.sh on $(date)

# Supabase (PostgreSQL via REST API)
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_KEY
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL

# JWT Secret (for authentication)
JWT_SECRET=$JWT_SECRET

# Railway sentinel-engine (for local dev, engine runs on port 3003)
ENGINE_URL=http://localhost:3003

# Node environment
NODE_ENV=development
EOF
  print_ok ".env.local created"
fi

# Also create .env with JWT_SECRET (for Next.js to load at build time)
if [ ! -f "$INSTALL_DIR/.env" ]; then
  cat > "$INSTALL_DIR/.env" << EOF
DATABASE_URL=file:$INSTALL_DIR/db/custom.db
JWT_SECRET=$JWT_SECRET
EOF
  print_ok ".env created"
fi

# ── Step 7: Set up the Sentinel Engine ──────────────────────────────────────
print_step "Setting up sentinel-engine..."

ENGINE_DIR="$INSTALL_DIR/mini-services/sentinel-engine"

if [ -d "$ENGINE_DIR" ]; then
  cd "$ENGINE_DIR"
  
  # Install engine dependencies
  print_step "Installing engine dependencies..."
  bun install 2>/dev/null || print_warn "Engine dependency install had issues (may still work)"
  
  # Create engine .env
  if [ ! -f "$ENGINE_DIR/.env" ]; then
    cat > "$ENGINE_DIR/.env" << EOF
# GuardianX Sentinel Engine — Environment Variables
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_KEY
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
JWT_SECRET=$JWT_SECRET
ZAI_API_KEY=placeholder
EOF
    print_ok "Engine .env created"
  fi
  
  cd "$INSTALL_DIR"
  print_ok "Sentinel engine configured"
else
  print_warn "Sentinel engine directory not found. Engine features (SAST/DAST) won't work."
fi

# ── Step 8: Create convenient startup scripts ───────────────────────────────
print_step "Creating startup scripts..."

# Script to start both app + engine
cat > "$INSTALL_DIR/start.sh" << 'STARTEOF'
#!/bin/bash
# GuardianX — Start Both Servers
# Run this to start the app + engine together

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${CYAN}[GuardianX]${NC} Starting app server (port 3000)..."
cd "$INSTALL_DIR"
bun run dev &
APP_PID=$!

echo -e "${CYAN}[GuardianX]${NC} Starting sentinel engine (port 3003)..."
cd "$INSTALL_DIR/mini-services/sentinel-engine"
bun run dev &
ENGINE_PID=$!

echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  GuardianX is now running!${NC}"
echo -e "${GREEN}  App:    http://localhost:3000${NC}"
echo -e "${GREEN}  Engine: http://localhost:3003/healthz${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo "Press Ctrl+C to stop both servers."

# Trap Ctrl+C to kill both processes
trap "kill $APP_PID $ENGINE_PID 2>/dev/null; exit" INT TERM

# Wait for both
wait
STARTEOF
chmod +x "$INSTALL_DIR/start.sh"

# Script to update from GitHub
cat > "$INSTALL_DIR/update.sh" << 'UPDATEEOF'
#!/bin/bash
# GuardianX — Pull Latest Changes from GitHub
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$INSTALL_DIR"

echo -e "${CYAN}[GuardianX]${NC} Pulling latest changes..."
git pull origin main
echo -e "${CYAN}[GuardianX]${NC} Installing dependencies..."
bun install
echo -e "${CYAN}[GuardianX]${NC} Updating engine dependencies..."
cd mini-services/sentinel-engine && bun install && cd "$INSTALL_DIR"
echo -e "${GREEN}[OK]${NC} Update complete. Run ./start.sh to restart."
UPDATEEOF
chmod +x "$INSTALL_DIR/update.sh"

# Script to push changes to GitHub
cat > "$INSTALL_DIR/push.sh" << 'PUSHEOF'
#!/bin/bash
# GuardianX — Push Changes to GitHub
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$INSTALL_DIR"

echo -e "${CYAN}[GuardianX]${NC} Checking for changes..."
git add -A
STATUS=$(git status --short)

if [ -z "$STATUS" ]; then
  echo -e "${YELLOW}No changes to push.${NC}"
  exit 0
fi

echo "Changes:"
echo "$STATUS"
echo ""
read -p "Commit message (or press Enter for auto): " MSG
MSG="${MSG:-Update from local dev}"

git commit -m "$MSG"
git push origin main
echo -e "${GREEN}[OK]${NC} Pushed to GitHub. Vercel will auto-deploy."
PUSHEOF
chmod +x "$INSTALL_DIR/push.sh"

print_ok "Startup scripts created"

# ── Step 9: Verify ──────────────────────────────────────────────────────────
print_step "Verifying installation..."

# Check key files exist
FILES_OK=true
for f in "package.json" "src/app/page.tsx" ".env.local" "start.sh" "update.sh" "push.sh"; do
  if [ -f "$INSTALL_DIR/$f" ]; then
    print_ok "  $f"
  else
    print_err "  $f MISSING"
    FILES_OK=false
  fi
done

if [ -d "$INSTALL_DIR/mini-services/sentinel-engine" ]; then
  print_ok "  mini-services/sentinel-engine/"
else
  print_warn "  mini-services/sentinel-engine/ MISSING (engine won't work)"
fi

# ── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo -e "${GREEN}  GuardianX installed successfully!${NC}"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "  Location:  $INSTALL_DIR"
echo ""
echo "  Quick commands:"
echo "    ./start.sh    — Start both servers (app + engine)"
echo "    ./update.sh   — Pull latest changes from GitHub"
echo "    ./push.sh     — Push your changes to GitHub"
echo ""
echo "  After starting:"
echo "    App:    http://localhost:3000"
echo "    Engine: http://localhost:3003/healthz"
echo ""
echo "  Login:"
echo "    Email:    ayanalidar@gmail.com"
echo "    Password: AdminPass123!"
echo ""
echo "  To change the password: User Management tab → select user → change"
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
