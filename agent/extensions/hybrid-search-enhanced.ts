#!/usr/bin/env node

/**
 * PI Agent Extension: Enhanced Hybrid Web Search
 * 
 * Advanced hybrid search combining best features from web-search.ts with AI processing
 * 
 * Features:
 * 1. Intelligent query routing (simple vs complex)
 * 2. AI answer generation using PI Agent's LLM
 * 3. Full feature parity with web-search.ts
 * 4. Enhanced error handling and fallback logic
 * 5. Caching and rate limiting
 * 6. Multiple search types and depth modes
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import dns from "node:dns";
import path from "node:path";

const dnsLookup = promisify(dns.lookup);

// Load .env file if it exists
const envPath = path.join(process.env.HOME || "", ".pi", ".env");
const SUPPORTED_ENV_KEYS = new Set(["SEARXNG_BASE_URL"] as const);

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, "utf-8");
  const unrecognizedKeys: string[] = [];
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      const trimmedKey = key.trim();
      if (SUPPORTED_ENV_KEYS.has(trimmedKey as any)) {
        const value = valueParts.join("=").trim();
        process.env[trimmedKey] = value;
      } else if (trimmedKey) {
        unrecognizedKeys.push(trimmedKey);
      }
    }
  });
  if (unrecognizedKeys.length > 0) {
    console.warn(`[hybrid-search] Unrecognized .env keys: ${unrecognizedKeys.join(", ")}`);
  }
}

// Configuration
const SEARXNG_BASE = process.env.SEARXNG_BASE_URL || "http://localhost:8080";

// Cache for search results
const searchCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Enhanced query classifier with multiple complexity levels
 */
function classifyQuery(query: string): {
  level: "simple" | "medium" | "complex";
  needsAI: boolean;
  searchDepth: "fast" | "standard" | "deep";
} {
  const lowerQuery = query.toLowerCase();
  const words = query.split(/\s+/).length;
  
  // Complex patterns (use AI with deep search)
  const complexPatterns = [
    /^(what|who|when|where|why|how)\s+/i,
    /explain\s+/i,
    /compare\s+/i,
    /difference between/i,
    /implications of/i,
    /impact of/i,
    /\?$/,
  ];
  
  // Medium complexity patterns
  const mediumPatterns = [
    /best way to/i,
    /tutorial on/i,
    /guide to/i,
    /step by step/i,
    /how to/i,
    /what is/i,
    /should i/i,
    /can you/i,
  ];
  
  // Simple patterns (no AI needed)
  const simplePatterns = [
    /^[\w\s]{1,20}$/i,
    /site:.+/i,
    /filetype:.+/i,
    /intitle:.+/i,
    /inurl:.+/i,
  ];
  
  // Check complexity
  for (const pattern of complexPatterns) {
    if (pattern.test(query)) {
      return {
        level: "complex",
        needsAI: true,
        searchDepth: "deep"
      };
    }
  }
  
  for (const pattern of mediumPatterns) {
    if (pattern.test(query)) {
      return {
        level: "medium",
        needsAI: words > 5, // Only use AI for longer medium queries
        searchDepth: "standard"
      };
    }
  }
  
  for (const pattern of simplePatterns) {
    if (pattern.test(query)) {
      return {
        level: "simple",
        needsAI: false,
        searchDepth: "fast"
      };
    }
  }
  
  // Default based on length
  if (words <= 3) {
    return {
      level: "simple",
      needsAI: false,
      searchDepth: "fast"
    };
  } else if (words <= 8) {
    return {
      level: "medium",
      needsAI: false,
      searchDepth: "standard"
    };
  } else {
    return {
      level: "complex",
      needsAI: true,
      searchDepth: "deep"
    };
  }
}

/**
 * Enhanced SearXNG search with caching and error handling
 */
async function searchSearXNG(
  query: string,
  options: {
    category?: string;
    language?: string;
    maxResults?: number;
    depth?: "fast" | "standard" | "deep";
    searchType?: string;
    timeRange?: string;
    safeSearch?: number;
  } = {}
): Promise<{ results: any[]; numberOfResults: number }> {
  const {
    category = "web",
    language = "en",
    maxResults = 10,
    depth = "standard",
    searchType = "web",
    timeRange,
    safeSearch = 0
  } = options;
  
  // Create cache key
  const cacheKey = `hybrid_search:${query}:${category}:${language}:${maxResults}:${depth}:${searchType}`;
  const cached = searchCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[hybrid-search] Using cached results for: "${query}"`);
    return cached.data;
  }
  
  try {
    // Validate SEARXNG URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(SEARXNG_BASE);
    } catch (error) {
      throw new Error(`Invalid SEARXNG_BASE_URL: ${SEARXNG_BASE}`);
    }
    
    // Check if host is reachable
    try {
      await dnsLookup(parsedUrl.hostname);
    } catch (error) {
      console.warn(`[hybrid-search] DNS lookup failed for ${parsedUrl.hostname}: ${error}`);
      // Continue anyway - might be local network issue
    }
    
    const searchData: Record<string, string> = {
      q: query,
      format: "json",
      language,
      categories: category,
      safesearch: safeSearch.toString()
    };
    
    if (timeRange) {
      searchData.time_range = timeRange;
    }
    
    // Adjust based on depth
    if (depth === "fast") {
      searchData.timeout = "2";
    } else if (depth === "deep") {
      searchData.timeout = "10";
      searchData.maxResults = (maxResults * 2).toString();
    }
    
    const url = `${SEARXNG_BASE}/search`;
    console.log(`[hybrid-search] Searching: "${query}" (depth: ${depth}, type: ${searchType})`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(searchData),
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`SearXNG HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.results || !Array.isArray(data.results)) {
      return { results: [], numberOfResults: 0 };
    }
    
    // Process results based on depth
    let processedResults = data.results;
    if (depth === "fast") {
      processedResults = processedResults.slice(0, Math.min(maxResults, 5));
    } else if (depth === "standard") {
      processedResults = processedResults.slice(0, maxResults);
    } else {
      processedResults = processedResults.slice(0, Math.min(maxResults * 2, 20));
    }
    
    const result = {
      results: processedResults,
      numberOfResults: data.number_of_results || 0
    };
    
    // Cache the results
    searchCache.set(cacheKey, { data: result, timestamp: Date.now() });
    
    return result;
    
  } catch (error) {
    console.error(`[hybrid-search] Search error for "${query}":`, error);
    
    // Check cache for stale results as fallback
    const cached = searchCache.get(cacheKey);
    if (cached) {
      console.log(`[hybrid-search] Using stale cached results as fallback`);
      return cached.data;
    }
    
    throw error;
  }
}

/**
 * Generate AI answer from search results
 */
async function generateAIAnswer(
  query: string,
  results: any[],
  pi: ExtensionAPI,
  options: {
    includeCitations?: boolean;
    depth?: "brief" | "detailed" | "comprehensive";
  } = {}
): Promise<{ answer: string; citations: Array<{ title: string; url: string; relevance: string }> }> {
  const { includeCitations = true, depth = "detailed" } = options;
  
  if (results.length === 0) {
    return {
      answer: "I couldn't find any relevant information to answer your question.",
      citations: []
    };
  }
  
  // Prepare context
  const context = results.slice(0, 6).map((result, i) => (
    `[Source ${i + 1}]: ${result.title}\n` +
    `Content: ${result.content}\n` +
    `URL: ${result.url}`
  )).join("\n\n");
  
  const systemPrompt = includeCitations 
    ? "You are an expert researcher. Answer the question using the provided sources. " +
      "Cite sources using [number] notation. Be accurate and comprehensive."
    : "You are an expert researcher. Answer the question using the provided sources. " +
      "Be accurate and comprehensive.";
  
  const userPrompt = includeCitations
    ? `Question: ${query}\n\nSources:\n${context}\n\nPlease answer the question, citing sources where appropriate.`
    : `Question: ${query}\n\nBased on these sources:\n${context}\n\nPlease provide a comprehensive answer.`;
  
  const messages = [{
    role: "system",
    content: systemPrompt
  }, {
    role: "user",
    content: userPrompt
  }];
  
  try {
    const llmResponse = await pi.callLLM(messages, {
      maxTokens: depth === "comprehensive" ? 2000 : depth === "detailed" ? 1200 : 800,
      temperature: 0.2
    });
    
    // Extract citations from answer
    const citations: Array<{ title: string; url: string; relevance: string }> = [];
    if (includeCitations) {
      const citationRegex = /\[(\d+)\]/g;
      const matches = llmResponse.content.matchAll(citationRegex);
      const citedIndices = new Set<number>();
      
      for (const match of matches) {
        const index = parseInt(match[1]) - 1;
        if (index >= 0 && index < results.length) {
          citedIndices.add(index);
        }
      }
      
      // Add citations
      Array.from(citedIndices).forEach(index => {
        const result = results[index];
        if (result) {
          citations.push({
            title: result.title,
            url: result.url,
            relevance: result.content.substring(0, 100)
          });
        }
      });
    }
    
    return {
      answer: llmResponse.content,
      citations
    };
    
  } catch (error) {
    console.error("[hybrid-search] AI answer generation error:", error);
    throw error;
  }
}

/**
 * Format traditional search results
 */
function formatSearchResults(results: any[], query: string, depth: string = "standard"): string {
  if (results.length === 0) {
    return `No results found for "${query}"`;
  }
  
  let response = `## Search Results (${depth} depth)\n\n`;
  response += `**Query:** ${query}\n`;
  response += `**Results found:** ${results.length}\n\n`;
  
  results.forEach((result, index) => {
    response += `${index + 1}. **${result.title}**\n`;
    if (result.content) {
      const maxLength = depth === "deep" ? 300 : depth === "standard" ? 150 : 80;
      response += `   ${result.content.substring(0, maxLength)}${result.content.length > maxLength ? '...' : ''}\n`;
    }
    response += `   URL: ${result.url}\n`;
    if (result.publishedDate) {
      response += `   Published: ${result.publishedDate}\n`;
    }
    if (result.engine) {
      response += `   Source: ${result.engine}\n`;
    }
    response += "\n";
  });
  
  return response;
}

/**
 * Enhanced hybrid search with full feature parity
 */
async function enhancedHybridSearch(
  query: string,
  options: any,
  pi: ExtensionAPI
): Promise<{ result: any; backend: string; queryAnalysis: any }> {
  const analysis = classifyQuery(query);
  console.log(`[hybrid-search] Query: "${query}" → Level: ${analysis.level}, AI: ${analysis.needsAI ? 'Yes' : 'No'}, Depth: ${analysis.searchDepth}`);
  
  try {
    // Check if user forced a specific backend
    const forceBackend = options?.forceBackend || "auto";
    
    if (forceBackend === "searxng") {
      console.log("[hybrid-search] Forced SearXNG backend");
      const { results, numberOfResults } = await searchSearXNG(query, {
        category: options?.category,
        language: options?.language,
        maxResults: options?.maxResults,
        depth: options?.depth || analysis.searchDepth,
        searchType: options?.searchType,
        timeRange: options?.timeRange,
        safeSearch: options?.safeSearch
      });
      
      return {
        result: { results, numberOfResults, isAI: false },
        backend: "searxng",
        queryAnalysis: analysis
      };
    }
    
    if (forceBackend === "ai" || (forceBackend === "auto" && analysis.needsAI)) {
      console.log("[hybrid-search] Using AI processing");
      try {
        // Get search results
        const { results } = await searchSearXNG(query, {
          category: options?.category,
          language: options?.language,
          maxResults: options?.maxResults || 12,
          depth: analysis.searchDepth,
          searchType: options?.searchType,
          timeRange: options?.timeRange,
          safeSearch: options?.safeSearch
        });
        
        if (results.length === 0) {
          throw new Error("No results found for AI processing");
        }
        
        // Generate AI answer
        const { answer, citations } = await generateAIAnswer(query, results, pi, {
          includeCitations: true,
          depth: "detailed"
        });
        
        return {
          result: { answer, citations, isAI: true },
          backend: "ai",
          queryAnalysis: analysis
        };
        
      } catch (aiError) {
        console.log("[hybrid-search] AI processing failed, falling back to SearXNG");
        // Fallback to traditional results
        const { results, numberOfResults } = await searchSearXNG(query, {
          category: options?.category,
          language: options?.language,
          maxResults: options?.maxResults,
          depth: analysis.searchDepth,
          searchType: options?.searchType,
          timeRange: options?.timeRange,
          safeSearch: options?.safeSearch
        });
        
        return {
          result: { results, numberOfResults, isAI: false },
          backend: "searxng",
          queryAnalysis: analysis
        };
      }
    } else {
      console.log("[hybrid-search] Using SearXNG (simple search)");
      const { results, numberOfResults } = await searchSearXNG(query, {
        category: options?.category,
        language: options?.language,
        maxResults: options?.maxResults,
        depth: analysis.searchDepth,
        searchType: options?.searchType,
        timeRange: options?.timeRange,
        safeSearch: options?.safeSearch
      });
      
      return {
        result: { results, numberOfResults, isAI: false },
        backend: "searxng",
        queryAnalysis: analysis
      };
    }
    
  } catch (error) {
    console.error("[hybrid-search] All backends failed:", error);
    throw error;
  }
}

export default function (pi: ExtensionAPI) {
  console.log("[hybrid-search-enhanced] Enhanced hybrid search extension loading...");
  
  try {
    // Register the enhanced hybrid search tool
    pi.registerTool({
      name: "web_search", // Same name for compatibility
      label: "Enhanced Hybrid Web Search",
      description: "Advanced web search with AI-powered answers and full feature parity",
      parameters: Type.Object({
        query: Type.String({ description: "Search query or question" }),
        
        // Search options (full parity with web-search.ts)
        category: Type.Optional(Type.String({ 
          description: "Search category: web, news, images, videos",
          default: "web"
        })),
        
        language: Type.Optional(Type.String({
          description: "Language code (default: en)",
          default: "en"
        })),
        
        maxResults: Type.Optional(Type.Number({
          description: "Maximum results to fetch",
          default: 10
        })),
        
        depth: Type.Optional(Type.String({
          description: "Search depth: fast, standard, deep",
          default: "standard"
        })),
        
        searchType: Type.Optional(Type.String({
          description: "Search type: web, news, images, videos",
          default: "web"
        })),
        
        timeRange: Type.Optional(Type.String({
          description: "Time range: day, week, month, year",
          default: ""
        })),
        
        safeSearch: Type.Optional(Type.Number({
          description: "Safe search level: 0=off, 1=moderate, 2=strict",
          default: 0
        })),
        
        // Hybrid features
        forceBackend: Type.Optional(Type.String({
          description: "Force backend: auto, searxng, ai",
          default: "auto"
        })),
        
        enableAI: Type.Optional(Type.Boolean({
          description: "Enable AI processing (overrides auto detection)",
          default: false
        })),
      }),
      
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        const query = params?.query;
        
        if (!query || typeof query !== "string" || query.trim() === "") {
          return {
            content: [{ type: "text", text: "**Error:** No query provided" }],
            details: {},
            isError: true
          };
        }
        
        try {
          // Override auto detection if enableAI is explicitly set
          const options = { ...params };
          if (params?.enableAI !== undefined) {
            options.forceBackend = params.enableAI ? "ai" : "searxng";
          }
          
          const { result, backend, queryAnalysis } = await enhancedHybridSearch(query, options, pi);
          
          // Format output based on backend
          if (result.isAI) {
            // AI answer format
            let response = `## AI-Powered Answer\n\n`;
            response += `**Query:** ${query}\n`;
            response += `**Analysis:** ${queryAnalysis.level} complexity\n\n`;
            response += `${result.answer}\n\n`;
            
            if (result.citations && result.citations.length > 0) {
              response += `### Sources Cited:\n\n`;
              result.citations.forEach((cite, i) => {
                response += `${i + 1}. **${cite.title}**\n`;
                response += `   ${cite.url}\n`;
                if (cite.relevance) {
                  response += `   Relevance: ${cite.relevance}\n`;
                }
                response += `\n`;
              });
            }
            
            return {
              content: [{ type: "text", text: response }],
              details: { 
                backend: backend,
                queryType: "ai",
                queryAnalysis: queryAnalysis,
                citationsCount: result.citations?.length || 0
              }
            };
          } else {
            // Traditional results format
            const formatted = formatSearchResults(result.results, query, params?.depth);
            
            return {
              content: [{ type: "text", text: formatted }],
              details: { 
                backend: backend,
                queryType: "traditional",
                queryAnalysis: queryAnalysis,
                resultCount: result.results?.length,
                totalResults: result.numberOfResults
              }
            };
          }
          
        } catch (error) {
          console.error("[hybrid-search-enhanced] Search execution error:", error);
          
          return {
            content: [{
              type: "text",
              text: `**Search Error**\n\n${error instanceof Error ? error.message : "Unknown error"}\n\nPlease try again or simplify your query.`
            }],
            details: {},
            isError: true
          };
        }
      },
    });
    
    console.log("[hybrid-search-enhanced] Enhanced hybrid search tool registered successfully");
    
  } catch (error) {
    console.error("[hybrid-search-enhanced] Extension initialization failed:", error);
    throw error;
  }
}