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

## Tools Available

### 1. `web_search` - Search the Web

Search the web for current information with customizable depth and categories.

**Parameters:**
- `query` (required): The search query
- `category` (optional): Search category - `general`, `news`, `it`, `science` (default: `general`)
- `language` (optional): Language code (default: `en`)
- `maxResults` (optional): Maximum number of results (default: `8`)
- `depth` (optional): Search depth - `fast`, `standard`, `deep` (default: `standard`)

**Examples:**
```javascript
web_search({ query: "TypeScript 5.0 new features" })
web_search({ query: "latest AI news", category: "news", depth: "deep" })
web_search({ query: "Python async best practices", depth: "deep" })
```

### 2. `fetch_content` - Fetch Content from a URL

Fetch and extract content from any specific URL. Useful for reading articles, documentation, or any web page.

**Parameters:**
- `url` (required): The URL to fetch content from
- `prompt` (optional): Specific question or focus when extracting content
- `maxLength` (optional): Maximum characters to extract (default: `2000`)
- `timeout` (optional): Request timeout in milliseconds (default: `15000`)

**Examples:**
```javascript
fetch_content({ url: "https://www.typescriptlang.org/docs/handbook/intro.html" })
fetch_content({ url: "https://example.com/article", prompt: "What are the main arguments?" })
fetch_content({ url: "https://example.com/long-article", maxLength: 5000 })
```

**Security Features:**
- ✅ SSRF protection: Blocks access to internal/private networks
- ✅ Content-Type validation: Only accepts text-based content (HTML, XML, JSON, etc.)
- ✅ Redirect following: Automatically follows up to 5 redirects
- ✅ Caching: Repeated requests to same URL use cached results (5-min TTL)
- ✅ URL validation: Only HTTP/HTTPS protocols allowed

**Supported Content:**
- HTML pages (scripts, styles, navigation removed)
- Text extraction from body content
- Title and meta description extraction
- Link preservation

## Usage

The PI agent will automatically use web search when you ask about:
- Current/recent events ("who won...", "latest news...", "current...")
- Time-sensitive information
- Real-time data

Or you can directly call the tools:
- `web_search({ query: "your query" })`
- `fetch_content({ url: "https://..." })`

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
