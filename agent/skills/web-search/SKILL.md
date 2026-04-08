---
name: web-search
description: Live web search using SearXNG API for real-time information
---

- Use this skill when the user needs current, real-time information from the web.
- Search using the SearXNG API endpoint.
- Parse and return relevant search results with title, content, URL, and published date.
- Categories: general, news, science, it, technology.
- Languages: en (English) by default, can be overridden.
- Format: json for structured parsing.
- Limit results to top 5-10 most relevant items.
- Always cite sources with URLs.
- For time-sensitive queries, prioritize recent results.

## API Endpoint

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
