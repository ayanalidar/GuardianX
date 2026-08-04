#!/bin/bash
# GuardianX one-command startup script for Windows (Git Bash)
# Starts: web app (3000) + sentinel engine (3003) + vuln target (3007)
# Usage: bash start.sh

set -e

PROJECT_DIR="/d/GuardianX"
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

echo "============================================"
echo "  GuardianX — Starting all services"
echo "============================================"
echo ""

# Kill any existing processes on our ports
echo "[1/4] Cleaning up old processes..."
pkill -f "next dev" 2>/dev/null || true
pkill -f "bun.*index.ts" 2>/dev/null || true
sleep 2

# Start sentinel engine
echo "[2/4] Starting Sentinel Engine (port 3003)..."
cd "$PROJECT_DIR/mini-services/sentinel-engine"
source "$PROJECT_DIR/.env.local" 2>/dev/null || true
bun run dev > "$LOG_DIR/engine.log" 2>&1 &
ENGINE_PID=$!
echo "   Engine PID: $ENGINE_PID (logs: logs/engine.log)"

# Start vuln-target (test app)
echo "[3/4] Starting VulnShop test target (port 3007)..."
cd "$PROJECT_DIR/mini-services/vuln-target"
bun run dev > "$LOG_DIR/vuln-target.log" 2>&1 &
VULN_PID=$!
echo "   VulnTarget PID: $VULN_PID (logs: logs/vuln-target.log)"

# Wait for engine to be ready
echo "   Waiting for engine to start..."
sleep 5

# Start web app
echo "[4/4] Starting Web App (port 3000)..."
cd "$PROJECT_DIR"
bun run dev > "$LOG_DIR/web.log" 2>&1 &
WEB_PID=$!
echo "   Web App PID: $WEB_PID (logs: logs/web.log)"

echo ""
echo "============================================"
echo "  All services started!"
echo "============================================"
echo ""
echo "  Web App:        http://localhost:3000"
echo "  Sentinel Engine: http://localhost:3003"
echo "  VulnShop:        http://localhost:3007"
echo ""
echo "  Logs in: $LOG_DIR/"
echo ""
echo "  Press Ctrl+C to stop all services"
echo ""

# Trap Ctrl+C to kill all background processes
trap "echo ''; echo 'Stopping all services...'; kill $ENGINE_PID $VULN_PID $WEB_PID 2>/dev/null; exit 0" INT TERM

# Keep the script running
wait
