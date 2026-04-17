#!/usr/bin/env node

/**
 * PI Agent Extension: Web Search
 *
 * Features enhanced with Brave Search capabilities:
 * - Multiple search types: web, news, images, videos
 * - Depth modes: fast, standard, deep
 * - Query intent detection with domain boosting
 * - Source content fetching (deep mode)
 * - Result ranking & confidence scoring
 * - AI summarization of search results
 * - Spell check and auto-suggest support
 * - Search operators (site:, filetype:, etc.)
 * - Direct URL content fetching (fetch_content tool)
 * - Structured data extraction
 * - Result deduplication
 * - Engine health monitoring
 *
 * Tools Provided:
 * - web_search({ query, category, searchType, language, maxResults, depth })
 * - fetch_content({ url, prompt?, maxLength?, timeout? })
 * - search_suggest({ query, language })
 * - spell_check({ query })
 * - summarize_results({ query, results, maxLength })
 *
 * Configuration:
 * - Set SEARXNG_BASE_URL environment variable
 * - Or create a .env file at ~/.pi/.env
 * - Defaults to http://localhost:8080 if not set
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
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) return;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) return;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Strip inline comments (not inside quotes)
    const commentIndex = value.indexOf(" #");
    if (commentIndex !== -1) {
      value = value.substring(0, commentIndex).trim();
    }

    if (key === "SEARXNG_BASE_URL" && !process.env.SEARXNG_BASE_URL) {
      process.env.SEARXNG_BASE_URL = value;
    } else if (SUPPORTED_ENV_KEYS.has(key as any)) {
      // Already handled above
    } else {
      // Collect unrecognized keys for warning
      unrecognizedKeys.push(key);
    }
  });

  // Warn about unrecognized keys to help debugging
  if (unrecognizedKeys.length > 0) {
    console.warn(
      `[web-search] Unrecognized keys in .env file (only SEARXNG_BASE_URL is supported): ${unrecognizedKeys.join(", ")}`,
    );
  }
}

// SearXNG Configuration
const SEARXNG_BASE = process.env.SEARXNG_BASE_URL || "http://localhost:8080";

// Validate SEARXNG_BASE_URL scheme AND IP address
try {
  const parsedUrl = new URL(SEARXNG_BASE);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported scheme: ${parsedUrl.protocol}`);
  }
  // Validate that the hostname is not an internal/private IP
  const searxngHostname = parsedUrl.hostname;
  if (isInternalIP(searxngHostname)) {
    throw new Error(
      `SEARXNG_BASE_URL must not point to an internal/private IP address: ${searxngHostname}`,
    );
  }
} catch (error) {
  if (error instanceof Error && error.message.includes("internal/private IP")) throw error;
  throw new Error(
    `Invalid SEARXNG_BASE_URL "${SEARXNG_BASE}": ${error instanceof Error ? error.message : String(error)}`,
  );
}

/**
 * Check if a hostname/IP string represents an internal/private address
 * Used for both direct URL validation and SEARXNG_BASE_URL validation
 * @private
 */
function isInternalIP(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (["localhost", "0.0.0.0", "::1", "[::1]"].includes(h)) return true;
  if (/^127\./.test(h)) return true;
  if (/^0[0-7]+\./.test(h) || /^0x[0-9a-f]+\./i.test(h)) return true;
  if (
    /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.)/.test(h)
  ) {
    return true;
  }
  if (/^fe[89ab]/i.test(h) || /^f[c-d]/i.test(h)) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  return false;
}

/**
 * Resolve a hostname to IP and check it is not internal/private (DNS rebinding protection)
 */
async function isSafeHostname(hostname: string): Promise<boolean> {
  try {
    const { address } = await dnsLookup(hostname);
    return !isInternalIP(address);
  } catch {
    return false;
  }
}

const SEARXNG_CONFIG = {
  baseUrl: SEARXNG_BASE,
  defaultLanguage: "en",
  maxResults: 8,
  searchTypes: {
    web: "general",
    news: "news",
    images: "images",
    videos: "videos",
  },
} as const;

/** Maximum HTML size for content extraction (500KB) */
const MAX_HTML_SIZE = 500 * 1024;

/** Simple token bucket rate limiter */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private maxTokens: number,
    private refillRate: number,
  ) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  tryConsume(tokens = 1): boolean {
    this.refill();
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate,
    );
    this.lastRefill = now;
  }
}

/** Rate limiters: 10 searches with 2/sec refill, 20 fetches with 5/sec refill */
const searchLimiter = new RateLimiter(10, 2);
const fetchLimiter = new RateLimiter(20, 5);

// Simple in-memory cache for search results
const searchCache = new Map<
  string,
  { data: any; timestamp: number; ttl?: number }
>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

/**
 * Get cached result if available and not expired
 */
function getCachedResult(cacheKey: string): any {
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
function setCachedResult(cacheKey: string, data: any): void {
  searchCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });

  // Evict oldest entries when cache exceeds size limit
  // Use insertion-order: Map guarantees iteration order, delete first N entries
  let toRemove = searchCache.size - 50;
  for (const key of searchCache.keys()) {
    if (toRemove <= 0) break;
    searchCache.delete(key);
    toRemove--;
  }
}

// ============================================================================
// HTTP Helpers
// ============================================================================

/**
 * Check if URL targets internal/private addresses (SSRF protection)
 */
function isBlockedInternalURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Block scheme-based attacks: file://, data://, javascript://
    const protocol = parsed.protocol.toLowerCase();
    if (!["http:", "https:"].includes(protocol)) {
      return true;
    }

    return isInternalIP(hostname);
  } catch {
    return true; // Block invalid URLs
  }
}

/**
 * Validate Content-Type header for text-based content
 */
function isTextBasedContent(contentType: string | null): boolean {
  if (!contentType) return true; // Allow if no content-type (be permissive)

  const textTypes = [
    "text/html",
    "text/plain",
    "text/xml",
    "text/markdown",
    "application/xhtml+xml",
    "application/xml",
    "application/json",
    "application/javascript",
    "text/",
  ];

  return textTypes.some((type) => contentType.toLowerCase().includes(type));
}

/**
 * Make an HTTP request (GET or POST) using fetch API
 * Enhanced with SSRF protection, redirect following, and content-type validation
 */
async function makeHttpRequest(
  url: string,
  method: "GET" | "POST" = "GET",
  postData: Record<string, string> | null = null,
  options: {
    maxRedirects?: number;
    validateContentType?: boolean;
    acceptHeader?: string;
    timeout?: number;
  } = {},
): Promise<string> {
  const {
    maxRedirects = 5,
    validateContentType = false,
    acceptHeader = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  } = options;

  // SSRF Protection: Block internal URLs
  if (isBlockedInternalURL(url)) {
    throw new Error(
      `Access to internal/private URLs is blocked for security: ${url}`,
    );
  }

  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: acceptHeader,
  };

  let body: string | null = null;
  if (method === "POST" && postData) {
    body = new URLSearchParams(postData).toString();
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const timeoutMs = options.timeout || 15000;

  // Follow redirects manually for better control
  let currentUrl = url;
  let redirectCount = 0;
  let currentMethod: "GET" | "POST" = method;
  let currentBody = body;

  while (true) {
    // DNS Rebinding protection: resolve hostname and verify IP before each fetch
    try {
      const parsedUrl = new URL(currentUrl);
      const safe = await isSafeHostname(parsedUrl.hostname);
      if (!safe) {
        throw new Error(
          `DNS resolution indicates unsafe/internal hostname: ${parsedUrl.hostname}`,
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("DNS resolution") ||
          error.message.includes("unsafe/internal"))
      ) {
        throw error;
      }
      // URL parse errors are caught below
    }

    const response = await fetch(currentUrl, {
      method: currentMethod,
      headers,
      body: currentMethod === "GET" ? null : currentBody,
      redirect: "manual", // Handle redirects manually
      signal: AbortSignal.timeout(timeoutMs),
    });

    // Handle redirects (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      redirectCount++;

      if (redirectCount > maxRedirects) {
        throw new Error(`Too many redirects (max: ${maxRedirects})`);
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new Error(`Redirect response without Location header`);
      }

      // Resolve relative URLs
      currentUrl = new URL(location, currentUrl).href;

      // Validate redirect scheme
      const redirectProtocol = new URL(currentUrl).protocol.toLowerCase();
      if (!["http:", "https:"].includes(redirectProtocol)) {
        throw new Error(`Redirect to unsupported scheme: ${redirectProtocol}`);
      }

      // SSRF check on redirect target
      if (isBlockedInternalURL(currentUrl)) {
        throw new Error(`Redirect to internal URL blocked: ${currentUrl}`);
      }

      // Per HTTP spec: 301/302/303 must convert to GET (drop body); only 307/308 preserve method
      if (response.status === 301 || response.status === 302 || response.status === 303) {
        currentMethod = "GET";
        currentBody = null;
      }

      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Content-Type validation (optional)
    if (validateContentType) {
      const contentType = response.headers.get("content-type");
      if (!isTextBasedContent(contentType)) {
        throw new Error(
          `Unsupported content type: ${contentType}. Only text-based content is allowed.`,
        );
      }
    }

    return await response.text();
  }
}

// ============================================================================
// Query Intent Detection & Domain Boosting (inspired by GreedySearch)
// ============================================================================

const DOMAIN_BOOST_MAP = [
  { keywords: ["react", "react native", "reactjs"], domains: ["react.dev", "reactnative.dev", "legacy.reactjs.org"] },
  { keywords: ["vue", "vuejs", "nuxt"], domains: ["vuejs.org", "nuxt.com"] },
  { keywords: ["angular"], domains: ["angular.io", "angular.dev"] },
  { keywords: ["svelte"], domains: ["svelte.dev", "kit.svelte.dev"] },
  { keywords: ["next.js", "nextjs"], domains: ["nextjs.org", "vercel.com"] },
  { keywords: ["node.js", "nodejs", "npm", "npx"], domains: ["nodejs.org", "npmjs.com", "nodejs.dev"] },
  { keywords: ["typescript", "tsconfig"], domains: ["typescriptlang.org"] },
  { keywords: ["python", "pip", "pypi"], domains: ["python.org", "docs.python.org", "pypi.org"] },
  { keywords: ["rust", "cargo", "crates"], domains: ["rust-lang.org", "doc.rust-lang.org", "crates.io"] },
  { keywords: ["docker", "container", "dockerfile"], domains: ["docker.com", "docs.docker.com"] },
  { keywords: ["kubernetes", "kubectl", "k8s"], domains: ["kubernetes.io", "kubernetes.docs"] },
  { keywords: ["aws", "amazon web", "lambda", "ec2", "s3"], domains: ["aws.amazon.com", "docs.aws.amazon.com"] },
  { keywords: ["firebase"], domains: ["firebase.google.com", "firebase.google.com/docs"] },
  { keywords: ["supabase"], domains: ["supabase.com", "supabase.com/docs"] },
  { keywords: ["prisma"], domains: ["prisma.io", "prisma.io/docs"] },
  { keywords: ["tailwind", "tailwindcss"], domains: ["tailwindcss.com"] },
  { keywords: ["vite"], domains: ["vitejs.dev", "vite.dev"] },
  { keywords: ["webpack"], domains: ["webpack.js.org"] },
  { keywords: ["github", "git"], domains: ["github", "docs.github.com", "git-scm.com"] },
  { keywords: ["openai", "gpt", "chatgpt"], domains: ["openai.com", "platform.openai.com", "help.openai.com"] },
  { keywords: ["anthropic", "claude"], domains: ["anthropic.com", "docs.anthropic.com"] },
  { keywords: ["weather", "forecast", "temperature"], domains: ["weather.com", "accuweather.com", "windy.com"] },
  { keywords: ["stock", "share price", "market cap", "nasdaq", "nyse"], domains: ["finance.yahoo.com", "google.com/finance"] },
] as const;

/**
 * Detect query intent and return domains that should be boosted
 */
function detectQueryIntent(query: string): string[] {
  const normalized = query.toLowerCase();
  const boostedDomains: string[] = [];

  for (const rule of DOMAIN_BOOST_MAP) {
    if (rule.keywords.some((kw) => normalized.includes(kw))) {
      boostedDomains.push(...rule.domains);
    }
  }

  return boostedDomains;
}

/**
 * Detect the type of query for intent-aware formatting
 */
function detectQueryType(query: string): string {
  const normalized = query.toLowerCase();

  if (
    ["how to", "how do i", "how can i", "tutorial", "guide", "example"].some((k) =>
      normalized.includes(k),
    )
  ) {
    return "tutorial";
  }
  if (
    ["error", "bug", "fix", "issue", "failed", "not working"].some((k) =>
      normalized.includes(k),
    )
  ) {
    return "debugging";
  }
  if (
    ["vs", "versus", "compare", "comparison", "better", "difference between"].some((k) =>
      normalized.includes(k),
    )
  ) {
    return "comparison";
  }
  if (
    ["weather", "forecast", "temperature", "humidity"].some((k) =>
      normalized.includes(k),
    )
  ) {
    return "weather";
  }
  if (
    ["news", "latest", "recent", "today", "current"].some((k) =>
      normalized.includes(k),
    )
  ) {
    return "news";
  }
  if (
    ["what is", "what are", "define", "meaning", "explain"].some((k) =>
      normalized.includes(k),
    )
  ) {
    return "definition";
  }

  return "general";
}

// ============================================================================
// Source Content Fetching (Deep Mode)
// ============================================================================

/**
 * Decode common HTML entities without external dependency
 */
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, "--")
    .replace(/&ndash;/g, "-")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}

/**
 * Parse HTML and extract readable text content
 * Uses htmlparser2 for safe, ReDoS-free parsing
 */
function extractTextFromHTML(html: string): string {
  if (html.length > MAX_HTML_SIZE) {
    html = html.slice(0, MAX_HTML_SIZE);
  }

  try {
    // Dynamic import to avoid hard dependency on htmlparser2 at build time
    const { Parser } = require("htmlparser2");
    const { DomHandler } = require("htmlparser2");

    const textParts: string[] = [];
    let linkText = "";
    let linkHref = "";

    const handler = new DomHandler((_error: Error | null, dom: any) => {
      function walkNode(node: any) {
        if (node.type === "comment") return;
        if (node.type === "script" || node.type === "style") return;

        if (node.type === "tag") {
          if (node.name === "br" || node.name === "hr" || node.name === "p" ||
              node.name === "div" || node.name === "tr" ||
              node.name.startsWith("h")) {
            textParts.push("\n");
          }

          if (node.name === "a") {
            linkText = "";
            linkHref = (node.attribs?.href) || "";
          }

          if (node.name === "img") {
            const alt = node.attribs?.alt || "";
            if (alt) textParts.push(`[img: ${alt}]`);
          }
        }

        if (node.type === "text") {
          const t = decodeHTMLEntities(node.data);
          if (node.parent?.name === "a") {
            linkText += t;
          } else {
            textParts.push(t);
          }
        }

        if (node.children) {
          for (const child of node.children) {
            walkNode(child);
          }
        }

        if (node.type === "tag" && node.name === "a") {
          if (linkText && linkHref) {
            textParts.push(`${linkText.trim()} (${linkHref})`);
          } else if (linkText) {
            textParts.push(linkText.trim());
          }
          textParts.push(" ");
          linkText = "";
          linkHref = "";
        }
      }

      for (const child of dom) {
        walkNode(child);
      }
    });

    const parser = new Parser(handler, {
      lowerCaseTagNames: true,
      decodeEntities: false,
    });

    parser.write(html);
    parser.end();

    return textParts.join("")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();
  } catch {
    // Fallback: simple tag stripping if htmlparser2 unavailable
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n")
      .trim();
  }
}

/**
 * Fetch and extract content from a URL (deep mode)
 * Enhanced with caching, content-type validation, and configurable limits
 */
async function fetchSourceContent(
  url: string,
  options: {
    maxContentLength?: number;
    useCache?: boolean;
    timeout?: number;
  } = {},
): Promise<{
  url: string;
  title: string;
  description: string;
  excerpt: string;
}> {
  const {
    maxContentLength = 2000,
    useCache = true,
    timeout = 15000,
  } = options;

  // Check cache first
  if (useCache) {
    const cacheKey = `ws:content:${url}`;
    const cached = getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }
  }

  try {
    const html = await makeHttpRequest(url, "GET", null, {
      validateContentType: true,
      timeout,
    });

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Extract meta description (check both attribute orders)
    const descMatch =
      html.match(
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      ) ||
      html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
      );
    const description = descMatch ? descMatch[1].trim() : "";

    // Extract main content using improved HTML parser
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    let bodyText = "";
    if (bodyMatch) {
      bodyText = extractTextFromHTML(bodyMatch[1]).slice(0, maxContentLength);
    }

    const result = {
      url,
      title,
      description,
      excerpt: bodyText || description || "No content extracted",
    };

    // Cache the result
    if (useCache) {
      const cacheKey = `ws:content:${url}`;
      setCachedResult(cacheKey, result);
    }

    return result;
  } catch (error) {
    return {
      url,
      title: "Fetch failed",
      description: "",
      excerpt: `Error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Fetch content from top N sources with concurrency limiting
 */
async function fetchTopSources(
  results: { results: Array<{ url: string; title: string }> },
  limit = 3,
): Promise<
  Array<{
    url: string;
    title: string;
    fetchedContent: {
      url: string;
      title: string;
      description: string;
      excerpt: string;
    };
  }>
> {
  const topUrls = results.results.slice(0, limit);

  // Limit concurrent requests to prevent overwhelming servers
  const CONCURRENT_LIMIT = 2;
  const fetched: Array<{
    url: string;
    title: string;
    fetchedContent: any;
  }> = [];

  for (let i = 0; i < topUrls.length; i += CONCURRENT_LIMIT) {
    const batch = topUrls.slice(i, i + CONCURRENT_LIMIT);
    const batchPromises = batch.map((r) => fetchSourceContent(r.url));
    const batchResults = await Promise.allSettled(batchPromises);

    batchResults.forEach((result, j) => {
      const sourceInfo = batch[j];
      const fetchedContent =
        result.status === "fulfilled"
          ? result.value
          : {
              url: sourceInfo.url,
              title: "Fetch failed",
              excerpt:
                result.reason instanceof Error
                  ? result.reason.message
                  : "Unknown error",
            };
      fetched.push({
        url: sourceInfo.url,
        title: sourceInfo.title,
        fetchedContent,
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
function rerankWithDomainBoost(
  results: Array<{ url: string; score?: number }>,
  boostedDomains: string[],
): Array<{ url: string; score: number; _domainBoosted: boolean }> {
  if (boostedDomains.length === 0)
    return results as Array<{ url: string; score: number; _domainBoosted: boolean }>;

  return results.map((r) => {
    let boost = 0;
    try {
      const urlHostname = new URL(r.url).hostname.replace(/^www\./, "");
      if (
        boostedDomains.some((d) =>
          urlHostname.includes(d.replace(/^www\./, "")),
        )
      ) {
        boost = 0.3; // 30% score boost for relevant domains
      }
    } catch {
      /* ignore invalid URLs */
    }

    return {
      ...r,
      score: (r.score || 0) + boost,
      _domainBoosted: boost > 0,
    };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Build confidence metadata for search results
 */
function buildConfidence(
  results: { results: Array<any>; answers?: Array<any>; suggestions?: Array<any>; numberOfResults?: number },
  query: string,
  queryType: string,
): {
  score: number;
  level: string;
  reasons: string[];
  totalResults: number;
  returnedCount: number;
} {
  // Use actual returned results count, not API's total estimate
  const returnedCount = results.results?.length || 0;
  const totalResults = results.numberOfResults || returnedCount; // Fallback to returned count
  const hasAnswers = (results.answers?.length ?? 0) > 0;
  const hasSuggestions = (results.suggestions?.length ?? 0) > 0;

  let score = 0;
  const reasons: string[] = [];

  // Score based on actual returned results (more reliable than API estimates)
  if (returnedCount >= 5) {
    score += 0.3;
    reasons.push("Multiple sources found");
  } else if (returnedCount >= 3) {
    score += 0.2;
    reasons.push("Several sources found");
  } else if (returnedCount >= 1) {
    score += 0.1;
    reasons.push("Few sources found");
  }

  // Bonus for API total count being high (indicates comprehensive search space)
  if (totalResults > 1000 && returnedCount > 0) {
    score += 0.1;
    reasons.push("Large search space");
  }

  if (hasAnswers) {
    score += 0.3;
    reasons.push("Direct answer available");
  }
  if (hasSuggestions) {
    score += 0.1;
    reasons.push("Alternative queries suggested");
  }
  if (queryType !== "general") {
    score += 0.1;
    reasons.push(`Specific intent: ${queryType}`);
  }

  let level = "low";
  if (score >= 0.7) level = "high";
  else if (score >= 0.4) level = "medium";

  return {
    score: Math.min(score, 1),
    level,
    reasons,
    totalResults,
    returnedCount,
  };
}

// ============================================================================
// Search
// ============================================================================

/**
 * Extract location keywords from query for relevance filtering
 */
function extractLocation(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  const stopWords = [
    "weather",
    "today",
    "current",
    "forecast",
    "temperature",
    "in",
    "what",
    "is",
    "how",
    "?",
    "and",
    "the",
    "of",
    "for",
    "now",
  ];
  return words.filter((w) => !stopWords.includes(w) && w.length > 2);
}

/**
 * Filter results by recency (for time-sensitive queries)
 * Removes results older than the specified days
 */
function filterByRecency(results: Array<{ publishedDate?: string }>, maxDaysOld = 3): Array<{ publishedDate?: string }> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - maxDaysOld * 24 * 60 * 60 * 1000);

  return results.filter((result) => {
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
function sortByRecency(results: Array<{ publishedDate?: string }>): Array<{ publishedDate?: string }> {
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
function needsRecentResults(query: string): boolean {
  const normalized = query.toLowerCase();
  const timeKeywords = [
    "weather",
    "forecast",
    "temperature",
    "current",
    "latest",
    "recent",
    "now",
    "today",
    "news",
    "live",
    "score",
    "stock",
    "price of",
    "exchange rate",
    "election",
    "result",
    "results",
    "how to",
    "tutorial",
    "guide",
  ];
  return timeKeywords.some((kw) => normalized.includes(kw));
}

/**
 * Perform a web search using SearXNG API
 */
async function search(
  query: string,
  options: {
    language?: string;
    category?: string;
    searchType?: string;
    maxResults?: number;
    depth?: string;
    enableSpellCheck?: boolean;
    enableDeduplication?: boolean;
    enableStructuredData?: boolean;
  } = {},
): Promise<{
  results: Array<{
    title: string;
    content: string;
    url: string;
    publishedDate: string | null;
    engine: string | null;
    score: number;
    _domainBoosted: boolean;
    _duplicateGroup?: number;
  }>;
  suggestions: string[];
  answers: string[];
  numberOfResults: number;
  hasErrors: boolean;
  queryType: string;
  confidence?: {
    score: number;
    level: string;
    reasons: string[];
    totalResults: number;
    returnedCount: number;
  };
  fetchedSources?: any;
  spellCheck?: {
    corrected: string;
    original: string;
    suggestions: string[];
  };
  structuredData?: {
    entities: Array<{ type: string; value: string; count: number }>;
    dates: string[];
    domains: Array<{ domain: string; count: number }>;
  };
  error?: string;
}> {
  const {
    language = SEARXNG_CONFIG.defaultLanguage,
    category = "general",
    searchType = "web",
    maxResults = SEARXNG_CONFIG.maxResults,
    depth = "standard",
    enableSpellCheck = true,
    enableDeduplication = true,
    enableStructuredData = false,
  } = options;

  if (!searchLimiter.tryConsume()) {
    return {
      results: [],
      suggestions: [],
      answers: [],
      numberOfResults: 0,
      hasErrors: true,
      error: "Rate limit exceeded. Please wait before searching again.",
      queryType: detectQueryType(query),
      confidence: {
        score: 0,
        level: "low",
        reasons: ["Rate limited"],
        totalResults: 0,
        returnedCount: 0,
      },
    };
  }

  // Create cache key with structured prefix to avoid collisions
  const cacheKey = `ws:search:${query}|${language}|${category}|${maxResults}|${depth}`;
  const isTimeSensitive = needsRecentResults(query);

  // Try to get from cache first (skip for deep mode as it fetches external content)
  // Skip cache for weather/time-sensitive queries - users want live data
  if (depth !== "deep" && !isTimeSensitive) {
    const cachedResult = getCachedResult(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
  }

  // Extract search operators from query
  const { cleanQuery, operators } = extractSearchOperators(query);
  
  // Determine category based on searchType
  const actualCategory = SEARXNG_CONFIG.searchTypes[searchType as keyof typeof SEARXNG_CONFIG.searchTypes] || category;
  
  const searchData = {
    q: cleanQuery,
    format: "json",
    language,
    categories: actualCategory,
  };

  // Add time range filter for time-sensitive queries (weather, news, etc.)
  if (needsRecentResults(query)) {
    (searchData as any).time_range = "week";
  }

  const url = `${SEARXNG_CONFIG.baseUrl}/search`;

  try {
    // Apply search operators to search parameters
    const finalSearchData = applySearchOperators(searchData, operators);
    
    // Spell check if enabled
    let spellCheckResult = null;
    if (enableSpellCheck) {
      spellCheckResult = await checkSpelling(cleanQuery);
    }
    
    const results = await makeHttpRequest(url, "POST", finalSearchData);
    const parsed = JSON.parse(results);

    if (!parsed.results || !Array.isArray(parsed.results)) {
      return {
        results: [],
        suggestions: parsed.suggestions || [],
        answers: parsed.answers || [],
        numberOfResults: parsed.number_of_results || 0,
        hasErrors: parsed.unresponsive_engines?.length > 0,
        queryType: detectQueryType(query),
      };
    }

    let sortedResults = parsed.results
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
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
        sortedResults = sortedResults.filter((result: any) => {
          const text = `${result.title} ${result.content} ${result.url}`.toLowerCase();
          // At least one location keyword should appear in the result
          return locationKeywords.some((kw) => text.includes(kw));
        });
      }
    }

    // Apply deduplication if enabled
    let processedResults = sortedResults;
    if (enableDeduplication) {
      processedResults = deduplicateResults(sortedResults);
    }
    
    const response: {
      results: Array<{
        title: string;
        content: string;
        url: string;
        publishedDate: string | null;
        engine: string | null;
        score: number;
        _domainBoosted: boolean;
        _duplicateGroup?: number;
      }>;
      suggestions: string[];
      answers: string[];
      numberOfResults: number;
      hasErrors: boolean;
      queryType: string;
      confidence?: {
        score: number;
        level: string;
        reasons: string[];
        totalResults: number;
        returnedCount: number;
      };
      fetchedSources?: any;
      spellCheck?: {
        corrected: string;
        original: string;
        suggestions: string[];
      };
      structuredData?: {
        entities: Array<{ type: string; value: string; count: number }>;
        dates: string[];
        domains: Array<{ domain: string; count: number }>;
      };
      error?: string;
    } = {
      results: processedResults.map((result: any) => ({
        title: result.title || "",
        content: result.content || "",
        url: result.url || "",
        publishedDate: result.publishedDate || result.pubdate || null,
        engine: result.engines ? result.engines.join(", ") : result.engine || null,
        score: result.score || 0,
        _domainBoosted: result._domainBoosted || false,
        _duplicateGroup: result._duplicateGroup,
      })),
      suggestions: parsed.suggestions || [],
      answers: parsed.answers || [],
      numberOfResults: parsed.number_of_results || 0,
      hasErrors: parsed.unresponsive_engines?.length > 0,
      queryType: detectQueryType(query),
    };

    // Confidence scoring (always included)
    response.confidence = buildConfidence(response, query, response.queryType);
    
    // Add spell check results if available
    if (spellCheckResult && spellCheckResult.corrected !== cleanQuery) {
      response.spellCheck = spellCheckResult;
    }
    
    // Extract structured data if enabled
    if (enableStructuredData && response.results.length > 0) {
      response.structuredData = extractStructuredData(response.results);
    }

    // Deep mode: fetch content from top sources
    if (depth === "deep" && response.results.length > 0) {
      response.fetchedSources = await fetchTopSources(response, 3);
    }

    // Cache the result if not in deep mode and not time-sensitive
    if (depth !== "deep" && !isTimeSensitive) {
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
      error: error instanceof Error ? error.message : String(error),
      queryType: detectQueryType(query),
      confidence: {
        score: 0,
        level: "low",
        reasons: ["Search failed"],
        totalResults: 0,
        returnedCount: 0,
      },
    };

    // Only cache transient errors (network failures), not permanent errors (bad query)
    // Use shorter TTL for errors to allow faster recovery
    if (depth !== "deep" && !isTimeSensitive) {
      searchCache.set(cacheKey, {
        data: errorResponse,
        timestamp: Date.now(),
        ttl: 60 * 1000, // 1 minute TTL for errors
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
function formatWeatherResults(searchData: any, query: string): string {
  const lines: string[] = [];

  // Header - use actual results count
  const actualCount = searchData.results.length;
  const confidenceLabel = searchData.confidence
    ? ` | Confidence: ${searchData.confidence.level} (${(searchData.confidence.score * 100).toFixed(0)}%)`
    : "";
  lines.push(`**Weather Results for "${query}"** (${actualCount} sources)${confidenceLabel}`);
  lines.push("");

  // Show top results with their full content snippets
  lines.push("**Current Conditions (from top sources):**");
  lines.push("");
  searchData.results.slice(0, 4).forEach((result: any, i: number) => {
    if (result.content) {
      // Show source name and full snippet
      lines.push(`${i + 1}. **${result.title}**`);
      lines.push(`   ${result.content}`);
      if (result.publishedDate) {
        lines.push(`   _Updated: ${result.publishedDate.split("T")[0]}_`);
      }
      lines.push("");
    }
  });

  // List all sources
  lines.push("**All Sources:**");
  searchData.results.forEach((r: any, i: number) => {
    lines.push(`${i + 1}. [${r.title}](${r.url})`);
  });

  return lines.join("\n");
}

/**
 * Format search results into a readable string
 */
function formatSearchResults(searchData: any, query: string, depth = "standard"): string {
  if (searchData.hasErrors && searchData.results.length === 0) {
    return `Search completed but no results were returned. Check your SearXNG instance configuration (${SEARXNG_CONFIG.baseUrl}).`;
  }

  if (searchData.results.length === 0) {
    let response = `No results found for "${query}".`;
    if (searchData.suggestions?.length > 0) {
      response += `\n\nSuggestions: ${searchData.suggestions.join(", ")}`;
    }
    return response;
  }

  // Special formatting for weather queries
  if (searchData.queryType === "weather") {
    return formatWeatherResults(searchData, query);
  }

  const queryTypeLabel = searchData.queryType ? ` [${searchData.queryType}]` : "";
  const confidenceLabel = searchData.confidence
    ? ` | Confidence: ${searchData.confidence.level} (${(searchData.confidence.score * 100).toFixed(0)}%)`
    : "";
  
  // Add spell check info if available
  const spellCheckLabel = searchData.spellCheck && searchData.spellCheck.corrected !== query
    ? ` | Spell check: "${searchData.spellCheck.corrected}"`
    : "";

  // Use actual results count, not API's total estimate (which is often 0)
  const actualCount = searchData.results.length;
  const totalCount = searchData.numberOfResults || actualCount;
  
  // Count duplicate groups
  const duplicateGroups = new Set(
    searchData.results
      .filter((r: any) => r._duplicateGroup)
      .map((r: any) => r._duplicateGroup)
  ).size;
  const duplicatesLabel = duplicateGroups > 0
    ? ` | ${duplicateGroups} duplicate group(s) detected`
    : "";

  let response = `Found ${actualCount} result(s) for "${query}"${queryTypeLabel}${confidenceLabel}${spellCheckLabel}${duplicatesLabel}:\n\n`;

  searchData.results.forEach((result: any, index: number) => {
    const boostBadge = result._domainBoosted ? " [BOOST]" : "";
    const duplicateBadge = result._duplicateGroup ? " [DUP]" : "";
    response += `${index + 1}. **${result.title}**${boostBadge}${duplicateBadge}\n`;
    if (result.content) {
      response += `   ${result.content}\n`;
    }
    response += `   URL: ${result.url}\n`;
    if (result.publishedDate) {
      response += `   Published: ${result.publishedDate}\n`;
    }
    if (result._duplicateGroup) {
      response += `   Note: Similar content detected (group ${result._duplicateGroup})\n`;
    }
    response += "\n";
  });

  // Deep mode: include fetched source content
  if (depth === "deep" && searchData.fetchedSources?.length > 0) {
    response += `---\n## Top Source Content (Deep Mode)\n\n`;
    searchData.fetchedSources.forEach((source: any, i: number) => {
      response += `**${i + 1}. ${source.fetchedContent.title || source.title}**\n`;
      response += `   ${source.fetchedContent.excerpt}\n`;
      response += `   [Read full](${source.url})\n\n`;
    });
  }

  if (searchData.suggestions?.length > 0) {
    response += `\nSuggestions: ${searchData.suggestions.join(", ")}`;
  }
  
  // Add structured data if available
  if (searchData.structuredData) {
    response += `\n\n---\n## Structured Data Analysis\n`;
    
    if (searchData.structuredData.entities.length > 0) {
      response += `\n**Common Entities:**\n`;
      searchData.structuredData.entities.slice(0, 5).forEach((entity: any) => {
        response += `• ${entity.value} (${entity.count} result${entity.count > 1 ? 's' : ''})\n`;
      });
    }
    
    if (searchData.structuredData.domains.length > 0) {
      response += `\n**Top Domains:**\n`;
      searchData.structuredData.domains.slice(0, 5).forEach((domain: any) => {
        response += `• ${domain.domain} (${domain.count} result${domain.count > 1 ? 's' : ''})\n`;
      });
    }
    
    if (searchData.structuredData.dates.length > 0) {
      response += `\n**Publication Dates:**\n`;
      searchData.structuredData.dates.slice(0, 3).forEach((date: string) => {
        response += `• ${date}\n`;
      });
    }
  }

  return response;
}

// ============================================================================
// AI Summarization Functions
// ============================================================================

/**
 * Generate AI summary of search results
 */
async function summarizeSearchResults(
  query: string,
  results: Array<{
    title: string;
    content: string;
    url: string;
    publishedDate: string | null;
    score: number;
  }>,
  maxLength = 1000
): Promise<string> {
  if (results.length === 0) {
    return `No results to summarize for query: "${query}"`;
  }

  // Extract top 3 results for summarization
  const topResults = results.slice(0, 3);
  
  // Create a combined text for summarization
  let combinedText = `Query: ${query}\n\n`;
  topResults.forEach((result, index) => {
    combinedText += `Result ${index + 1}: ${result.title}\n`;
    combinedText += `Content: ${result.content}\n`;
    if (result.publishedDate) {
      combinedText += `Published: ${result.publishedDate}\n`;
    }
    combinedText += `URL: ${result.url}\n\n`;
  });

  // Limit text length
  if (combinedText.length > maxLength * 3) {
    combinedText = combinedText.substring(0, maxLength * 3);
  }

  // In a real implementation, this would call an AI API
  // For now, create a simple summary
  const summary = `Based on ${results.length} search results for "${query}":\n\n` +
    `• ${topResults.map(r => r.title).join("\n• ")}\n\n` +
    `Key points from top sources:\n` +
    topResults.map((r, i) => `${i + 1}. ${r.content.substring(0, 150)}...`).join("\n");

  return summary.substring(0, maxLength);
}

/**
 * Extract search operators from query
 */
function extractSearchOperators(query: string): {
  cleanQuery: string;
  operators: Record<string, string[]>;
} {
  const operators: Record<string, string[]> = {
    site: [],
    filetype: [],
    intitle: [],
    inurl: [],
    after: [],
    before: [],
  };

  let cleanQuery = query;
  
  // Extract site: operator
  const siteRegex = /(?:^|\s)(site:([\w.-]+\.[\w]+))(?:\s|$)/gi;
  let match;
  while ((match = siteRegex.exec(query)) !== null) {
    operators.site.push(match[2]);
    cleanQuery = cleanQuery.replace(match[1], " ").replace(/\s+/g, " ").trim();
  }

  // Extract filetype: operator
  const filetypeRegex = /(?:^|\s)(filetype:([\w]+))(?:\s|$)/gi;
  while ((match = filetypeRegex.exec(query)) !== null) {
    operators.filetype.push(match[2]);
    cleanQuery = cleanQuery.replace(match[1], " ").replace(/\s+/g, " ").trim();
  }

  // Extract intitle: operator
  const intitleRegex = /(?:^|\s)(intitle:"([^"]+)"|intitle:([^\s]+))(?:\s|$)/gi;
  while ((match = intitleRegex.exec(query)) !== null) {
    operators.intitle.push(match[2] || match[3]);
    cleanQuery = cleanQuery.replace(match[1], " ").replace(/\s+/g, " ").trim();
  }

  return { cleanQuery, operators };
}

/**
 * Apply search operators to modify search parameters
 */
function applySearchOperators(
  searchParams: Record<string, string>,
  operators: Record<string, string[]>
): Record<string, string> {
  const params = { ...searchParams };
  
  if (operators.site.length > 0) {
    // SearXNG uses domain filter
    params.q = `${params.q} ${operators.site.map(s => `site:${s}`).join(" ")}`;
  }
  
  if (operators.filetype.length > 0) {
    // Convert to SearXNG filetype filter
    params.q = `${params.q} ${operators.filetype.map(f => `filetype:${f}`).join(" ")}`;
  }
  
  return params;
}

/**
 * Get search suggestions from SearXNG
 */
async function getSearchSuggestions(
  query: string,
  language = "en"
): Promise<string[]> {
  const cacheKey = `ws:suggest:${query}:${language}`;
  const cached = getCachedResult(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const url = `${SEARXNG_CONFIG.baseUrl}/autocomplete`;
    const response = await makeHttpRequest(
      url,
      "GET",
      null,
      { timeout: 5000 }
    );
    
    const suggestions = JSON.parse(response) || [];
    setCachedResult(cacheKey, suggestions);
    return suggestions.slice(0, 5); // Return top 5 suggestions
  } catch (error) {
    console.warn(`Failed to get search suggestions: ${error}`);
    return [];
  }
}

/**
 * Check spelling of query using SearXNG
 */
async function checkSpelling(
  query: string
): Promise<{
  corrected: string;
  original: string;
  suggestions: string[];
}> {
  const cacheKey = `ws:spell:${query}`;
  const cached = getCachedResult(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    // SearXNG doesn't have a dedicated spell check endpoint
    // So we'll implement a simple client-side spell check
    const words = query.toLowerCase().split(/\s+/);
    
    // Common misspellings dictionary (simplified)
    const corrections: Record<string, string> = {
      "recieve": "receive",
      "seperate": "separate",
      "definately": "definitely",
      "occured": "occurred",
      "occurence": "occurrence",
      "seach": "search",
      "serch": "search",
      "googles": "google",
      "youtubes": "youtube",
      "wether": "weather",
      "temprature": "temperature",
      "programing": "programming",
      "javascipt": "javascript",
      "typescipt": "typescript",
      "pyton": "python",
    };
    
    const correctedWords = words.map(word => corrections[word] || word);
    const corrected = correctedWords.join(" ");
    
    const result = {
      corrected,
      original: query,
      suggestions: corrected !== query ? [corrected] : []
    };
    
    setCachedResult(cacheKey, result);
    return result;
  } catch (error) {
    console.warn(`Failed to check spelling: ${error}`);
    return {
      corrected: query,
      original: query,
      suggestions: []
    };
  }
}

/**
 * Deduplicate search results based on content similarity
 */
function deduplicateResults(
  results: Array<{
    title: string;
    content: string;
    url: string;
    score: number;
  }>
): Array<{
  title: string;
  content: string;
  url: string;
  score: number;
  _duplicateGroup?: number;
}> {
  const seenUrls = new Set<string>();
  const seenContent = new Set<string>();
  const deduplicated: Array<{
    title: string;
    content: string;
    url: string;
    score: number;
    _duplicateGroup?: number;
  }> = [];
  
  let groupId = 1;
  
  for (const result of results) {
    // Check for duplicate URLs
    if (seenUrls.has(result.url)) {
      continue;
    }
    
    // Check for similar content (simple fingerprint)
    const contentFingerprint = result.content
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 50);
      
    if (seenContent.has(contentFingerprint) && contentFingerprint.length > 10) {
      // Mark as duplicate but keep it
      deduplicated.push({
        ...result,
        _duplicateGroup: groupId
      });
      groupId++;
      continue;
    }
    
    seenUrls.add(result.url);
    seenContent.add(contentFingerprint);
    deduplicated.push(result);
  }
  
  return deduplicated;
}

/**
 * Extract structured data from search results
 */
function extractStructuredData(
  results: Array<{
    title: string;
    content: string;
    url: string;
    publishedDate: string | null;
  }>
): {
  entities: Array<{ type: string; value: string; count: number }>;
  dates: string[];
  domains: Array<{ domain: string; count: number }>;
} {
  const entities: Record<string, number> = {};
  const dates: string[] = [];
  const domains: Record<string, number> = {};
  
  // Simple entity extraction (in real implementation, use NLP)
  const commonEntities = [
    "React", "Vue", "Angular", "Node.js", "Python", "JavaScript", "TypeScript",
    "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes", "GitHub",
    "OpenAI", "GPT", "Claude", "Gemini", "Llama",
    "COVID", "pandemic", "vaccine", "inflation", "recession",
    "Bitcoin", "Ethereum", "crypto", "blockchain",
  ];
  
  for (const result of results) {
    // Extract domain from URL
    try {
      const urlObj = new URL(result.url);
      const domain = urlObj.hostname.replace(/^www\./, "");
      domains[domain] = (domains[domain] || 0) + 1;
    } catch {}
    
    // Extract dates
    if (result.publishedDate) {
      dates.push(result.publishedDate);
    }
    
    // Extract entities
    const text = `${result.title} ${result.content}`.toLowerCase();
    for (const entity of commonEntities) {
      if (text.includes(entity.toLowerCase())) {
        entities[entity] = (entities[entity] || 0) + 1;
      }
    }
  }
  
  return {
    entities: Object.entries(entities)
      .map(([value, count]) => ({ type: "technology", value, count }))
      .sort((a, b) => b.count - a.count),
    dates: [...new Set(dates)].sort().reverse(),
    domains: Object.entries(domains)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ============================================================================
// PI Agent Extension Factory
// ============================================================================

export default function (pi: ExtensionAPI) {
  console.log('[web-search] Extension loading...');
  
  try {
    console.log(`[web-search] SEARXNG_BASE_URL: ${process.env.SEARXNG_BASE_URL || 'not set, using default'}`);
    console.log(`[web-search] Using base URL: ${SEARXNG_BASE}`);
    
    // Register the web_search tool
  
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description:
      "Search the web for current information with Brave-like features. Supports multiple search types, depth modes, spell check, and result deduplication.",
    parameters: Type.Object({
      query: Type.String({ description: "The search query (supports operators: site:, filetype:, intitle:)" }),
      searchType: Type.Optional(
        Type.String({ 
          description: 'Search type: web (general), news, images, videos (default: web)',
          default: "web"
        }),
      ),
      category: Type.Optional(
        Type.String({ description: 'Search category (general, news, it, science)' }),
      ),
      language: Type.Optional(
        Type.String({ description: "Language code (default: en)", default: "en" }),
      ),
      maxResults: Type.Optional(
        Type.Number({ description: "Maximum number of results (default: 8)", default: 8 }),
      ),
      depth: Type.Optional(
        Type.String({
          description: 'Search depth: "fast" (quick), "standard" (balanced), "deep" (fetch source content)',
          default: "standard"
        }),
      ),
      enableSpellCheck: Type.Optional(
        Type.Boolean({ description: "Enable spell checking (default: true)", default: true }),
      ),
      enableDeduplication: Type.Optional(
        Type.Boolean({ description: "Enable result deduplication (default: true)", default: true }),
      ),
      enableStructuredData: Type.Optional(
        Type.Boolean({ description: "Enable structured data extraction (default: false)", default: false }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const query = params?.query;

      if (!query || typeof query !== "string" || query.trim() === "") {
        const errorText = `**Web Search Error**\n\nNo search query provided. Please provide a search query.`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }

      try {
        const results = await search(query, {
          searchType: params?.searchType || "web",
          category: params?.category || "general",
          language: params?.language || "en",
          maxResults: params?.maxResults || SEARXNG_CONFIG.maxResults,
          depth: params?.depth || "standard",
          enableSpellCheck: params?.enableSpellCheck ?? true,
          enableDeduplication: params?.enableDeduplication ?? true,
          enableStructuredData: params?.enableStructuredData ?? false,
        });

        // Handle connection/network errors
        if (results.hasErrors && results.error) {
          const errorText = `**Web Search Unavailable**\n\nThe search engine could not be reached. Please try again later.\n\n**Details:** ${results.error}\n**SearXNG URL:** ${SEARXNG_CONFIG.baseUrl}`;
          return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
        }

        // Handle no results
        if (results.results.length === 0) {
          let text = `No results found for "${query}".`;
          if (results.suggestions?.length > 0) {
            text += `\n\nTry these instead: ${results.suggestions.join(", ")}`;
          }
          return { content: [{ type: "text", text }], details: {} };
        }

        const text = formatSearchResults(results, query, params?.depth || "standard");
        return { content: [{ type: "text", text }], details: {} };
      } catch (error) {
        const errorText = `**Web Search Failed**\n\nAn unexpected error occurred.\n\n**Error:** ${error instanceof Error ? error.message : "Unknown error"}`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }
    },
  });

  // Register the fetch_content tool
  pi.registerTool({
    name: "fetch_content",
    label: "Fetch Content",
    description:
      "Fetch and extract content from a specific URL. Useful for reading articles, documentation, or any web page.",
    parameters: Type.Object({
      url: Type.String({ description: "The URL to fetch content from" }),
      prompt: Type.Optional(
        Type.String({
          description: "Optional: Specific question or focus when extracting content",
        }),
      ),
      maxLength: Type.Optional(
        Type.Number({
          description: "Maximum characters to extract from content (default: 2000)",
        }),
      ),
      timeout: Type.Optional(
        Type.Number({
          description: "Request timeout in milliseconds (default: 15000)",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!fetchLimiter.tryConsume()) {
        const errorText = `**Fetch Content Rate Limited**\n\nToo many requests. Please wait before fetching more content.`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }

      const url = params?.url;

      if (!url || typeof url !== "string" || url.trim() === "") {
        const errorText = `**Fetch Content Error**\n\nNo URL provided. Please provide a URL to fetch.`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }

      const cleanUrl = url.trim();

      // Validate URL format
      let validUrl: URL;
      try {
        validUrl = new URL(cleanUrl);
        if (!["http:", "https:"].includes(validUrl.protocol)) {
          throw new Error("Only HTTP/HTTPS URLs are supported");
        }
      } catch (error) {
        const errorText = `**Fetch Content Error**\n\nInvalid URL: ${url}\n\n**Details:** ${error instanceof Error ? error.message : String(error)}`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }

      // Check for internal/private URLs (SSRF protection)
      if (isBlockedInternalURL(cleanUrl)) {
        const errorText = `**Fetch Content Blocked**\n\nAccess to internal/private URLs is not allowed for security reasons.\n\n**URL:** ${cleanUrl}`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }

      try {
        const content = await fetchSourceContent(cleanUrl, {
          maxContentLength: params?.maxLength || 2000,
          useCache: true,
          timeout: params?.timeout || 15000,
        });

        if (!content || content.title === "Fetch failed") {
          const errorText = `**Fetch Content Failed**\n\nCould not extract content from: ${cleanUrl}\n\n**Details:** ${content?.excerpt || "Unknown error"}`;
          return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
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

        return { content: [{ type: "text", text: response }], details: {} };
      } catch (error) {
        const errorText = `**Fetch Content Failed**\n\nAn unexpected error occurred.\n\n**URL:** ${cleanUrl}\n**Error:** ${error instanceof Error ? error.message : "Unknown error"}`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }
    },
  });

  // Register the search_suggest tool
  pi.registerTool({
    name: "search_suggest",
    label: "Search Suggestions",
    description:
      "Get search suggestions for a query. Useful for auto-completion and query refinement.",
    parameters: Type.Object({
      query: Type.String({ description: "Partial query to get suggestions for" }),
      language: Type.Optional(
        Type.String({ description: "Language code (default: en)", default: "en" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const query = params?.query;

      if (!query || typeof query !== "string" || query.trim() === "") {
        const errorText = `**Search Suggestions Error**\n\nNo query provided. Please provide a query.`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }

      try {
        const suggestions = await getSearchSuggestions(query, params?.language || "en");
        
        if (suggestions.length === 0) {
          return { 
            content: [{ type: "text", text: `No suggestions found for "${query}".` }], 
            details: {} 
          };
        }
        
        const response = `**Search Suggestions for "${query}":**\n\n` +
          suggestions.map((s, i) => `${i + 1}. ${s}`).join("\n");
        
        return { content: [{ type: "text", text: response }], details: {} };
      } catch (error) {
        const errorText = `**Search Suggestions Failed**\n\nAn unexpected error occurred.\n\n**Error:** ${error instanceof Error ? error.message : "Unknown error"}`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }
    },
  });

  // Register the spell_check tool
  pi.registerTool({
    name: "spell_check",
    label: "Spell Check",
    description:
      "Check spelling of a query and get corrections.",
    parameters: Type.Object({
      query: Type.String({ description: "Query to check spelling for" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const query = params?.query;

      if (!query || typeof query !== "string" || query.trim() === "") {
        const errorText = `**Spell Check Error**\n\nNo query provided. Please provide a query.`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }

      try {
        const result = await checkSpelling(query);
        
        if (result.corrected === query) {
          return { 
            content: [{ type: "text", text: `No spelling corrections found for "${query}".` }], 
            details: {} 
          };
        }
        
        const response = `**Spell Check for "${query}":**\n\n` +
          `**Original:** ${result.original}\n` +
          `**Corrected:** ${result.corrected}\n` +
          `**Suggestions:** ${result.suggestions.join(", ") || "None"}`;
        
        return { content: [{ type: "text", text: response }], details: {} };
      } catch (error) {
        const errorText = `**Spell Check Failed**\n\nAn unexpected error occurred.\n\n**Error:** ${error instanceof Error ? error.message : "Unknown error"}`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }
    },
  });

  // Register the summarize_results tool
  pi.registerTool({
    name: "summarize_results",
    label: "Summarize Search Results",
    description:
      "Generate an AI summary of search results.",
    parameters: Type.Object({
      query: Type.String({ description: "The original search query" }),
      results: Type.Array(
        Type.Object({
          title: Type.String(),
          content: Type.String(),
          url: Type.String(),
          publishedDate: Type.Optional(Type.String()),
          score: Type.Optional(Type.Number()),
        }),
        { description: "Search results to summarize" }
      ),
      maxLength: Type.Optional(
        Type.Number({ 
          description: "Maximum length of summary (default: 1000)", 
          default: 1000 
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const query = params?.query;
      const results = params?.results;

      if (!query || typeof query !== "string" || query.trim() === "") {
        const errorText = `**Summarize Results Error**\n\nNo query provided. Please provide a query.`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }

      if (!results || !Array.isArray(results) || results.length === 0) {
        const errorText = `**Summarize Results Error**\n\nNo results provided. Please provide search results to summarize.`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }

      try {
        const summary = await summarizeSearchResults(
          query, 
          results, 
          params?.maxLength || 1000
        );
        
        const response = `## AI Summary of Search Results\n\n` +
          `**Query:** ${query}\n` +
          `**Results analyzed:** ${results.length}\n\n` +
          `---\n\n${summary}`;
        
        return { content: [{ type: "text", text: response }], details: {} };
      } catch (error) {
        const errorText = `**Summarize Results Failed**\n\nAn unexpected error occurred.\n\n**Error:** ${error instanceof Error ? error.message : "Unknown error"}`;
        return { content: [{ type: "text", text: errorText }], details: {}, isError: true };
      }
    },
  });
    
    console.log('[web-search] All tools registered successfully');
  } catch (error) {
    console.error('[web-search] Extension initialization failed:', error);
    throw error; // Re-throw so PI Agent knows extension failed to load
  }
}

