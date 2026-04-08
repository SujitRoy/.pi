#!/usr/bin/env node

/**
 * PI Agent Extension: Web Search
 * 
 * This extension enables live web search using SearXNG API.
 * Add this to your PI agent's extensions directory to enable search capabilities.
 * 
 * Usage: The agent will automatically use this when search is needed.
 * 
 * Configuration:
 * Set SEARXNG_BASE_URL environment variable or it will default to http://localhost:8080
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// SearXNG API Configuration
// IMPORTANT: Set SEARXNG_BASE_URL environment variable to your SearXNG instance URL
const SEARXNG_CONFIG = {
  baseUrl: process.env.SEARXNG_BASE_URL || 'http://localhost:8080',
  defaultLanguage: 'en',
  defaultCategories: ['general', 'news'],
  maxResults: 8
};

/**
 * Make a POST HTTP request to SearXNG API
 * @param {string} baseUrl - The base URL of the API
 * @param {Object} postData - The form data to send
 * @returns {Promise<string>} Response body
 */
function makeHttpPostRequest(baseUrl, postData) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(baseUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const bodyData = new URLSearchParams(postData).toString();

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyData)
      },
      timeout: 30000
    };

    const request = client.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        }
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });

    request.write(bodyData);
    request.end();
  });
}

/**
 * Perform a web search using SearXNG API
 * @param {string} query - The search query
 * @param {Object} options - Search options
 * @param {string} options.language - Language code (default: 'en')
 * @param {string} options.category - Search category (default: 'general')
 * @param {number} options.maxResults - Maximum number of results (default: 8)
 * @returns {Promise<Object>} Search results and metadata
 */
async function search(query, options = {}) {
  const {
    language = SEARXNG_CONFIG.defaultLanguage,
    category = 'general',
    maxResults = SEARXNG_CONFIG.maxResults
  } = options;

  const searchData = {
    q: query,
    format: 'json'
  };

  // Only add category if specified
  if (category) {
    searchData.categories = category;
  }

  // Only add language if specified
  if (language) {
    searchData.language = language;
  }

  const url = `${SEARXNG_CONFIG.baseUrl}/search`;

  try {
    const results = await makeHttpPostRequest(url, searchData);
    const parsed = JSON.parse(results);

    // Check for unresponsive engines
    if (parsed.unresponsive_engines && parsed.unresponsive_engines.length > 0) {
      const failedEngines = parsed.unresponsive_engines.map(e => e[0]).join(', ');
      console.warn(`Warning: Some search engines are not responding: ${failedEngines}`);
    }

    if (!parsed.results || !Array.isArray(parsed.results)) {
      return {
        results: [],
        suggestions: parsed.suggestions || [],
        answers: parsed.answers || [],
        numberOfResults: parsed.number_of_results || 0,
        hasErrors: parsed.unresponsive_engines && parsed.unresponsive_engines.length > 0
      };
    }

    // Sort results by score and extract the most relevant
    const sortedResults = parsed.results
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, maxResults);

    // Extract and format the most relevant results
    return {
      results: sortedResults.map(result => ({
        title: result.title || '',
        content: result.content || '',
        url: result.url || '',
        publishedDate: result.publishedDate || result.pubdate || null,
        engine: result.engines ? result.engines.join(', ') : result.engine || null,
        score: result.score || 0
      })),
      suggestions: parsed.suggestions || [],
      answers: parsed.answers || [],
      numberOfResults: parsed.number_of_results || 0,
      hasErrors: parsed.unresponsive_engines && parsed.unresponsive_engines.length > 0
    };
  } catch (error) {
    console.error('Search failed:', error.message);
    return {
      results: [],
      suggestions: [],
      answers: [],
      numberOfResults: 0,
      hasErrors: true,
      error: error.message
    };
  }
}

/**
 * Search and format results for natural language answer
 * @param {string} query - The search query
 * @param {Object} options - Search options
 * @returns {Promise<string>} Formatted answer
 */
async function searchAndAnswer(query, options = {}) {
  const searchData = await search(query, options);

  // Check if there are errors with unresponsive engines
  if (searchData.hasErrors && searchData.results.length === 0) {
    return `Search completed but no results were returned. Some search engines are not responding. You may need to check your SearXNG instance configuration.`;
  }

  if (searchData.results.length === 0) {
    let response = `No results found for "${query}".`;
    if (searchData.suggestions && searchData.suggestions.length > 0) {
      response += `\n\nSuggestions: ${searchData.suggestions.join(', ')}`;
    }
    return response;
  }

  let response = `Found ${searchData.numberOfResults} result(s) for "${query}":\n\n`;

  searchData.results.forEach((result, index) => {
    response += `${index + 1}. **${result.title}**\n`;
    if (result.content) {
      response += `   ${result.content}\n`;
    }
    response += `   URL: ${result.url}\n`;
    if (result.publishedDate) {
      response += `   Published: ${result.publishedDate}\n`;
    }
    response += '\n';
  });

  if (searchData.suggestions && searchData.suggestions.length > 0) {
    response += `\nSuggestions: ${searchData.suggestions.join(', ')}`;
  }

  return response;
}

/**
 * PI Agent Extension Factory Function
 * @param {Object} context - PI agent context
 * @returns {Object} Extension definition
 */
module.exports = function(context) {
  return {
    name: 'web-search',
    description: 'Perform live web searches using SearXNG API',
    
    /**
     * Execute web search tool
     */
    tools: [
      {
        name: 'web_search',
        description: 'Search the web for current information',
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
            }
          },
          required: ['query']
        },
        execute: async (params) => {
          try {
            const results = await search(params.query, {
              category: params.category,
              language: params.language,
              maxResults: params.maxResults
            });
            return results;
          } catch (error) {
            return {
              error: error.message,
              results: []
            };
          }
        }
      }
    ],

    /**
     * Hook into agent messages to enable automatic search
     */
    hooks: {
      onMessage: async (message) => {
        // Auto-detect when search might be useful
        const searchKeywords = ['current', 'latest', 'recent', 'now', 'today', 'who won', 'what is happening'];
        const shouldSearch = searchKeywords.some(keyword => 
          message.toLowerCase().includes(keyword)
        );

        if (shouldSearch && message.length > 10) {
          try {
            const result = await searchAndAnswer(message);
            return result;
          } catch (error) {
            return null; // Don't block the message if search fails
          }
        }

        return null; // Let the agent continue normally
      }
    }
  };
};
