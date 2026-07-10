@echo off
title Encrypted Crew Bridge
cls

echo ============================================
echo   ENCRYPTED CREW BRIDGE
echo   --- built by XenozExe ---
echo ============================================
echo.
echo [!] Make sure AES_KEY is set in .env
echo.
echo [1] Checking environment...
if not exist .env (
    echo [i] Creating .env from .env.example...
    copy .env.example .env > nul
    echo [i] Generate AES key: openssl rand -hex 32
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
echo   5. Enter your license key in the auth modal
echo   6. Click "Connect to Bridge"
echo.
echo   Discord:     https://discord.gg/f5bSTzZtE6
echo.
echo ============================================
echo.
echo [3] Starting MCP Server (logs below)...
echo.
cd /D "%~dp0packages\mcp-server"
npm run dev