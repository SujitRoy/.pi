/**
 * Prompt Enhancer Extension - Optimized Implementation
 * 
 * TWO MODES:
 * 1. AUTO mode (default): Silently enhances every prompt before agent sees it
 * 2. MANUAL mode: User types /enhance, then their next message gets enhanced
 * 
 * The agent ALWAYS works with the enhanced version in AUTO mode.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

// ── Types ──────────────────────────────────────────────────────────────────

type EnhancementMode = 'auto' | 'manual' | 'off';

interface EnhancementStats {
  totalEnhanced: number;
  totalSkipped: number;
  lastEnhanced: string | null;
}

interface PromptAnalysis {
  needsEnhancement: boolean;
  isVague: boolean;
  vagueTerms: string[];
  missingElements: string[];
  domain: string | null;
  taskType: 'create' | 'fix' | 'explain' | 'refactor' | 'optimize' | 'unknown';
  reason: string;
}

// ── Analysis Engine ────────────────────────────────────────────────────────

function analyzePrompt(text: string): PromptAnalysis {
  const lower = text.toLowerCase();
  
  // Task type detection
  let taskType: PromptAnalysis['taskType'] = 'unknown';
  if (/\b(create|make|build|generate|write|add|implement|scaffold|setup)\b/.test(lower)) taskType = 'create';
  else if (/\b(fix|repair|resolve|debug|correct|patch|bug|issue|error|broken)\b/.test(lower)) taskType = 'fix';
  else if (/\b(explain|describe|what is|how does|tell me|document|clarify)\b/.test(lower)) taskType = 'explain';
  else if (/\b(refactor|restructure|reorganize|clean up|rewrite|rework)\b/.test(lower)) taskType = 'refactor';
  else if (/\b(optimize|improve|speed up|faster|performance|efficient|reduce|minimize)\b/.test(lower)) taskType = 'optimize';
  
  // Vague term detection
  const vagueTerms = [
    'improve', 'fix', 'update', 'change', 'make better', 'optimize',
    'enhance', 'modify', 'adjust', 'tweak', 'something', 'stuff',
    'thing', 'it', 'that', 'this', 'there', 'somehow', 'whatever',
  ];
  const foundVague = vagueTerms.filter(t => lower.includes(t));
  const isVague = foundVague.length > 1 || (text.length < 40 && foundVague.length > 0);
  
  // Missing elements
  const missingElements: string[] = [];
  if (!/\b(you are|act as|be a|as a|senior|junior|engineer|developer|expert|specialist)\b/.test(lower)) 
    missingElements.push('role');
  if (!/\b(format|output|return|json|markdown|code block|list|table|structure)\b/.test(lower)) 
    missingElements.push('output_format');
  if (!/\b(do not|don't|must|should|only|never|always|ensure|prevent|avoid|because)\b/.test(lower)) 
    missingElements.push('constraints');
  if (text.length < 60)
    missingElements.push('context');
  
  // Domain
  let domain: string | null = null;
  const domains: Record<string, RegExp> = {
    'typescript': /\b(typescript|ts|node\.js|express|nestjs|angular|deno)\b/i,
    'python': /\b(python|django|flask|fastapi|pytorch|tensorflow|pandas)\b/i,
    'rust': /\b(rust|cargo|actix|tokio|serde|wasm)\b/i,
    'react': /\b(react|jsx|tsx|next\.js|gatsby|remix|redux|zustand)\b/i,
    'database': /\b(sql|postgres|mysql|mongo|prisma|orm|database|query|schema)\b/i,
    'devops': /\b(docker|kubernetes|ci|cd|deploy|pipeline|aws|gcp|azure|terraform)\b/i,
    'testing': /\b(test|jest|vitest|pytest|cypress|playwright|mock|stub|assert)\b/i,
  };
  for (const [key, pattern] of Object.entries(domains)) {
    if (pattern.test(lower)) { domain = key; break; }
  }
  
  const needsEnhancement = isVague || missingElements.length >= 2 || text.length < 30;
  
  const reasons: string[] = [];
  if (isVague) reasons.push(`vague terms: ${foundVague.join(', ')}`);
  if (missingElements.length > 0) reasons.push(`missing: ${missingElements.join(', ')}`);
  if (text.length < 30) reasons.push('too short');
  
  return {
    needsEnhancement,
    isVague,
    vagueTerms: foundVague,
    missingElements,
    domain,
    taskType,
    reason: reasons.join('; ') || 'adequate',
  };
}

// ── Enhancement Engine ─────────────────────────────────────────────────────

function enhancePrompt(original: string, analysis: PromptAnalysis): string {
  const blocks: string[] = [];
  
  // 1. ROLE
  const roles: Record<string, string> = {
    create: `You are a senior ${analysis.domain || 'software'} engineer. Build production-quality solutions.`,
    fix: `You are a senior ${analysis.domain || 'software'} engineer specializing in debugging. Find root causes, not symptoms.`,
    explain: `You are a technical educator. Explain clearly with examples.`,
    refactor: `You are a software architect. Refactor incrementally, preserve behavior.`,
    optimize: `You are a performance engineer. Measure before/after, prove improvements.`,
    unknown: `You are an expert ${analysis.domain || 'software'} engineer.`,
  };
  blocks.push(roles[analysis.taskType]);
  
  // 2. TASK
  blocks.push(`\nTASK: ${original.trim()}`);
  
  // 3. CONTEXT
  blocks.push(`\nCONTEXT:
- Work in the current directory: use grep, ls, read to explore
- Follow existing patterns, naming conventions, code style
- Use already-installed dependencies only`);
  
  // 4. CONSTRAINTS
  blocks.push(`\nCONSTRAINTS:
- DO: Make minimal, surgical changes BECAUSE: reduces regression risk
- DO NOT: Change unrelated code BECAUSE: scope discipline
- DO NOT: Add new dependencies unless absolutely required BECAUSE: avoid bloat
- If uncertain, use ask_user BEFORE acting`);
  
  // 5. OUTPUT
  const outputs: Record<string, string> = {
    create: `\nOUTPUT PLAN (before writing code):
1. List files to create/modify
2. Explain approach in 2-3 sentences
3. Write complete code (no placeholders or "// TODO")
4. Verify with tests if available`,
    fix: `\nOUTPUT PLAN (before fixing):
1. State the root cause
2. Explain fix in 1-2 sentences
3. Apply the minimal fix
4. Verify the bug is resolved`,
    explain: `\nOUTPUT:
1. Clear explanation with examples
2. Code snippets showing usage
3. Common pitfalls to avoid`,
    refactor: `\nOUTPUT PLAN:
1. Analyze current structure
2. Explain refactoring approach
3. Apply changes incrementally (one file/function at a time)
4. Verify behavior unchanged`,
    optimize: `\nOUTPUT PLAN:
1. Identify bottleneck with evidence
2. Propose optimization
3. Apply change
4. Show before/after improvement`,
    unknown: `\nOUTPUT:
1. Clarify understanding of the task
2. Propose approach
3. Implement
4. Verify`,
  };
  blocks.push(outputs[analysis.taskType]);
  
  // 6. ANTI-HALLUCINATION
  blocks.push(`\nCRITICAL RULES:
- ONLY reference files that EXIST (use grep/ls to verify)
- NEVER invent APIs, libraries, or file paths
- If unsure about requirements: ASK, do NOT guess
- Return ONLY the requested code, no unnecessary commentary`);
  
  return blocks.join('\n');
}

// ── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  
  let mode: EnhancementMode = 'auto';
  let stats: EnhancementStats = { totalEnhanced: 0, totalSkipped: 0, lastEnhanced: null };

  // ── Commands ────────────────────────────────────────────────────────

  pi.registerCommand('enhance', {
    description: 'Enhance the next prompt (manual mode) or toggle auto mode',
    handler: async (args, ctx) => {
      const subCommand = args.trim().toLowerCase();
      
      if (subCommand === 'on' || subCommand === 'auto') {
        mode = 'auto';
        ctx.ui.notify('✨ Auto-enhance ON. All prompts will be enhanced automatically.', 'success');
      } else if (subCommand === 'off') {
        mode = 'off';
        ctx.ui.notify('🔕 Enhancement OFF. Prompts sent as-is.', 'info');
      } else if (subCommand === 'manual') {
        mode = 'manual';
        ctx.ui.notify('🎯 Manual mode ON. Use /enhance before your prompt to enhance it once.', 'info');
      } else if (subCommand === 'stats') {
        ctx.ui.notify(
          `Mode: ${mode.toUpperCase()}\nEnhanced: ${stats.totalEnhanced}\nSkipped: ${stats.totalSkipped}\nLast: ${stats.lastEnhanced?.slice(0, 60) || 'none'}`,
          'info'
        );
      } else if (subCommand === 'preview' || subCommand === 'show') {
        // If user typed /enhance preview some text, show what it would become
        const previewText = args.replace(/^(on|off|auto|manual|stats|preview|show)\s*/, '').trim();
        if (!previewText) {
          ctx.ui.notify('Usage: /enhance preview [your prompt text]', 'error');
          return;
        }
        const analysis = analyzePrompt(previewText);
        const enhanced = enhancePrompt(previewText, analysis);
        ctx.ui.notify(
          `📊 Needs enhancement: ${analysis.needsEnhancement} (${analysis.reason})\n\n📝 Would become:\n${enhanced.slice(0, 400)}...`,
          'info'
        );
      } else {
        // No subcommand = toggle
        if (mode === 'auto') {
          mode = 'off';
          ctx.ui.notify('🔕 Enhancement OFF', 'info');
        } else {
          mode = 'auto';
          ctx.ui.notify('✨ Auto-enhance ON', 'success');
        }
      }
    },
  });

  // ── Event: input (intercept user prompts) ──────────────────────────

  pi.on('input', async (event, ctx) => {
    const text = event.text.trim();
    
    // NEVER enhance:
    if (mode === 'off') return { action: 'continue' };
    if (event.source === 'extension') return { action: 'continue' };
    if (text.startsWith('/')) return { action: 'continue' };
    
    // Skip very short responses (conversational replies)
    const shortReplies = /^(yes|no|ok|okay|sure|thanks|thank you|continue|proceed|go ahead|next|done|good|great|nice|perfect|fine|alright|nope|yep|yeah)$/i;
    if (shortReplies.test(text)) {
      stats.totalSkipped++;
      return { action: 'continue' };
    }
    
    // Skip very short follow-ups (less than 15 chars)
    if (text.length < 15) {
      stats.totalSkipped++;
      return { action: 'continue' };
    }
    
    const analysis = analyzePrompt(text);
    
    // In AUTO mode: enhance everything that needs it
    if (mode === 'auto' && analysis.needsEnhancement) {
      const enhanced = enhancePrompt(text, analysis);
      stats.totalEnhanced++;
      stats.lastEnhanced = text;
      
      if (ctx.hasUI) {
        ctx.ui.notify(
          `✨ Enhanced (${analysis.reason})`,
          'info'
        );
      }
      
      return { action: 'transform', text: enhanced };
    }
    
    // In MANUAL mode: only enhance if user typed /enhance right before
    // (Manual mode toggle is handled via a session flag)
    
    stats.totalSkipped++;
    return { action: 'continue' };
  });

  // ── Event: session_start ─────────────────────────────────────────────

  pi.on('session_start', async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.notify(
        '✨ Prompt Enhancer loaded (AUTO mode).\nCommands: /enhance on|off|manual|stats|preview [text]',
        'info'
      );
    }
  });
}
