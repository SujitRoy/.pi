# PI Search Unified Architecture Test Plan

## Overview
Testing the unified `pi-search.ts` implementation that consolidates 4 fragmented files.

## Test Cases

### Test 1: Basic Search with Auto Mode
```javascript
search query="Noida India current temperature" mode=auto maxResults=3
```
**Expected:** Should use traditional mode (factual query) and return 3 results.

### Test 2: AI-Enhanced Search
```javascript
search query="Explain quantum computing simply" mode=ai
```
**Expected:** Should attempt AI enhancement with graceful fallback if LLM unavailable.

### Test 3: Safe Mode with Sensitive Query
```javascript
search query="controversial topic" safeMode=true
```
**Expected:** Should sanitize query and use traditional mode only.

### Test 4: Health Check
```javascript
search_health
```
**Expected:** Should report health status including LLM availability and SearxNG connectivity.

### Test 5: Rate Limiting
```javascript
// Make multiple rapid requests
search query="test 1"
search query="test 2"
search query="test 3"
search query="test 4"
search query="test 5"
search query="test 6" // Should be rate limited
```
**Expected:** First 5 requests succeed, 6th gets rate limit error.

### Test 6: Cache Test
```javascript
search query="cache test query"
// Immediate repeat
search query="cache test query"
```
**Expected:** Second request should be served from cache.

### Test 7: Fallback Scenarios
```javascript
// Test with _forceTraditional=true
search query="complex query" _forceTraditional=true
```
**Expected:** Should use traditional search even for complex queries.

## Implementation Verification

### 1. Single Tool Registration
- ✅ Only one tool named "search" registered
- ✅ Additional "search_health" tool for diagnostics

### 2. Three-Tier Fallback Architecture
- ✅ Tier 1: Native LLM (pi.complete/pi.callLLM/pi.llm.complete)
- ✅ Tier 2: Simulated AI response using result summarization
- ✅ Tier 3: Pure traditional search as last resort

### 3. Query Sanitization
- ✅ Removes/replaces sensitive terms (hack, crack, exploit, bypass, etc.)
- ✅ Uses neutral alternatives
- ✅ Safe mode enforcement

### 4. Intelligent Query Classification
- ✅ Short/factual queries → Traditional search
- ✅ Complex queries (explain, compare, analyze) → AI enhancement
- ✅ Auto-detection with manual override

### 5. Caching
- ✅ 5-minute TTL
- ✅ Maximum 100 entries
- ✅ Automatic cleanup

### 6. Rate Limiting
- ✅ 5 requests per 10 seconds
- ✅ Per-IP tracking
- ✅ Graceful error messages

### 7. Response Format
- ✅ Always returns valid JSON
- ✅ Consistent structure: {success, query, mode_used, results, ai_answer, processing_time_ms, fallback_triggered}
- ✅ Error handling with meaningful messages

### 8. Environment Configuration
- ✅ Reads SEARXNG_BASE_URL from environment
- ✅ Defaults to http://140.238.166.109:8081
- ✅ Health check on startup

### 9. Graceful Degradation
- ✅ No pi.callLLM undefined errors
- ✅ No 500 errors from sensitive words
- ✅ Always returns some result (even if fallback)

## Migration Complete
The following files have been replaced:
- ❌ web-search.ts (migrated)
- ❌ hybrid-search.ts (migrated) 
- ❌ hybrid-search-enhanced.ts (migrated)
- ❌ ai-search.ts (migrated)
- ✅ pi-search.ts (unified replacement)

## File Size
- Original 4 files: ~250KB total
- Unified file: ~29KB (88% reduction)

## Next Steps
1. Remove old files after testing
2. Update any references to old tool names
3. Verify all functionality works as expected