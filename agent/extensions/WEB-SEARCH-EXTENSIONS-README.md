# Unified Search Extension for PI Agent: pi-search.ts

## Overview

**Single unified search extension** replacing 4 fragmented files (`web-search.ts`, `hybrid-search.ts`, `hybrid-search-enhanced.ts`, `ai-search.ts`) with intelligent three-tier architecture:

1. **Native LLM integration** (auto-detects available LLM method)
2. **Simulated AI response** using result summarization  
3. **Traditional search** as final fallback

## Quick Start

### Single Unified Extension
```json
"packages": [
  "extensions\\pi-search.ts",    // Unified intelligent search
  "extensions\\planning.js",
  "npm:pi-gsd"
]
```

**Migration Complete:** All previous search extensions have been consolidated into `pi-search.ts`. See `CONSOLIDATION_SUMMARY.md` for details.

## Key Features

| Feature | Description |
|---------|-------------|
| **Traditional Search** | ✅ Full SearXNG integration with all parameters |
| **AI Answer Generation** | ✅ Auto-detects LLM availability with graceful fallback |
| **Query Classification** | ✅ Intelligent 3-level classification (simple/complex/research) |
| **Multi-mode Support** | ✅ auto/traditional/ai/research modes with manual override |
| **Query Sanitization** | ✅ Avoids 500 errors by replacing sensitive terms |
| **Result Caching** | ✅ 5-minute TTL with automatic cleanup |
| **Rate Limiting** | ✅ 5 requests per 10 seconds with queueing |
| **Timeout Handling** | ✅ Comprehensive with retries |
| **Graceful Degradation** | ✅ Always returns valid JSON even on total failure |
| **Health Monitoring** | ✅ Startup health check and diagnostic tool |

## Available Tools

### Single Unified Tool
```javascript
search({
  query: "your search query",      // Required
  mode: "auto",                    // auto|traditional|ai|research
  maxResults: 10,                  // 1-20
  depth: "standard",               // fast|standard|deep
  safeMode: true                   // Avoid content filters
})
```

### Response Format
Always returns valid JSON:
```javascript
{
  success: boolean,
  query: string,
  mode_used: string,
  results: [{title, url, snippet}],
  ai_answer?: string,
  processing_time_ms: number,
  fallback_triggered: boolean,
  error_message?: string
}
```

### Diagnostic Tool
```javascript
search_health()  // Check system health and configuration
```

## Configuration

### Environment Variables
```bash
# Required
export SEARXNG_BASE_URL="http://localhost:8080"

# Or create ~/.pi/.env file:
SEARXNG_BASE_URL=http://localhost:8080
```

**Default:** Falls back to `http://140.238.166.109:8081` if not configured.

### settings.json Example
```json
{
  "lastChangelogVersion": "0.67.2",
  "defaultProvider": "agentrouter",
  "defaultModel": "deepseek-v3.2",
  "defaultThinkingLevel": "medium",
  "theme": "tokyo-night",
  "enabledModels": [],
  "packages": [
    "extensions\\pi-search.ts",
    "extensions\\planning.js",
    "npm:pi-gsd"
  ]
}
```

## Usage Examples

### Simple Factual Query
```javascript
search({
  query: "weather in New York",
  mode: "traditional",
  maxResults: 5
})
```

### Complex Research Query  
```javascript
search({
  query: "Explain quantum computing to a beginner with practical applications",
  mode: "research",
  depth: "deep",
  maxResults: 15
})
```

### Manual Mode Selection
```javascript
search({
  query: "latest AI research papers",
  mode: "ai",          // Force AI enhancement
  safeMode: false      // Allow wider content
})
```

### Health Check
```javascript
search_health()  // Returns system status and available modes
```

## Intelligent Architecture

### Three-Tier Fallback
1. **Tier 1:** Native LLM (pi.complete/pi.callLLM/pi.llm.complete)  
2. **Tier 2:** Simulated AI via result summarization  
3. **Tier 3:** Traditional search results only

### Query Sanitization
Automatically replaces sensitive terms to avoid 500 errors:
- `hack, crack, exploit` → `security, access, vulnerability`
- `kill, murder, weapon` → `stop, crime, tool`
- `porn, xxx, adult` → `content, adult material, mature`

### Rate Limiting & Caching
- **Rate limit:** 5 requests per 10 seconds per IP
- **Cache:** 5-minute TTL, maximum 100 entries
- **Queueing:** Automatic request queuing during rate limits

## Migration from Old Extensions

### Old Configuration (OBSOLETE)
```json
"packages": [
  "extensions\\web-search.ts",
  "extensions\\ai-search.ts"
]
```

### New Configuration
```json
"packages": [
  "extensions\\pi-search.ts"  // Replaces ALL search extensions
]
```

### Tool Name Changes
- `web_search` → `search` (unified tool)
- `ai_search` → `search` (with mode="ai")
- `research_topic` → `search` (with mode="research")

## Testing

Run the test suite:
```bash
# See test-pi-search.md for comprehensive test scenarios
cat agent/extensions/test-pi-search.md
```

## Troubleshooting

### Common Issues

**"No search results returned"**
- Check `SEARXNG_BASE_URL` environment variable
- Run `search_health()` to test connectivity
- Verify SearXNG instance is running

**"AI enhancement not working"**
- The extension gracefully falls back to traditional search if LLM unavailable
- Check console for startup health messages
- Use `mode: "traditional"` to bypass AI attempts

**Rate limit errors**
- Maximum 5 requests per 10 seconds
- Wait for reset or implement request queuing
- Consider implementing client-side caching

## Legacy Files (Archived)

The following files have been consolidated into `pi-search.ts`:
- ❌ `web-search.ts` - Traditional search
- ❌ `hybrid-search.ts` - Basic hybrid  
- ❌ `hybrid-search-enhanced.ts` - Enhanced hybrid
- ❌ `ai-search.ts` - Advanced AI search

See `CONSOLIDATION_SUMMARY.md` for technical details of the unification.

---

**Maintained as part of PI Agent** - This unified extension represents the recommended approach for all web search functionality in PI Agent.