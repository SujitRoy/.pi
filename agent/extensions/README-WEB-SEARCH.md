# PI Agent Web Search Extension

This extension enables your PI agent to perform live web searches using the SearXNG API.

## Quick Setup

### Option 1: Create a `.env` File (Recommended)

```bash
cd ~/.pi
copy .env.example .env
# Edit .env with your SearXNG URL
```

Example `.env` content:
```
SEARXNG_BASE_URL=http://your-searxng-host:port
```

⚠️ **IMPORTANT**: The `.env` file is in `.gitignore` and will NEVER be committed!

### Option 2: Set Environment Variable

**Windows:**
```cmd
setx SEARXNG_BASE_URL "http://your-searxng-host:port"
```

**Linux/macOS:**
```bash
# Add to ~/.bashrc or ~/.zshrc
export SEARXNG_BASE_URL="http://your-searxng-host:port"
```

## Usage

The PI agent will automatically use web search when you ask about:
- Current/recent events ("who won...", "latest news...", "current...")
- Time-sensitive information
- Real-time data

Just ask your question and the agent will search if needed!

## Troubleshooting

### No Results Returned

1. **Check configuration:**
   ```bash
   # Verify .env file exists
   ls ~/.pi/.env
   
   # Or check environment variable
   echo %SEARXNG_BASE_URL%  (Windows)
   echo $SEARXNG_BASE_URL   (Linux/macOS)
   ```

2. **Test SearXNG directly:**
   ```bash
   curl -X POST "$SEARXNG_BASE_URL/search" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "q=test&format=json"
   ```

3. **Check for unresponsive engines** in the JSON response

## How It Works

1. Extension loads `.env` file or environment variable
2. Makes POST requests to SearXNG API
3. Parses and sorts results by relevance
4. Returns formatted results to PI agent
5. Handles errors gracefully

## Security

- ✅ Configuration via `.env` file (gitignored)
- ✅ No hardcoded URLs or IPs in code
- ✅ Environment variable fallback
- ✅ Safe to commit to version control
