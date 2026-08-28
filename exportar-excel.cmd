@echo off
REM Exporta los movimientos a CSV para abrirlos en Excel.
cd /d "%~dp0"

call npm run db:export
if errorlevel 1 (
  pause
  exit /b 1
)

start "" "%~dp0exportado"
pause
