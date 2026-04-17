---
name: web-search
description: Live web search using unified pi-search extension with intelligent three-tier architecture
---

## When to Use Web Search

Use `search` tool (from pi-search.ts) when:
- Query requires current, real-time information (news, weather, stock prices, live scores)
- User asks about events that happened recently or are ongoing
- User provides a URL and wants content extracted (use `fetch_content`)
- Query is about something you don't have training knowledge of

Do NOT use web_search when:
- The answer is general knowledge, programming concepts, or well-established facts
- The query is about code, algorithms, architecture, or technical concepts you already know
- The user is asking you to perform an action (commit code, review files, etc.)
- The query is vague or ambiguous — ask for clarification first

**Examples of when to search:**
- "What's the weather in Tokyo?" → use `search` (mode: auto)
- "Who won the last Super Bowl?" → use `search` (mode: traditional)
- "Latest Node.js security vulnerabilities" → use `search` (mode: research)
- "Current price of Bitcoin" → use `search` (mode: auto)

**Examples of when NOT to search:**
- "How do I write a for loop in Python?" → answer from knowledge
- "What is OAuth?" → answer from knowledge
- "Fix this bug in my code" → inspect and fix code
- "Review this PR" → review code

## Available Tools

### 1. `search` - Unified Intelligent Search
- Use for current, real-time information from the web.
- Auto-detects query type: simple/factual → traditional search, complex → AI enhancement
- Intelligent three-tier fallback: Native LLM → Simulated AI → Traditional search
- Parameters: query, mode (auto/traditional/ai/research), maxResults (1-20), depth (fast/standard/deep), safeMode (true/false)
- Query sanitization: Avoids 500 errors by replacing sensitive terms
- Rate limiting: 5 requests per 10 seconds with queueing
- Caching: 5-minute TTL with automatic cleanup

**Modes:**
- `auto`: Intelligent classification (default)
- `traditional`: Traditional SearXNG search only
- `ai`: Force AI enhancement if available
- `research`: Deep research with maximum AI integration

### 2. `fetch_content` - Fetch Content from URL
- Use this skill when you need to read content from a specific URL.
- Extracts title, meta description, and main text content.
- Strips scripts, styles, and navigation elements.
- Returns clean, readable text (default: up to 2000 characters, configurable).
- Optional `prompt` parameter to focus extraction on specific questions.
- Optional `maxLength` parameter to control content length.
- Optional `timeout` parameter for request timeout control.

**Security Features:**
- SSRF protection: Blocks access to internal/private network URLs
- Content-Type validation: Only processes text-based content
- Query sanitization: Replaces sensitive terms to avoid 500 errors
- Safe mode: Filters adult/pornographic content by default
- Rate limiting: Prevents abuse with 5 requests per 10 seconds

**Use cases:**
- Reading articles, blog posts, documentation
- Extracting information from specific web pages
- Following up on search results to get full content
- Bypassing JavaScript rendering limitations

---

## Web Search API Endpoint

```bash
curl -X POST "$SEARXNG_BASE_URL/search" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "q=QUERY&format=json&categories=CATEGORY&language=en"
```

## Usage

When searching, use the following parameters:
- `query` - The search query (required)
- `mode` - auto/traditional/ai/research (default: auto)
- `maxResults` - 1-20 (default: 10)
- `depth` - fast/standard/deep (default: standard)
- `safeMode` - true/false (default: true, avoids adult content)

## Response Format

Parse the JSON response and extract:
- `title` - Result title
- `content` - Snippet/summary content
- `url` - Source URL
- `publishedDate` - When available

## Example

For query "who won t20 wc 2026":
1. Use `search({query: "who won t20 wc 2026", mode: "auto"})`
2. System auto-classifies as factual/time-sensitive → uses traditional search
3. Returns structured JSON with results and optional AI answer
4. Format as concise answer with source links and timestamps

**Note:** `fetch_content` tool is still available as part of the unified search extension.

For fetching content from a URL:
1. Use `fetch_content({ url: "https://..." })` 
2. Optionally add `prompt: "specific question"` to focus extraction
3. Review the extracted content and provide answer
