@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0tools\node.exe" (
  echo The bundled Node runtime is missing. Rebuild this intranet folder.
  pause
  exit /b 1
)
"%~dp0tools\node.exe" "%~dp0intranet.mjs" --start-slipcurve --open
if errorlevel 1 pause
