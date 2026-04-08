@echo off
REM Setup script for PI Agent Web Search Extension
REM Run this script to configure your SearXNG API endpoint

echo.
echo ========================================
echo  PI Agent Web Search Configuration
echo ========================================
echo.

REM Set the environment variable for the current session
set /p SEARXNG_URL="Enter your SearXNG base URL (e.g., http://your-host:port): "

if "%SEARXNG_URL%"=="" (
    echo Error: URL cannot be empty!
    pause
    exit /b 1
)

REM Set for current session
set SEARXNG_BASE_URL=%SEARXNG_URL%

REM Set permanently for user environment
setx SEARXNG_BASE_URL "%SEARXNG_URL%"

echo.
echo ✓ Environment variable set successfully!
echo   SEARXNG_BASE_URL=%SEARXNG_URL%
echo.
echo The setting has been saved permanently.
echo Restart your terminal or PI agent to apply changes.
echo.
pause
