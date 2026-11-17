@echo off
setlocal
"%~dp0..\..\tools\node.exe" "%~dp0windows-folder.mjs" cli %*
if "%~1"=="" pause
