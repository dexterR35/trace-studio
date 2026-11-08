@echo off
cd /d "%~dp0"
set "TRACE_AI_PROFILE=%~1"
if "%TRACE_AI_PROFILE%"=="" set "TRACE_AI_PROFILE=cpu"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-ai.ps1" -Profile %TRACE_AI_PROFILE%
if errorlevel 1 pause
