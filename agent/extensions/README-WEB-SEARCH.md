# PI Agent Web Search Extension

This extension enables your PI agent to perform live web searches using the SearXNG API.

## Features

- ✅ Real-time web search capabilities
- ✅ Multiple search categories (general, news, IT, science, etc.)
- ✅ Multi-language support
- ✅ Structured JSON responses
- ✅ Source citation with URLs
- ✅ Error handling for unresponsive search engines

## Configuration

The SearXNG API endpoint is configured via environment variable:

```bash
# Set this in your shell profile (.bashrc, .zshrc, etc.) or .env file
export SEARXNG_BASE_URL="http://your-searxng-host:port"
```

Default: `http://localhost:8080` (if environment variable is not set)

## Usage

### As a PI Agent Skill

The PI agent will automatically use the web-search skill when it determines that live web search is needed based on the SKILL.md instructions.

### Direct CLI Testing

You can test the extension directly from the command line:

```bash
# Test web search
node web-search.js "your search query"

# Example
node web-search.js "latest AI developments 2026"
```

### Programmatic Usage

```javascript
const { search, searchAndAnswer } = require('./web-search');

// Get structured search results
const results = await search("query", {
  language: 'en',
  category: 'news',
  maxResults: 10
});

// Get formatted answer
const answer = await searchAndAnswer("query");
console.log(answer);
```

## Search Categories

- `general` - General web search (default)
- `news` - News articles and recent events
- `it` - Information technology topics
- `science` - Scientific research and news
- `images` - Image search
- `videos` - Video search
- `music` - Music search
- `files` - File search
- `social media` - Social media content

## Troubleshooting

### No Results Returned

If searches return no results, check:

1. **SearXNG instance is running**: Verify your SearXNG server is operational
2. **Search engines configured**: Ensure search engines are properly configured in SearXNG
3. **Network connectivity**: Confirm the PI agent machine can reach the SearXNG server
4. **Check unresponsive engines**: The response includes `unresponsive_engines` array - check which engines are timing out

### Testing SearXNG Directly

Test your SearXNG instance with curl:

```bash
# General search (POST method with Content-Type header)
curl -X POST "$SEARXNG_BASE_URL/search" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "q=test query&format=json"

# With specific category
curl -X POST "$SEARXNG_BASE_URL/search" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "q=test query&format=json&categories=news&language=en"
```

### Testing the Extension

```bash
# Test the extension directly
node test-web-search.js "your search query"

# Example
node test-web-search.js "who won t20 world cup 2026"
```

### API Response Format

The SearXNG API returns:

```json
{
  "query": "search query",
  "number_of_results": 10,
  "results": [
    {
      "title": "Result Title",
      "content": "Result snippet/content",
      "url": "https://example.com",
      "publishedDate": "2026-04-08",
      "engine": "google"
    }
  ],
  "answers": [],
  "suggestions": ["alternative query 1"],
  "unresponsive_engines": []
}
```

## Integration with PI Agent

The extension integrates with PI agent through:

1. **Skill Definition**: `agent/skills/web-search/SKILL.md` - Tells the agent when and how to use web search
2. **Extension Script**: `agent/extensions/web-search.js` - Implements the actual search functionality

The agent will invoke web search when:
- User asks for current/recent information
- Query contains time-sensitive keywords
- Agent determines existing knowledge may be outdated

## Security Notes

- The extension makes HTTP requests to your SearXNG instance
- Ensure your SearXNG instance is properly secured if exposed to the internet
- Consider using HTTPS if your SearXNG supports it
- API keys or authentication tokens are not required for default SearXNG setups

## License

MIT
