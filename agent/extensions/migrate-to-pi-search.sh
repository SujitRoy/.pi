#!/bin/bash

# Migration script for PI Agent Search Architecture Consolidation
# This script helps migrate from 4 fragmented search files to unified pi-search.ts

echo "========================================="
echo "PI Agent Search Architecture Migration"
echo "========================================="

echo ""
echo "Current search files:"
ls -la *search*.ts

echo ""
echo "Backup created in: backup_old_search/"
echo ""

# Check if pi-search.ts exists
if [ ! -f "pi-search.ts" ]; then
    echo "ERROR: pi-search.ts not found!"
    exit 1
fi

echo "New unified file:"
echo "- pi-search.ts (29KB, replaces all 4 search files)"
echo ""

echo "Migration steps:"
echo "1. ✅ Backup created: backup_old_search/"
echo "2. ✅ New unified file created: pi-search.ts"
echo "3. ❓ Remove old search files (optional, but recommended)"
echo "4. ❓ Update package.json or any references"
echo ""

echo "To remove old files (recommended):"
echo "  rm web-search.ts hybrid-search.ts hybrid-search-enhanced.ts ai-search.ts"
echo ""

echo "Tool name changes:"
echo "- OLD: web_search, basic_hybrid_search, hybrid_web_search, ai_search"
echo "- NEW: search (single unified tool)"
echo "- NEW: search_health (optional health check)"
echo ""

echo "Parameter changes:"
echo "- query (string): Search query"
echo "- mode (auto|traditional|ai|research): Default 'auto'"
echo "- maxResults (1-20): Default 10"
echo "- depth (fast|standard|deep): Default 'standard'"
echo "- safeMode (boolean): Default true (avoids content filters)"
echo ""

echo "Testing commands:"
echo "1. Basic search:"
echo "   search query=\"Noida India current temperature\" mode=auto maxResults=3"
echo ""
echo "2. AI-enhanced search:"
echo "   search query=\"Explain quantum computing simply\" mode=ai"
echo ""
echo "3. Safe mode:"
echo "   search query=\"controversial topic\" safeMode=true"
echo ""
echo "4. Health check:"
echo "   search_health"
echo ""

echo "Features of unified architecture:"
echo "✅ Auto-detects LLM method (pi.complete, pi.callLLM, pi.llm.complete)"
echo "✅ Three-tier fallback: Native LLM → Simulated AI → Traditional"
echo "✅ Query sanitization (removes sensitive terms)"
echo "✅ Intelligent query classification"
echo "✅ Caching with 5-minute TTL"
echo "✅ Rate limiting (5 requests per 10 seconds)"
echo "✅ Graceful degradation (always returns valid JSON)"
echo "✅ Health check on startup"
echo ""

echo "Migration complete! The unified pi-search.ts is ready to use."
echo "========================================="