@echo off
REM GuardianX — Windows Update Script
REM Pulls latest changes from GitHub and installs dependencies
REM
REM Usage: Double-click this file, or run from Command Prompt:
REM   cd D:\GuardianX
REM   update.bat

setlocal
cd /d "%~dp0"

echo.
echo ===================================================
echo   GuardianX - Updating from GitHub
echo ===================================================
echo.

echo [GuardianX] Pulling latest changes...
git pull origin main
if %errorlevel% neq 0 (
    echo [ERROR] Git pull failed. Check your internet connection.
    pause
    exit /b 1
)

echo [GuardianX] Installing app dependencies...
call bun install
if %errorlevel% neq 0 (
    echo [WARN] bun install had issues. Trying npm...
    call npm install
)

if exist "mini-services\sentinel-engine" (
    echo [GuardianX] Installing engine dependencies...
    cd mini-services\sentinel-engine
    call bun install
    cd /d "%~dp0"
)

echo.
echo ===================================================
echo   Update complete!
echo   Run start.bat to restart the servers.
echo ===================================================
pause
