@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 18 ou superior e execute novamente.
  pause
  exit /b 1
)
start "" http://127.0.0.1:4173
node server.mjs
pause
