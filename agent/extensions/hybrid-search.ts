#!/usr/bin/env node

/**
 * PI Agent Extension: Hybrid Web Search
 * 
 * Intelligently routes queries:
 * - Simple searches → SearXNG (fast, traditional results)
 * - Complex Q&A → AI-powered processing (using SearXNG results + LLM)
 * - Fallback logic if one service fails
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// Configuration
const SEARXNG_BASE = process.env.SEARXNG_BASE_URL || "http://localhost:8080";

// Query classifier - determines which backend to use
function classifyQuery(query: string): "simple" | "complex" {
  const lowerQuery = query.toLowerCase();
  
  // Complex queries (use AI processing)
  const complexPatterns = [
    /^(what|who|when|where|why|how)\s+/i,
    /explain\s+/i,
    /compare\s+/i,
    /difference between/i,
    /best way to/i,
    /tutorial on/i,
    /guide to/i,
    /step by step/i,
    /how to/i,
    /what is/i,
    /why does/i,
    /should i/i,
    /can you/i,
    /\?$/  // Questions ending with ?
  ];
  
  // Check for complex patterns
  for (const pattern of complexPatterns) {
    if (pattern.test(query)) {
      return "complex";
    }
  }
  
  // Check query length and structure
  const words = query.split(/\s+/).length;
  if (words <= 3) {
    return "simple"; // Short queries are usually simple searches
  }
  
  // Default to complex for longer queries
  return "complex";
}

// SearXNG backend
async function searchSearXNG(
  query: string,
  options: any
): Promise<{ results: any[]; numberOfResults: number }> {
  try {
    const response = await fetch(`${SEARXNG_BASE}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        q: query,
        format: "json",
        ...options
      }),
    });
    
    if (!response.ok) {
      throw new Error(`SearXNG error: ${response.status}`);
    }
    
    const data = await response.json();
    return {
      results: data.results || [],
      numberOfResults: data.number_of_results || 0
    };
  } catch (error) {
    console.error("[hybrid-search] SearXNG error:", error);
    throw error;
  }
}

// AI Answer Generator (using LLM)
async function generateAIAnswer(
  query: string, 
  results: any[], 
  pi: ExtensionAPI
): Promise<{ answer: string; citations: any[] }> {
  // Prepare context for LLM
  const context = results.slice(0, 4).map((result, i) => (
    `[Source ${i+1}]: "${result.title}"\n` +
    `Content: ${result.content}\n` +
    `URL: ${result.url}`
  )).join("\n\n");

  // Prepare prompt with results context
  const messages = [{
    role: "system",
    content: "You are an expert researcher. Answer the user's question using the provided sources. " +
             "Cite sources using [number] notation. For each source, include its title as citation text."
  }, {
    role: "user",
    content: `Question: ${query}\n\nSources:\n${context}`
  }];

  // Call LLM to generate answer
  const llmResponse = await pi.callLLM(messages, {
    maxTokens: 1000,
    temperature: 0.3
  });

  return {
    answer: llmResponse.content,
    citations: results.slice(0, 4).map((r, i) => ({
      index: i + 1,
      title: r.title,
      url: r.url
    }))
  };
}

// Hybrid search - intelligently chooses backend
async function hybridSearch(
  query: string, 
  options: any, 
  pi: ExtensionAPI
): Promise<{ result: any; backend: string }> {
  const queryType = classifyQuery(query);
  console.log(`[hybrid-search] Query: "${query}" → Type: ${queryType}`);
  
  try {
    if (queryType === "complex") {
      console.log("[hybrid-search] Using AI processing");
      try {
        // Get search results from SearXNG
        const { results } = await searchSearXNG(query, {
          maxResults: 8
        });
        
        if (results.length === 0) {
          throw new Error("No results found for AI processing");
        }
        
        // Generate AI answer
        const { answer, citations } = await generateAIAnswer(query, results, pi);
        return {
          result: {
            answer,
            citations,
            isAI: true
          },
          backend: "ai"
        };
      } catch (aiError) {
        console.log("[hybrid-search] AI processing failed, falling back to SearXNG");
        // Fallback to SearXNG
        const { results, numberOfResults } = await searchSearXNG(query, options);
        return {
          result: { results, numberOfResults, isAI: false },
          backend: "searxng"
        };
      }
    } else {
      console.log("[hybrid-search] Using SearXNG (simple search)");
      const { results, numberOfResults } = await searchSearXNG(query, options);
      return {
        result: { results, numberOfResults, isAI: false },
        backend: "searxng"
      };
    }
  } catch (error) {
    console.error("[hybrid-search] All backends failed:", error);
    throw error;
  }
}

// Format traditional search results
function formatSearchResults(results: any[], query: string): string {
  if (results.length === 0) {
    return `No results found for "${query}"`;
  }
  
  let response = `Found ${results.length} result(s) for "${query}":\n\n`;
  
  results.forEach((result, index) => {
    response += `${index + 1}. **${result.title}**\n`;
    if (result.content) {
      response += `   ${result.content}\n`;
    }
    response += `   URL: ${result.url}\n`;
    if (result.publishedDate) {
      response += `   Published: ${result.publishedDate}\n`;
    }
    response += "\n";
  });
  
  return response;
}

export default function (pi: ExtensionAPI) {
  console.log("[hybrid-search] Hybrid search extension loading...");
  
  try {
    // Register the main hybrid search tool
    pi.registerTool({
      name: "web_search", // Same name for compatibility
      label: "Hybrid Web Search",
      description: "Intelligent web search using SearXNG and AI processing",
      parameters: Type.Object({
        query: Type.String({ description: "Search query" }),
        category: Type.Optional(Type.String({ 
          description: "Search category: web, news, images, videos",
          default: "web"
        })),
        language: Type.Optional(Type.String({
          description: "Language code (default: en)",
          default: "en"
        })),
        maxResults: Type.Optional(Type.Number({
          description: "Maximum results (SearXNG only)",
          default: 8
        })),
        forceBackend: Type.Optional(Type.String({
          description: "Force backend: auto, searxng, ai",
          default: "auto"
        })),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        const query = params?.query;
        if (!query) {
          return {
            content: [{ type: "text", text: "**Error:** No query provided" }],
            details: {},
            isError: true
          };
        }
        
        try {
          let result;
          let backendUsed = "searxng";
          const forceBackend = params?.forceBackend || "auto";
          
          if (forceBackend === "searxng") {
            const searchResult = await searchSearXNG(query, params);
            result = { 
              results: searchResult.results,
              numberOfResults: searchResult.numberOfResults,
              isAI: false 
            };
          } else if (forceBackend === "ai") {
            const { results } = await searchSearXNG(query, { maxResults: 8 });
            if (results.length === 0) {
              throw new Error("No results found for AI processing");
            }
            const aiResult = await generateAIAnswer(query, results, pi);
            result = { ...aiResult, isAI: true };
            backendUsed = "ai";
          } else {
            const hybridResult = await hybridSearch(query, params, pi);
            result = hybridResult.result;
            backendUsed = hybridResult.backend;
          }
          
          // Format output based on backend
          if (result.isAI) {
            // AI answer format
            let response = `## AI-Generated Answer\n\n`;
            response += `${result.answer}\n\n`;
            
            if (result.citations && result.citations.length > 0) {
              response += `### Sources:\n`;
              result.citations.forEach((cite: any, i: number) => {
                response += `${i + 1}. ${cite.title}\n`;
                if (cite.url) response += `   ${cite.url}\n`;
              });
            }
            
            return {
              content: [{ type: "text", text: response }],
              details: { backend: backendUsed, queryType: "ai" }
            };
          } else {
            // SearXNG traditional results format
            const formatted = formatSearchResults(result.results || [], query);
            return {
              content: [{ type: "text", text: formatted }],
              details: { 
                backend: backendUsed, 
                queryType: "traditional",
                resultCount: result.results?.length,
                totalResults: result.numberOfResults
              }
            };
          }
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `**Search Error**\n\n${error instanceof Error ? error.message : "Unknown error"}`
            }],
            details: {},
            isError: true
          };
        }
      },
    });
    
    console.log("[hybrid-search] Hybrid search tool registered successfully");
    
  } catch (error) {
    console.error("[hybrid-search] Extension initialization failed:", error);
    throw error;
  }
}
