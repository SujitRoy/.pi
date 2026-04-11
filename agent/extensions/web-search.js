#!/usr/bin/env node

/**
 * PI Agent Extension: Web Search (Enhanced)
 *
 * Features inspired by GreedySearch-pi, adapted for SearXNG:
 * - Depth modes: fast, standard, deep
 * - Query intent detection with domain boosting
 * - Source content fetching (deep mode)
 * - Result ranking & confidence scoring
 * - Direct URL content fetching (fetch_content tool)
 *
 * Tools Provided:
 * - web_search({ query, category, language, maxResults, depth })
 * - fetch_content({ url, prompt? })
 *
 * Configuration:
 * - Set SEARXNG_BASE_URL environment variable
 * - Or create a .env file at ~/.pi/.env
 * - Defaults to http://localhost:8080 if not set
 */

const path = require('path');
const fs = require('fs');

// Load .env file if it exists
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) return;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Strip inline comments (not inside quotes)
    const commentIndex = value.indexOf(' #');
    if (commentIndex !== -1) {
      value = value.substring(0, commentIndex).trim();
    }

    if (key === 'SEARXNG_BASE_URL' && !process.env.SEARXNG_BASE_URL) {
      process.env.SEARXNG_BASE_URL = value;
    }
  });
}

// Proxy configuration (to enable in future)
// const PROXY_CONFIG = {
//   proxyUrl: process.env.PROXY_URL || null
// };

// SearXNG Configuration
const SEARXNG_BASE = process.env.SEARXNG_BASE_URL || 'http://localhost:8080';

// Validate SEARXNG_BASE_URL scheme
try {
  const parsedUrl = new URL(SEARXNG_BASE);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported scheme: ${parsedUrl.protocol}`);
  }
} catch (error) {
  throw new Error(`Invalid SEARXNG_BASE_URL "${SEARXNG_BASE}": ${error.message}`);
}

const SEARXNG_CONFIG = {
  baseUrl: SEARXNG_BASE,
  defaultLanguage: 'en',
  maxResults: 8
};

// Simple in-memory cache for search results
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

/**
 * Get cached result if available and not expired
 */
function getCachedResult(cacheKey) {
  const cached = searchCache.get(cacheKey);
  if (cached) {
    const ttl = cached.ttl || CACHE_TTL; // Use per-entry TTL or default
    if (Date.now() - cached.timestamp < ttl) {
      return cached.data;
    }
    // Remove expired entry
    searchCache.delete(cacheKey);
  }
  return null;
}

/**
 * Cache search result
 */
function setCachedResult(cacheKey, data) {
  searchCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });

  // Evict oldest entries when cache exceeds size limit
  while (searchCache.size > 50) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey === undefined) break;
    searchCache.delete(firstKey);
  }
}

// ============================================================================
// HTTP Helpers
// ============================================================================

/**
 * Check if URL targets internal/private addresses (SSRF protection)
 */
function isBlockedInternalURL(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Block scheme-based attacks: file://, data://, javascript://
    const protocol = parsed.protocol.toLowerCase();
    if (!['http:', 'https:'].includes(protocol)) {
      return true;
    }

    // Block localhost, loopback, and internal IPs
    const blockedHostnames = ['localhost', '0.0.0.0', '::1', '[::1]'];
    if (blockedHostnames.includes(hostname)) {
      return true;
    }

    // Block entire 127.0.0.0/8 loopback range (127.0.0.0 - 127.255.255.255)
    if (/^127\./.test(hostname)) {
      return true;
    }

    // Block octal/hex IP bypasses (0177.0.0.1, 0x7f.0.0.1)
    if (/^0[0-7]+\./.test(hostname) || /^0x[0-9a-f]+\./i.test(hostname)) {
      return true;
    }

    // Block private IP ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x
    const privateIPPattern = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/;
    if (privateIPPattern.test(hostname)) {
      return true;
    }

    // Block IPv6 link-local (fe80::/10) and unique local (fc00::/7, fd00::/8)
    if (/^fe[89ab]/i.test(hostname) || /^f[c-d]/i.test(hostname)) {
      return true;
    }

    // Block .local and .internal TLDs
    if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return true;
    }

    return false;
  } catch {
    return true; // Block invalid URLs
  }
}

/**
 * Validate Content-Type header for text-based content
 */
function isTextBasedContent(contentType) {
  if (!contentType) return true; // Allow if no content-type (be permissive)
  
  const textTypes = [
    'text/html', 'text/plain', 'text/xml', 'text/markdown',
    'application/xhtml+xml', 'application/xml',
    'application/json', 'application/javascript',
    'text/'
  ];
  
  return textTypes.some(type => contentType.toLowerCase().includes(type));
}

/**
 * Make an HTTP request (GET or POST) using fetch API
 * Enhanced with SSRF protection, redirect following, and content-type validation
 */
async function makeHttpRequest(url, method = 'GET', postData = null, options = {}) {
  const { 
    maxRedirects = 5, 
    validateContentType = false,
    acceptHeader = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  } = options;
  
  // SSRF Protection: Block internal URLs
  if (isBlockedInternalURL(url)) {
    throw new Error(`Access to internal/private URLs is blocked for security: ${url}`);
  }
  
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': acceptHeader
  };

  let body = null;
  if (method === 'POST' && postData) {
    body = new URLSearchParams(postData).toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const timeoutMs = options.timeout || 15000;
  
  // Follow redirects manually for better control
  let currentUrl = url;
  let redirectCount = 0;
  
  while (true) {
    const response = await fetch(currentUrl, {
      method,
      headers,
      body,
      redirect: 'manual', // Handle redirects manually
      signal: AbortSignal.timeout(timeoutMs)
    });
    
    // Handle redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectCount++;
      
      if (redirectCount > maxRedirects) {
        throw new Error(`Too many redirects (max: ${maxRedirects})`);
      }
      
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirect response without Location header`);
      }
      
      // Resolve relative URLs
      currentUrl = new URL(location, currentUrl).href;

      // Validate redirect scheme
      const redirectProtocol = new URL(currentUrl).protocol.toLowerCase();
      if (!['http:', 'https:'].includes(redirectProtocol)) {
        throw new Error(`Redirect to unsupported scheme: ${redirectProtocol}`);
      }

      // SSRF check on redirect target
      if (isBlockedInternalURL(currentUrl)) {
        throw new Error(`Redirect to internal URL blocked: ${currentUrl}`);
      }

      continue;
    }
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Content-Type validation (optional)
    if (validateContentType) {
      const contentType = response.headers.get('content-type');
      if (!isTextBasedContent(contentType)) {
        throw new Error(`Unsupported content type: ${contentType}. Only text-based content is allowed.`);
      }
    }
    
    return await response.text();
  }
}

// ============================================================================
// Query Intent Detection & Domain Boosting (inspired by GreedySearch)
// ============================================================================

const DOMAIN_BOOST_MAP = [
  { keywords: ['react', 'react native', 'reactjs'], domains: ['react.dev', 'reactnative.dev', 'legacy.reactjs.org'] },
  { keywords: ['vue', 'vuejs', 'nuxt'], domains: ['vuejs.org', 'nuxt.com'] },
  { keywords: ['angular'], domains: ['angular.io', 'angular.dev'] },
  { keywords: ['svelte'], domains: ['svelte.dev', 'kit.svelte.dev'] },
  { keywords: ['next.js', 'nextjs'], domains: ['nextjs.org', 'vercel.com'] },
  { keywords: ['node.js', 'nodejs', 'npm', 'npx'], domains: ['nodejs.org', 'npmjs.com', 'nodejs.dev'] },
  { keywords: ['typescript', 'tsconfig'], domains: ['typescriptlang.org'] },
  { keywords: ['python', 'pip', 'pypi'], domains: ['python.org', 'docs.python.org', 'pypi.org'] },
  { keywords: ['rust', 'cargo', 'crates'], domains: ['rust-lang.org', 'doc.rust-lang.org', 'crates.io'] },
  { keywords: ['docker', 'container', 'dockerfile'], domains: ['docker.com', 'docs.docker.com'] },
  { keywords: ['kubernetes', 'kubectl', 'k8s'], domains: ['kubernetes.io', 'kubernetes.docs'] },
  { keywords: ['aws', 'amazon web', 'lambda', 'ec2', 's3'], domains: ['aws.amazon.com', 'docs.aws.amazon.com'] },
  { keywords: ['firebase'], domains: ['firebase.google.com', 'firebase.google.com/docs'] },
  { keywords: ['supabase'], domains: ['supabase.com', 'supabase.com/docs'] },
  { keywords: ['prisma'], domains: ['prisma.io', 'prisma.io/docs'] },
  { keywords: ['tailwind', 'tailwindcss'], domains: ['tailwindcss.com'] },
  { keywords: ['vite'], domains: ['vitejs.dev', 'vite.dev'] },
  { keywords: ['webpack'], domains: ['webpack.js.org'] },
  { keywords: ['github', 'git'], domains: ['github.com', 'docs.github.com', 'git-scm.com'] },
  { keywords: ['openai', 'gpt', 'chatgpt'], domains: ['openai.com', 'platform.openai.com', 'help.openai.com'] },
  { keywords: ['anthropic', 'claude'], domains: ['anthropic.com', 'docs.anthropic.com'] },
  { keywords: ['weather', 'forecast', 'temperature'], domains: ['weather.com', 'accuweather.com', 'windy.com'] },
  { keywords: ['stock', 'share price', 'market cap', 'nasdaq', 'nyse'], domains: ['finance.yahoo.com', 'google.com/finance'] },
];

/**
 * Detect query intent and return domains that should be boosted
 */
function detectQueryIntent(query) {
  const normalized = query.toLowerCase();
  const boostedDomains = [];

  for (const rule of DOMAIN_BOOST_MAP) {
    if (rule.keywords.some(kw => normalized.includes(kw))) {
      boostedDomains.push(...rule.domains);
    }
  }

  return boostedDomains;
}

/**
 * Detect the type of query for intent-aware formatting
 */
function detectQueryType(query) {
  const normalized = query.toLowerCase();

  if (['how to', 'how do i', 'how can i', 'tutorial', 'guide', 'example'].some(k => normalized.includes(k))) {
    return 'tutorial';
  }
  if (['error', 'bug', 'fix', 'issue', 'failed', 'not working'].some(k => normalized.includes(k))) {
    return 'debugging';
  }
  if (['vs', 'versus', 'compare', 'comparison', 'better', 'difference between'].some(k => normalized.includes(k))) {
    return 'comparison';
  }
  if (['weather', 'forecast', 'temperature', 'humidity'].some(k => normalized.includes(k))) {
    return 'weather';
  }
  if (['news', 'latest', 'recent', 'today', 'current'].some(k => normalized.includes(k))) {
    return 'news';
  }
  if (['what is', 'what are', 'define', 'meaning', 'explain'].some(k => normalized.includes(k))) {
    return 'definition';
  }

  return 'general';
}

// ============================================================================
// Source Content Fetching (Deep Mode)
// ============================================================================

/**
 * Parse HTML and extract readable text content
 * Uses a robust approach without external dependencies
 */
function extractTextFromHTML(html) {
  // Remove script, style, noscript, svg content entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');

  // Extract meaningful content from structural elements
  text = text
    // Convert block elements to newlines
    .replace(/<(?:p|div|article|section|header|footer|main|li|tr|h[1-6])[^>]*>/gi, '\n')
    .replace(/<\/(?:p|div|article|section|header|footer|main|li|tr|h[1-6])>/gi, '\n')
    // Handle line breaks
    .replace(/<(?:br|hr)[^>]*\/?>/gi, '\n')
    // Handle links: keep text, add URL
    .replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)')
    // Handle images: keep alt text
    .replace(/<img[^>]+alt=["']([^"']*)["'][^>]*\/?>/gi, ' [img: $1] ')
    .replace(/<img[^>]*\/?>/gi, ' ')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  return text;
}

/**
 * Fetch and extract content from a URL (deep mode)
 * Enhanced with caching, content-type validation, and configurable limits
 */
async function fetchSourceContent(url, options = {}) {
  const { 
    maxContentLength = 2000,
    useCache = true,
    timeout = 15000
  } = options;
  
  // Check cache first
  if (useCache) {
    const cacheKey = `content_${url}`;
    const cached = getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }
  }
  
  try {
    const html = await makeHttpRequest(url, 'GET', null, { 
      validateContentType: true,
      timeout
    });

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract meta description (check both attribute orders)
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract main content using improved HTML parser
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyText = '';
    if (bodyMatch) {
      bodyText = extractTextFromHTML(bodyMatch[1]).slice(0, maxContentLength);
    }

    const result = {
      url,
      title,
      description,
      excerpt: bodyText || description || 'No content extracted'
    };
    
    // Cache the result
    if (useCache) {
      const cacheKey = `content_${url}`;
      setCachedResult(cacheKey, result);
    }
    
    return result;
  } catch (error) {
    return { url, title: 'Fetch failed', description: '', excerpt: `Error: ${error.message}` };
  }
}

/**
 * Fetch content from top N sources with concurrency limiting
 */
async function fetchTopSources(results, limit = 3) {
  const topUrls = results.results.slice(0, limit);
  
  // Limit concurrent requests to prevent overwhelming servers
  const CONCURRENT_LIMIT = 2;
  const fetched = [];
  
  for (let i = 0; i < topUrls.length; i += CONCURRENT_LIMIT) {
    const batch = topUrls.slice(i, i + CONCURRENT_LIMIT);
    const batchPromises = batch.map(r => fetchSourceContent(r.url));
    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((result, j) => {
      const originalUrl = batch[j];
      fetched.push({
        ...originalUrl,
        fetchedContent: result.status === 'fulfilled' ? result.value : { url: originalUrl.url, title: 'Fetch failed', excerpt: result.reason?.message || 'Unknown error' }
      });
    });
  }
  
  return fetched;
}

// ============================================================================
// Result Ranking & Confidence Scoring
// ============================================================================

/**
 * Re-rank results with domain boost from query intent
 */
function rerankWithDomainBoost(results, boostedDomains) {
  if (boostedDomains.length === 0) return results;

  return results.map(r => {
    let boost = 0;
    try {
      const urlHostname = new URL(r.url).hostname.replace(/^www\./, '');
      if (boostedDomains.some(d => urlHostname.includes(d.replace(/^www\./, '')))) {
        boost = 0.3; // 30% score boost for relevant domains
      }
    } catch { /* ignore invalid URLs */ }

    return { ...r, score: (r.score || 0) + boost, _domainBoosted: boost > 0 };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Build confidence metadata for search results
 */
function buildConfidence(results, query, queryType) {
  // Use actual returned results count, not API's total estimate
  const returnedCount = results.results?.length || 0;
  const totalResults = results.numberOfResults || returnedCount; // Fallback to returned count
  const hasAnswers = results.answers?.length > 0;
  const hasSuggestions = results.suggestions?.length > 0;

  let score = 0;
  const reasons = [];

  // Score based on actual returned results (more reliable than API estimates)
  if (returnedCount >= 5) { score += 0.3; reasons.push('Multiple sources found'); }
  else if (returnedCount >= 3) { score += 0.2; reasons.push('Several sources found'); }
  else if (returnedCount >= 1) { score += 0.1; reasons.push('Few sources found'); }

  // Bonus for API total count being high (indicates comprehensive search space)
  if (totalResults > 1000 && returnedCount > 0) { score += 0.1; reasons.push('Large search space'); }

  if (hasAnswers) { score += 0.3; reasons.push('Direct answer available'); }
  if (hasSuggestions) { score += 0.1; reasons.push('Alternative queries suggested'); }
  if (queryType !== 'general') { score += 0.1; reasons.push(`Specific intent: ${queryType}`); }

  let level = 'low';
  if (score >= 0.7) level = 'high';
  else if (score >= 0.4) level = 'medium';

  return {
    score: Math.min(score, 1),
    level,
    reasons,
    totalResults,
    returnedCount
  };
}

// ============================================================================
// Search
// ============================================================================

/**
 * Extract location keywords from query for relevance filtering
 */
function extractLocation(query) {
  const words = query.toLowerCase().split(/\s+/);
  const stopWords = ['weather', 'today', 'current', 'forecast', 'temperature', 'in', 'what', 'is', 'how', '?', 'and', 'the', 'of', 'for', 'now'];
  return words.filter(w => !stopWords.includes(w) && w.length > 2);
}

/**
 * Filter results by recency (for time-sensitive queries)
 * Removes results older than the specified days
 */
function filterByRecency(results, maxDaysOld = 3) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - maxDaysOld * 24 * 60 * 60 * 1000);

  return results.filter(result => {
    if (!result.publishedDate) return true; // Keep undated results
    try {
      const pubDate = new Date(result.publishedDate);
      return pubDate >= cutoff;
    } catch {
      return true; // Keep if date parsing fails
    }
  });
}

/**
 * Sort results by recency (newest first)
 */
function sortByRecency(results) {
  return results.sort((a, b) => {
    const dateA = a.publishedDate ? new Date(a.publishedDate).getTime() : 0;
    const dateB = b.publishedDate ? new Date(b.publishedDate).getTime() : 0;
    // Treat NaN as 0 (undated)
    const validA = Number.isFinite(dateA) ? dateA : 0;
    const validB = Number.isFinite(dateB) ? dateB : 0;
    // Undated results go to the end
    if (validA === 0 && validB === 0) return 0;
    if (validA === 0) return 1;
    if (validB === 0) return -1;
    return validB - validA; // Newest first
  });
}

/**
 * Detect if a query needs recent/time-filtered results
 */
function needsRecentResults(query) {
  const normalized = query.toLowerCase();
  const timeKeywords = [
    'weather', 'forecast', 'temperature', 'current', 'latest', 'recent',
    'now', 'today', 'news', 'live', 'score', 'stock', 'price of',
    'exchange rate', 'election', 'result', 'results', 'how to',
    'tutorial', 'guide'
  ];
  return timeKeywords.some(kw => normalized.includes(kw));
}

/**
 * Perform a web search using SearXNG API
 */
async function search(query, options = {}) {
  const {
    language = SEARXNG_CONFIG.defaultLanguage,
    category = 'general',
    maxResults = SEARXNG_CONFIG.maxResults,
    depth = 'standard'
  } = options;

  // Create cache key with structured prefix to avoid collisions
  const cacheKey = `search|${query}|${language}|${category}|${maxResults}|${depth}`;
  const isTimeSensitive = needsRecentResults(query);

  // Try to get from cache first (skip for deep mode as it fetches external content)
  // Skip cache for weather/time-sensitive queries - users want live data
  if (depth !== 'deep' && !isTimeSensitive) {
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
  }

  const searchData = {
    q: query,
    format: 'json',
    language,
    categories: category
  };

  // Add time range filter for time-sensitive queries (weather, news, etc.)
  if (needsRecentResults(query)) {
    searchData.time_range = 'week';
  }

  const url = `${SEARXNG_CONFIG.baseUrl}/search`;

  try {
    const results = await makeHttpRequest(url, 'POST', searchData);
    const parsed = JSON.parse(results);

    if (!parsed.results || !Array.isArray(parsed.results)) {
      return {
        results: [],
        suggestions: parsed.suggestions || [],
        answers: parsed.answers || [],
        numberOfResults: parsed.number_of_results || 0,
        hasErrors: parsed.unresponsive_engines?.length > 0
      };
    }

    let sortedResults = parsed.results
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, maxResults);

    // Apply domain boosting based on query intent
    const boostedDomains = detectQueryIntent(query);
    if (boostedDomains.length > 0) {
      sortedResults = rerankWithDomainBoost(sortedResults, boostedDomains);
    }

    // For time-sensitive queries, filter out stale results and sort by recency
    if (isTimeSensitive) {
      sortedResults = filterByRecency(sortedResults, 3); // Max 3 days old
      sortedResults = sortByRecency(sortedResults);

      // For weather/news queries, also filter out results that don't mention the query location
      const locationKeywords = extractLocation(query);
      if (locationKeywords.length > 0) {
        sortedResults = sortedResults.filter(result => {
          const text = `${result.title} ${result.content} ${result.url}`.toLowerCase();
          // At least one location keyword should appear in the result
          return locationKeywords.some(kw => text.includes(kw));
        });
      }
    }

    const response = {
      results: sortedResults.map(result => ({
        title: result.title || '',
        content: result.content || '',
        url: result.url || '',
        publishedDate: result.publishedDate || result.pubdate || null,
        engine: result.engines ? result.engines.join(', ') : result.engine || null,
        score: result.score || 0,
        _domainBoosted: result._domainBoosted || false
      })),
      suggestions: parsed.suggestions || [],
      answers: parsed.answers || [],
      numberOfResults: parsed.number_of_results || 0,
      hasErrors: parsed.unresponsive_engines?.length > 0,
      queryType: detectQueryType(query)
    };

    // Confidence scoring (always included)
    response.confidence = buildConfidence(response, query, response.queryType);

    // Deep mode: fetch content from top sources
    if (depth === 'deep' && response.results.length > 0) {
      response.fetchedSources = await fetchTopSources(response, 3);
    }

    // Cache the result if not in deep mode and not time-sensitive
    if (depth !== 'deep' && !isTimeSensitive) {
      setCachedResult(cacheKey, response);
    }
    
    return response;
  } catch (error) {
    const errorResponse = {
      results: [],
      suggestions: [],
      answers: [],
      numberOfResults: 0,
      hasErrors: true,
      error: error.message,
      queryType: detectQueryType(query),
      confidence: { score: 0, level: 'low', reasons: ['Search failed'], totalResults: 0, returnedCount: 0 }
    };

    // Only cache transient errors (network failures), not permanent errors (bad query)
    // Use shorter TTL for errors to allow faster recovery
    if (depth !== 'deep' && !isTimeSensitive) {
      searchCache.set(cacheKey, {
        data: errorResponse,
        timestamp: Date.now(),
        ttl: 60 * 1000 // 1 minute TTL for errors
      });
    }

    return errorResponse;
  }
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format weather results into a clean, structured format
 */
function formatWeatherResults(searchData, query) {
  const lines = [];

  // Header - use actual results count
  const actualCount = searchData.results.length;
  const confidenceLabel = searchData.confidence
    ? ` | Confidence: ${searchData.confidence.level} (${(searchData.confidence.score * 100).toFixed(0)}%)`
    : '';
  lines.push(`**Weather Results for "${query}"** (${actualCount} sources)${confidenceLabel}`);
  lines.push('');

  // Show top results with their full content snippets
  lines.push('**Current Conditions (from top sources):**');
  lines.push('');
  searchData.results.slice(0, 4).forEach((result, i) => {
    if (result.content) {
      // Show source name and full snippet
      lines.push(`${i + 1}. **${result.title}**`);
      lines.push(`   ${result.content}`);
      if (result.publishedDate) {
        lines.push(`   _Updated: ${result.publishedDate.split('T')[0]}_`);
      }
      lines.push('');
    }
  });

  // List all sources
  lines.push('**All Sources:**');
  searchData.results.forEach((r, i) => {
    lines.push(`${i + 1}. [${r.title}](${r.url})`);
  });

  return lines.join('\n');
}

/**
 * Format search results into a readable string
 */
function formatSearchResults(searchData, query, depth = 'standard') {
  if (searchData.hasErrors && searchData.results.length === 0) {
    return `Search completed but no results were returned. Check your SearXNG instance configuration (${SEARXNG_CONFIG.baseUrl}).`;
  }

  if (searchData.results.length === 0) {
    let response = `No results found for "${query}".`;
    if (searchData.suggestions?.length > 0) {
      response += `\n\nSuggestions: ${searchData.suggestions.join(', ')}`;
    }
    return response;
  }

  // Special formatting for weather queries
  if (searchData.queryType === 'weather') {
    return formatWeatherResults(searchData, query);
  }

  const queryTypeLabel = searchData.queryType ? ` [${searchData.queryType}]` : '';
  const confidenceLabel = searchData.confidence ? ` | Confidence: ${searchData.confidence.level} (${(searchData.confidence.score * 100).toFixed(0)}%)` : '';

  // Use actual results count, not API's total estimate (which is often 0)
  const actualCount = searchData.results.length;
  const totalCount = searchData.numberOfResults || actualCount;

  let response = `Found ${actualCount} result(s) for "${query}"${queryTypeLabel}${confidenceLabel}:\n\n`;

  searchData.results.forEach((result, index) => {
    const boostBadge = result._domainBoosted ? ' ⭐' : '';
    response += `${index + 1}. **${result.title}**${boostBadge}\n`;
    if (result.content) {
      response += `   ${result.content}\n`;
    }
    response += `   URL: ${result.url}\n`;
    if (result.publishedDate) {
      response += `   Published: ${result.publishedDate}\n`;
    }
    response += '\n';
  });

  // Deep mode: include fetched source content
  if (depth === 'deep' && searchData.fetchedSources?.length > 0) {
    response += `---\n## 📄 Top Source Content (Deep Mode)\n\n`;
    searchData.fetchedSources.forEach((source, i) => {
      response += `**${i + 1}. ${source.fetchedContent.title || source.title}**\n`;
      response += `   ${source.fetchedContent.excerpt}\n`;
      response += `   [Read full](${source.url})\n\n`;
    });
  }

  if (searchData.suggestions?.length > 0) {
    response += `\nSuggestions: ${searchData.suggestions.join(', ')}`;
  }

  return response;
}

// ============================================================================
// PI Agent Extension Factory
// ============================================================================

module.exports = function(api) {
  // Register the web_search tool
  api.registerTool({
    name: 'web_search',
    description: 'Search the web for current information. Supports depth modes for varying detail levels.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query'
        },
        category: {
          type: 'string',
          description: 'Search category (general, news, it, science)',
          default: 'general'
        },
        language: {
          type: 'string',
          description: 'Language code',
          default: 'en'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results',
          default: 8
        },
        depth: {
          type: 'string',
          description: 'Search depth: "fast" (quick), "standard" (balanced), "deep" (fetch source content)',
          enum: ['fast', 'standard', 'deep'],
          default: 'standard'
        }
      },
      required: ['query']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      const query = params?.query;

      if (!query || typeof query !== 'string' || query.trim() === '') {
        const errorText = `**Web Search Error**\n\nNo search query provided. Please provide a search query.`;
        return { content: [{ type: 'text', text: errorText }], isError: true };
      }

      try {
        const results = await search(query, {
          category: params?.category || 'general',
          language: params?.language || 'en',
          maxResults: params?.maxResults || SEARXNG_CONFIG.maxResults,
          depth: params?.depth || 'standard'
        });

        // Handle connection/network errors
        if (results.hasErrors && results.error) {
          const errorText = `**Web Search Unavailable**\n\nThe search engine could not be reached. Please try again later.\n\n**Details:** ${results.error}\n**SearXNG URL:** ${SEARXNG_CONFIG.baseUrl}`;
          return { content: [{ type: 'text', text: errorText }], isError: true };
        }

        // Handle no results
        if (results.results.length === 0) {
          let text = `No results found for "${query}".`;
          if (results.suggestions?.length > 0) {
            text += `\n\nTry these instead: ${results.suggestions.join(', ')}`;
          }
          return { content: [{ type: 'text', text }] };
        }

        const text = formatSearchResults(results, query, params?.depth || 'standard');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        const errorText = `**Web Search Failed**\n\nAn unexpected error occurred.\n\n**Error:** ${error.message || 'Unknown error'}`;
        return { content: [{ type: 'text', text: errorText }], isError: true };
      }
    }
  });

  // Register the fetch_content tool
  api.registerTool({
    name: 'fetch_content',
    description: 'Fetch and extract content from a specific URL. Useful for reading articles, documentation, or any web page.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch content from'
        },
        prompt: {
          type: 'string',
          description: 'Optional: Specific question or focus when extracting content'
        },
        maxLength: {
          type: 'number',
          description: 'Maximum characters to extract from content (default: 2000)',
          default: 2000
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in milliseconds (default: 15000)',
          default: 15000
        }
      },
      required: ['url']
    },
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      const url = params?.url;

      if (!url || typeof url !== 'string' || url.trim() === '') {
        const errorText = `**Fetch Content Error**\n\nNo URL provided. Please provide a URL to fetch.`;
        return { content: [{ type: 'text', text: errorText }], isError: true };
      }

      const cleanUrl = url.trim();

      // Validate URL format
      let validUrl;
      try {
        validUrl = new URL(cleanUrl);
        if (!['http:', 'https:'].includes(validUrl.protocol)) {
          throw new Error('Only HTTP/HTTPS URLs are supported');
        }
      } catch (error) {
        const errorText = `**Fetch Content Error**\n\nInvalid URL: ${url}\n\n**Details:** ${error.message}`;
        return { content: [{ type: 'text', text: errorText }], isError: true };
      }

      // Check for internal/private URLs (SSRF protection)
      if (isBlockedInternalURL(cleanUrl)) {
        const errorText = `**Fetch Content Blocked**\n\nAccess to internal/private URLs is not allowed for security reasons.\n\n**URL:** ${cleanUrl}`;
        return { content: [{ type: 'text', text: errorText }], isError: true };
      }

      try {
        const content = await fetchSourceContent(cleanUrl, {
          maxContentLength: params?.maxLength || 2000,
          useCache: true,
          timeout: params?.timeout || 15000
        });

        if (!content || content.title === 'Fetch failed') {
          const errorText = `**Fetch Content Failed**\n\nCould not extract content from: ${cleanUrl}\n\n**Details:** ${content?.excerpt || 'Unknown error'}`;
          return { content: [{ type: 'text', text: errorText }], isError: true };
        }

        // Format the response
        let response = `## ${content.title}\n\n`;
        response += `**Source:** ${content.url}\n\n`;
        response += `---\n\n${content.excerpt}\n\n`;
        response += `---\n*Content extracted successfully.*`;

        if (params?.prompt) {
          response = `## Content from: ${content.title}\n\n`;
          response += `**Source:** ${content.url}\n`;
          response += `**Your question:** ${params.prompt}\n\n`;
          response += `---\n\n`;
          response += `**Extracted Content:**\n\n${content.excerpt}\n\n`;
          response += `---\n*Review the content above to answer your question.*`;
        }

        return { content: [{ type: 'text', text: response }] };
      } catch (error) {
        const errorText = `**Fetch Content Failed**\n\nAn unexpected error occurred.\n\n**URL:** ${cleanUrl}\n**Error:** ${error.message || 'Unknown error'}`;
        return { content: [{ type: 'text', text: errorText }], isError: true };
      }
    }
  });
};
