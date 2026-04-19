/**
 * Planning Extension for GEMINI.md Compliance
 * Helps enforce surgical precision and empirical validation
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
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
export default function (pi: ExtensionAPI) {
  // Register tools
  pi.registerTool({
    name: 'validate_impact_radius',
    label: 'Validate Impact Radius',
    description: 'Validate impact radius before editing - grep_search for symbols',
    parameters: Type.Object({
      symbol: Type.String({ description: 'Symbol/function/variable name to search for' }),
      file_pattern: Type.Optional(Type.String({ description: 'File pattern to search in', default: '*.js' })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { symbol, file_pattern = '*.js' } = params;
      
      try {
        // Use bash to grep for the symbol
        const result = await pi.exec('bash', ['-c', `grep -r "${symbol}" --include="${file_pattern}" . 2>/dev/null || echo "No matches found"`], { signal });
        
        const lines = result.stdout.split('\n').filter(Boolean);
        const fileCount = new Set(lines.map((line: string) => line.split(':')[0])).size;
        
        return {
          content: [{ type: 'text', text: `Found ${lines.length} matches in ${fileCount} files. Review impact radius before editing.` }],
          details: {
            success: true,
            symbol,
            matches_found: lines.length,
            files_affected: fileCount,
            matches: lines.slice(0, 20)
          }
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Failed to validate impact radius: ${error?.message || 'Unknown error'}` }],
          details: { success: false, error: error?.message },
          isError: true
        };
      }
    }
  });
  
  pi.registerTool({
    name: 'create_reproduction',
    label: 'Create Reproduction',
    description: 'Create failing test/script BEFORE fixing bugs',
    parameters: Type.Object({
      issue: Type.String({ description: 'Description of the issue' }),
      language: Type.Optional(Type.String({ description: 'Programming language for reproduction script', default: 'javascript' })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { issue, language = 'javascript' } = params;
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `reproduce_${timestamp}.${language === 'javascript' ? 'js' : language === 'python' ? 'py' : 'txt'}`;
      
      let content = '';
      if (language === 'javascript') {
        content = `// Reproduction script for: ${issue}\n\n` +
                 `// TODO: Add reproduction code here\n` +
                 `// 1. Setup\n` +
                 `// 2. Trigger the bug\n` +
                 `// 3. Verify failure\n\n` +
                 `console.log('Reproducing: ${issue}');\n`;
      } else if (language === 'python') {
        content = `# Reproduction script for: ${issue}\n\n` +
                 `# TODO: Add reproduction code here\n` +
                 `# 1. Setup\n` +
                 `# 2. Trigger the bug\n` +
                 `# 3. Verify failure\n\n` +
                 `print('Reproducing: ${issue}')\n`;
      } else {
        content = `Reproduction script for: ${issue}\n\n` +
                 `TODO: Add reproduction code here\n` +
                 `1. Setup\n` +
                 `2. Trigger the bug\n` +
                 `3. Verify failure\n`;
      }
      
      return {
        content: [{ type: 'text', text: `Created reproduction script: ${filename}` }],
        details: {
          filename,
          content,
          language,
          issue
        }
      };
    }
  });
  
  pi.registerTool({
    name: 'surgical_edit_check',
    label: 'Surgical Edit Check',
    description: 'Check if edit is surgical (one atomic change, minimal impact)',
    parameters: Type.Object({
      file_path: Type.String({ description: 'Path to file being edited' }),
      change_description: Type.String({ description: 'Description of the change' }),
      lines_changed: Type.Number({ description: 'Number of lines changed' }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { file_path, change_description, lines_changed } = params;
      
      const isSurgical = lines_changed <= 10;
      const recommendations = [];
      
      if (lines_changed > 50) {
        recommendations.push('Consider breaking this into multiple atomic changes.');
      }
      if (lines_changed > 100) {
        recommendations.push('This looks like a refactor - ensure it\'s truly necessary.');
      }
      
      const message = isSurgical 
        ? `✅ Edit is surgical (${lines_changed} lines). Good job!`
        : `⚠️ Edit may not be surgical (${lines_changed} lines). ${recommendations.join(' ')}`;
      
      return {
        content: [{ type: 'text', text: message }],
        details: {
          is_surgical: isSurgical,
          lines_changed,
          recommendations,
          file_path
        }
      };
    }
  });
  
  pi.registerTool({
    name: 'efficiency_check',
    label: 'Efficiency Check',
    description: 'Check if task follows ≤3 turn cycles and efficiency discipline',
    parameters: Type.Object({
      turns_used: Type.Number({ description: 'Number of turns used so far' }),
      task_complexity: Type.String({ description: 'Task complexity: simple, moderate, complex' }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { turns_used, task_complexity } = params;
      
      const maxTurns = task_complexity === 'simple' ? 3 : task_complexity === 'moderate' ? 5 : 7;
      const isEfficient = turns_used <= maxTurns;
      
      const recommendations = [];
      if (turns_used > maxTurns) {
        recommendations.push(`Aim for ≤${maxTurns} turns for ${task_complexity} tasks.`);
        recommendations.push('Combine independent operations in single tool calls.');
        recommendations.push('Minimize back-and-forth, maximize work per turn.');
      }
      
      const message = isEfficient
        ? `✅ Efficient (${turns_used}/${maxTurns} turns for ${task_complexity} task)`
        : `⚠️ Inefficient (${turns_used}/${maxTurns} turns for ${task_complexity} task). ${recommendations.join(' ')}`;
      
      return {
        content: [{ type: 'text', text: message }],
        details: {
          is_efficient: isEfficient,
          turns_used,
          max_recommended: maxTurns,
          task_complexity,
          recommendations
        }
      };
    }
  });
  
  pi.on('session_start', async (event, ctx) => {
    // Use ctx.ui.notify instead of console.log for user notifications
    if (ctx.hasUI && event.reason === 'startup') {
      ctx.ui.notify('Planning extension loaded - GEMINI.md compliance enabled', 'info');
    }
  });
}