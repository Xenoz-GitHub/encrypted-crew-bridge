@echo off
title Encrypted Crew Bridge
cls

echo ============================================
echo   ENCRYPTED CREW BRIDGE
echo   --- built by XenozExe ---
echo ============================================
echo.
echo [1] Checking environment...
if not exist .env (
    copy .env.example .env > nul
)
echo [OK] Environment ready
echo.
echo [2] Installing dependencies...
call npm install 2>nul
if errorlevel 1 (
    echo [ERROR] npm install failed
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.
echo ============================================
echo   HOW TO USE:
echo ============================================
echo.
echo   1. Open Chrome/Edge and go to chrome://extensions
echo   2. Enable "Developer mode" (top right)
echo   3. Click "Load unpacked" and select: %~dp0browser-ext
echo   4. Open https://chat.deepseek.com
echo   5. Click "Start" on the bridge panel
echo.
echo ============================================
echo.
echo [3] Starting MCP Server (logs below)...
echo.
cd /D "%~dp0packages\mcp-server"
npm run dev
