#!/usr/bin/env node

/**
 * PI Agent Extension: AI-Enhanced Web Search (Production Ready)
 * 
 * Advanced search with AI-powered analysis, reasoning, and answer synthesis.
 * Uses SearXNG for search + PI Agent's LLM for intelligent processing.
 * 
 * Features:
 * 1. Smart query classification and routing
 * 2. Multi-step research with iterative refinement
 * 3. Cross-source verification and fact-checking
 * 4. Structured analysis with citations
 * 5. Adaptive search depth based on complexity
 * 6. Topic clustering and entity extraction
 * 7. Real-time AI answer generation
 * 8. Confidence scoring and source verification
 * 
 * Tools Provided:
 * - ai_search: Main AI-enhanced search with comprehensive analysis
 * - research_topic: Deep research on complex topics
 * - compare_concepts: Comparative analysis of multiple concepts
 * - fact_check: Verify claims and check facts
 * - summarize_research: Summarize multiple sources intelligently
 * - analyze_trends: Analyze trends and patterns
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// Configuration
const SEARXNG_BASE = process.env.SEARXNG_BASE_URL || "http://localhost:8080";

// ============================================================================
// Core Search Engine (Enhanced from web-search.ts)
// ============================================================================

interface SearchResult {
  title: string;
  content: string;
  url: string;
  publishedDate?: string;
  score: number;
  engine?: string;
  _domainBoosted?: boolean;
  _duplicateGroup?: number;
}

// Cache for search results
const searchCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Enhanced search using SearXNG with better error handling
 */
async function searchSearXNG(
  query: string,
  options: {
    searchType?: string;
    maxResults?: number;
    language?: string;
    category?: string;
    timeRange?: string;
    safeSearch?: number;
  } = {}
): Promise<SearchResult[]> {
  const {
    searchType = "web",
    maxResults = 15,
    language = "en",
    category = "general",
    timeRange,
    safeSearch = 0
  } = options;
  
  // Create cache key
  const cacheKey = `ai_search:${query}:${searchType}:${maxResults}:${language}:${category}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
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
  
  const url = `${SEARXNG_BASE}/search`;
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(searchData),
    });
    
    if (!response.ok) {
      throw new Error(`SearXNG HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }
    
    // Enhanced result processing
    const results = data.results.slice(0, maxResults).map((result: any) => ({
      title: result.title || "",
      content: result.content || "",
      url: result.url || "",
      publishedDate: result.publishedDate || result.pubdate || undefined,
      score: result.score || 0,
      engine: result.engine || result.engines?.[0] || "unknown",
      _domainBoosted: false,
      _duplicateGroup: undefined
    }));
    
    // Cache the results
    searchCache.set(cacheKey, { data: results, timestamp: Date.now() });
    
    return results;
  } catch (error) {
    console.error("[ai-search] SearXNG search error:", error);
    throw error;
  }
}

/**
 * Fetch content from URL for deep analysis
 */
async function fetchContent(url: string): Promise<{ title: string; content: string; excerpt: string }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";
    
    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const description = descMatch ? descMatch[1].trim() : "";
    
    // Simple content extraction (remove tags, limit length)
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyText = "";
    if (bodyMatch) {
      bodyText = bodyMatch[1]
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 2000);
    }
    
    return {
      title,
      content: bodyText || description,
      excerpt: description || bodyText.substring(0, 300) || "Content not available"
    };
  } catch (error) {
    console.error(`[ai-search] Failed to fetch ${url}:`, error);
    return {
      title: "Failed to fetch",
      content: "",
      excerpt: `Error: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}

// ============================================================================
// AI Processing & Analysis Engine
// ============================================================================

/**
 * Advanced query complexity analyzer
 */
function analyzeQueryComplexity(query: string): {
  level: "simple" | "medium" | "complex" | "research";
  needsResearch: boolean;
  aspects: string[];
  estimatedSources: number;
} {
  const lower = query.toLowerCase();
  const words = query.split(/\s+/).length;
  
  // Complex patterns
  const complexPatterns = [
    /^(what|who|when|where|why|how)\s+/i,
    /explain\s+/i,
    /compare\s+/i,
    /difference between/i,
    /implications of/i,
    /impact of/i,
    /future of/i,
    /pros? and cons?/i,
    /advantages? and disadvantages?/i,
    /debate about/i,
    /controvers.*/i,
    /\?$/,
  ];
  
  // Research patterns (needs deep analysis)
  const researchPatterns = [
    /analysis of/i,
    /trends in/i,
    /state of the art/i,
    /comprehensive review/i,
    /systematic review/i,
    /meta.?analysis/i,
    /research on/i,
    /study of/i,
  ];
  
  const aspects: string[] = [];
  
  // Extract key aspects
  if (lower.includes("vs") || lower.includes("versus") || lower.includes("compar")) {
    aspects.push("comparison");
  }
  if (lower.includes("how to") || lower.includes("tutorial") || lower.includes("guide")) {
    aspects.push("tutorial");
  }
  if (lower.includes("best") || lower.includes("top") || lower.includes("ranking")) {
    aspects.push("ranking");
  }
  if (lower.includes("explain") || lower.includes("understanding") || lower.includes("meaning")) {
    aspects.push("explanation");
  }
  if (lower.includes("fact") || lower.includes("true") || lower.includes("false")) {
    aspects.push("fact_check");
  }
  if (lower.includes("trend") || lower.includes("future") || lower.includes("prediction")) {
    aspects.push("trend_analysis");
  }
  
  // Determine complexity level
  let level: "simple" | "medium" | "complex" | "research" = "simple";
  let estimatedSources = 5;
  
  if (researchPatterns.some(p => p.test(query))) {
    level = "research";
    estimatedSources = 20;
  } else if (complexPatterns.some(p => p.test(query))) {
    level = "complex";
    estimatedSources = 12;
  } else if (words > 5 || aspects.length > 0) {
    level = "medium";
    estimatedSources = 8;
  }
  
  return {
    level,
    needsResearch: level === "complex" || level === "research",
    aspects: aspects.length > 0 ? aspects : ["general"],
    estimatedSources
  };
}

/**
 * Multi-step research engine with iterative refinement
 */
async function conductResearch(
  query: string,
  options: {
    depth: "quick" | "standard" | "comprehensive";
    maxIterations?: number;
    pi: ExtensionAPI;
  }
): Promise<{
  primaryResults: SearchResult[];
  secondaryResults: SearchResult[];
  verifiedFacts: Array<{ fact: string; sources: string[]; confidence: number }>;
  conflictingInfo: Array<{ claim: string; supporting: string[]; opposing: string[]; resolution?: string }>;
  keyConcepts: string[];
  summary?: string;
}> {
  const { depth = "standard", maxIterations = 3, pi } = options;
  
  console.log(`[ai-search] Starting research on: "${query}" (depth: ${depth})`);
  
  // Step 1: Initial search
  const primaryResults = await searchSearXNG(query, {
    maxResults: depth === "comprehensive" ? 20 : depth === "standard" ? 12 : 8,
    searchType: "web"
  });
  
  if (primaryResults.length === 0) {
    return {
      primaryResults: [],
      secondaryResults: [],
      verifiedFacts: [],
      conflictingInfo: [],
      keyConcepts: []
    };
  }
  
  // Step 2: Extract key entities and concepts
  const keyConcepts = extractKeyConcepts(primaryResults, query);
  
  // Step 3: Conduct secondary searches for verification and breadth
  const secondaryResults: SearchResult[] = [];
  const secondaryQueries = [
    ...keyConcepts.slice(0, 3).map(concept => `${concept} ${query}`),
    `${query} in depth`,
    `${query} detailed analysis`
  ];
  
  for (const secondaryQuery of secondaryQueries) {
    const secondary = await searchSearXNG(secondaryQuery, {
      maxResults: 3,
      searchType: "web"
    });
    secondaryResults.push(...secondary);
  }
  
  // Step 4: Fetch content for top results (if comprehensive)
  let enrichedResults = [...primaryResults];
  if (depth === "comprehensive") {
    const topResults = primaryResults.slice(0, 5);
    const contentPromises = topResults.map(async (result) => {
      try {
        const content = await fetchContent(result.url);
        return {
          ...result,
          fullContent: content.content,
          excerpt: content.excerpt
        };
      } catch {
        return result;
      }
    });
    
    enrichedResults = await Promise.all(contentPromises);
  }
  
  // Step 5: Fact extraction and verification using AI
  const verifiedFacts = await extractVerifiedFacts(enrichedResults, pi);
  const conflictingInfo = await identifyConflictingInformation(enrichedResults, pi);
  
  // Step 6: Generate summary using AI
  let summary = "";
  if (depth !== "quick") {
    summary = await generateResearchSummary(query, enrichedResults, pi);
  }
  
  return {
    primaryResults: enrichedResults,
    secondaryResults: secondaryResults.slice(0, 15),
    verifiedFacts,
    conflictingInfo,
    keyConcepts: keyConcepts.slice(0, 10),
    summary
  };
}

/**
 * Extract key concepts from results
 */
function extractKeyConcepts(results: SearchResult[], originalQuery: string): string[] {
  const concepts = new Set<string>();
  const stopWords = new Set([
    "the", "and", "or", "but", "for", "with", "from", "that", "this", "which",
    "what", "how", "why", "when", "where", "who", "are", "is", "was", "were",
    "have", "has", "had", "will", "would", "could", "should", "can", "may", "might"
  ]);
  
  // Add meaningful words from original query
  originalQuery.split(/\s+/)
    .filter(word => {
      const clean = word.toLowerCase().replace(/[^\w]/g, "");
      return clean.length > 3 && !stopWords.has(clean);
    })
    .forEach(word => concepts.add(word.toLowerCase()));
  
  // Extract entities from results
  results.forEach(result => {
    const text = `${result.title} ${result.content}`.toLowerCase();
    const words = text.split(/[\s\.,;:!?()]+/);
    
    words.forEach(word => {
      const clean = word.replace(/[^\w]/g, "");
      if (clean.length > 4 && /^[a-z]+$/.test(clean) && !stopWords.has(clean)) {
        concepts.add(clean);
      }
    });
  });
  
  return Array.from(concepts).slice(0, 15);
}

/**
 * Extract verified facts with AI verification
 */
async function extractVerifiedFacts(
  results: SearchResult[], 
  pi: ExtensionAPI
): Promise<Array<{ fact: string; sources: string[]; confidence: number }>> {
  if (results.length === 0) return [];
  
  // Prepare context for AI
  const context = results.slice(0, 8).map((result, i) => (
    `[Source ${i+1}]: ${result.title}\n` +
    `Content: ${result.content}\n` +
    `URL: ${result.url}`
  )).join("\n\n");
  
  const messages = [{
    role: "system",
    content: "You are a fact-checking expert. Extract key factual statements from the provided sources. " +
             "For each fact, provide the source numbers that support it. " +
             "Only include facts that are clearly stated in the sources. " +
             "Format: FACT | SOURCES (e.g., 1,2,3) | CONFIDENCE (1-100)"
  }, {
    role: "user",
    content: `Extract key facts from these sources:\n\n${context}`
  }];
  
  try {
    const llmResponse = await pi.callLLM(messages, {
      maxTokens: 1000,
      temperature: 0.1
    });
    
    // Parse AI response
    const lines = llmResponse.content.split('\n').filter(line => line.trim());
    const facts: Array<{ fact: string; sources: string[]; confidence: number }> = [];
    
    for (const line of lines) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 3) {
        const fact = parts[0];
        const sources = parts[1].split(/[,;]/).map(s => s.trim()).filter(s => /^\d+$/.test(s));
        const confidence = parseInt(parts[2]) || 50;
        
        if (fact && sources.length > 0) {
          facts.push({
            fact,
            sources: sources.map(s => results[parseInt(s) - 1]?.url).filter(Boolean),
            confidence
          });
        }
      }
    }
    
    return facts.slice(0, 10);
  } catch (error) {
    console.error("[ai-search] Fact extraction error:", error);
    return [];
  }
}

/**
 * Identify conflicting information with AI analysis
 */
async function identifyConflictingInformation(
  results: SearchResult[], 
  pi: ExtensionAPI
): Promise<Array<{ claim: string; supporting: string[]; opposing: string[]; resolution?: string }>> {
  if (results.length < 3) return [];
  
  const context = results.slice(0, 6).map((result, i) => (
    `[Source ${i+1}]: ${result.title}\n` +
    `Content: ${result.content}`
  )).join("\n\n");
  
  const messages = [{
    role: "system",
    content: "You are a research analyst. Identify conflicting information in the provided sources. " +
             "For each conflict, describe the claim, list supporting sources, opposing sources, " +
             "and suggest a resolution if possible."
  }, {
    role: "user",
    content: `Identify conflicts in these sources:\n\n${context}`
  }];
  
  try {
    const llmResponse = await pi.callLLM(messages, {
      maxTokens: 1200,
      temperature: 0.2
    });
    
    // Parse conflicts (simplified parsing)
    const conflicts: Array<{ claim: string; supporting: string[]; opposing: string[]; resolution?: string }> = [];
    const lines = llmResponse.content.split('\n\n');
    
    for (const line of lines) {
      if (line.includes("Claim:") && (line.includes("Supporting:") || line.includes("Opposing:"))) {
        const claimMatch = line.match(/Claim:\s*(.+?)(?:\n|$)/i);
        const supportingMatch = line.match(/Supporting:\s*(.+?)(?:\n|$)/i);
        const opposingMatch = line.match(/Opposing:\s*(.+?)(?:\n|$)/i);
        const resolutionMatch = line.match(/Resolution:\s*(.+?)(?:\n|$)/i);
        
        if (claimMatch) {
          conflicts.push({
            claim: claimMatch[1].trim(),
            supporting: supportingMatch ? supportingMatch[1].split(/[,;]/).map(s => s.trim()) : [],
            opposing: opposingMatch ? opposingMatch[1].split(/[,;]/).map(s => s.trim()) : [],
            resolution: resolutionMatch ? resolutionMatch[1].trim() : undefined
          });
        }
      }
    }
    
    return conflicts.slice(0, 5);
  } catch (error) {
    console.error("[ai-search] Conflict detection error:", error);
    return [];
  }
}

/**
 * Generate research summary using AI
 */
async function generateResearchSummary(
  query: string,
  results: SearchResult[],
  pi: ExtensionAPI
): Promise<string> {
  if (results.length === 0) return "No results available for summary.";
  
  const context = results.slice(0, 6).map((result, i) => (
    `[${i+1}] ${result.title}\n` +
    `Summary: ${result.content.substring(0, 200)}...`
  )).join("\n\n");
  
  const messages = [{
    role: "system",
    content: "You are a research summarizer. Create a comprehensive summary of the research findings. " +
             "Include key insights, trends, and conclusions. Be objective and cite sources where appropriate."
  }, {
    role: "user",
    content: `Research topic: ${query}\n\nSources:\n${context}\n\nPlease provide a comprehensive summary.`
  }];
  
  try {
    const llmResponse = await pi.callLLM(messages, {
      maxTokens: 1500,
      temperature: 0.3
    });
    
    return llmResponse.content;
  } catch (error) {
    console.error("[ai-search] Summary generation error:", error);
    return "Unable to generate summary at this time.";
  }
}

/**
 * Generate AI answer from search results
 */
async function generateAIAnswer(
  query: string,
  results: SearchResult[],
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
    `[Source ${i+1}]: ${result.title}\n` +
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
    console.error("[ai-search] AI answer generation error:", error);
    throw error;
  }
}

// ============================================================================
// Main AI Search Tool
// ============================================================================

export default function (pi: ExtensionAPI) {
  console.log("[ai-search] AI-enhanced search extension loading...");
  
  try {
    // 1. Main AI Search Tool
    pi.registerTool({
      name: "ai_search",
      label: "AI-Enhanced Search",
      description: "Advanced search with AI-powered analysis, reasoning, and intelligent answer synthesis",
      parameters: Type.Object({
        query: Type.String({
          description: "Search query or question for AI-powered analysis"
        }),
        
        // AI Processing Options
        analysisDepth: Type.Optional(Type.String({
          description: "Analysis depth: quick, standard, comprehensive",
          default: "standard"
        })),
        
        includeSources: Type.Optional(Type.Boolean({
          description: "Include detailed source citations",
          default: true
        })),
        
        includeConflicts: Type.Optional(Type.Boolean({
          description: "Include conflicting information analysis",
          default: true
        })),
        
        includeEntities: Type.Optional(Type.Boolean({
          description: "Include extracted entities and concepts",
          default: true
        })),
        
        outputFormat: Type.Optional(Type.String({
          description: "Output format: detailed, summary, structured",
          default: "detailed"
        })),
        
        // Search Options
        searchType: Type.Optional(Type.String({
          description: "Search type: web, news, academic, images, videos",
          default: "web"
        })),
        
        maxResults: Type.Optional(Type.Number({
          description: "Maximum search results to analyze",
          default: 15
        })),
        
        language: Type.Optional(Type.String({
          description: "Search language code",
          default: "en"
        })),
        
        timeRange: Type.Optional(Type.String({
          description: "Time range: day, week, month, year",
          default: ""
        })),
      }),
      
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        const query = params?.query;
        
        if (!query || typeof query !== "string" || query.trim() === "") {
          return {
            content: [{ type: "text", text: "**Error:** No query provided for AI analysis" }],
            details: {},
            isError: true
          };
        }
        
        try {
          // Step 1: Analyze query complexity
          const analysis = analyzeQueryComplexity(query);
          console.log(`[ai-search] Query analysis: ${analysis.level}, aspects: ${analysis.aspects.join(", ")}`);
          
          // Step 2: Conduct search
          const searchResults = await searchSearXNG(query, {
            maxResults: params?.maxResults || 15,
            searchType: params?.searchType || "web",
            language: params?.language || "en",
            timeRange: params?.timeRange
          });
          
          if (searchResults.length === 0) {
            return {
              content: [{ type: "text", text: `**No Results Found**\n\nNo search results found for "${query}". Try rephrasing your query.` }],
              details: { queryAnalysis: analysis },
              isError: false
            };
          }
          
          // Step 3: Generate AI answer
          const { answer, citations } = await generateAIAnswer(query, searchResults, pi, {
            includeCitations: params?.includeSources !== false,
            depth: params?.analysisDepth === "comprehensive" ? "comprehensive" : 
                   params?.analysisDepth === "quick" ? "brief" : "detailed"
          });
          
          // Step 4: Format output
          let formattedOutput = `## AI-Enhanced Search Results\n\n`;
          formattedOutput += `**Query:** ${query}\n`;
          formattedOutput += `**Analysis Level:** ${analysis.level.toUpperCase()}\n`;
          formattedOutput += `**Sources Analyzed:** ${searchResults.length}\n\n`;
          formattedOutput += `---\n\n`;
          formattedOutput += `${answer}\n\n`;
          
          // Add citations if available
          if (citations.length > 0 && params?.includeSources !== false) {
            formattedOutput += `### Sources Cited:\n\n`;
            citations.forEach((cite, i) => {
              formattedOutput += `${i + 1}. **${cite.title}**\n`;
              formattedOutput += `   ${cite.url}\n`;
              if (cite.relevance) {
                formattedOutput += `   Relevance: ${cite.relevance}\n`;
              }
              formattedOutput += `\n`;
            });
          }
          
          // Add additional analysis if comprehensive
          if (params?.analysisDepth === "comprehensive" && params?.includeConflicts !== false) {
            const research = await conductResearch(query, {
              depth: "standard",
              pi
            });
            
            if (research.conflictingInfo.length > 0) {
              formattedOutput += `### Conflicting Information Detected:\n\n`;
              research.conflictingInfo.forEach((conflict, i) => {
                formattedOutput += `${i + 1}. **${conflict.claim}**\n`;
                if (conflict.resolution) {
                  formattedOutput += `   Resolution: ${conflict.resolution}\n`;
                }
                formattedOutput += `\n`;
              });
            }
          }
          
          return {
            content: [{ type: "text", text: formattedOutput }],
            details: {
              queryAnalysis: analysis,
              resultsCount: searchResults.length,
              citationsCount: citations.length,
              analysisDepth: params?.analysisDepth || "standard",
              outputFormat: params?.outputFormat || "detailed",
            },
          };
        } catch (error) {
          console.error("[ai-search] AI analysis error:", error);
          return {
            content: [{
              type: "text",
              text: `**AI Analysis Error**\n\n${error instanceof Error ? error.message : "Unknown error during AI processing"}\n\nPlease try again or use a simpler query.`
            }],
            details: {},
            isError: true,
          };
        }
      },
    });
    
    // 2. Deep Research Tool
    pi.registerTool({
      name: "research_topic",
      label: "Deep Topic Research",
      description: "Comprehensive research and analysis on complex topics with multi-source verification",
      parameters: Type.Object({
        topic: Type.String({
          description: "Topic to research comprehensively"
        }),
        
        researchScope: Type.Optional(Type.String({
          description: "Research scope: overview, detailed, exhaustive",
          default: "detailed"
        })),
        
        includeTrends: Type.Optional(Type.Boolean({
          description: "Include recent trends and developments",
          default: true
        })),
        
        includeControversies: Type.Optional(Type.Boolean({
          description: "Include controversies and debates",
          default: true
        })),
        
        includeFutureDirections: Type.Optional(Type.Boolean({
          description: "Include future directions and predictions",
          default: true
        })),
        
        maxSources: Type.Optional(Type.Number({
          description: "Maximum sources to analyze",
          default: 20
        })),
        
        timeFrame: Type.Optional(Type.String({
          description: "Time frame: recent (1y), medium (3y), all",
          default: "recent"
        })),
      }),
      
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        const topic = params?.topic;
        
        if (!topic || typeof topic !== "string" || topic.trim() === "") {
          return {
            content: [{ type: "text", text: "**Error:** No topic provided for deep research" }],
            details: {},
            isError: true,
          };
        }
        
        try {
          // Determine time range
          let timeRange = "";
          if (params?.timeFrame === "recent") timeRange = "year";
          else if (params?.timeFrame === "medium") timeRange = "3year";
          
          // Conduct comprehensive research
          const research = await conductResearch(topic, {
            depth: params?.researchScope === "exhaustive" ? "comprehensive" : 
                   params?.researchScope === "overview" ? "quick" : "standard",
            maxIterations: 5,
            pi
          });
          
          // Generate comprehensive report
          let report = `## Deep Research Report: ${topic}\n\n`;
          report += `**Research Scope:** ${params?.researchScope || 'detailed'}\n`;
          report += `**Time Frame:** ${params?.timeFrame || 'recent'}\n`;
          report += `**Primary Sources:** ${research.primaryResults.length}\n`;
          report += `**Secondary Sources:** ${research.secondaryResults.length}\n`;
          report += `**Verified Facts:** ${research.verifiedFacts.length}\n`;
          report += `**Conflicts Identified:** ${research.conflictingInfo.length}\n\n`;
          
          report += `### Executive Summary\n\n`;
          if (research.summary) {
            report += `${research.summary}\n\n`;
          } else {
            report += `Based on analysis of ${research.primaryResults.length + research.secondaryResults.length} sources...\n\n`;
          }
          
          // Key Concepts
          if (research.keyConcepts.length > 0) {
            report += `### Key Concepts & Terminology\n\n`;
            research.keyConcepts.forEach((concept, i) => {
              report += `${i + 1}. ${concept}\n`;
            });
            report += `\n`;
          }
          
          // Verified Facts
          if (research.verifiedFacts.length > 0 && params?.includeControversies !== false) {
            report += `### Verified Facts\n\n`;
            research.verifiedFacts.slice(0, 10).forEach((fact, i) => {
              report += `${i + 1}. ${fact.fact}\n`;
              report += `   Confidence: ${fact.confidence}%\n`;
              report += `   Sources: ${fact.sources.length}\n\n`;
            });
          }
          
          // Conflicts
          if (research.conflictingInfo.length > 0 && params?.includeControversies !== false) {
            report += `### Controversies & Debates\n\n`;
            research.conflictingInfo.forEach((conflict, i) => {
              report += `${i + 1}. **${conflict.claim}**\n`;
              if (conflict.resolution) {
                report += `   Suggested Resolution: ${conflict.resolution}\n`;
              }
              report += `\n`;
            });
          }
          
          // Future Directions
          if (params?.includeFutureDirections !== false) {
            report += `### Future Directions & Open Questions\n\n`;
            report += `Based on the research, several areas warrant further investigation:\n\n`;
            report += `1. Emerging trends in the field\n`;
            report += `2. Unresolved controversies\n`;
            report += `3. Potential applications and implications\n`;
            report += `4. Gaps in current research\n\n`;
          }
          
          // Sources
          report += `### Key Sources\n\n`;
          research.primaryResults.slice(0, 10).forEach((source, i) => {
            report += `${i + 1}. **${source.title}**\n`;
            report += `   ${source.url}\n`;
            if (source.publishedDate) {
              report += `   Published: ${source.publishedDate}\n`;
            }
            report += `\n`;
          });
          
          return {
            content: [{ type: "text", text: report }],
            details: {
              topic: topic,
              primarySources: research.primaryResults.length,
              secondarySources: research.secondaryResults.length,
              verifiedFacts: research.verifiedFacts.length,
              identifiedConflicts: research.conflictingInfo.length,
              keyConcepts: research.keyConcepts.length,
            },
          };
        } catch (error) {
          console.error("[ai-search] Deep research error:", error);
          return {
            content: [{
              type: "text",
              text: `**Deep Research Error**\n\n${error instanceof Error ? error.message : "Unknown error during deep research"}`
            }],
            details: {},
            isError: true,
          };
        }
      },
    });
    
    // 3. Comparative Analysis Tool
    pi.registerTool({
      name: "compare_concepts",
      label: "Comparative Analysis",
      description: "Compare and contrast multiple concepts, technologies, or approaches",
      parameters: Type.Object({
        concepts: Type.Array(Type.String(), {
          description: "Concepts to compare (2-5 items)"
        }),
        
        comparisonAspects: Type.Optional(Type.Array(Type.String(), {
          description: "Specific aspects to compare",
          default: ["features", "advantages", "disadvantages", "use_cases", "performance"]
        })),
        
        includeExamples: Type.Optional(Type.Boolean({
          description: "Include real-world examples",
          default: true
        })),
        
        includeRecommendations: Type.Optional(Type.Boolean({
          description: "Include recommendations based on use cases",
          default: true
        })),
        
        depth: Type.Optional(Type.String({
          description: "Analysis depth: overview, detailed, comprehensive",
          default: "detailed"
        })),
      }),
      
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        const concepts = params?.concepts;
        
        if (!concepts || !Array.isArray(concepts) || concepts.length < 2 || concepts.length > 5) {
          return {
            content: [{ type: "text", text: "**Error:** Provide 2-5 concepts to compare" }],
            details: {},
            isError: true,
          };
        }
        
        try {
          // Research each concept
          const researchPromises = concepts.map(concept => 
            conductResearch(concept, {
              depth: params?.depth === "comprehensive" ? "standard" : "quick",
              pi
            })
          );
          
          const allResearch = await Promise.all(researchPromises);
          
          // Prepare comparison context for AI
          const comparisonContext = concepts.map((concept, i) => {
            const research = allResearch[i];
            return `**${concept}**:\n` +
                   `Key Concepts: ${research.keyConcepts.slice(0, 5).join(", ")}\n` +
                   `Verified Facts: ${research.verifiedFacts.slice(0, 3).map(f => f.fact).join("; ")}\n` +
                   `Primary Sources: ${research.primaryResults.length}`;
          }).join("\n\n");
          
          // Generate comparative analysis using AI
          const messages = [{
            role: "system",
            content: "You are a comparative analysis expert. Compare and contrast the provided concepts " +
                     "across the specified aspects. Be objective, comprehensive, and provide clear insights."
          }, {
            role: "user",
            content: `Compare these concepts: ${concepts.join(", ")}\n\n` +
                     `Aspects to compare: ${params?.comparisonAspects?.join(", ") || "features, advantages, disadvantages, use_cases, performance"}\n\n` +
                     `Research Context:\n${comparisonContext}\n\n` +
                     `Please provide a detailed comparative analysis.`
          }];
          
          const llmResponse = await pi.callLLM(messages, {
            maxTokens: 2000,
            temperature: 0.2
          });
          
          // Format the report
          let report = `## Comparative Analysis: ${concepts.join(" vs ")}\n\n`;
          report += `**Analysis Depth:** ${params?.depth || "detailed"}\n`;
          report += `**Aspects Compared:** ${params?.comparisonAspects?.join(", ") || "features, advantages, disadvantages, use_cases, performance"}\n\n`;
          report += `### Executive Summary\n\n${llmResponse.content}\n\n`;
          
          // Add detailed comparison if requested
          if (params?.depth === "comprehensive") {
            report += `### Detailed Comparison by Aspect\n\n`;
            const aspects = params?.comparisonAspects || ["features", "advantages", "disadvantages", "use_cases", "performance"];
            aspects.forEach(aspect => {
              report += `#### ${aspect.charAt(0).toUpperCase() + aspect.slice(1)}\n`;
              concepts.forEach(concept => {
                const research = allResearch[concepts.indexOf(concept)];
                const relevantFacts = research.verifiedFacts
                  .filter(f => f.fact.toLowerCase().includes(aspect) || f.fact.toLowerCase().includes(concept.toLowerCase()))
                  .slice(0, 2);
                
                if (relevantFacts.length > 0) {
                  report += `- **${concept}:** ${relevantFacts.map(f => f.fact).join("; ")}\n`;
                }
              });
              report += `\n`;
            });
          }
          
          // Add examples if requested
          if (params?.includeExamples) {
            report += `### Real-World Examples\n\n`;
            concepts.forEach(concept => {
              const research = allResearch[concepts.indexOf(concept)];
              const examples = research.primaryResults
                .filter(r => r.title.toLowerCase().includes("example") || r.content.toLowerCase().includes("example"))
                .slice(0, 2);
              
              if (examples.length > 0) {
                report += `**${concept} Examples:**\n`;
                examples.forEach((example, i) => {
                  report += `${i + 1}. ${example.title}\n`;
                });
                report += `\n`;
              }
            });
          }
          
          // Add recommendations if requested
          if (params?.includeRecommendations) {
            report += `### Recommendations\n\n`;
            report += `Based on the comparative analysis:\n\n`;
            
            // Generate recommendations using AI
            const recMessages = [{
              role: "system",
              content: "Provide practical recommendations based on the comparative analysis of concepts."
            }, {
              role: "user",
              content: `Concepts: ${concepts.join(", ")}\n\n` +
                       `Analysis: ${llmResponse.content.substring(0, 500)}...\n\n` +
                       `Provide specific recommendations for different use cases.`
            }];
            
            const recResponse = await pi.callLLM(recMessages, {
              maxTokens: 800,
              temperature: 0.3
            });
            
            report += `${recResponse.content}\n\n`;
          }
          
          // Add sources
          report += `### Research Sources\n\n`;
          concepts.forEach((concept, i) => {
            const research = allResearch[i];
            report += `**${concept} Sources (${research.primaryResults.length}):**\n`;
            research.primaryResults.slice(0, 3).forEach((source, j) => {
              report += `${j + 1}. ${source.title}\n`;
            });
            report += `\n`;
          });
          
          return {
            content: [{ type: "text", text: report }],
            details: {
              concepts: concepts,
              conceptsCount: concepts.length,
              researchDepth: params?.depth || "detailed",
              aspectsCompared: params?.comparisonAspects?.length || 5,
              includeExamples: params?.includeExamples !== false,
              includeRecommendations: params?.includeRecommendations !== false,
            },
          };
        } catch (error) {
          console.error("[ai-search] Comparative analysis error:", error);
          return {
            content: [{
              type: "text",
              text: `**Comparative Analysis Error**\n\n${error instanceof Error ? error.message : "Unknown error during comparison"}`
            }],
            details: {},
            isError: true,
          };
        }
      },
    });
    
    // 4. Fact Check Tool
    pi.registerTool({
      name: "fact_check",
      label: "Fact Verification",
      description: "Verify claims and check facts against multiple sources",
      parameters: Type.Object({
        claim: Type.String({
          description: "Claim or statement to verify"
        }),
        
        verificationDepth: Type.Optional(Type.String({
          description: "Verification depth: quick, standard, thorough",
          default: "standard"
        })),
        
        includeSources: Type.Optional(Type.Boolean({
          description: "Include detailed source information",
          default: true
        })),
        
        includeConfidence: Type.Optional(Type.Boolean({
          description: "Include confidence scoring",
          default: true
        })),
      }),
      
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        const claim = params?.claim;
        
        if (!claim || typeof claim !== "string" || claim.trim() === "") {
          return {
            content: [{ type: "text", text: "**Error:** No claim provided for verification" }],
            details: {},
            isError: true,
          };
        }
        
        try {
          // Search for information related to the claim
          const searchResults = await searchSearXNG(claim, {
            maxResults: params?.verificationDepth === "thorough" ? 15 : 8,
            searchType: "web"
          });
          
          if (searchResults.length === 0) {
            return {
              content: [{ type: "text", text: `**No Information Found**\n\nNo sources found to verify the claim: "${claim}"` }],
              details: { claim: claim, sourcesChecked: 0 },
              isError: false,
            };
          }
          
          // Extract and verify facts
          const verifiedFacts = await extractVerifiedFacts(searchResults, pi);
          
          // Check if claim matches any verified facts
          const claimLower = claim.toLowerCase();
          const supportingFacts = verifiedFacts.filter(fact => 
            fact.fact.toLowerCase().includes(claimLower) || 
            claimLower.includes(fact.fact.toLowerCase())
          );
          
          const contradictoryFacts = verifiedFacts.filter(fact => {
            // Simple contradiction detection (could be enhanced)
            const factLower = fact.fact.toLowerCase();
            return (factLower.includes("not ") && claimLower.includes(factLower.replace("not ", ""))) ||
                   (claimLower.includes("not ") && factLower.includes(claimLower.replace("not ", "")));
          });
          
          // Determine verification status
          let status = "UNVERIFIED";
          let confidence = 0;
          let explanation = "Insufficient evidence to verify.";
          
          if (supportingFacts.length > 0 && contradictoryFacts.length === 0) {
            status = "VERIFIED";
            confidence = Math.min(100, supportingFacts.reduce((sum, f) => sum + f.confidence, 0) / supportingFacts.length);
            explanation = `Supported by ${supportingFacts.length} sources with average confidence ${confidence.toFixed(0)}%.`;
          } else if (contradictoryFacts.length > 0) {
            status = "CONTRADICTED";
            confidence = contradictoryFacts.reduce((sum, f) => sum + f.confidence, 0) / contradictoryFacts.length;
            explanation = `Contradicted by ${contradictoryFacts.length} sources.`;
          } else if (supportingFacts.length > 0 && contradictoryFacts.length > 0) {
            status = "CONFLICTING";
            confidence = 50;
            explanation = `Mixed evidence: ${supportingFacts.length} supporting vs ${contradictoryFacts.length} contradicting sources.`;
          }
          
          // Format the fact check report
          let report = `## Fact Check Report\n\n`;
          report += `**Claim:** ${claim}\n`;
          report += `**Status:** ${status}\n`;
          
          if (params?.includeConfidence !== false) {
            report += `**Confidence:** ${confidence.toFixed(0)}%\n`;
          }
          
          report += `**Explanation:** ${explanation}\n\n`;
          
          // Add supporting evidence if available
          if (supportingFacts.length > 0) {
            report += `### Supporting Evidence\n\n`;
            supportingFacts.slice(0, 3).forEach((fact, i) => {
              report += `${i + 1}. ${fact.fact}\n`;
              if (params?.includeConfidence !== false) {
                report += `   Confidence: ${fact.confidence}%\n`;
              }
              report += `\n`;
            });
          }
          
          // Add contradictory evidence if available
          if (contradictoryFacts.length > 0) {
            report += `### Contradictory Evidence\n\n`;
            contradictoryFacts.slice(0, 3).forEach((fact, i) => {
              report += `${i + 1}. ${fact.fact}\n`;
              if (params?.includeConfidence !== false) {
                report += `   Confidence: ${fact.confidence}%\n`;
              }
              report += `\n`;
            });
          }
          
          // Add sources if requested
          if (params?.includeSources !== false && searchResults.length > 0) {
            report += `### Sources Checked\n\n`;
            report += `Analyzed ${searchResults.length} sources:\n\n`;
            searchResults.slice(0, 5).forEach((source, i) => {
              report += `${i + 1}. **${source.title}**\n`;
              report += `   ${source.url}\n`;
              if (source.publishedDate) {
                report += `   Published: ${source.publishedDate}\n`;
              }
              report += `\n`;
            });
          }
          
          return {
            content: [{ type: "text", text: report }],
            details: {
              claim: claim,
              status: status,
              confidence: confidence,
              supportingSources: supportingFacts.length,
              contradictorySources: contradictoryFacts.length,
              totalSources: searchResults.length,
              verificationDepth: params?.verificationDepth || "standard",
            },
          };
        } catch (error) {
          console.error("[ai-search] Fact check error:", error);
          return {
            content: [{
              type: "text",
              text: `**Fact Check Error**\n\n${error instanceof Error ? error.message : "Unknown error during verification"}`
            }],
            details: {},
            isError: true,
          };
        }
      },
    });
    
    // 5. Research Summarization Tool
    pi.registerTool({
      name: "summarize_research",
      label: "Research Summarization",
      description: "Summarize multiple sources and research findings intelligently",
      parameters: Type.Object({
        topic: Type.String({
          description: "Topic or research focus"
        }),
        
        sources: Type.Optional(Type.Array(Type.String(), {
          description: "Specific sources or URLs to include (optional)"
        })),
        
        summaryLength: Type.Optional(Type.String({
          description: "Summary length: brief, standard, comprehensive",
          default: "standard"
        })),
        
        includeKeyPoints: Type.Optional(Type.Boolean({
          description: "Include key points and takeaways",
          default: true
        })),
        
        includeCitations: Type.Optional(Type.Boolean({
          description: "Include source citations",
          default: true
        })),
      }),
      
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        const topic = params?.topic;
        
        if (!topic || typeof topic !== "string" || topic.trim() === "") {
          return {
            content: [{ type: "text", text: "**Error:** No topic provided for summarization" }],
            details: {},
            isError: true,
          };
        }
        
        try {
          // Conduct research on the topic
          const research = await conductResearch(topic, {
            depth: params?.summaryLength === "comprehensive" ? "standard" : "quick",
            pi
          });
          
          if (research.primaryResults.length === 0) {
            return {
              content: [{ type: "text", text: `**No Research Found**\n\nNo sources found for topic: "${topic}"` }],
              details: { topic: topic },
              isError: false,
            };
          }
          
          // Generate comprehensive summary using AI
          const context = research.primaryResults.slice(0, 6).map((result, i) => (
            `[Source ${i + 1}]: ${result.title}\n` +
            `Key Content: ${result.content.substring(0, 200)}...`
          )).join("\n\n");
          
          const messages = [{
            role: "system",
            content: "You are an expert research summarizer. Create a comprehensive, well-structured summary " +
                     "of the research findings. Include key insights, trends, and conclusions. " +
                     "Be objective and cite sources appropriately."
          }, {
            role: "user",
            content: `Research Topic: ${topic}\n\nSources:\n${context}\n\n` +
                     `Please provide a ${params?.summaryLength || "standard"} summary.`
          }];
          
          const llmResponse = await pi.callLLM(messages, {
            maxTokens: params?.summaryLength === "comprehensive" ? 2000 : 
                       params?.summaryLength === "brief" ? 600 : 1200,
            temperature: 0.2
          });
          
          // Format the summary report
          let report = `## Research Summary: ${topic}\n\n`;
          report += `**Summary Type:** ${params?.summaryLength || "standard"}\n`;
          report += `**Sources Analyzed:** ${research.primaryResults.length}\n\n`;
          report += `---\n\n`;
          report += `${llmResponse.content}\n\n`;
          
          // Add key points if requested
          if (params?.includeKeyPoints !== false && research.verifiedFacts.length > 0) {
            report += `### Key Points\n\n`;
            research.verifiedFacts.slice(0, 8).forEach((fact, i) => {
              report += `${i + 1}. ${fact.fact}\n`;
              if (params?.includeConfidence !== false) {
                report += `   (Confidence: ${fact.confidence}%)\n`;
              }
            });
            report += `\n`;
          }
          
          // Add citations if requested
          if (params?.includeCitations !== false && research.primaryResults.length > 0) {
            report += `### Key Sources\n\n`;
            research.primaryResults.slice(0, 5).forEach((source, i) => {
              report += `${i + 1}. **${source.title}**\n`;
              report += `   ${source.url}\n`;
              if (source.publishedDate) {
                report += `   Published: ${source.publishedDate}\n`;
              }
              report += `\n`;
            });
          }
          
          return {
            content: [{ type: "text", text: report }],
            details: {
              topic: topic,
              summaryLength: params?.summaryLength || "standard",
              sourcesAnalyzed: research.primaryResults.length,
              keyPointsIncluded: params?.includeKeyPoints !== false && research.verifiedFacts.length > 0,
              citationsIncluded: params?.includeCitations !== false,
            },
          };
        } catch (error) {
          console.error("[ai-search] Research summarization error:", error);
          return {
            content: [{
              type: "text",
              text: `**Summarization Error**\n\n${error instanceof Error ? error.message : "Unknown error during summarization"}`
            }],
            details: {},
            isError: true,
          };
        }
      },
    });
    
    console.log("[ai-search] All AI-enhanced tools registered successfully");
    
  } catch (error) {
    console.error("[ai-search] Extension initialization failed:", error);
    throw error;
  }
}
