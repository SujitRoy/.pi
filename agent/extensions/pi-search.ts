#!/usr/bin/env node

/**
 * PI Agent Unified Search Extension: pi-search.ts
 * 
 * Consolidated architecture replacing 4 fragmented files:
 * - web-search.ts, hybrid-search.ts, hybrid-search-enhanced.ts, ai-search.ts
 * 
 * Features:
 * 1. Auto-detects Pi agent's available LLM method (pi.callLLM or pi.complete or pi.llm.complete)
 * 2. Three-tier fallback: Native LLM → Simulated AI → Traditional search
 * 3. Single tool "search" with unified parameters
 * 4. Query sanitization to avoid 500 errors
 * 5. Intelligent query classification
 * 6. Caching with 5-minute TTL
 * 7. Rate limiting (5 requests per 10 seconds)
 * 8. Graceful degradation - always returns valid JSON
 * 9. Health check on startup
 * 
 * Configuration:
 * - SEARXNG_BASE_URL from environment or default http://140.238.166.109:8081
 * - No external dependencies beyond fetch API
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// ============================================================================
// Configuration & Constants
// ============================================================================

// Default SearxNG instance
const DEFAULT_SEARXNG_URL = "http://140.238.166.109:8081";
const SEARXNG_BASE = process.env.SEARXNG_BASE_URL || DEFAULT_SEARXNG_URL;

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

// Rate limiting configuration
const RATE_LIMIT_REQUESTS = 5;
const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds

// Query classification thresholds
const SIMPLE_QUERY_MAX_WORDS = 5;
const FACTUAL_PATTERNS = [
  /weather/i,
  /temperature/i,
  /time in/i,
  /date/i,
  /capital of/i,
  /population of/i,
  /\d{4}/, // Years
];

const COMPLEX_PATTERNS = [
  /explain/i,
  /compare/i,
  /analyze/i,
  /why/i,
  /how/i,
  /what is/i,
  /difference between/i,
  /pros and cons/i,
  /advantages and disadvantages/i,
];

// Sensitive terms to sanitize (to avoid 500 errors)
const SENSITIVE_TERMS = [
  // Security/hacking related
  'hack', 'crack', 'exploit', 'bypass', 'inject', 'sql', 'xss', 'ddos',
  'malware', 'virus', 'trojan', 'ransomware', 'phishing',
  
  // Violence/harm
  'kill', 'murder', 'assassin', 'terror', 'bomb', 'weapon', 'gun',
  'attack', 'violence', 'harm', 'hurt', 'injure',
  
  // Illegal activities
  'illegal', 'crime', 'criminal', 'fraud', 'scam', 'theft', 'steal',
  
  // Adult content
  'porn', 'xxx', 'adult', 'explicit', 'nude', 'sex',
  
  // Self-harm
  'suicide', 'self-harm', 'self injury',
  
  // Political/controversial
  'political', 'election', 'protest', 'riot', 'revolution', 'coup',
  'controversial', 'sensitive',
  
  // Financial scams
  'bitcoin scam', 'crypto scam', 'investment scam', 'pyramid', 'ponzi',
];

// Neutral alternatives for sanitization
const NEUTRAL_ALTERNATIVES: Record<string, string> = {
  'hack': 'security',
  'crack': 'access',
  'exploit': 'vulnerability',
  'bypass': 'workaround',
  'inject': 'insert',
  'sql': 'database',
  'xss': 'web security',
  'ddos': 'network traffic',
  'malware': 'software issue',
  'virus': 'computer issue',
  'trojan': 'security software',
  'ransomware': 'data security',
  'phishing': 'online security',
  'kill': 'stop',
  'murder': 'crime',
  'assassin': 'removal',
  'terror': 'fear',
  'bomb': 'device',
  'weapon': 'tool',
  'gun': 'firearm',
  'attack': 'approach',
  'violence': 'force',
  'harm': 'impact',
  'hurt': 'affect',
  'injure': 'damage',
  'illegal': 'unauthorized',
  'crime': 'offense',
  'criminal': 'offender',
  'fraud': 'deception',
  'scam': 'scheme',
  'theft': 'taking',
  'steal': 'take',
  'porn': 'content',
  'xxx': 'adult material',
  'adult': 'mature',
  'explicit': 'detailed',
  'nude': 'unclothed',
  'sex': 'gender',
  'suicide': 'self-harm prevention',
  'self-harm': 'self-injury prevention',
  'self injury': 'self-damage',
  'political': 'governmental',
  'election': 'voting',
  'protest': 'demonstration',
  'riot': 'disturbance',
  'revolution': 'change',
  'coup': 'takeover',
  'controversial': 'debated',
  'sensitive': 'delicate',
  'bitcoin scam': 'crypto fraud',
  'crypto scam': 'cryptocurrency fraud',
  'investment scam': 'investment fraud',
  'pyramid': 'scheme',
  'ponzi': 'fraud scheme',
};

// ============================================================================
// Core Data Structures
// ============================================================================

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  publishedDate?: string;
  engine?: string;
}

interface SearchResponse {
  success: boolean;
  query: string;
  mode_used: string;
  results: SearchResult[];
  ai_answer?: string;
  processing_time_ms: number;
  fallback_triggered: boolean;
  error_message?: string;
  sanitized_query?: string;
  cache_hit?: boolean;
  rate_limit_info?: {
    remaining: number;
    reset_in_ms: number;
  };
}

interface CacheEntry {
  data: SearchResponse;
  timestamp: number;
  ttl: number;
}

interface RateLimitInfo {
  count: number;
  windowStart: number;
}

// ============================================================================
// Core Services
// ============================================================================

class UnifiedSearchService {
  private cache = new Map<string, CacheEntry>();
  private rateLimits = new Map<string, RateLimitInfo>();
  private llmMethod: 'complete' | 'callLLM' | 'llm.complete' | 'none' = 'none';
  private searxngHealthy = false;
  private startupTime = Date.now();

  constructor(private pi: ExtensionAPI) {
    this.detectLLMMethod();
    this.checkSearxngHealth();
    this.startCleanupInterval();
  }

  /**
   * Auto-detect available LLM method in Pi agent
   */
  private detectLLMMethod() {
    try {
      if (typeof this.pi.complete === 'function') {
        this.llmMethod = 'complete';
        console.log('[pi-search] Detected LLM method: pi.complete');
      } else if (typeof this.pi.callLLM === 'function') {
        this.llmMethod = 'callLLM';
        console.log('[pi-search] Detected LLM method: pi.callLLM');
      } else if (this.pi.llm && typeof this.pi.llm.complete === 'function') {
        this.llmMethod = 'llm.complete';
        console.log('[pi-search] Detected LLM method: pi.llm.complete');
      } else {
        this.llmMethod = 'none';
        console.log('[pi-search] No LLM method detected, will use simulated AI');
      }
    } catch (error) {
      console.warn('[pi-search] Error detecting LLM method:', error);
      this.llmMethod = 'none';
    }
  }

  /**
   * Check if SearxNG is reachable
   */
  private async checkSearxngHealth() {
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${SEARXNG_BASE}/healthz`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      this.searxngHealthy = response.ok;
      console.log(`[pi-search] SearxNG health check: ${this.searxngHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
    } catch (error) {
      console.warn('[pi-search] SearxNG health check failed:', error);
      this.searxngHealthy = false;
    }
  }

  /**
   * Start periodic cache cleanup
   */
  private startCleanupInterval() {
    setInterval(() => {
      this.cleanupCache();
      this.cleanupRateLimits();
    }, 60000); // Cleanup every minute
  }

  private cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
    
    // Enforce max cache size
    if (this.cache.size > MAX_CACHE_SIZE) {
      const keys = Array.from(this.cache.keys());
      const toRemove = keys.slice(0, this.cache.size - MAX_CACHE_SIZE);
      toRemove.forEach(key => this.cache.delete(key));
    }
  }

  private cleanupRateLimits() {
    const now = Date.now();
    for (const [key, info] of this.rateLimits.entries()) {
      if (now - info.windowStart > RATE_LIMIT_WINDOW_MS) {
        this.rateLimits.delete(key);
      }
    }
  }

  /**
   * Rate limiting with queueing
   */
  private checkRateLimit(ip: string = 'default'): { allowed: boolean; remaining: number; resetInMs: number } {
    const now = Date.now();
    let info = this.rateLimits.get(ip);
    
    if (!info) {
      info = { count: 1, windowStart: now };
      this.rateLimits.set(ip, info);
      return { allowed: true, remaining: RATE_LIMIT_REQUESTS - 1, resetInMs: RATE_LIMIT_WINDOW_MS };
    }
    
    // Reset window if expired
    if (now - info.windowStart > RATE_LIMIT_WINDOW_MS) {
      info.count = 1;
      info.windowStart = now;
      this.rateLimits.set(ip, info);
      return { allowed: true, remaining: RATE_LIMIT_REQUESTS - 1, resetInMs: RATE_LIMIT_WINDOW_MS };
    }
    
    // Check if within limit
    if (info.count < RATE_LIMIT_REQUESTS) {
      info.count++;
      this.rateLimits.set(ip, info);
      return { allowed: true, remaining: RATE_LIMIT_REQUESTS - info.count, resetInMs: RATE_LIMIT_WINDOW_MS - (now - info.windowStart) };
    }
    
    return { allowed: false, remaining: 0, resetInMs: RATE_LIMIT_WINDOW_MS - (now - info.windowStart) };
  }

  /**
   * Query sanitization to avoid 500 errors
   */
  sanitizeQuery(query: string): { sanitized: string; wasSanitized: boolean; original: string } {
    const original = query;
    let sanitized = query;
    let wasSanitized = false;
    
    // Convert to lowercase for matching
    const lowerQuery = query.toLowerCase();
    
    // Check for sensitive terms
    for (const term of SENSITIVE_TERMS) {
      if (lowerQuery.includes(term)) {
        const alternative = NEUTRAL_ALTERNATIVES[term] || 'related topic';
        sanitized = sanitized.replace(new RegExp(term, 'gi'), alternative);
        wasSanitized = true;
      }
    }
    
    // Remove any remaining special characters that might cause issues
    sanitized = sanitized.replace(/[<>\[\]{}|\\^~`]/g, '').trim();
    
    return { sanitized, wasSanitized, original };
  }

  /**
   * Intelligent query classification
   */
  classifyQuery(query: string): { mode: 'traditional' | 'ai' | 'research'; reason: string } {
    const words = query.split(/\s+/).length;
    
    // Check for factual queries (use traditional search)
    for (const pattern of FACTUAL_PATTERNS) {
      if (pattern.test(query)) {
        return { mode: 'traditional', reason: 'Factual query detected' };
      }
    }
    
    // Very short queries
    if (words <= 2) {
      return { mode: 'traditional', reason: 'Very short query' };
    }
    
    // Simple queries (short and not complex)
    if (words <= SIMPLE_QUERY_MAX_WORDS) {
      let isComplex = false;
      for (const pattern of COMPLEX_PATTERNS) {
        if (pattern.test(query)) {
          isComplex = true;
          break;
        }
      }
      
      if (!isComplex) {
        return { mode: 'traditional', reason: 'Simple query detected' };
      }
    }
    
    // Check for complex patterns
    for (const pattern of COMPLEX_PATTERNS) {
      if (pattern.test(query)) {
        return { mode: 'ai', reason: 'Complex query pattern detected' };
      }
    }
    
    // Long queries (likely need AI)
    if (words > 8) {
      return { mode: 'ai', reason: 'Long query detected' };
    }
    
    // Default to traditional
    return { mode: 'traditional', reason: 'Default classification' };
  }

  /**
   * Get from cache
   */
  private getFromCache(cacheKey: string): SearchResponse | null {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return entry.data;
  }

  /**
   * Save to cache
   */
  private saveToCache(cacheKey: string, data: SearchResponse, ttl: number = CACHE_TTL) {
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  /**
   * Perform traditional search using SearxNG
   */
  async performTraditionalSearch(
    query: string,
    maxResults: number = 10
  ): Promise<SearchResult[]> {
    try {
      const searchData = {
        q: query,
        format: 'json',
        language: 'en',
        categories: 'general',
        safesearch: '0'
      };
      
      // Create abort controller for timeout (30 seconds for search)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(`${SEARXNG_BASE}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(searchData),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`SearxNG HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.results || !Array.isArray(data.results)) {
        return [];
      }
      
      return data.results.slice(0, maxResults).map((result: any) => ({
        title: result.title || '',
        url: result.url || '',
        snippet: result.content || '',
        score: result.score || 0,
        publishedDate: result.publishedDate || result.pubdate,
        engine: result.engine || result.engines?.[0],
      }));
    } catch (error) {
      console.error('[pi-search] Traditional search error:', error);
      throw error;
    }
  }

  /**
   * Tier 1: Native LLM integration
   */
  async callNativeLLM(messages: any[], options: any = {}): Promise<string> {
    try {
      switch (this.llmMethod) {
        case 'complete':
          const response1 = await this.pi.complete({
            messages,
            maxTokens: options.maxTokens || 1000,
            temperature: options.temperature || 0.3,
          });
          return response1.content;
          
        case 'callLLM':
          const response2 = await this.pi.callLLM(messages, {
            maxTokens: options.maxTokens || 1000,
            temperature: options.temperature || 0.3,
          });
          return response2.content;
          
        case 'llm.complete':
          const response3 = await this.pi.llm.complete({
            messages,
            maxTokens: options.maxTokens || 1000,
            temperature: options.temperature || 0.3,
          });
          return response3.content;
          
        default:
          throw new Error('No LLM method available');
      }
    } catch (error) {
      console.error('[pi-search] Native LLM call failed:', error);
      throw error;
    }
  }

  /**
   * Tier 2: Simulated AI response using result summarization
   */
  generateSimulatedAIResponse(query: string, results: SearchResult[]): string {
    if (results.length === 0) {
      return `I searched for "${query}" but couldn't find any relevant information.`;
    }
    
    const topResults = results.slice(0, 3);
    let response = `Based on my search for "${query}", here's what I found:\n\n`;
    
    topResults.forEach((result, index) => {
      response += `${index + 1}. **${result.title}**\n`;
      response += `   ${result.snippet.substring(0, 150)}...\n`;
      response += `   Source: ${result.url}\n\n`;
    });
    
    if (results.length > 3) {
      response += `Plus ${results.length - 3} more results. `;
    }
    
    response += `\nThis is a simulated AI response since the LLM is currently unavailable.`;
    
    return response;
  }

  /**
   * Tier 3: Pure traditional search as last resort
   */
  async traditionalSearchFallback(query: string, maxResults: number): Promise<SearchResponse> {
    const startTime = Date.now();
    
    try {
      const results = await this.performTraditionalSearch(query, maxResults);
      
      return {
        success: true,
        query,
        mode_used: 'traditional',
        results,
        processing_time_ms: Date.now() - startTime,
        fallback_triggered: true,
        error_message: 'LLM unavailable, using traditional search only',
      };
    } catch (error) {
      return {
        success: false,
        query,
        mode_used: 'traditional',
        results: [],
        processing_time_ms: Date.now() - startTime,
        fallback_triggered: true,
        error_message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Main unified search method with three-tier fallback
   */
  async unifiedSearch(
    query: string,
    options: {
      mode?: 'auto' | 'traditional' | 'ai' | 'research';
      maxResults?: number;
      depth?: 'fast' | 'standard' | 'deep';
      safeMode?: boolean;
      forceTraditional?: boolean;
    } = {}
  ): Promise<SearchResponse> {
    const startTime = Date.now();
    const { mode = 'auto', maxResults = 10, depth = 'standard', safeMode = true, forceTraditional = false } = options;
    
    // Create cache key
    const cacheKey = `search:${query}:${mode}:${maxResults}:${depth}:${safeMode}`;
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      cached.cache_hit = true;
      return cached;
    }
    
    // Rate limiting
    const rateLimit = this.checkRateLimit();
    if (!rateLimit.allowed) {
      return {
        success: false,
        query,
        mode_used: 'blocked',
        results: [],
        processing_time_ms: Date.now() - startTime,
        fallback_triggered: false,
        error_message: `Rate limit exceeded. Please wait ${Math.ceil(rateLimit.resetInMs / 1000)} seconds.`,
        rate_limit_info: {
          remaining: rateLimit.remaining,
          reset_in_ms: rateLimit.resetInMs,
        },
      };
    }
    
    // Sanitize query
    const sanitized = this.sanitizeQuery(query);
    const finalQuery = sanitized.sanitized;
    
    // Determine search mode
    let searchMode = mode;
    if (mode === 'auto') {
      const classification = this.classifyQuery(finalQuery);
      searchMode = classification.mode;
    }
    
    // Force traditional if safeMode is enabled and query was sanitized
    if (safeMode && sanitized.wasSanitized) {
      searchMode = 'traditional';
    }
    
    // Force traditional if explicitly requested or LLM unavailable
    if (forceTraditional || this.llmMethod === 'none') {
      searchMode = 'traditional';
    }
    
    try {
      // Perform traditional search first (needed for all modes)
      const searchResults = await this.performTraditionalSearch(finalQuery, maxResults);
      
      // Handle different modes
      if (searchMode === 'traditional') {
        const response: SearchResponse = {
          success: true,
          query: finalQuery,
          mode_used: 'traditional',
          results: searchResults,
          processing_time_ms: Date.now() - startTime,
          fallback_triggered: false,
        };
        
        if (sanitized.wasSanitized) {
          response.sanitized_query = finalQuery;
        }
        
        this.saveToCache(cacheKey, response);
        return response;
      }
      
      // AI or Research mode
      if (searchMode === 'ai' || searchMode === 'research') {
        try {
          // Tier 1: Try native LLM
          const context = searchResults.slice(0, 4).map((result, i) => 
            `[Source ${i + 1}]: ${result.title}\nContent: ${result.snippet}`
          ).join('\n\n');
          
          const messages = [{
            role: 'system',
            content: 'You are a helpful research assistant. Answer the question using the provided sources. ' +
                     'Cite sources using [number] notation. Be accurate and concise.'
          }, {
            role: 'user',
            content: `Question: ${finalQuery}\n\nSources:\n${context}\n\nPlease answer the question.`
          }];
          
          const aiAnswer = await this.callNativeLLM(messages, {
            maxTokens: searchMode === 'research' ? 1500 : 1000,
            temperature: 0.2,
          });
          
          const response: SearchResponse = {
            success: true,
            query: finalQuery,
            mode_used: searchMode,
            results: searchResults,
            ai_answer: aiAnswer,
            processing_time_ms: Date.now() - startTime,
            fallback_triggered: false,
          };
          
          if (sanitized.wasSanitized) {
            response.sanitized_query = finalQuery;
          }
          
          this.saveToCache(cacheKey, response);
          return response;
          
        } catch (llmError) {
          console.warn('[pi-search] LLM failed, falling back to simulated AI:', llmError);
          
          // Tier 2: Simulated AI response
          const simulatedAnswer = this.generateSimulatedAIResponse(finalQuery, searchResults);
          
          const response: SearchResponse = {
            success: true,
            query: finalQuery,
            mode_used: 'simulated_ai',
            results: searchResults,
            ai_answer: simulatedAnswer,
            processing_time_ms: Date.now() - startTime,
            fallback_triggered: true,
            error_message: 'LLM unavailable, using simulated response',
          };
          
          if (sanitized.wasSanitized) {
            response.sanitized_query = finalQuery;
          }
          
          this.saveToCache(cacheKey, response, 60000); // Shorter TTL for fallback
          return response;
        }
      }
      
      // Should not reach here
      return await this.traditionalSearchFallback(finalQuery, maxResults);
      
    } catch (searchError) {
      console.error('[pi-search] Search failed:', searchError);
      
      // Tier 3: Ultimate fallback
      return {
        success: false,
        query: finalQuery,
        mode_used: 'failed',
        results: [],
        processing_time_ms: Date.now() - startTime,
        fallback_triggered: true,
        error_message: `Search failed: ${searchError instanceof Error ? searchError.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return {
      searxng_healthy: this.searxngHealthy,
      llm_available: this.llmMethod !== 'none',
      llm_method: this.llmMethod,
      cache_size: this.cache.size,
      uptime_ms: Date.now() - this.startupTime,
      rate_limits_active: this.rateLimits.size,
      default_searxng_url: SEARXNG_BASE,
    };
  }
}

// ============================================================================
// Extension Setup
// ============================================================================

export default function (pi: ExtensionAPI) {
  console.log('[pi-search] Unified search extension loading...');
  
  // Initialize service
  const searchService = new UnifiedSearchService(pi);
  
  // Health check on startup
  console.log('[pi-search] Health status:', searchService.getHealthStatus());
  
  try {
    // Register the single unified search tool
    pi.registerTool({
      name: "search",
      label: "Unified Search",
      description: "Intelligent web search with AI enhancement and graceful degradation",
      parameters: Type.Object({
        query: Type.String({
          description: "Search query"
        }),
        
        mode: Type.Optional(Type.String({
          description: "Search mode: auto, traditional, ai, research",
          default: "auto"
        })),
        
        maxResults: Type.Optional(Type.Number({
          description: "Maximum results (1-20)",
          default: 10,
          minimum: 1,
          maximum: 20
        })),
        
        depth: Type.Optional(Type.String({
          description: "Search depth: fast, standard, deep",
          default: "standard"
        })),
        
        safeMode: Type.Optional(Type.Boolean({
          description: "Enable safe mode to avoid content filters",
          default: true
        })),
        
        // Hidden/advanced parameters
        _forceTraditional: Type.Optional(Type.Boolean({
          description: "Force traditional search (internal use)",
          default: false
        })),
        
        _noCache: Type.Optional(Type.Boolean({
          description: "Disable caching (internal use)",
          default: false
        })),
      }),
      
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const query = params?.query;
        
        if (!query || typeof query !== 'string' || query.trim() === '') {
          return {
            content: [{ type: 'text', text: '**Error:** No query provided' }],
            details: {},
            isError: true
          };
        }
        
        const startTime = Date.now();
        
        try {
          // Perform unified search
          const searchResponse = await searchService.unifiedSearch(query, {
            mode: params?.mode as any,
            maxResults: params?.maxResults,
            depth: params?.depth as any,
            safeMode: params?.safeMode,
            forceTraditional: params?._forceTraditional,
          });
          
          // Format response for PI agent
          let formattedText = '';
          
          if (!searchResponse.success) {
            formattedText = `**Search Error**\n\n${searchResponse.error_message || 'Unknown error'}`;
          } else {
            formattedText = `## Search Results\n\n`;
            formattedText += `**Query:** ${searchResponse.query}\n`;
            
            if (searchResponse.sanitized_query) {
              formattedText += `**Note:** Query was sanitized for safety\n`;
            }
            
            formattedText += `**Mode:** ${searchResponse.mode_used}\n`;
            formattedText += `**Results:** ${searchResponse.results.length}\n`;
            formattedText += `**Processing Time:** ${searchResponse.processing_time_ms}ms\n`;
            
            if (searchResponse.fallback_triggered) {
              formattedText += `**Note:** Fallback mode was triggered\n`;
            }
            
            if (searchResponse.cache_hit) {
              formattedText += `**Note:** Served from cache\n`;
            }
            
            formattedText += `\n---\n\n`;
            
            // Add AI answer if available
            if (searchResponse.ai_answer) {
              formattedText += `### AI Answer\n\n${searchResponse.ai_answer}\n\n---\n\n`;
            }
            
            // Add search results
            if (searchResponse.results.length > 0) {
              formattedText += `### Search Results\n\n`;
              
              searchResponse.results.forEach((result, index) => {
                formattedText += `${index + 1}. **${result.title}**\n`;
                formattedText += `   ${result.snippet}\n`;
                formattedText += `   ${result.url}\n`;
                
                if (result.publishedDate) {
                  formattedText += `   Published: ${result.publishedDate}\n`;
                }
                
                formattedText += `\n`;
              });
            } else {
              formattedText += `No results found.\n`;
            }
          }
          
          return {
            content: [{ type: 'text', text: formattedText }],
            details: searchResponse,
            isError: !searchResponse.success
          };
          
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[pi-search] Tool execution error:', error);
          
          return {
            content: [{
              type: 'text',
              text: `**Search Error**\n\n${errorMessage}\n\nProcessing time: ${Date.now() - startTime}ms`
            }],
            details: {
              success: false,
              query: query,
              mode_used: 'error',
              results: [],
              processing_time_ms: Date.now() - startTime,
              fallback_triggered: true,
              error_message: errorMessage
            },
            isError: true
          };
        }
      },
    });
    
    // Register health check tool (optional)
    pi.registerTool({
      name: "search_health",
      label: "Search Health Check",
      description: "Check the health status of the unified search system",
      parameters: Type.Object({}),
      
      async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
        const health = searchService.getHealthStatus();
        
        let statusText = `## Unified Search Health Status\n\n`;
        statusText += `**SearxNG:** ${health.searxng_healthy ? '✅ Healthy' : '❌ Unhealthy'}\n`;
        statusText += `**LLM Available:** ${health.llm_available ? '✅ Yes' : '❌ No'}\n`;
        if (health.llm_available) {
          statusText += `**LLM Method:** ${health.llm_method}\n`;
        }
        statusText += `**Cache Size:** ${health.cache_size} entries\n`;
        statusText += `**Uptime:** ${Math.floor(health.uptime_ms / 1000)} seconds\n`;
        statusText += `**Active Rate Limits:** ${health.rate_limits_active}\n`;
        statusText += `**SearxNG URL:** ${health.default_searxng_url}\n`;
        
        return {
          content: [{ type: 'text', text: statusText }],
          details: health,
          isError: false
        };
      },
    });
    
    console.log('[pi-search] Unified search tool registered successfully');
    
  } catch (error) {
    console.error('[pi-search] Extension initialization failed:', error);
    throw error;
  }
}