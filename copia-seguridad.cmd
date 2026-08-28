@echo off
REM Copia de seguridad de la base de datos. Se puede usar con la app abierta.
cd /d "%~dp0"

call npm run db:backup
if errorlevel 1 (
  echo.
  echo No se ha podido crear la copia. Revisa el mensaje de arriba.
  pause
  exit /b 1
)

echo.
echo Las copias estan en la carpeta "copias".
pause
