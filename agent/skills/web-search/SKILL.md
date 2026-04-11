---
name: web-search
description: Live web search using SearXNG API and URL content fetching for real-time information
---

## When to Use Web Search

Use `web_search` tool when:
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
- "What's the weather in Tokyo?" → use `web_search`
- "Who won the last Super Bowl?" → use `web_search`
- "Latest Node.js security vulnerabilities" → use `web_search`
- "Current price of Bitcoin" → use `web_search`

**Examples of when NOT to search:**
- "How do I write a for loop in Python?" → answer from knowledge
- "What is OAuth?" → answer from knowledge
- "Fix this bug in my code" → inspect and fix code
- "Review this PR" → review code

## Available Tools

### 1. `web_search` - Search the Web
- Use ONLY for current, real-time information from the web.
- Search using the SearXNG API endpoint.
- Parse and return relevant search results with title, content, URL, and published date.
- Categories: general, news, science, it, technology.
- Languages: en (English) by default, can be overridden.
- Format: json for structured parsing.
- Limit results to top 5-10 most relevant items.
- Always cite sources with URLs.
- For time-sensitive queries, prioritize recent results.

**Depth Modes:**
- `fast`: Quick search, no content fetching
- `standard`: Balanced approach with basic formatting
- `deep`: Fetches and extracts content from top 3 source pages

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
- Automatic redirect following (up to 5 hops)
- Intelligent caching for repeated requests (5-min TTL)

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
- `q` - The search query
- `format` - json (for structured parsing)
- `categories` - news, general, it, science (default: general)
- `language` - en (default)

## Response Format

Parse the JSON response and extract:
- `title` - Result title
- `content` - Snippet/summary content
- `url` - Source URL
- `publishedDate` - When available

## Example

For query "who won t20 wc 2026":
1. Search with category=news for recent events
2. Parse results array
3. Return top results with title, content, URL, and date
4. Format as a concise answer with source links

For fetching content from a URL:
1. Use `fetch_content({ url: "https://..." })` 
2. Optionally add `prompt: "specific question"` to focus extraction
3. Review the extracted content and provide answer
