@echo off
setlocal DisableDelayedExpansion
set "INTRANET_ROOT=%~dp0..\..\.."
"%INTRANET_ROOT%\tools\node.exe" "%INTRANET_ROOT%\tools\runtime-update\local-intranet\update-runtimes.mjs" launch --only "%~n0-native"
if errorlevel 1 pause
exit /b %errorlevel%
