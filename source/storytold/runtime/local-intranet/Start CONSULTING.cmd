@echo off
setlocal
call "%~dp0find-node.cmd"
if errorlevel 1 goto failed
"%CONSULTING_NODE%" "%~dp0..\consulting-serve.mjs" --open
if not errorlevel 1 exit /b 0
:failed
pause
exit /b 1
