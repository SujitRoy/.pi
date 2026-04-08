# Web Search Extension Setup Guide

## Quick Start

### 1. Configure Your SearXNG Instance

Set the environment variable in your shell profile:

**Windows (PowerShell):**
```powershell
# Add to your $PROFILE
$env:SEARXNG_BASE_URL = "http://your-searxng-host:port"
```

**Windows (CMD):**
```cmd
setx SEARXNG_BASE_URL "http://your-searxng-host:port"
```

**Linux/macOS:**
```bash
# Add to ~/.bashrc or ~/.zshrc
export SEARXNG_BASE_URL="http://your-searxng-host:port"
```

### 2. Alternative: Create a .env File

```bash
cd ~/.pi
cp .env.example .env
# Edit .env with your actual SearXNG URL
```

⚠️ **IMPORTANT**: Never commit the `.env` file to version control!

### 3. Verify Configuration

Test the extension:

```bash
cd ~/.pi/agent/extensions
node test-web-search.js "test query"
```

### 4. Start PI Agent

The PI agent will automatically use the environment variable:

```bash
pi
```

## Troubleshooting

### Extension Not Working?

1. **Check environment variable:**
   ```bash
   # Windows
   echo %SEARXNG_BASE_URL%
   
   # Linux/macOS
   echo $SEARXNG_BASE_URL
   ```

2. **Verify SearXNG is running:**
   ```bash
   curl -X POST "$SEARXNG_BASE_URL/search" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "q=test&format=json"
   ```

3. **Check for unresponsive engines in the response**

### Security Notes

- ✅ The `.env` file is in `.gitignore` and won't be committed
- ✅ Never share your SearXNG URL publicly
- ✅ Use HTTPS if your SearXNG instance is accessible over the internet
- ✅ Consider adding authentication if exposing to the internet

## How It Works

The extension:
1. Reads `SEARXNG_BASE_URL` from environment variables
2. Falls back to `http://localhost:8080` if not set
3. Makes POST requests with proper Content-Type header
4. Parses and formats results for the PI agent
5. Handles errors gracefully (unresponsive engines, timeouts, etc.)

## Example Usage in PI Agent

Once configured, simply ask questions like:
- "Who won the latest cricket match?"
- "What's the current weather in New York?"
- "Latest news about AI developments"
- "Recent technology trends 2026"

The PI agent will automatically invoke web search when it determines you need current information.
