@echo off
setlocal
if exist "%~dp0Storytold\native\launchers\" (
  explorer.exe "%~dp0Storytold\native\launchers"
) else (
  echo Native application launchers are missing from this folder.
  pause
)
