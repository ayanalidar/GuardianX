@echo off
REM GuardianX — Windows Push Script
REM Commits and pushes your changes to GitHub (auto-deploys to Vercel)
REM
REM Usage: Double-click this file, or run from Command Prompt:
REM   cd D:\GuardianX
REM   push.bat

setlocal
cd /d "%~dp0"

echo.
echo ===================================================
echo   GuardianX - Push Changes to GitHub
echo ===================================================
echo.

echo [GuardianX] Checking for changes...
git add -A

REM Check if there are changes to commit
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo No changes to push.
    pause
    exit /b 0
)

git status --short

echo.
set /p MSG="Commit message (or press Enter for 'Update from local dev'): "
if "%MSG%"=="" set MSG=Update from local dev

git commit -m "%MSG%"
if %errorlevel% neq 0 (
    echo [ERROR] Git commit failed.
    pause
    exit /b 1
)

echo [GuardianX] Pushing to GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo [ERROR] Git push failed. Try: git pull origin main first.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo   Pushed to GitHub successfully!
echo   Vercel will auto-deploy to www.guardianx.in
echo ===================================================
pause
