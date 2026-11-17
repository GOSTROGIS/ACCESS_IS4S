@echo off
setlocal
call "%~dp0find-node.cmd"
if errorlevel 1 exit /b 1
"%CONSULTING_NODE%" "%~dp0..\consulting-mcp.mjs" %*
exit /b %errorlevel%
