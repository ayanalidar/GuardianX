@echo off
REM ============================================================
REM   GuardianX — Double-click to start all services
REM   Place this file on your Desktop
REM ============================================================

REM Set the project path (change D: to your drive if different)
set PROJECT_DIR=D:\GuardianX

REM Open Git Bash in the project directory and run start.sh
REM --cd-to-home is removed so it starts in the project dir
REM -i keeps the terminal interactive (you can see logs + Ctrl+C to stop)

CD /D "%PROJECT_DIR%"

REM Check if Git Bash exists
if not exist "C:\Program Files\Git\bin\bash.exe" (
    echo ERROR: Git Bash not found at C:\Program Files\Git\bin\bash.exe
    echo Please install Git for Windows from https://git-scm.com
    pause
    exit /b 1
)

REM Launch Git Bash with start.sh
"C:\Program Files\Git\bin\bash.exe" --login -i -c "cd /d/GuardianX && bash start.sh"

REM If bash exits (user pressed Ctrl+C), keep window open briefly
echo.
echo GuardianX services stopped.
timeout /t 3 /nobreak >nul
