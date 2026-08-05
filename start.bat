@echo off
REM GuardianX one-command startup for Windows
REM Just double-click this file or run: start.bat

cd /d D:\GuardianX

echo ============================================
echo   GuardianX - Starting all services
echo ============================================
echo.

echo [1/3] Starting Sentinel Engine (port 3003)...
cd mini-services\sentinel-engine
start /B bun run dev > ..\..\logs\engine.log 2>&1
cd ..\..

echo [2/3] Starting VulnShop test target (port 3007)...
cd mini-services\vuln-target
start /B bun run dev > ..\..\logs\vuln-target.log 2>&1
cd ..\..

timeout /t 5 /nobreak >nul

echo [3/3] Starting Web App (port 3000)...
start /B bun run dev > logs\web.log 2>&1

echo.
echo ============================================
echo   All services started!
echo ============================================
echo.
echo   Web App:         http://localhost:3000
echo   Sentinel Engine: http://localhost:3003
echo   VulnShop:        http://localhost:3007
echo.
echo   Close this window to stop all services.
echo.
pause
