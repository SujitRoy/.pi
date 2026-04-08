#!/usr/bin/env node

/**
 * Test script for Web Search Extension
 * 
 * Usage: node test-web-search.js "your search query"
 */

const searchExtension = require('./web-search');

// Create a mock context for testing
const mockContext = {};
const extension = searchExtension(mockContext);

const query = process.argv[2];
if (!query) {
  console.log('Usage: node test-web-search.js "your search query"');
  process.exit(1);
}

console.log(`\n🔍 Searching for: "${query}"\n`);

// Get the web_search tool
const webSearchTool = extension.tools.find(t => t.name === 'web_search');

webSearchTool.execute({ query, maxResults: 5 })
  .then(async (results) => {
    if (results.results && results.results.length > 0) {
      console.log(`📊 Found ${results.numberOfResults} results\n`);
      console.log('━'.repeat(80));
      
      results.results.forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.title}`);
        console.log(`   ${result.content}`);
        console.log(`   URL: ${result.url}`);
        if (result.publishedDate) {
          console.log(`   Published: ${result.publishedDate}`);
        }
        console.log(`   Engine: ${result.engine} | Score: ${result.score.toFixed(2)}`);
        console.log('─'.repeat(80));
      });

      if (results.suggestions && results.suggestions.length > 0) {
        console.log(`\n💡 Suggestions: ${results.suggestions.slice(0, 5).join(', ')}`);
      }
    } else {
      console.log('❌ No results found');
      if (results.hasErrors) {
        console.log('⚠️  Some search engines may not be responding');
      }
    }
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
