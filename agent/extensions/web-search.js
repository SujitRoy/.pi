#!/usr/bin/env node

/**
 * PI Agent Extension: Web Search (Enhanced)
 *
 * Features inspired by GreedySearch-pi, adapted for SearXNG:
 * - Depth modes: fast, standard, deep
 * - Query intent detection with domain boosting
 * - Source content fetching (deep mode)
 * - Result ranking & confidence scoring
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
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      if (key.trim() === 'SEARXNG_BASE_URL' && !process.env.SEARXNG_BASE_URL) {
        process.env.SEARXNG_BASE_URL = value;
      }
    }
  });
}

// SearXNG Configuration
const SEARXNG_CONFIG = {
  baseUrl: process.env.SEARXNG_BASE_URL || 'http://localhost:8080',
  defaultLanguage: 'en',
  maxResults: 8
};

// ============================================================================
// HTTP Helpers
// ============================================================================

/**
 * Make an HTTP request (GET or POST) using fetch API
 */
async function makeHttpRequest(url, method = 'GET', postData = null) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json'
  };

  let body = null;
  if (method === 'POST' && postData) {
    body = new URLSearchParams(postData).toString();
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
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
 * Fetch and extract content from a URL (simplified readability)
 */
async function fetchSourceContent(url) {
  try {
    const html = await makeHttpRequest(url);

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract body text (simple approach - strip HTML tags)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyText = '';
    if (bodyMatch) {
      bodyText = bodyMatch[1]
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 2000); // Limit to 2000 chars
    }

    return {
      url,
      title,
      description,
      excerpt: bodyText || description || 'No content extracted'
    };
  } catch (error) {
    console.error(`[web-search] Failed to fetch source ${url}:`, error.message);
    return { url, title: 'Fetch failed', description: '', excerpt: `Error: ${error.message}` };
  }
}

/**
 * Fetch content from top N sources
 */
async function fetchTopSources(results, limit = 3) {
  const topUrls = results.results.slice(0, limit);
  const fetchPromises = topUrls.map(r => fetchSourceContent(r.url));

  const fetched = await Promise.allSettled(fetchPromises);
  return fetched.map((result, i) => ({
    ...topUrls[i],
    fetchedContent: result.status === 'fulfilled' ? result.value : { url: topUrls[i].url, title: 'Fetch failed', excerpt: result.reason?.message || 'Unknown error' }
  }));
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
  const totalResults = results.numberOfResults || 0;
  const returnedCount = results.results?.length || 0;
  const hasAnswers = results.answers?.length > 0;
  const hasSuggestions = results.suggestions?.length > 0;

  let score = 0;
  const reasons = [];

  if (totalResults > 1000) { score += 0.3; reasons.push('Many sources found'); }
  else if (totalResults > 100) { score += 0.2; reasons.push('Good number of sources'); }
  else if (totalResults > 0) { score += 0.1; reasons.push('Few sources found'); }

  if (returnedCount > 0) { score += 0.2; }
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
    // Undated results go to the end
    if (dateA === 0 && dateB === 0) return 0;
    if (dateA === 0) return 1;
    if (dateB === 0) return -1;
    return dateB - dateA; // Newest first
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
    const isTimeSensitive = needsRecentResults(query);
    if (isTimeSensitive) {
      sortedResults = filterByRecency(sortedResults, 3); // Max 3 days old
      sortedResults = sortByRecency(sortedResults);
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

    return response;
  } catch (error) {
    console.error('[web-search] Search failed:', error.message);
    return {
      results: [],
      suggestions: [],
      answers: [],
      numberOfResults: 0,
      hasErrors: true,
      error: error.message,
      queryType: detectQueryType(query),
      confidence: { score: 0, level: 'low', reasons: ['Search failed'], totalResults: 0, returnedCount: 0 }
    };
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

  // Header
  const confidenceLabel = searchData.confidence
    ? ` | Confidence: ${searchData.confidence.level} (${(searchData.confidence.score * 100).toFixed(0)}%)`
    : '';
  lines.push(`**Weather Results for "${query}"**${confidenceLabel}`);
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

  let response = `Found ${searchData.numberOfResults} result(s) for "${query}"${queryTypeLabel}${confidenceLabel}:\n\n`;

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
// Auto-Search Detection
// ============================================================================

/**
 * Detect if a message likely needs web search
 */
function shouldAutoSearch(message) {
  const searchKeywords = [
    'weather', 'temperature', 'current', 'latest', 'recent', 'now', 'today',
    'who won', 'what is happening', 'news', 'live', 'score', 'stock',
    'price of', 'exchange rate', 'election', 'result', 'results',
    'how to', 'tutorial', 'guide'
  ];
  return searchKeywords.some(keyword => message.toLowerCase().includes(keyword));
}

// ============================================================================
// PI Agent Extension Factory
// ============================================================================

module.exports = function(api) {
  console.log('[web-search] Extension loaded, SearXNG URL:', SEARXNG_CONFIG.baseUrl);

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
      console.log('[web-search] Tool called with params:', JSON.stringify(params, null, 2));

      const query = params?.query;

      console.log('[web-search] Extracted query:', query);

      if (!query || typeof query !== 'string' || query.trim() === '') {
        const errorText = `⚠️ **Web Search Error**\n\n` +
          `No search query provided. Please provide a search query.\n\n` +
          `**Received:** ${JSON.stringify(params)}\n\n` +
          `**Example:** web_search({ query: "Noida weather forecast" })`;
        console.error('[web-search] Error: No valid query');
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
          const errorText = `⚠️ **Web Search Unavailable**\n\n` +
            `The search engine could not be reached. Please try again later.\n\n` +
            `**Details:** ${results.error}\n` +
            `**SearXNG URL:** ${SEARXNG_CONFIG.baseUrl}\n\n` +
            `*Tip: Verify your SearXNG instance is running and accessible.*`;
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
        const errorText = `⚠️ **Web Search Failed**\n\n` +
          `An unexpected error occurred while searching.\n\n` +
          `**Error:** ${error.message || 'Unknown error'}`;
        console.error('[web-search] Tool execution failed:', error);
        return { content: [{ type: 'text', text: errorText }], isError: true };
      }
    }
  });

  // Hook into user input to auto-trigger search when appropriate
  api.on('input', async (event, ctx) => {
    const message = event.text || '';

    if (shouldAutoSearch(message) && message.length > 5) {
      console.log('[web-search] Auto-triggering search for:', message);
      try {
        const results = await search(message, { depth: 'fast' });

        // If search failed, let the original message through with an error note
        if (results.hasErrors && results.error) {
          console.error('[web-search] Auto-search failed:', results.error);
          const errorMsg = `[Web search unavailable: ${results.error}]`;
          return { action: 'transform', text: `${message}\n\n${errorMsg}` };
        }

        // If no results, let the agent handle it naturally
        if (results.results.length === 0) {
          console.log('[web-search] No results found');
          const noResultsMsg = `[Web search returned no results for this query]`;
          return { action: 'transform', text: `${message}\n\n${noResultsMsg}` };
        }

        const formatted = formatSearchResults(results, message, 'fast');
        const enhancedMessage = `${message}\n\n[Web search results:]\n${formatted}`;
        console.log('[web-search] Search results injected into context');

        return { action: 'transform', text: enhancedMessage };
      } catch (error) {
        console.error('[web-search] Auto-search failed:', error.message);
        // Add error context so agent knows search didn't work
        const errorMsg = `[Web search service error: ${error.message}]`;
        return { action: 'transform', text: `${message}\n\n${errorMsg}` };
      }
    }

    // Let the message continue unchanged
    return { action: 'continue' };
  });
};
