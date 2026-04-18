#!/usr/bin/env node

/**
 * Planning Extension for GEMINI.md Compliance
 * Helps enforce surgical precision and empirical validation
 */

import { Type } from '@sinclair/typebox';

// Tool: validate_impact_radius
// Checks impact radius before editing
const validateImpactRadius = {
  name: 'validate_impact_radius',
  description: 'Validate impact radius before editing - grep_search for symbols',
  parameters: Type.Object({
    symbol: Type.String({ description: 'Symbol/function/variable name to search for' }),
    file_pattern: Type.Optional(Type.String({ description: 'File pattern to search in', default: '*.js' })),
  }),
  handler: async (args: any, pi: any) => {
    const { symbol, file_pattern = '*.js' } = args;
    
    try {
      // Use bash to grep for the symbol
      const result = await pi.callTool('bash', {
        command: `grep -r "${symbol}" --include="${file_pattern}" . 2>/dev/null || echo "No matches found"`,
      });
      
      const lines = result.stdout.split('\n').filter(Boolean);
      const fileCount = new Set(lines.map((line: string) => line.split(':')[0])).size;
      
      return {
        success: true,
        symbol,
        matches_found: lines.length,
        files_affected: fileCount,
        matches: lines.slice(0, 20), // First 20 matches
        message: `Found ${lines.length} matches in ${fileCount} files. Review impact radius before editing.`
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Unknown error',
        message: 'Failed to validate impact radius'
      };
    }
  }
};

// Tool: create_reproduction
// Creates a reproduction script for bugs
const createReproduction = {
  name: 'create_reproduction',
  description: 'Create a reproduction script for bugs (empirical validation)',
  parameters: Type.Object({
    bug_description: Type.String({ description: 'Description of the bug' }),
    file_path: Type.String({ description: 'Path to the file with the bug' }),
    test_command: Type.Optional(Type.String({ description: 'Command to run the test', default: 'node' })),
  }),
  handler: async (args: any, pi: any) => {
    const { bug_description, file_path, test_command = 'node' } = args;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reproFile = `reproduce_${timestamp}.js`;
    
    const content = `// Reproduction script for: ${bug_description}
// Created: ${new Date().toISOString()}
// File: ${file_path}

const fs = require('fs');
const path = require('path');

console.log('=== BUG REPRODUCTION TEST ===');
console.log('Description: ${bug_description}');
console.log('File: ${file_path}');
console.log('\\n--- Test Execution ---');

try {
  // Load and test the problematic code
  ${test_command === 'node' ? `require('./${file_path}');` : `// Custom test execution for ${test_command}`}
  console.log('✅ Expected failure but got success - bug may be fixed');
  process.exit(1); // Fail if it doesn't error
} catch (error) {
  console.log('❌ Bug reproduced successfully:');
  console.log(error.message);
  console.log('\\n=== REPRODUCTION COMPLETE ===');
  process.exit(0); // Success - bug reproduced
}
`;

    await pi.callTool('write', {
      path: reproFile,
      content
    });

    return {
      success: true,
      reproduction_file: reproFile,
      command_to_run: `${test_command} ${reproFile}`,
      message: `Reproduction script created. Run: ${test_command} ${reproFile}`
    };
  }
};

// Tool: surgical_edit_check
// Validates surgical edit compliance
const surgicalEditCheck = {
  name: 'surgical_edit_check',
  description: 'Check if edit follows surgical precision guidelines',
  parameters: Type.Object({
    file_path: Type.String({ description: 'Path to file being edited' }),
    old_text: Type.String({ description: 'Text being replaced' }),
    new_text: Type.String({ description: 'Replacement text' }),
  }),
  handler: async (args: any) => {
    const { file_path, old_text, new_text } = args;
    
    const oldLines = old_text.split('\n').length;
    const newLines = new_text.split('\n').length;
    const lineChange = Math.abs(oldLines - newLines);
    
    // Check for common violations
    const violations: string[] = [];
    
    if (oldLines > 10 && lineChange > 5) {
      violations.push('Large change detected - may violate surgical precision');
    }
    
    if (old_text.includes('//') && !new_text.includes(old_text.split('//')[0])) {
      violations.push('Comment modification detected - may be refactor creep');
    }
    
    if (old_text.trim() === '' && new_text.trim() !== '') {
      violations.push('Adding to empty space - ensure this is required');
    }
    
    return {
      success: true,
      file_path,
      old_line_count: oldLines,
      new_line_count: newLines,
      line_change: lineChange,
      violations,
      is_surgical: violations.length === 0,
      message: violations.length === 0 
        ? 'Edit appears surgical' 
        : `Potential violations: ${violations.join(', ')}`
    };
  }
};

// Tool: efficiency_check
// Checks turn efficiency
const efficiencyCheck = {
  name: 'efficiency_check',
  description: 'Check efficiency metrics for current task',
  parameters: Type.Object({
    task_description: Type.String({ description: 'Description of current task' }),
    current_turn: Type.Number({ description: 'Current turn number', minimum: 1 }),
  }),
  handler: async (args: any) => {
    const { task_description, current_turn } = args;
    
    const warnings: string[] = [];
    const recommendations: string[] = [];
    
    if (current_turn > 3) {
      warnings.push(`Turn ${current_turn}: Exceeding 3-turn efficiency target`);
      recommendations.push('Consider if task can be broken down or parallelized');
    }
    
    if (current_turn > 5) {
      warnings.push(`Turn ${current_turn}: Approaching 5-turn complexity limit`);
      recommendations.push('Re-evaluate approach or request clarification');
    }
    
    return {
      success: true,
      task_description,
      current_turn,
      warnings,
      recommendations,
      on_track: current_turn <= 3,
      message: current_turn <= 3 
        ? 'On track for ≤3-turn efficiency' 
        : `Consider efficiency improvements. ${recommendations.join(' ')}`
    };
  }
};

// Export the extension as a factory function
export default (pi: any) => ({
  name: 'planning',
  version: '1.0.0',
  description: 'Planning and validation tools for GEMINI.md compliance',
  tools: [
    validateImpactRadius,
    createReproduction,
    surgicalEditCheck,
    efficiencyCheck
  ],
  onInitialize: (pi: any) => {
    console.log('✅ Planning extension loaded - GEMINI.md compliance enabled');
  }
});