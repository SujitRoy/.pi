# Quick Test Guide for Enhanced Web-Search

## **Step 1: Restart PI Agent**
Restart your PI agent to load the enhanced web-search extension.

## **Step 2: Run These Test Commands**

### Test 1: Basic Enhanced Search
```
web_search({
  query: "react hooks tutorial",
  searchType: "web",
  enableSpellCheck: true
})
```

**Check for:**
- Confidence score in output
- Domain boosting ([BOOST] indicators)
- No spelling corrections (tutorial is correct)

### Test 2: Search with Operators
```
web_search({
  query: "site:github.com python tutorial",
  enableDeduplication: true
})
```

**Check for:**
- `site:github.com` operator processed
- Python domain boosting
- Duplicate detection if any similar results

### Test 3: Spell Check
```
spell_check({
  query: "recieve payment for servises"
})
```

**Check for:**
- "recieve" → "receive" correction
- "servises" → "services" correction
- Suggestions array

### Test 4: Search Suggestions
```
search_suggest({
  query: "how to learn"
})
```

**Check for:**
- 3-5 relevant suggestions
- Numbered list format

### Test 5: News Search
```
web_search({
  query: "latest ai news 2025",
  searchType: "news",
  maxResults: 8
})
```

**Check for:**
- Recent publication dates
- News-specific sources
- AI-related domain boosting

## **Expected Results Matrix**

| Test | Success Indicators | Potential Issues |
|------|-------------------|------------------|
| Basic Search | Confidence score, domain boost | SearXNG connectivity |
| Search Operators | Operator processed, filtered results | Operator syntax support |
| Spell Check | Corrections shown | Dictionary coverage |
| Suggestions | Relevant suggestions returned | Autocomplete endpoint |
| News Search | Recent dates, news sources | News category support |

## **Common Issues & Fixes**

### Issue 1: "SearXNG instance not reachable"
**Fix:** Check `SEARXNG_BASE_URL` is correct and instance is running

### Issue 2: "Rate limit exceeded"
**Fix:** Wait a few seconds between tests

### Issue 3: "No results found"
**Fix:** Try simpler query, check SearXNG logs

### Issue 4: "Spell check not correcting"
**Fix:** Add more words to corrections dictionary in code

### Issue 5: "Deep mode timeout"
**Fix:** Increase timeout or reduce maxResults

## **Test Results Template**

Copy and fill this after testing:

```
Test Date: _________
PI Agent Restarted: ☐ Yes ☐ No
SearXNG Instance: ☐ Accessible ☐ Issues

Test 1 - Basic Search:
✅ Confidence scoring working
✅ Domain boost indicators
✅ Spell check (no corrections needed)
⏱ Response time: ____ seconds

Test 2 - Search Operators:
✅ site: operator processed
✅ Results filtered appropriately
⏱ Response time: ____ seconds

Test 3 - Spell Check:
✅ "recieve" → "receive"
✅ "servises" → "services" 
✅ Suggestions provided
⏱ Response time: ____ seconds

Test 4 - Search Suggestions:
✅ Suggestions returned: ____
✅ Relevant to query
✅ Formatted correctly
⏱ Response time: ____ seconds

Test 5 - News Search:
✅ Recent results (within 7 days)
✅ News sources prioritized
✅ Time-sensitive filtering
⏱ Response time: ____ seconds

Overall Status: ☐ All features working ☐ Some issues ☐ Major issues

Issues Found:
1. _________________________
2. _________________________
3. _________________________

Next Actions:
1. _________________________
2. _________________________
3. _________________________
```

## **Production Readiness Checklist**

After successful testing:

- [ ] All 5 test scenarios pass
- [ ] Response times < 5 seconds
- [ ] Error handling works gracefully
- [ ] Security features block malicious attempts
- [ ] Cache improves repeat query performance
- [ ] Memory usage acceptable
- [ ] Rate limits appropriate for your usage

## **Support**

If issues persist:
1. Check SearXNG instance logs
2. Verify `SEARXNG_BASE_URL` environment variable
3. Review extension console warnings
4. Check rate limit settings
5. Test with simpler queries first