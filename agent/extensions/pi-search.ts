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

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
// parse will be imported dynamically

// Configuration
// SearXNG instance URL - must be configured via environment variable or config
// Set SEARXNG_BASE_URL environment variable to use your own SearXNG instance
// Example: export SEARXNG_BASE_URL="http://localhost:8081"
// Or create ~/.pi/agent/search-config.json with {"searxngUrl": "http://localhost:8081"}
declare const process: any;

function getSearxngUrl(): string {
  // First priority: Environment variable
  if (typeof process !== 'undefined' && process.env && process.env.SEARXNG_BASE_URL) {
    const envUrl = process.env.SEARXNG_BASE_URL.trim();
    if (envUrl) {
      console.log('[pi-search] Using SearXNG URL from environment: ', envUrl);
      return envUrl;
    }
  }
  
  // Second priority: Configuration file
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    const configPaths = [
      path.join(os.homedir(), '.pi', 'agent', 'search-config.json'),
      path.join(os.homedir(), '.pi-search-config.json'),
      path.join(process.cwd(), '.pi-search-config.json')
    ];
    
    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.searxngUrl && typeof config.searxngUrl === 'string') {
          const fileUrl = config.searxngUrl.trim();
          if (fileUrl) {
            console.log('[pi-search] Using SearXNG URL from config file: ', fileUrl);
            return fileUrl;
          }
        }
      }
    }
  } catch (error) {
    // Silently ignore config file errors
  }
  
  // No configuration found
  throw new Error(
    'SearXNG URL not configured. Please set SEARXNG_BASE_URL environment variable or create a config file.\n' +
    'Options:\n' +
    '1. Set environment variable: export SEARXNG_BASE_URL="http://localhost:8081"\n' +
    '2. Create ~/.pi/agent/search-config.json: {\"searxngUrl\": \"http://localhost:8081\"}\n' +
    '3. Use a public SearXNG instance (see https://searx.space/ for public instances)'
  );
}

// Initialize on first use (lazy initialization)
let SEARXNG_BASE: string | null = null;
let initializationError: string | null = null;

function getSearxngBase(): string {
  if (SEARXNG_BASE !== null) return SEARXNG_BASE;
  
  try {
    SEARXNG_BASE = getSearxngUrl();
    return SEARXNG_BASE;
  } catch (error) {
    initializationError = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds
const CACHE_MAX_ITEMS = 100;

// Sanitization configuration
enum SanitizationLevel {
    NONE = 'none',           // No sanitization (for trusted environments)
    MINIMAL = 'minimal',     // Block only clearly malicious intent
    MODERATE = 'moderate',   // Block obvious inappropriate content (default)
    STRICT = 'strict'        // Aggressive sanitization (compliance mode)
}

const DEFAULT_SANITIZATION_LEVEL = SanitizationLevel.MODERATE;
const SANITIZATION_LEVEL = (typeof process !== 'undefined' && process.env && process.env.SANITIZATION_LEVEL) || DEFAULT_SANITIZATION_LEVEL;

// Simple LRU cache implementation
class SimpleLRUCache<K, V> {
    private cache = new Map<K, { value: V; timestamp: number; accessTime: number }>();
    private maxSize: number;
    private ttl: number;
    
    constructor(maxSize: number, ttl: number) {
        this.maxSize = maxSize;
        this.ttl = ttl;
        // Auto-cleanup every minute
        setInterval(() => this.cleanup(), 60000);
    }
    
    get(key: K): V | undefined {
        const entry = this.cache.get(key);
        if (!entry) return undefined;
        
        // Check if expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return undefined;
        }
        
        // Update access time for LRU
        entry.accessTime = Date.now();
        return entry.value;
    }
    
    set(key: K, value: V): void {
        const now = Date.now();
        this.cache.set(key, { 
            value, 
            timestamp: now,
            accessTime: now 
        });
        
        // Enforce max size
        if (this.cache.size > this.maxSize) {
            // Find least recently used key
            let lruKey: K | null = null;
            let oldestAccess = Infinity;
            
            for (const [k, entry] of this.cache.entries()) {
                if (entry.accessTime < oldestAccess) {
                    oldestAccess = entry.accessTime;
                    lruKey = k;
                }
            }
            
            if (lruKey) {
                this.cache.delete(lruKey);
            }
        }
    }
    
    has(key: K): boolean {
        return this.get(key) !== undefined;
    }
    
    delete(key: K): boolean {
        return this.cache.delete(key);
    }
    
    get size(): number {
        return this.cache.size;
    }
    
    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > this.ttl) {
                this.cache.delete(key);
            }
        }
    }
    
    // Get cache statistics
    getStats() {
        const now = Date.now();
        let oldestTimestamp = Infinity;
        let oldestAccess = Infinity;
        
        for (const entry of this.cache.values()) {
            if (entry.timestamp < oldestTimestamp) {
                oldestTimestamp = entry.timestamp;
            }
            if (entry.accessTime < oldestAccess) {
                oldestAccess = entry.accessTime;
            }
        }
        
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            ttl: this.ttl,
            oldestEntryAge: oldestTimestamp === Infinity ? 'N/A' : Math.floor((now - oldestTimestamp) / 1000) + 's',
            oldestAccessAge: oldestAccess === Infinity ? 'N/A' : Math.floor((now - oldestAccess) / 1000) + 's'
        };
    }
}

// Create LRU cache instance
const searchCache = new SimpleLRUCache<string, any>(CACHE_MAX_ITEMS, CACHE_TTL);

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

// Structured error codes
enum SearchErrorCode {
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    QUERY_BLOCKED = 'QUERY_BLOCKED',
    NO_RESULTS = 'NO_RESULTS',
    SEARCH_FAILED = 'SEARCH_FAILED',
    NETWORK_ERROR = 'NETWORK_ERROR',
    SSRF_BLOCKED = 'SSRF_BLOCKED',
    INVALID_URL = 'INVALID_URL',
    PARSING_ERROR = 'PARSING_ERROR',
    AI_GENERATION_FAILED = 'AI_GENERATION_FAILED',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

interface SearchError {
    code: SearchErrorCode;
    message: string;
    details?: any;
    retryable: boolean;
    timestamp: string;
}

// Create structured errors
function createError(
    code: SearchErrorCode, 
    message: string, 
    details?: any, 
    retryable = false
): SearchError {
    return {
        code,
        message,
        details,
        retryable,
        timestamp: new Date().toISOString()
    };
}

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
// Query classification with enhanced intent detection
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

// Enhanced query expansion and refinement
async function expandAndRefineQuery(query: string, piContext?: any): Promise<{
    original: string;
    expanded: string[];
    focusAreas: string[];
    searchStrategy: 'broad' | 'focused' | 'comparative' | 'factual';
}> {
    // Detect query intent
    const lowerQuery = query.toLowerCase();
    
    // Intent detection
    let searchStrategy: 'broad' | 'focused' | 'comparative' | 'factual' = 'broad';
    if (lowerQuery.includes(' vs ') || lowerQuery.includes(' versus ') || lowerQuery.includes('compare')) {
        searchStrategy = 'comparative';
    } else if (lowerQuery.includes('how to') || lowerQuery.includes('step by step') || lowerQuery.includes('tutorial')) {
        searchStrategy = 'focused';
    } else if (lowerQuery.includes('what is') || lowerQuery.includes('define') || lowerQuery.includes('meaning of')) {
        searchStrategy = 'factual';
    } else if (lowerQuery.includes('latest') || lowerQuery.includes('recent') || lowerQuery.includes('202')) {
        searchStrategy = 'focused';
    }
    
    // Generate expanded queries based on strategy
    const expanded: string[] = [query];
    const focusAreas: string[] = [];
    
    switch (searchStrategy) {
        case 'comparative':
            // Extract entities for comparison
            const entities = query.split(/ vs | versus | compare | and /i).map(e => e.trim()).filter(e => e.length > 0);
            if (entities.length >= 2) {
                expanded.push(`${entities[0]} advantages disadvantages`);
                expanded.push(`${entities[1]} advantages disadvantages`);
                expanded.push(`${entities[0]} ${entities[1]} comparison 2025`);
                focusAreas.push('pros_cons', 'features', 'performance', 'use_cases');
            }
            break;
            
        case 'focused':
            expanded.push(`${query} best practices`);
            expanded.push(`${query} tutorial guide`);
            expanded.push(`${query} step by step`);
            focusAreas.push('how_to', 'tutorial', 'best_practices', 'examples');
            break;
            
        case 'factual':
            expanded.push(`${query} definition`);
            expanded.push(`what is ${query.replace(/what is |define |meaning of /gi, '')}`);
            expanded.push(`${query} explained simply`);
            focusAreas.push('definition', 'explanation', 'basics', 'fundamentals');
            break;
            
        default: // broad
            expanded.push(`${query} overview`);
            expanded.push(`${query} comprehensive guide`);
            expanded.push(`${query} details information`);
            focusAreas.push('overview', 'details', 'information', 'guide');
    }
    
    // Remove duplicates
    const uniqueExpanded = [...new Set(expanded)];
    
    return {
        original: query,
        expanded: uniqueExpanded,
        focusAreas,
        searchStrategy
    };
}

// Result credibility scoring
function calculateCredibility(result: any): {
    score: number;
    level: 'high' | 'medium' | 'low';
    reasons: string[];
    factors: Array<{factor: string, score: number}>;
} {
    const factors: Array<{factor: string, score: number}> = [];
    
    // Extract domain from URL
    let domain = '';
    try {
        domain = new URL(result.url || '').hostname.replace('www.', '');
    } catch (e) {
        domain = result.url || '';
    }
    
    // 1. Domain authority scoring
    let domainScore = 0.6; // default medium
    
    // High authority domains
    const highAuthorityPatterns = [
        /\.edu$/, /\.gov$/, /\.ac\.[a-z]{2,3}$/,
        /nih\.gov/, /who\.int/, /un\.org/,
        /nature\.com/, /science\.org/, /thelancet\.com/,
        /arxiv\.org/, /researchgate\.net/
    ];
    
    const mediumAuthorityPatterns = [
        /\.org$/, /wikipedia\.org/, /bbc\.com/,
        /reuters\.com/, /apnews\.com/, /bloomberg\.com/,
        /forbes\.com/, /techcrunch\.com/, /stackoverflow\.com/,
        /github\.com/, /medium\.com/
    ];
    
    if (highAuthorityPatterns.some(pattern => pattern.test(domain))) {
        domainScore = 0.9;
    } else if (mediumAuthorityPatterns.some(pattern => pattern.test(domain))) {
        domainScore = 0.75;
    } else if (domain.includes('blogspot') || domain.includes('wordpress')) {
        domainScore = 0.5; // Lower for free blogging platforms
    }
    
    factors.push({ factor: 'domain_authority', score: domainScore });
    
    // 2. Recency scoring
    let recencyScore = 0.7;
    if (result.publishedDate) {
        try {
            const pubDate = new Date(result.publishedDate);
            const now = new Date();
            const daysDiff = (now.getTime() - pubDate.getTime()) / (1000 * 3600 * 24);
            
            if (daysDiff < 30) recencyScore = 0.9; // Less than 30 days
            else if (daysDiff < 365) recencyScore = 0.8; // Less than 1 year
            else if (daysDiff < 730) recencyScore = 0.7; // 1-2 years
            else recencyScore = 0.6; // More than 2 years
        } catch (e) {
            // Date parsing failed
        }
    }
    factors.push({ factor: 'recency', score: recencyScore });
    
    // 3. Content quality indicators
    let contentScore = 0.7;
    const snippet = result.snippet || '';
    
    // Evidence-based language
    if (snippet.includes('study shows') || snippet.includes('research indicates') || 
        snippet.includes('according to') || snippet.includes('data suggests')) {
        contentScore += 0.1;
    }
    
    // Formal/professional language
    if (!snippet.match(/\b(lol|omg|wtf|awesome|cool)\b/i) && snippet.length > 50) {
        contentScore += 0.05;
    }
    
    // Contains numbers/statistics
    if (snippet.match(/\d+[%°]?\b/) || snippet.includes('percent') || snippet.includes('statistic')) {
        contentScore += 0.05;
    }
    
    // Length indication
    if (snippet.length > 100) contentScore += 0.05;
    if (snippet.length > 200) contentScore += 0.05;
    
    contentScore = Math.min(contentScore, 0.95); // Cap at 0.95
    factors.push({ factor: 'content_quality', score: contentScore });
    
    // 4. Original search score weighting
    const searchScore = result.score || 0.5;
    factors.push({ factor: 'search_relevance', score: searchScore });
    
    // Calculate weighted average
    const weights = {
        domain_authority: 0.3,
        recency: 0.25,
        content_quality: 0.25,
        search_relevance: 0.2
    };
    
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const factor of factors) {
        const weight = weights[factor.factor as keyof typeof weights] || 0.25;
        weightedSum += factor.score * weight;
        totalWeight += weight;
    }
    
    const finalScore = weightedSum / totalWeight;
    
    // Determine credibility level
    let level: 'high' | 'medium' | 'low' = 'medium';
    if (finalScore >= 0.8) level = 'high';
    if (finalScore <= 0.6) level = 'low';
    
    const reasons = factors.map(f => `${f.factor}:${f.score.toFixed(2)}`);
    
    return {
        score: finalScore,
        level,
        reasons,
        factors
    };
}

// Filter results by credibility
function filterByCredibility(results: any[], minScore = 0.7): any[] {
    return results
        .map(result => ({
            ...result,
            credibility: calculateCredibility(result)
        }))
        .filter(result => result.credibility.score >= minScore)
        .sort((a, b) => b.credibility.score - a.credibility.score);
}

// Perform SearXNG search
async function performSearxngSearch(query: string, category = 'general', maxResults = 10) {
    try {
        const url = `${getSearxngBase()}/search`;
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
            throw createError(
                SearchErrorCode.NETWORK_ERROR,
                `SearXNG error: ${response.status} ${response.statusText}`,
                { status: response.status, statusText: response.statusText },
                response.status >= 500 // Retryable for server errors
            );
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

// Enhanced AI answer generation with multi-step reasoning
async function generateEnhancedAnswer(
    query: string, 
    results: any[], 
    piContext: any,
    options: {
        includeCitations?: boolean;
        includeConfidence?: boolean;
        maxSources?: number;
    } = {}
): Promise<{
    answer: string;
    confidence: number;
    sources: Array<{title: string, url: string, credibility: number}>;
    citations?: string[];
    processingSteps: string[];
}> {
    const {
        includeCitations = true,
        includeConfidence = true,
        maxSources = 5
    } = options;
    
    const processingSteps: string[] = [];
    
    try {
        // Step 1: Filter by credibility
        processingSteps.push('Filtering results by credibility');
        const credibleResults = filterByCredibility(results, 0.7);
        
        if (credibleResults.length === 0) {
            // Fallback to top results if no credible ones
            processingSteps.push('No highly credible results found, using top results');
            const topResults = results.slice(0, Math.min(3, results.length));
            return {
                answer: `Based on available information: ${topResults.map(r => r.snippet.substring(0, 100)).join(' ')}...`,
                confidence: 0.6,
                sources: topResults.map(r => ({
                    title: r.title,
                    url: r.url,
                    credibility: 0.6
                })),
                processingSteps
            };
        }
        
        // Step 2: Extract key information
        processingSteps.push(`Analyzing ${credibleResults.length} credible sources`);
        const topCredibleResults = credibleResults.slice(0, maxSources);
        
        // Step 3: Generate comprehensive answer using PI's LLM
        const pi = (globalThis as any).pi || piContext?.pi;
        
        if (pi?.complete || pi?.callLLM) {
            processingSteps.push('Generating answer with LLM');
            
            // Prepare enhanced prompt
            const sourcesText = topCredibleResults.map((r, i) => {
                const cred = r.credibility || calculateCredibility(r);
                return `[Source ${i + 1}] ${r.title} (Credibility: ${cred.level.toUpperCase()})
Content: ${r.snippet}
URL: ${r.url}`;
            }).join('\n\n');
            
            const systemPrompt = `You are a knowledgeable research assistant. Your task is to:
1. Analyze the provided search results
2. Synthesize a comprehensive answer to the query
3. Highlight consensus and disagreements among sources
4. Provide specific citations when referencing information
5. Indicate confidence level based on source quality

Guidelines:
- Base your answer ONLY on the provided sources
- If sources disagree, acknowledge this
- Prioritize information from higher credibility sources
- Use clear, concise language
- Include [Source X] citations for key facts`;
            
            const userPrompt = `Query: ${query}

Sources:
${sourcesText}

Please provide a comprehensive answer that:
1. Directly addresses the query
2. Cites specific sources for key information
3. Notes any disagreements or limitations in the sources
4. Ends with a confidence assessment (High/Medium/Low) based on source quality`;
            
            let aiAnswer: string;
            
            if (pi?.complete) {
                const response = await pi.complete({
                    prompt: `${systemPrompt}\n\n${userPrompt}`,
                    maxTokens: 1500,
                    temperature: 0.3, // Lower temperature for more factual responses
                    stopSequences: ['Confidence:']
                });
                aiAnswer = response;
            } else if (pi?.callLLM) {
                const response = await pi.callLLM({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ]
                });
                aiAnswer = typeof response === 'string' ? response : response.content || '';
            } else {
                throw new Error('No LLM available');
            }
            
            // Step 4: Calculate confidence based on source credibility
            processingSteps.push('Calculating confidence score');
            const avgCredibility = topCredibleResults.reduce(
                (sum, r) => sum + (r.credibility?.score || calculateCredibility(r).score), 0
            ) / topCredibleResults.length;
            
            // Adjust confidence based on answer quality indicators
            let confidence = avgCredibility;
            
            // Boost confidence if answer contains citations
            if (aiAnswer.includes('[Source')) {
                confidence += 0.05;
            }
            
            // Boost confidence if answer acknowledges limitations
            if (aiAnswer.match(/limitation|disagreement|conflict|contradict/i)) {
                confidence += 0.03; // Shows critical thinking
            }
            
            confidence = Math.min(confidence, 0.95); // Cap at 0.95
            
            // Step 5: Extract citations
            let citations: string[] = [];
            if (includeCitations) {
                citations = topCredibleResults.map((r, i) => `[${i + 1}] ${r.title} - ${r.url}`);
            }
            
            processingSteps.push('Answer generation complete');
            
            return {
                answer: aiAnswer,
                confidence,
                sources: topCredibleResults.map(r => ({
                    title: r.title,
                    url: r.url,
                    credibility: r.credibility?.score || calculateCredibility(r).score
                })),
                citations,
                processingSteps
            };
        } else {
            // Fallback to improved summarization
            processingSteps.push('Using fallback summarization (no LLM available)');
            
            const topResults = credibleResults.slice(0, 3);
            const answer = `Based on ${credibleResults.length} credible sources:

${topResults.map((r, i) => {
                const cred = r.credibility || calculateCredibility(r);
                return `${i + 1}. ${r.title} (${cred.level} credibility): ${r.snippet.substring(0, 200)}...`;
            }).join('\n\n')}

Key points aggregated from sources.`;
            
            const avgCredibility = topResults.reduce(
                (sum, r) => sum + (r.credibility?.score || calculateCredibility(r).score), 0
            ) / topResults.length;
            
            return {
                answer,
                confidence: avgCredibility,
                sources: topResults.map(r => ({
                    title: r.title,
                    url: r.url,
                    credibility: r.credibility?.score || calculateCredibility(r).score
                })),
                processingSteps
            };
        }
    } catch (error) {
        console.error('Enhanced answer generation failed:', error);
        processingSteps.push(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        
        // Ultimate fallback
        return {
            answer: `Search found ${results.length} results. Key information: ${results.slice(0, 2).map(r => r.snippet.substring(0, 100)).join('; ')}...`,
            confidence: 0.5,
            sources: results.slice(0, 2).map(r => ({
                title: r.title,
                url: r.url,
                credibility: 0.5
            })),
            processingSteps
        };
    }
}

// Maintain backward compatibility
async function generateAIAnswer(query: string, results: any[], piContext: any) {
    const enhanced = await generateEnhancedAnswer(query, results, piContext, {
        includeCitations: true,
        includeConfidence: true,
        maxSources: 3
    });
    
    let answer = enhanced.answer;
    if (enhanced.confidence < 0.7) {
        answer += `\n\nNote: Confidence in this answer is ${enhanced.confidence < 0.6 ? 'low' : 'moderate'} due to source quality limitations.`;
    }
    
    return answer;
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

// Enhanced content extraction with structured output
async function fetchStructuredContent(url: string, maxLength = 2000, focusPrompt?: string): Promise<{
    title: string;
    url: string;
    content: string;
    structured: {
        headings: Array<{level: number, text: string}>;
        paragraphs: string[];
        lists: Array<{items: string[], ordered: boolean}>;
        keyPoints: string[];
        metadata: {
            author?: string;
            date?: string;
            wordCount: number;
            readingTime: string;
        };
    };
    length: number;
    fetchedAt: string;
    contentType: 'article' | 'documentation' | 'forum' | 'general';
}> {
    try {
        // Comprehensive URL validation for SSRF protection
        if (!isUrlSafeForFetching(url)) {
            throw createError(
                SearchErrorCode.SSRF_BLOCKED,
                'URL is not safe for fetching. Blocked to prevent SSRF attacks.',
                { url },
                false
            );
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
            throw createError(
                SearchErrorCode.NETWORK_ERROR,
                `HTTP ${response.status}: ${response.statusText}`,
                { status: response.status, statusText: response.statusText, url },
                response.status >= 500
            );
        }
        
        const html = await response.text();
        const contentType = response.headers.get('content-type') || '';
        
        // Parse HTML with proper parser
        const { parse } = await import('node-html-parser');
        const root = parse(html);
        
        // Extract title
        const titleElement = root.querySelector('title');
        const title = titleElement ? titleElement.text.trim() : 'No title';
        
        // Determine content type
        let detectedType: 'article' | 'documentation' | 'forum' | 'general' = 'general';
        if (root.querySelector('article') || 
            root.querySelector('[class*="article"]') || 
            root.querySelector('[class*="post-content"]') ||
            html.includes('article') || html.includes('blog-post')) {
            detectedType = 'article';
        } else if (root.querySelector('pre, code') || 
                  html.includes('documentation') || 
                  html.includes('api') || 
                  html.includes('getting-started')) {
            detectedType = 'documentation';
        } else if (root.querySelector('[class*="forum"]') || 
                  root.querySelector('[class*="comment"]') || 
                  html.includes('discussion') || 
                  html.includes('thread')) {
            detectedType = 'forum';
        }
        
        // Extract main content with structure preservation
        const bodyElement = root.querySelector('body') || root;
        
        // Remove unwanted elements
        bodyElement.querySelectorAll('script, style, noscript, iframe, nav, footer, header, aside, form, button, input, select, textarea').forEach(el => el.remove());
        
        // Extract structured elements
        const headings: Array<{level: number, text: string}> = [];
        const paragraphs: string[] = [];
        const lists: Array<{items: string[], ordered: boolean}> = [];
        
        // Process headings (h1-h6)
        for (let i = 1; i <= 6; i++) {
            const headingElements = bodyElement.querySelectorAll(`h${i}`);
            headingElements.forEach(el => {
                const text = el.text.trim();
                if (text && text.length > 0) {
                    headings.push({ level: i, text });
                }
            });
        }
        
        // Process paragraphs
        const paragraphElements = bodyElement.querySelectorAll('p');
        paragraphElements.forEach(el => {
            const text = el.text.trim();
            if (text && text.length > 10) { // Minimum length to avoid navigation text
                paragraphs.push(text);
            }
        });
        
        // Process lists
        const listElements = bodyElement.querySelectorAll('ul, ol');
        listElements.forEach(el => {
            const items = el.querySelectorAll('li').map(li => li.text.trim()).filter(text => text.length > 0);
            if (items.length > 0) {
                lists.push({
                    items,
                    ordered: el.tagName.toLowerCase() === 'ol'
                });
            }
        });
        
        // Extract metadata
        const metadata = {
            author: extractMetadata(root, ['author', 'byline', 'creator']),
            date: extractMetadata(root, ['date', 'time', 'published', 'modified']),
            wordCount: 0,
            readingTime: ''
        };
        
        // Generate main content text
        let mainText = '';
        
        // Use headings and paragraphs for better structure
        if (headings.length > 0 && paragraphs.length > 0) {
            // Combine headings and paragraphs in order
            const allElements = [...headings.map(h => `#${'#'.repeat(h.level - 1)} ${h.text}`), ...paragraphs];
            mainText = allElements.join('\n\n');
        } else {
            // Fallback to structuredText
            mainText = bodyElement.structuredText;
        }
        
        // Clean up excessive whitespace
        mainText = mainText.replace(/\s+/g, ' ').trim();
        
        // Calculate word count and reading time
        const wordCount = mainText.split(/\s+/).length;
        metadata.wordCount = wordCount;
        metadata.readingTime = `${Math.ceil(wordCount / 200)} min read`;
        
        // Extract key points (first sentence of each paragraph)
        const keyPoints = paragraphs
            .map(p => {
                const firstSentence = p.split(/[.!?]+/)[0];
                return firstSentence && firstSentence.length > 20 ? firstSentence.trim() + '.' : null;
            })
            .filter((kp): kp is string => kp !== null)
            .slice(0, 10); // Limit to top 10 key points
        
        // Apply focus prompt if provided
        if (focusPrompt && mainText) {
            mainText = focusContent(mainText, focusPrompt);
        }
        
        // Truncate if needed
        if (mainText.length > maxLength) {
            mainText = mainText.substring(0, maxLength) + '...';
        }
        
        return {
            title,
            url,
            content: mainText,
            structured: {
                headings,
                paragraphs,
                lists,
                keyPoints,
                metadata
            },
            length: mainText.length,
            fetchedAt: new Date().toISOString(),
            contentType: detectedType
        };
    } catch (error) {
        console.error('Structured content fetch error:', error);
        // Re-throw structured error or wrap generic error
        if (error && typeof error === 'object' && 'code' in error) {
            throw error;
        } else {
            throw createError(
                SearchErrorCode.NETWORK_ERROR,
                error instanceof Error ? error.message : 'Content fetch failed',
                { url },
                true
            );
        }
    }
}

// Helper function to extract metadata
function extractMetadata(root: any, selectors: string[]): string | undefined {
    for (const selector of selectors) {
        // Try meta tags first
        const metaTag = root.querySelector(`meta[name="${selector}"], meta[property="${selector}"]`);
        if (metaTag && metaTag.getAttribute('content')) {
            return metaTag.getAttribute('content').trim();
        }
        
        // Try elements with class or id
        const elements = root.querySelectorAll(`[class*="${selector}"], [id*="${selector}"]`);
        for (const el of elements) {
            const text = el.text.trim();
            if (text && text.length > 0) {
                return text;
            }
        }
    }
    return undefined;
}

// Helper function to focus content based on prompt
function focusContent(content: string, focusPrompt: string): string {
    const lowerContent = content.toLowerCase();
    const lowerPrompt = focusPrompt.toLowerCase();
    
    // Split into sentences
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // Score sentences based on relevance to focus prompt
    const scoredSentences = sentences.map(sentence => {
        let score = 0;
        const lowerSentence = sentence.toLowerCase();
        
        // Exact matches
        if (lowerSentence.includes(lowerPrompt)) {
            score += 10;
        }
        
        // Word overlap
        const promptWords = lowerPrompt.split(/\s+/).filter(w => w.length > 3);
        const sentenceWords = lowerSentence.split(/\s+/);
        
        for (const word of promptWords) {
            if (sentenceWords.includes(word)) {
                score += 2;
            }
        }
        
        return { sentence, score };
    });
    
    // Sort by score and take top sentences
    const relevantSentences = scoredSentences
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(s => s.sentence.trim() + '.');
    
    if (relevantSentences.length > 0) {
        return relevantSentences.join(' ');
    }
    
    // Fallback to original content
    return content;
}

// Maintain backward compatibility
async function fetchUrlContent(url: string, maxLength = 2000, prompt?: string) {
    const structured = await fetchStructuredContent(url, maxLength, prompt);
    
    // Convert to old format for compatibility
    return {
        title: structured.title,
        url: structured.url,
        content: structured.content,
        length: structured.length,
        fetchedAt: structured.fetchedAt,
        // Include structured data in details for new consumers
        _structured: structured.structured,
        _contentType: structured.contentType
    };
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
            error: createError(
                SearchErrorCode.RATE_LIMIT_EXCEEDED,
                'Rate limit exceeded. Please wait a few seconds before searching again.',
                { 
                    remainingTokens: rateLimiter.getRemainingTokens('global'),
                    timeUntilNextToken: rateLimiter.getTimeUntilNextToken('global')
                },
                true
            ),
            processing_time_ms: Date.now() - startTime
        };
    }
    
    // Check cache
    const cacheKey = `${query}:${mode}:${maxResults}:${depth}:${safeMode}`;
    const cached = searchCache.get(cacheKey);
    if (cached) {
        return {
            ...cached,
            cached: true,
            processing_time_ms: Date.now() - startTime
        };
    }
    
    // Check if query should be blocked entirely (severe violations)
    if (safeMode && shouldBlockQuery(query)) {
        return {
            success: false,
            query,
            error: createError(
                SearchErrorCode.QUERY_BLOCKED,
                'Query contains prohibited content and cannot be processed.',
                { query, sanitizationLevel: SANITIZATION_LEVEL },
                false
            ),
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
        // OPTIMIZATION: Query expansion and refinement
        const queryAnalysis = await expandAndRefineQuery(query, piContext);
        
        // Perform search with expanded queries for better coverage
        let allSearchResults: any[] = [];
        
        // Search with original query first
        const primaryResults = await performSearxngSearch(searchQuery, 'general', maxResults);
        allSearchResults.push(...primaryResults);
        
        // If we need more results or want broader coverage, try expanded queries
        if (effectiveMode === 'research' || depth === 'deep') {
            // Use first expanded query for additional results
            if (queryAnalysis.expanded.length > 1) {
                const expandedQuery = queryAnalysis.expanded[1];
                const expandedResults = await performSearxngSearch(expandedQuery, 'general', Math.floor(maxResults / 2));
                
                // Merge results, avoiding duplicates by URL
                const existingUrls = new Set(allSearchResults.map(r => r.url));
                for (const result of expandedResults) {
                    if (!existingUrls.has(result.url)) {
                        allSearchResults.push(result);
                        existingUrls.add(result.url);
                    }
                }
            }
        }
        
        // Filter and sort by credibility
        const searchResults = filterByCredibility(allSearchResults, 0.6);
        
        if (searchResults.length === 0) {
            return {
                success: false,
                query,
                error: createError(
                    SearchErrorCode.NO_RESULTS,
                    'No credible search results found',
                    { query, expandedQueries: queryAnalysis.expanded },
                    true
                ),
                processing_time_ms: Date.now() - startTime
            };
        }
        
        // Generate enhanced AI answer if requested
        let aiAnswer = null;
        let enhancedAnswer = null;
        let answerConfidence = null;
        
        if (effectiveMode === 'ai' || effectiveMode === 'research') {
            // Use enhanced answer generation
            enhancedAnswer = await generateEnhancedAnswer(query, searchResults, piContext, {
                includeCitations: true,
                includeConfidence: true,
                maxSources: effectiveMode === 'research' ? 5 : 3
            });
            
            aiAnswer = enhancedAnswer.answer;
            answerConfidence = enhancedAnswer.confidence;
        }
        
        // Enhanced deep mode with structured content extraction
        let deepContent: any = null;
        let structuredContent: any = null;
        
        if (depth === 'deep' && searchResults.length > 0) {
            try {
                const topResult = searchResults[0];
                
                // Use structured content extraction
                structuredContent = await fetchStructuredContent(topResult.url, 1500);
                
                // Convert to compatible format
                deepContent = {
                    title: structuredContent.title,
                    url: structuredContent.url,
                    content: structuredContent.content,
                    length: structuredContent.length,
                    fetchedAt: structuredContent.fetchedAt
                };
                
                // Include structured data for enhanced processing
                deepContent._structured = structuredContent.structured;
                deepContent._contentType = structuredContent.contentType;
                
            } catch (error) {
                console.error('Enhanced deep content fetch failed:', error);
                deepContent = null;
                structuredContent = null;
            }
        }
        
        const result = {
            success: true,
            query,
            query_analysis: queryAnalysis, // OPTIMIZATION: Include query expansion analysis
            mode_used: effectiveMode,
            results: searchResults,
            ai_answer: aiAnswer,
            enhanced_answer: enhancedAnswer, // OPTIMIZATION: Include full enhanced answer data
            answer_confidence: answerConfidence, // OPTIMIZATION: Include confidence score
            deep_content: deepContent,
            structured_content: structuredContent, // OPTIMIZATION: Include structured content
            results_count: searchResults.length,
            credible_results_count: searchResults.filter(r => r.credibility?.score >= 0.7).length, // OPTIMIZATION: Credibility stats
            processing_time_ms: Date.now() - startTime,
            cached: false
        };
        
        // Cache the result
        searchCache.set(cacheKey, result);
        
        return result;
    } catch (error) {
        console.error('Search failed:', error);
        // Handle structured errors
        if (error && typeof error === 'object' && 'code' in error) {
            return {
                success: false,
                query,
                error,
                processing_time_ms: Date.now() - startTime
            };
        }
        
        return {
            success: false,
            query,
            error: createError(
                SearchErrorCode.SEARCH_FAILED,
                `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                { originalError: error instanceof Error ? error.message : error },
                true
            ),
            processing_time_ms: Date.now() - startTime
        };
    }
}

// Health check function
function searchHealth() {
    const now = Date.now();
    
    // Get cache statistics
    const cacheStats = searchCache.getStats();
    
    const rateLimiterStats = rateLimiter.getStats();
    const globalRemaining = rateLimiter.getRemainingTokens('global');
    const timeUntilNext = rateLimiter.getTimeUntilNextToken('global');
    
    let searxngUrl = 'Not configured';
    let status = 'healthy';
    
    try {
      searxngUrl = getSearxngBase();
    } catch (error) {
      status = 'configuration_required';
      searxngUrl = 'Not configured - ' + (error instanceof Error ? error.message : String(error));
    }
    
    return {
        status,
        searxng_url: searxngUrl,
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
export default async function (pi: ExtensionAPI): Promise<void> {
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
                // Handle structured errors
                try {
                    const error = result.error as any;
                    if (error && typeof error === 'object' && error.code) {
                        text = `**Search Error (${error.code})**\n\n${error.message || 'Unknown error'}`;
                        if (error.details && Object.keys(error.details).length > 0) {
                            text += `\n\n**Details:** ${JSON.stringify(error.details, null, 2)}`;
                        }
                        if (error.retryable) {
                            text += '\n\n**Note:** This error is retryable.';
                        }
                    } else {
                        text = `**Search Error**\n\n${result.error || 'Unknown error'}`;
                    }
                } catch (e) {
                    text = `**Search Error**\n\n${typeof result.error === 'string' ? result.error : 'Unknown error'}`;
                }
            } else {
                text = `## 🔍 Enhanced Search Results\n\n`;
                text += `**Query:** ${result.query}\n`;
                
                // OPTIMIZATION: Show query analysis
                if (result.query_analysis) {
                    text += `**Search Strategy:** ${result.query_analysis.searchStrategy}\n`;
                    if (result.query_analysis.focusAreas.length > 0) {
                        text += `**Focus Areas:** ${result.query_analysis.focusAreas.join(', ')}\n`;
                    }
                }
                
                text += `**Mode:** ${result.mode_used}\n`;
                text += `**Total Results:** ${result.results_count}\n`;
                
                // OPTIMIZATION: Show credibility stats
                if (result.credible_results_count !== undefined) {
                    text += `**Credible Results:** ${result.credible_results_count} (${Math.round((result.credible_results_count / result.results_count) * 100)}%)\n`;
                }
                
                text += `**Processing Time:** ${result.processing_time_ms}ms\n`;
                
                // OPTIMIZATION: Show confidence score for AI answers
                if (result.answer_confidence !== null && result.answer_confidence !== undefined) {
                    const confidencePercent = Math.round(result.answer_confidence * 100);
                    let confidenceEmoji = '🟡';
                    if (confidencePercent >= 80) confidenceEmoji = '🟢';
                    if (confidencePercent <= 60) confidenceEmoji = '🔴';
                    text += `**Answer Confidence:** ${confidenceEmoji} ${confidencePercent}%\n`;
                }
                
                if (result.cached) {
                    text += `**Note:** Served from cache\n`;
                }
                
                if (result.ai_answer) {
                    text += `\n---\n\n### 🤖 AI Answer\n\n${result.ai_answer}\n`;
                }
                
                // OPTIMIZATION: Show enhanced answer details if available
                if (result.enhanced_answer?.sources) {
                    text += `\n**Sources Used:** ${result.enhanced_answer.sources.length} credible sources\n`;
                }
                
                if (result.results && result.results.length > 0) {
                    text += `\n---\n\n### 📊 Top Results (with Credibility Scores)\n\n`;
                    result.results.slice(0, 3).forEach((r: any, i: number) => {
                        const credibility = r.credibility || calculateCredibility(r);
                        const credibilityPercent = Math.round(credibility.score * 100);
                        let credibilityBadge = '🟡';
                        if (credibilityPercent >= 80) credibilityBadge = '🟢';
                        if (credibilityPercent <= 60) credibilityBadge = '🔴';
                        
                        text += `${i + 1}. ${credibilityBadge} **${r.title}**\n`;
                        text += `   Credibility: ${credibilityPercent}% (${credibility.level})\n`;
                        text += `   ${r.snippet.substring(0, 120)}...\n`;
                        text += `   ${r.url}\n\n`;
                    });
                }
                
                // OPTIMIZATION: Show structured content info if available
                if (result.structured_content) {
                    text += `\n---\n\n### 📄 Structured Content Analysis\n\n`;
                    text += `**Content Type:** ${result.structured_content.contentType}\n`;
                    text += `**Headings Found:** ${result.structured_content.structured.headings.length}\n`;
                    text += `**Key Points:** ${result.structured_content.structured.keyPoints.length}\n`;
                    if (result.structured_content.structured.metadata.readingTime) {
                        text += `**Reading Time:** ${result.structured_content.structured.metadata.readingTime}\n`;
                    }
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
                
                // OPTIMIZATION: Use enhanced structured content extraction
                const content = await fetchStructuredContent(
                    params.url, 
                    maxLengthValue,
                    params.prompt
                );
                
                let text = `## 📄 Enhanced Content Extraction\n\n`;
                text += `**Title:** ${content.title}\n`;
                text += `**URL:** ${content.url}\n`;
                text += `**Content Type:** ${content.contentType}\n`;
                text += `**Length:** ${content.length} characters\n`;
                text += `**Word Count:** ${content.structured.metadata.wordCount}\n`;
                text += `**Reading Time:** ${content.structured.metadata.readingTime}\n`;
                
                if (content.structured.metadata.author) {
                    text += `**Author:** ${content.structured.metadata.author}\n`;
                }
                if (content.structured.metadata.date) {
                    text += `**Date:** ${content.structured.metadata.date}\n`;
                }
                
                text += `**Fetched At:** ${content.fetchedAt}\n\n`;
                
                // Show structure analysis
                text += `### 📊 Structure Analysis\n\n`;
                text += `**Headings:** ${content.structured.headings.length} headings found\n`;
                text += `**Paragraphs:** ${content.structured.paragraphs.length} paragraphs\n`;
                text += `**Lists:** ${content.structured.lists.length} lists\n`;
                text += `**Key Points:** ${content.structured.keyPoints.length} extracted\n\n`;
                
                // Show key points if available
                if (content.structured.keyPoints.length > 0) {
                    text += `### 🔑 Key Points\n\n`;
                    content.structured.keyPoints.slice(0, 5).forEach((point, i) => {
                        text += `${i + 1}. ${point}\n`;
                    });
                    text += `\n`;
                }
                
                // Show content preview
                text += `### 📝 Content Preview\n\n`;
                
                if (params.prompt) {
                    text += `*(Focused on: "${params.prompt}")*\n\n`;
                }
                
                // Show either beginning or focused content
                if (params.prompt && content.content.length > 0) {
                    // Show focused preview
                    text += `${content.content.substring(0, 600)}${content.content.length > 600 ? '...' : ''}`;
                } else {
                    // Show structured preview with headings
                    const previewLength = 800;
                    if (content.content.length <= previewLength) {
                        text += content.content;
                    } else {
                        // Try to show complete first section
                        const firstPeriod = content.content.indexOf('.', previewLength - 100);
                        if (firstPeriod > 0) {
                            text += content.content.substring(0, firstPeriod + 1) + '...';
                        } else {
                            text += content.content.substring(0, previewLength) + '...';
                        }
                    }
                }
                
                // Return with proper structure for pi tool API
                return {
                    content: [{ type: 'text', text }],
                    details: { 
                        success: true, 
                        content: {
                            title: content.title,
                            url: content.url,
                            content: content.content,
                            length: content.length,
                            fetchedAt: content.fetchedAt,
                            // Include structured data in a way that preserves compatibility
                            _structured: content.structured,
                            _contentType: content.contentType
                        }
                    },
                    isError: false
                };
            } catch (error) {
                // Handle structured errors
                let errorMessage = 'Unknown error';
                let errorCode = SearchErrorCode.UNKNOWN_ERROR;
                let retryable = false;
                
                if (error && typeof error === 'object') {
                    const err = error as any;
                    if ('code' in err) {
                        errorMessage = err.message || 'Fetch failed';
                        errorCode = err.code as SearchErrorCode;
                        retryable = err.retryable || false;
                    } else if ('message' in err) {
                        errorMessage = err.message;
                    }
                } else if (error instanceof Error) {
                    errorMessage = error.message;
                }
                
                let text = `**Fetch Content Error**\n\nFailed to fetch content: ${errorMessage}`;
                
                return {
                    content: [{ type: 'text', text }],
                    details: { 
                        success: false,
                        error: createError(errorCode, errorMessage, { url: params.url }, retryable)
                    },
                    isError: true
                };
            }
        }
    });
}