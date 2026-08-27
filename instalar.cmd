@echo off
REM Primera instalacion: dependencias, configuracion y compilacion.
cd /d "%~dp0"

where node >/dev/null 2>nul
if errorlevel 1 (
  echo.
  echo No se encuentra Node.js. Instalalo desde https://nodejs.org (version LTS^)
  echo y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

echo == Instalando dependencias ==
call npm install || goto :error

echo.
echo == Configuracion ==
call npm run setup || goto :error

echo == Compilando ==
call npm run build || goto :error

echo.
echo Listo. Abre iniciar.cmd para arrancar la app.
pause
exit /b 0

:error
echo.
echo Algo ha fallado. Revisa el mensaje de arriba.
pause
exit /b 1
