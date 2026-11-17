@echo off
setlocal
"%~dp0..\..\tools\node.exe" "%~dp0windows-folder.mjs" dashboard
if errorlevel 1 pause
