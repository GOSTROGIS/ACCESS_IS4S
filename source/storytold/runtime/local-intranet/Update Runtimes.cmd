@echo off
setlocal DisableDelayedExpansion
"%~dp0tools\node.exe" "%~dp0tools\runtime-update\local-intranet\update-runtimes.mjs" %*
exit /b %errorlevel%
