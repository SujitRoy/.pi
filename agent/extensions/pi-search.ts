#!/usr/bin/env node

/**
 * Robust Web Search Extension for PI Agent
 * 
 * Features:
 * 1. Tight LLM integration using PI's native API
 * 2. Intelligent query processing with AI enhancement
 * 3. Multi-source search with fallbacks
 * 4. Real-time caching and rate limiting
 * 5. Comprehensive error handling
 * 6. Health monitoring and diagnostics
 * 
 * Tools:
 * - search: Unified intelligent search with AI enhancement
 * - search_health: System diagnostics
 * - fetch_content: URL content extraction
 */

// Configuration
const DEFAULT_SEARXNG_URL = "http://140.238.166.109:8081";
// Use global process if available, otherwise default
declare const process: any;
const SEARXNG_BASE = (typeof process !== 'undefined' && process.env && process.env.SEARXNG_BASE_URL) || DEFAULT_SEARXNG_URL;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds

// Cache and rate limiting
const searchCache = new Map();
const requestTimestamps: number[] = [];

// Clean cache periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of searchCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL) {
            searchCache.delete(key);
        }
    }
}, 60000); // Clean every minute

// Rate limiting check
function checkRateLimit(): boolean {
    const now = Date.now();
    // Remove old timestamps
    while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
        requestTimestamps.shift();
    }
    
    if (requestTimestamps.length >= RATE_LIMIT_REQUESTS) {
        return false;
    }
    
    requestTimestamps.push(now);
    return true;
}

// Query sanitization to avoid 500 errors
function sanitizeQuery(query: string): string {
    const replacements: Record<string, string> = {
        // Security terms
        'hack': 'security',
        'crack': 'access',
        'exploit': 'vulnerability',
        'bypass': 'workaround',
        'ddos': 'network issue',
        'malware': 'security software',
        'virus': 'computer issue',
        
        // Violence terms
        'kill': 'stop',
        'murder': 'crime',
        'weapon': 'tool',
        'attack': 'action',
        'terror': 'fear',
        
        // Adult content
        'porn': 'content',
        'xxx': 'adult material',
        'adult': 'mature',
        'nsfw': 'content',
        
        // Political/sensitive
        'controversial': 'debated',
        'political': 'governmental',
        'protest': 'demonstration',
        'riot': 'protest'
    };
    
    let sanitized = query.toLowerCase();
    for (const [bad, good] of Object.entries(replacements)) {
        const regex = new RegExp(`\\b${bad}\\b`, 'gi');
        sanitized = sanitized.replace(regex, good);
    }
    
    return sanitized;
}

// Query classification
function classifyQuery(query: string): 'simple' | 'complex' | 'research' {
    const simplePatterns = [
        /weather/i,
        /temperature/i,
        /time in/i,
        /date/i,
        /capital of/i,
        /population of/i,
        /price of/i,
        /rate of/i,
        /score/i,
        /result/i
    ];
    
    const researchPatterns = [
        /explain/i,
        /analyze/i,
        /compare/i,
        /contrast/i,
        /evaluate/i,
        /assess/i,
        /research/i,
        /study/i,
        /investigate/i,
        /comprehensive/i
    ];
    
    const wordCount = query.split(/\s+/).length;
    
    if (wordCount <= 3 || simplePatterns.some(pattern => pattern.test(query))) {
        return 'simple';
    } else if (researchPatterns.some(pattern => pattern.test(query)) || wordCount > 10) {
        return 'research';
    } else {
        return 'complex';
    }
}

// Perform SearXNG search
async function performSearxngSearch(query: string, category = 'general', maxResults = 10) {
    try {
        const url = `${SEARXNG_BASE}/search`;
        const params = new URLSearchParams({
            q: query,
            format: 'json',
            categories: category,
            language: 'en',
            time_range: '',
            safesearch: '1'
        });
        
        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(`${url}?${params}`, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'PI-Agent-Search/1.0'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`SearXNG error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Format results
        return data.results?.slice(0, maxResults).map((result: any) => ({
            title: result.title || 'No title',
            url: result.url || '#',
            snippet: result.content || 'No description',
            score: result.score || 0,
            publishedDate: result.publishedDate || null
        })) || [];
    } catch (error) {
        console.error('Search error:', error);
        return [];
    }
}

// Generate AI-enhanced answer
async function generateAIAnswer(query: string, results: any[], piContext: any) {
    try {
        // Try to use PI's LLM if available
        const pi = (globalThis as any).pi || piContext?.pi;
        
        if (pi?.complete) {
            const prompt = `Based on these search results, answer the query: "${query}"\n\nSearch Results:\n${results.slice(0, 5).map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n')}\n\nProvide a comprehensive, accurate answer citing sources where appropriate.`;
            
            const answer = await pi.complete({
                prompt,
                maxTokens: 1000,
                temperature: 0.7
            });
            
            return answer;
        } else if (pi?.callLLM) {
            const answer = await pi.callLLM({
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that answers questions based on search results. Cite sources when appropriate.'
                    },
                    {
                        role: 'user',
                        content: `Query: ${query}\n\nSearch Results:\n${results.slice(0, 5).map((r, i) => `${i + 1}. ${r.title}: ${r.snippet}`).join('\n')}\n\nAnswer:`
                    }
                ]
            });
            
            return answer;
        }
        
        // Fallback: Simple summarization
        return `Based on ${results.length} search results:\n\n${results.slice(0, 3).map(r => `• ${r.title}: ${r.snippet.substring(0, 150)}...`).join('\n\n')}`;
    } catch (error) {
        console.error('AI answer generation failed:', error);
        return `Search found ${results.length} results. ${results.slice(0, 3).map(r => r.title).join(', ')}`;
    }
}

// Fetch URL content
async function fetchUrlContent(url: string, maxLength = 2000, prompt?: string) {
    try {
        // Basic URL validation
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            throw new Error('Invalid URL protocol');
        }
        
        // Use AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'PI-Agent-Search/1.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const html = await response.text();
        
        // Simple HTML parsing (in production, use a proper HTML parser)
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : 'No title';
        
        // Extract text content (simplified)
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        let text = bodyMatch ? bodyMatch[1] : html;
        
        // Remove scripts, styles, comments
        text = text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, '');
        
        // Remove HTML tags
        text = text.replace(/<[^>]+>/g, ' ');
        
        // Clean up whitespace
        text = text.replace(/\s+/g, ' ').trim();
        
        // Truncate if needed
        if (text.length > maxLength) {
            text = text.substring(0, maxLength) + '...';
        }
        
        return {
            title,
            url,
            content: text,
            length: text.length,
            fetchedAt: new Date().toISOString()
        };
    } catch (error) {
        console.error('Content fetch error:', error);
        throw error;
    }
}

// Main search function
async function unifiedSearch(params: {
    query: string;
    mode?: 'auto' | 'traditional' | 'ai' | 'research';
    maxResults?: number;
    depth?: 'fast' | 'standard' | 'deep';
    safeMode?: boolean;
}, piContext: any) {
    const startTime = Date.now();
    const {
        query,
        mode = 'auto',
        maxResults = 10,
        depth = 'standard',
        safeMode = true
    } = params;
    
    // Check rate limit
    if (!checkRateLimit()) {
        return {
            success: false,
            query,
            error: 'Rate limit exceeded. Please wait a few seconds before searching again.',
            processing_time_ms: Date.now() - startTime
        };
    }
    
    // Check cache
    const cacheKey = `${query}:${mode}:${maxResults}:${depth}:${safeMode}`;
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return {
            ...cached.data,
            cached: true,
            processing_time_ms: Date.now() - startTime
        };
    }
    
    // Sanitize query if safe mode is enabled
    const searchQuery = safeMode ? sanitizeQuery(query) : query;
    
    // Determine search mode
    let effectiveMode = mode;
    if (mode === 'auto') {
        const classification = classifyQuery(query);
        effectiveMode = classification === 'simple' ? 'traditional' : 
                       classification === 'research' ? 'research' : 'ai';
    }
    
    try {
        // Perform search
        const searchResults = await performSearxngSearch(searchQuery, 'general', maxResults);
        
        if (searchResults.length === 0) {
            return {
                success: false,
                query,
                error: 'No search results found',
                processing_time_ms: Date.now() - startTime
            };
        }
        
        // Generate AI answer if requested
        let aiAnswer = null;
        if (effectiveMode === 'ai' || effectiveMode === 'research') {
            aiAnswer = await generateAIAnswer(query, searchResults, piContext);
        }
        
        // Deep mode: Fetch content from top results
        let deepContent: any = null;
        if (depth === 'deep' && searchResults.length > 0) {
            try {
                const topResult = searchResults[0];
                deepContent = await fetchUrlContent(topResult.url, 1000);
            } catch (error) {
                console.error('Deep content fetch failed:', error);
                deepContent = null;
            }
        }
        
        const result = {
            success: true,
            query,
            mode_used: effectiveMode,
            results: searchResults,
            ai_answer: aiAnswer,
            deep_content: deepContent,
            results_count: searchResults.length,
            processing_time_ms: Date.now() - startTime,
            cached: false
        };
        
        // Cache the result
        searchCache.set(cacheKey, {
            data: result,
            timestamp: Date.now()
        });
        
        // Limit cache size
        if (searchCache.size > 100) {
            const firstKey = searchCache.keys().next().value;
            searchCache.delete(firstKey);
        }
        
        return result;
    } catch (error) {
        console.error('Search failed:', error);
        return {
            success: false,
            query,
            error: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            processing_time_ms: Date.now() - startTime
        };
    }
}

// Health check function
function searchHealth() {
    const now = Date.now();
    const cacheStats = {
        size: searchCache.size,
        oldest: searchCache.size > 0 ? 
            Math.floor((now - Math.min(...Array.from(searchCache.values()).map(e => e.timestamp))) / 1000) + ' seconds ago' :
            'N/A'
    };
    
    const rateLimitStats = {
        recent_requests: requestTimestamps.length,
        window_remaining_ms: RATE_LIMIT_WINDOW_MS - (now - (requestTimestamps[0] || now))
    };
    
    return {
        status: 'healthy',
        searxng_url: SEARXNG_BASE,
        cache: cacheStats,
        rate_limiting: rateLimitStats,
        timestamp: new Date().toISOString()
    };
}

// Export the extension
export default async function (pi: any): Promise<void> {
    // Minimal logging - only errors
    if (!pi.registerTool) {
        console.error('[pi-search] ERROR: pi.registerTool not available!');
        return;
    }
    
    // Register search tool
    pi.registerTool({
        name: 'search',
        description: 'Intelligent web search with AI enhancement',
        parameters: {
            query: { type: 'string', description: 'Search query' },
            mode: { 
                type: 'string', 
                description: 'Search mode: auto, traditional, ai, research',
                enum: ['auto', 'traditional', 'ai', 'research'],
                default: 'auto'
            },
            maxResults: { 
                type: 'number', 
                description: 'Maximum number of results (1-20)',
                minimum: 1,
                maximum: 20,
                default: 10
            },
            depth: { 
                type: 'string', 
                description: 'Search depth: fast, standard, deep',
                enum: ['fast', 'standard', 'deep'],
                default: 'standard'
            },
            safeMode: { 
                type: 'boolean', 
                description: 'Enable safe mode to filter sensitive content',
                default: true
            }
        },
        handler: unifiedSearch
    });
    
    // Register health check tool
    pi.registerTool({
        name: 'search_health',
        description: 'Check search system health and statistics',
        parameters: {},
        handler: searchHealth
    });
    
    // Register content fetch tool
    pi.registerTool({
        name: 'fetch_content',
        description: 'Fetch and extract content from a URL',
        parameters: {
            url: { type: 'string', description: 'URL to fetch' },
            maxLength: { 
                type: 'number', 
                description: 'Maximum content length in characters',
                default: 2000
            },
            prompt: { 
                type: 'string', 
                description: 'Optional prompt to focus extraction',
                optional: true
            }
        },
        handler: async (params: any, piContext: any) => {
            try {
                // Handle maxLength parameter safely
                let maxLengthValue = 2000;
                if (params && params.maxLength !== undefined && params.maxLength !== null) {
                    // Convert to number if it's a string
                    if (typeof params.maxLength === 'string') {
                        maxLengthValue = parseInt(params.maxLength, 10) || 2000;
                    } else if (typeof params.maxLength === 'number') {
                        maxLengthValue = params.maxLength;
                    }
                    // Ensure it's a positive number
                    if (maxLengthValue <= 0 || !Number.isFinite(maxLengthValue)) {
                        maxLengthValue = 2000;
                    }
                }
                
                const content = await fetchUrlContent(
                    params.url, 
                    maxLengthValue,
                    params.prompt
                );
                
                return {
                    success: true,
                    content,
                    processing_time_ms: Date.now() - (piContext?.startTime || Date.now())
                };
            } catch (error) {
                return {
                    success: false,
                    error: `Failed to fetch content: ${error instanceof Error ? error.message : 'Unknown error'}`,
                    processing_time_ms: Date.now() - (piContext?.startTime || Date.now())
                };
            }
        }
    });
}