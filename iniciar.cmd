@echo off
REM Arranca la app y abre el navegador.
cd /d "%~dp0"

if not exist ".next" (
  echo No esta compilada todavia. Ejecuta primero instalar.cmd
  pause
  exit /b 1
)

start "" http://localhost:3000
echo Finanzas corriendo en http://localhost:3000
echo Cierra esta ventana para parar la app.
call npm start
