@echo off
echo.
echo ========================================
echo  PI Agent Web Search - Quick Test
echo ========================================
echo.

REM Check if environment variable is set
if "%SEARXNG_BASE_URL%"=="" (
    echo [X] SEARXNG_BASE_URL is NOT set
    echo.
    echo Please run setup-env.bat first to configure your SearXNG URL
    echo.
    pause
    exit /b 1
)

echo [✓] SEARXNG_BASE_URL is set to: %SEARXNG_BASE_URL%
echo.
echo Testing web search...
echo.

node "%~dp0test-web-search.js" "current time"

echo.
echo ========================================
echo  Test Complete
echo ========================================
echo.
pause
