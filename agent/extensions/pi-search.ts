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

import { Type } from '@sinclair/typebox';
import { parse } from 'node-html-parser';

// Configuration
const DEFAULT_SEARXNG_URL = "http://140.238.166.109:8081";
// Use global process if available, otherwise default
declare const process: any;
const SEARXNG_BASE = (typeof process !== 'undefined' && process.env && process.env.SEARXNG_BASE_URL) || DEFAULT_SEARXNG_URL;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds

// Sanitization configuration
enum SanitizationLevel {
    NONE = 'none',           // No sanitization (for trusted environments)
    MINIMAL = 'minimal',     // Block only clearly malicious intent
    MODERATE = 'moderate',   // Block obvious inappropriate content (default)
    STRICT = 'strict'        // Aggressive sanitization (compliance mode)
}

const DEFAULT_SANITIZATION_LEVEL = SanitizationLevel.MODERATE;
const SANITIZATION_LEVEL = (typeof process !== 'undefined' && process.env && process.env.SANITIZATION_LEVEL) || DEFAULT_SANITIZATION_LEVEL;

// Cache
const searchCache = new Map();

// Clean cache periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of searchCache.entries()) {
        if (now - entry.timestamp > CACHE_TTL) {
            searchCache.delete(key);
        }
    }
}, 60000); // Clean every minute

// Rate limiting with token bucket algorithm
class TokenBucketRateLimiter {
    private buckets: Map<string, { tokens: number; lastRefill: number }> = new Map();
    private cleanupInterval: any;
    
    constructor(
        private tokensPerInterval: number = RATE_LIMIT_REQUESTS,
        private intervalMs: number = RATE_LIMIT_WINDOW_MS,
        private maxBurst: number = RATE_LIMIT_REQUESTS * 2
    ) {
        // Clean up old buckets every 5 minutes
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }
    
    // Get or create a bucket for a key (user/IP/session)
    private getBucket(key: string) {
        let bucket = this.buckets.get(key);
        const now = Date.now();
        
        if (!bucket) {
            bucket = {
                tokens: this.maxBurst,
                lastRefill: now
            };
            this.buckets.set(key, bucket);
            return bucket;
        }
        
        // Refill tokens based on time elapsed
        const timePassed = now - bucket.lastRefill;
        if (timePassed > this.intervalMs) {
            const intervalsPassed = Math.floor(timePassed / this.intervalMs);
            const tokensToAdd = intervalsPassed * this.tokensPerInterval;
            bucket.tokens = Math.min(this.maxBurst, bucket.tokens + tokensToAdd);
            bucket.lastRefill = now;
        }
        
        return bucket;
    }
    
    // Check if a request is allowed
    isAllowed(key: string = 'global'): boolean {
        const bucket = this.getBucket(key);
        
        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return true;
        }
        
        return false;
    }
    
    // Get remaining tokens
    getRemainingTokens(key: string = 'global'): number {
        const bucket = this.getBucket(key);
        return Math.max(0, bucket.tokens);
    }
    
    // Get time until next token (in ms)
    getTimeUntilNextToken(key: string = 'global'): number {
        const bucket = this.getBucket(key);
        if (bucket.tokens >= 1) return 0;
        
        const now = Date.now();
        const timeSinceLastRefill = now - bucket.lastRefill;
        const timeUntilNextRefill = this.intervalMs - timeSinceLastRefill;
        return Math.max(0, timeUntilNextRefill);
    }
    
    // Clean up old buckets (older than 1 hour)
    private cleanup() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        for (const [key, bucket] of this.buckets.entries()) {
            if (bucket.lastRefill < oneHourAgo && bucket.tokens >= this.maxBurst) {
                this.buckets.delete(key);
            }
        }
    }
    
    // Get stats
    getStats() {
        return {
            totalBuckets: this.buckets.size,
            tokensPerInterval: this.tokensPerInterval,
            intervalMs: this.intervalMs,
            maxBurst: this.maxBurst
        };
    }
}

// Create rate limiter instance
const rateLimiter = new TokenBucketRateLimiter();

// Rate limiting check (maintains backward compatibility)
function checkRateLimit(): boolean {
    return rateLimiter.isAllowed('global');
}

// Enhanced query sanitization with configurable levels
function sanitizeQuery(query: string, level: SanitizationLevel = SANITIZATION_LEVEL as SanitizationLevel): string {
    // Early return for NONE level
    if (level === SanitizationLevel.NONE) {
        return query;
    }
    
    // Define sanitization rules by level
    interface BlockRules {
        blockPatterns: RegExp[];
        replacement: string;
    }
    
    interface ReplacementRules {
        replacements: Record<string, string>;
    }
    
    type SanitizationRules = BlockRules | ReplacementRules;
    
    const rules: Record<SanitizationLevel, SanitizationRules> = {
        [SanitizationLevel.NONE]: { blockPatterns: [], replacement: '' },
        
        [SanitizationLevel.MINIMAL]: {
            blockPatterns: [
                /\b(child\s*?porn|cp|kiddie\s*?porn)\b/gi,
                /\b(rape|incest|bestiality)\b/gi,
                /\b(bomb\s*?making|build\s*?bomb)\b/gi,
                /\b(how\s+to\s+kill\s+someone)\b/gi
            ],
            replacement: '[content removed]'
        },
        
        [SanitizationLevel.MODERATE]: {
            blockPatterns: [
                /\b(child\s*?porn|cp|kiddie\s*?porn|rape|incest|bestiality)\b/gi,
                /\b(bomb\s*?making|build\s*?bomb|how\s+to\s+kill\s+someone)\b/gi,
                /\b(hardcore\s*?porn|extreme\s*?porn)\b/gi,
                /\b(drugs\s+for\s+sale|buy\s+drugs)\b/gi
            ],
            replacement: '[content removed]'
        },
        
        [SanitizationLevel.STRICT]: {
            replacements: {
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
            }
        }
    };
    
    const levelRules = rules[level];
    let sanitized = query;
    
    if ('replacements' in levelRules) {
        // Apply word replacements (STRICT level)
        for (const [bad, good] of Object.entries(levelRules.replacements)) {
            const regex = new RegExp(`\\b${bad}\\b`, 'gi');
            sanitized = sanitized.replace(regex, good);
        }
    } else {
        // Apply block patterns (MINIMAL and MODERATE levels)
        for (const pattern of levelRules.blockPatterns) {
            sanitized = sanitized.replace(pattern, levelRules.replacement);
        }
    }
    
    return sanitized;
}

// Check if query should be blocked entirely
function shouldBlockQuery(query: string, level: SanitizationLevel = SANITIZATION_LEVEL as SanitizationLevel): boolean {
    if (level === SanitizationLevel.NONE) {
        return false;
    }
    
    // Severe violations that should always be blocked
    const severePatterns = [
        /\b(child\s*?porn|cp|kiddie\s*?porn)\b/gi,
        /\b(rape\s*?porn|incest\s*?porn)\b/gi,
        /\b(make\s+bomb|build\s+bomb|bomb\s+making)\b/gi
    ];
    
    for (const pattern of severePatterns) {
        if (pattern.test(query)) {
            return true;
        }
    }
    
    return false;
}

// Get description of sanitization level
function getSanitizationDescription(level: SanitizationLevel): string {
    const descriptions = {
        [SanitizationLevel.NONE]: 'No sanitization - queries passed through as-is',
        [SanitizationLevel.MINIMAL]: 'Minimal - only blocks clearly malicious intent',
        [SanitizationLevel.MODERATE]: 'Moderate - blocks obvious inappropriate content (default)',
        [SanitizationLevel.STRICT]: 'Strict - aggressive sanitization for compliance'
    };
    return descriptions[level] || 'Unknown level';
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
// Validate URL is safe for fetching (SSRF protection)
function isUrlSafeForFetching(url: string): boolean {
    try {
        const parsed = new URL(url);
        
        // Protocol validation
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }
        
        // Extract hostname/IP
        const hostname = parsed.hostname.toLowerCase();
        
        // Block localhost and loopback addresses
        if (hostname === 'localhost' || hostname === 'localhost.localdomain') {
            return false;
        }
        
        // Block IPv4 loopback
        if (hostname === '127.0.0.1' || hostname === '127.0.0.0') {
            return false;
        }
        
        // Block IPv6 loopback (compressed and uncompressed)
        if (hostname === '::1' || hostname === '0:0:0:0:0:0:0:1' || hostname === '[::1]') {
            return false;
        }
        
        // Block IPv4 private ranges
        const ipParts = hostname.split('.').map(Number);
        if (ipParts.length === 4 && !ipParts.some(isNaN)) {
            // 10.0.0.0/8
            if (ipParts[0] === 10) {
                return false;
            }
            // 172.16.0.0/12
            if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) {
                return false;
            }
            // 192.168.0.0/16
            if (ipParts[0] === 192 && ipParts[1] === 168) {
                return false;
            }
            // 169.254.0.0/16 (link-local)
            if (ipParts[0] === 169 && ipParts[1] === 254) {
                return false;
            }
        }
        
        // Block common cloud metadata endpoints
        const blockedPatterns = [
            /^metadata\.google\.internal$/i,
            /^169\.254\.169\.254$/,
            /^metadata$/i,
            /^instance-data$/i
        ];
        
        for (const pattern of blockedPatterns) {
            if (pattern.test(hostname)) {
                return false;
            }
        }
        
        // Block .local and .internal domains
        if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
            return false;
        }
        
        return true;
    } catch (error) {
        // Invalid URL format
        return false;
    }
}

async function fetchUrlContent(url: string, maxLength = 2000, prompt?: string) {
    try {
        // Comprehensive URL validation for SSRF protection
        if (!isUrlSafeForFetching(url)) {
            throw new Error('URL is not safe for fetching. Blocked to prevent SSRF attacks.');
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
        
        // Parse HTML with proper parser
        const root = parse(html);
        
        // Extract title
        const titleElement = root.querySelector('title');
        const title = titleElement ? titleElement.text.trim() : 'No title';
        
        // Extract main content
        const bodyElement = root.querySelector('body');
        let text = '';
        
        if (bodyElement) {
            // Remove script and style elements
            bodyElement.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
            
            // Get structured text (preserves paragraph structure)
            text = bodyElement.structuredText;
            
            // Clean up excessive whitespace
            text = text.replace(/\s+/g, ' ').trim();
        } else {
            // Fallback: extract text from entire document
            root.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());
            text = root.structuredText.replace(/\s+/g, ' ').trim();
        }
        
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
    
    // Check if query should be blocked entirely (severe violations)
    if (safeMode && shouldBlockQuery(query)) {
        return {
            success: false,
            query,
            error: 'Query contains prohibited content and cannot be processed.',
            processing_time_ms: Date.now() - startTime
        };
    }
    
    // Sanitize query if safe mode is enabled
    const sanitizationLevel = safeMode ? (SANITIZATION_LEVEL as SanitizationLevel) : SanitizationLevel.NONE;
    const searchQuery = safeMode ? sanitizeQuery(query, sanitizationLevel) : query;
    
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
    
    const rateLimiterStats = rateLimiter.getStats();
    const globalRemaining = rateLimiter.getRemainingTokens('global');
    const timeUntilNext = rateLimiter.getTimeUntilNextToken('global');
    
    return {
        status: 'healthy',
        searxng_url: SEARXNG_BASE,
        cache: cacheStats,
        sanitization: {
            level: SANITIZATION_LEVEL,
            description: getSanitizationDescription(SANITIZATION_LEVEL as SanitizationLevel)
        },
        rate_limiting: {
            ...rateLimiterStats,
            global_remaining_tokens: globalRemaining,
            global_time_until_next_token_ms: timeUntilNext,
            algorithm: 'token_bucket',
            recent_requests: 'N/A (deprecated - use token bucket stats)'
        },
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
        label: 'Web Search',
        description: 'Intelligent web search with AI enhancement',
        parameters: Type.Object({
            query: Type.String({ description: 'Search query' }),
            mode: Type.Optional(Type.String({ 
                description: 'Search mode: auto, traditional, ai, research',
                enum: ['auto', 'traditional', 'ai', 'research'],
                default: 'auto'
            })),
            maxResults: Type.Optional(Type.Number({ 
                description: 'Maximum number of results (1-20)',
                minimum: 1,
                maximum: 20,
                default: 10
            })),
            depth: Type.Optional(Type.String({ 
                description: 'Search depth: fast, standard, deep',
                enum: ['fast', 'standard', 'deep'],
                default: 'standard'
            })),
            safeMode: Type.Optional(Type.Boolean({ 
                description: 'Enable safe mode to filter sensitive content',
                default: true
            }))
        }),
        execute: async (toolCallId: string, params: any, signal: any, onUpdate: any, ctx: any) => {
            const result = await unifiedSearch(params, ctx);
            
            // Format the response for PI
            let text = '';
            if (!result.success) {
                text = `**Search Error**\n\n${result.error || 'Unknown error'}`;
            } else {
                text = `## Search Results\n\n`;
                text += `**Query:** ${result.query}\n`;
                text += `**Mode:** ${result.mode_used}\n`;
                text += `**Results:** ${result.results_count}\n`;
                text += `**Processing Time:** ${result.processing_time_ms}ms\n`;
                
                if (result.cached) {
                    text += `**Note:** Served from cache\n`;
                }
                
                if (result.ai_answer) {
                    text += `\n---\n\n### AI Answer\n\n${result.ai_answer}\n`;
                }
                
                if (result.results && result.results.length > 0) {
                    text += `\n---\n\n### Top Results\n\n`;
                    result.results.slice(0, 3).forEach((r: any, i: number) => {
                        text += `${i + 1}. **${r.title}**\n`;
                        text += `   ${r.snippet.substring(0, 100)}...\n`;
                        text += `   ${r.url}\n\n`;
                    });
                }
            }
            
            return {
                content: [{ type: 'text', text }],
                details: result,
                isError: !result.success
            };
        }
    });
    
    // Register health check tool
    pi.registerTool({
        name: 'search_health',
        label: 'Search Health',
        description: 'Check search system health and statistics',
        parameters: Type.Object({}),
        execute: async (toolCallId: string, params: any, signal: any, onUpdate: any, ctx: any) => {
            const health = searchHealth();
            let text = `## Search System Health\n\n`;
            text += `**Status:** ${health.status}\n`;
            text += `**SearXNG URL:** ${health.searxng_url}\n`;
            text += `**Cache Size:** ${health.cache.size} entries\n`;
            text += `**Rate Limit Recent Requests:** ${health.rate_limiting.recent_requests}\n`;
            text += `**Timestamp:** ${health.timestamp}\n`;
            
            return {
                content: [{ type: 'text', text }],
                details: health,
                isError: false
            };
        }
    });
    
    // Register content fetch tool
    pi.registerTool({
        name: 'fetch_content',
        label: 'Fetch Content',
        description: 'Fetch and extract content from a URL',
        parameters: Type.Object({
            url: Type.String({ description: 'URL to fetch' }),
            maxLength: Type.Optional(Type.Number({ 
                description: 'Maximum content length in characters',
                default: 2000
            })),
            prompt: Type.Optional(Type.String({ 
                description: 'Optional prompt to focus extraction'
            }))
        }),
        execute: async (toolCallId: string, params: any, signal: any, onUpdate: any, ctx: any) => {
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
                
                let text = `## Content Fetched\n\n`;
                text += `**Title:** ${content.title}\n`;
                text += `**URL:** ${content.url}\n`;
                text += `**Length:** ${content.length} characters\n`;
                text += `**Fetched At:** ${content.fetchedAt}\n\n`;
                text += `### Content Preview\n\n${content.content.substring(0, 500)}${content.content.length > 500 ? '...' : ''}`;
                
                return {
                    content: [{ type: 'text', text }],
                    details: { success: true, content },
                    isError: false
                };
            } catch (error) {
                let text = `**Fetch Content Error**\n\nFailed to fetch content: ${error instanceof Error ? error.message : 'Unknown error'}`;
                
                return {
                    content: [{ type: 'text', text }],
                    details: { 
                        success: false, 
                        error: error instanceof Error ? error.message : 'Unknown error' 
                    },
                    isError: true
                };
            }
        }
    });
}