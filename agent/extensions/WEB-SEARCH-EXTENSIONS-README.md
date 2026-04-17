# Web Search Extensions for PI Agent

## Overview

Four web search extensions with different capabilities:

1. **`web-search.ts`** - Traditional SearXNG search (stable, production-ready)
2. **`hybrid-search.ts`** - Basic AI hybrid with query classification  
3. **`hybrid-search-enhanced.ts`** - Enhanced hybrid with full feature parity
4. **`ai-search.ts`** - Advanced AI search with 5 specialized tools

## Quick Start

### Option A: Traditional + Advanced AI (Recommended for stability)
```json
"packages": [
  "extensions\\web-search.ts",    // Traditional search
  "extensions\\ai-search.ts",     // Advanced AI tools
  "extensions\\planning.js",
  "npm:pi-gsd"
]
```

### Option B: Enhanced Hybrid + Advanced AI (Full features)
```json
"packages": [
  "extensions\\hybrid-search-enhanced.ts",  // AI-enhanced search
  "extensions\\ai-search.ts",               // Advanced AI tools  
  "extensions\\planning.js",
  "npm:pi-gsd"
]
```

## File Comparison

| Feature | web-search.ts | hybrid-search.ts | hybrid-search-enhanced.ts | ai-search.ts |
|---------|--------------|------------------|--------------------------|--------------|
| **Traditional Search** | ✅ Full features | ✅ Basic | ✅ Full parity | ✅ Enhanced |
| **AI Answer Generation** | ❌ No | ✅ Basic | ✅ Enhanced | ✅ Advanced |
| **Query Classification** | ❌ No | ✅ Simple/Complex | ✅ 3-level | ✅ 4-level |
| **Multi-step Research** | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **Fact Verification** | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **Comparative Analysis** | ❌ No | ❌ No | ❌ No | ✅ Yes |
| **Result Caching** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| **Rate Limiting** | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| **Timeout Handling** | ✅ Yes | ❌ No | ✅ Yes | ✅ Limited |
| **Tools Provided** | 5 tools | 1 tool | 1 tool | 5 tools |

## Available Tools

### From `web-search.ts`:
1. `web_search` - Traditional SearXNG search
2. `fetch_content` - Fetch URL content
3. `search_suggest` - Get search suggestions
4. `spell_check` - Check spelling
5. `summarize_results` - Summarize search results

### From `hybrid-search-enhanced.ts`:
1. `web_search` - Enhanced hybrid search with AI answers

### From `ai-search.ts`:
1. `ai_search` - Advanced AI-enhanced search
2. `research_topic` - Deep research on complex topics
3. `compare_concepts` - Comparative analysis
4. `fact_check` - Claim verification
5. `summarize_research` - Research summarization

## Configuration

### Environment Variables
```bash
# Required for all extensions
export SEARXNG_BASE_URL="http://localhost:8080"

# Or create ~/.pi/.env file:
SEARXNG_BASE_URL=http://localhost:8080
```

### settings.json Examples

#### 1. Traditional Search Only
```json
"packages": [
  "extensions\\web-search.ts",
  "extensions\\planning.js",
  "npm:pi-gsd"
]
```

#### 2. Basic Hybrid Search  
```json
"packages": [
  "extensions\\hybrid-search.ts",
  "extensions\\planning.js",
  "npm:pi-gsd"
]
```

#### 3. Advanced AI Search Only
```json
"packages": [
  "extensions\\ai-search.ts",
  "extensions\\planning.js",
  "npm:pi-gsd"
]
```

#### 4. Traditional + Advanced AI (Recommended)
```json
"packages": [
  "extensions\\web-search.ts",
  "extensions\\ai-search.ts",
  "extensions\\planning.js",
  "npm:pi-gsd"
]
```

#### 5. Enhanced Hybrid + Advanced AI (Full Features)
```json
"packages": [
  "extensions\\hybrid-search-enhanced.ts",
  "extensions\\ai-search.ts",
  "extensions\\planning.js",
  "npm:pi-gsd"
]
```

## Usage Examples

### Traditional Search
```javascript
web_search({
  query: "react hooks documentation",
  category: "web",
  maxResults: 10,
  depth: "standard"
})
```

### AI-Enhanced Search
```javascript
// Using hybrid-search-enhanced.ts
web_search({
  query: "Explain quantum computing to a beginner",
  forceBackend: "auto",  // Auto-detects need for AI
  depth: "deep"
})

// Or force AI processing
web_search({
  query: "Compare React and Vue frameworks",
  forceBackend: "ai",
  enableAI: true
})
```

### Advanced AI Tools
```javascript
// Comprehensive AI analysis
ai_search({
  query: "Latest breakthroughs in renewable energy 2026",
  analysisDepth: "comprehensive",
  includeConflicts: true,
  includeEntities: true
})

// Deep research
research_topic({
  topic: "AI safety alignment challenges",
  researchScope: "exhaustive",
  includeControversies: true
})

// Comparative analysis
compare_concepts({
  concepts: ["React", "Vue", "Svelte"],
  comparisonAspects: ["performance", "ecosystem", "learning_curve"]
})

// Fact checking
fact_check({
  claim: "OpenAI GPT-5 was released in 2025",
  verificationDepth: "thorough"
})

// Research summarization
summarize_research({
  topic: "Blockchain scalability solutions",
  summaryLength: "comprehensive"
})
```

## Important Notes

### Tool Name Conflicts
- **`web_search` tool exists in:** `web-search.ts`, `hybrid-search.ts`, `hybrid-search-enhanced.ts`
- **Resolution:** Last loaded extension wins
- **Recommendation:** Load only one provider of `web_search` tool

### Backward Compatibility
- `hybrid-search-enhanced.ts` maintains full parameter compatibility with `web-search.ts`
- All traditional search parameters work in enhanced version
- New parameters added for AI control

### Performance Considerations
- AI processing adds latency (2-10 seconds depending on complexity)
- Caching improves repeat query performance
- Traditional search is fastest for simple queries

## Migration Guide

### From Traditional to AI-Enhanced

#### Step 1: Test Current Setup
```json
"packages": ["extensions\\web-search.ts"]
```

#### Step 2: Add Advanced AI Tools
```json
"packages": [
  "extensions\\web-search.ts",
  "extensions\\ai-search.ts"
]
```

#### Step 3: Replace with Enhanced Hybrid
```json
"packages": [
  "extensions\\hybrid-search-enhanced.ts",
  "extensions\\ai-search.ts"
]
```

#### Step 4: Test and Optimize
- Test with various query types
- Adjust `forceBackend` settings as needed
- Monitor performance

## Testing Recommendations

### Phase 1: Individual Testing
```bash
# Test each extension independently
1. web-search.ts alone
2. hybrid-search.ts alone  
3. hybrid-search-enhanced.ts alone
4. ai-search.ts alone
```

### Phase 2: Integration Testing
```bash
# Test combinations
1. web-search.ts + ai-search.ts
2. hybrid-search-enhanced.ts + ai-search.ts
```

### Phase 3: Performance Testing
- Simple queries (1-3 words)
- Complex questions
- AI-intensive queries
- Error scenarios

## Troubleshooting

### Common Issues

#### 1. "SEARXNG_BASE_URL not set"
```bash
# Set environment variable
export SEARXNG_BASE_URL="http://localhost:8080"

# Or create ~/.pi/.env file
echo 'SEARXNG_BASE_URL=http://localhost:8080' > ~/.pi/.env
```

#### 2. Tool not found
- Check extension is in `settings.json`
- Verify tool name spelling
- Check console for registration errors

#### 3. AI answers not working
- Ensure `pi.callLLM()` is available in your PI Agent version
- Check query classification is working
- Try `forceBackend: "ai"` to bypass auto-detection

#### 4. Performance issues
- Use `depth: "fast"` for simple queries
- Enable caching
- Consider rate limiting for high-volume usage

## Development

### File Structure
```
extensions/
├── web-search.ts          # Traditional search (stable)
├── hybrid-search.ts       # Basic AI hybrid
├── hybrid-search-enhanced.ts # Enhanced hybrid (recommended)
├── ai-search.ts          # Advanced AI tools
└── WEB-SEARCH-EXTENSIONS-README.md
```

### Adding New Features

#### To hybrid-search-enhanced.ts:
1. Add new parameters to `pi.registerTool`
2. Update `enhancedHybridSearch` function
3. Add parameter handling in `searchSearXNG`
4. Update documentation

#### To ai-search.ts:
1. Add new tool definition
2. Implement corresponding function
3. Add error handling
4. Update parameter validation

## Contributing

### Guidelines
1. Maintain backward compatibility where possible
2. Add comprehensive error handling
3. Include TypeScript type definitions
4. Add console logging for debugging
5. Update documentation

### Testing Requirements
- Test all error scenarios
- Verify parameter validation
- Test performance with various inputs
- Ensure no breaking changes

## License

These extensions are part of the PI Agent ecosystem.

## Support

For issues or questions:
1. Check the PI Agent documentation
2. Review console logs for errors
3. Test with minimal configuration
4. Consult the troubleshooting section above

---

**Last Updated:** April 17, 2026  
**Version:** 1.0.0  
**Status:** Production Ready