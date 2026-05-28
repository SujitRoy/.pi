/**
 * Prompt Enhancer Extension - Using 'transform' correctly
 * 
 * Instead of the two-step "hold then send" approach,
 * we use 'transform' to replace the user's text with
 * a meta-instruction that asks the agent to first enhance,
 * then execute.
 * 
 * This is ONE turn, not two. The agent receives:
 * "Enhance the following prompt, then execute the enhanced version: [user's text]"
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type EnhancementMode = 'auto' | 'off';

// ── The enhancement wrapper ───────────────────────────────────────────────

function buildEnhancedPrompt(original: string): string {
  return `BEFORE EXECUTING ANYTHING ELSE, first rewrite the following user request to be clearer and more specific, then immediately execute that rewritten version.

ORIGINAL REQUEST:
"""
${original}
"""

ENHANCEMENT RULES:
- Fix all spelling and grammar errors
- Add missing context and specificity
- Structure clearly with sections if helpful (TASK, STEPS, CONSTRAINTS)
- Remove ambiguity
- Keep the user's original intent - do NOT add requirements they didn't ask for

OUTPUT THE ENHANCED PROMPT in this format:
---ENHANCED---
<the complete enhanced prompt here>
---END---

Then IMMEDIATELY execute the enhanced prompt as your actual task.`;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function shouldSkip(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.startsWith('/')) return true;
  if (trimmed.length < 10) return true;
  if (/^(yes|no|ok|okay|sure|thanks|thank you|continue|proceed|go ahead|next|done|good|great|nice|perfect|fine|alright|nope|yep|yeah)$/i.test(trimmed)) return true;
  return false;
}

// ── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  
  let mode: EnhancementMode = 'auto';
  let enhanceCount = 0;

  // ── Commands ────────────────────────────────────────────────────────

  pi.registerCommand('enhance', {
    description: 'Toggle prompt enhancement on/off or show stats',
    handler: async (args, ctx) => {
      const sub = args.trim().toLowerCase();
      
      if (sub === 'off' || sub === 'disable') {
        mode = 'off';
        ctx.ui.notify('🔕 Enhancement OFF', 'info');
      } else if (sub === 'on' || sub === 'enable' || sub === 'auto') {
        mode = 'auto';
        ctx.ui.notify('✨ Enhancement ON - Prompts will be rewritten for clarity', 'success');
      } else if (sub === 'stats') {
        ctx.ui.notify(`📊 Enhanced: ${enhanceCount} prompts`, 'info');
      } else {
        mode = mode === 'auto' ? 'off' : 'auto';
        ctx.ui.notify(`Enhancement: ${mode.toUpperCase()}`, 'info');
      }
    },
  });

  // ── Event: input - Transform the prompt ─────────────────────────────

  pi.on('input', async (event, ctx) => {
    if (mode === 'off') return { action: 'continue' };
    if (event.source === 'extension') return { action: 'continue' };
    if (shouldSkip(event.text)) return { action: 'continue' };
    
    const original = event.text.trim();
    const enhanced = buildEnhancedPrompt(original);
    
    enhanceCount++;
    
    if (ctx.hasUI) {
      ctx.ui.setStatus('enhancer', `Enhanced ×${enhanceCount}`);
      const preview = original.length > 40 ? original.slice(0, 40) + '...' : original;
      ctx.ui.notify(`✨ Enhancing: "${preview}"`, 'info');
    }
    
    // KEY: Use 'transform' to replace the user's text
    // The agent receives the transformed text and processes it normally
    return { action: 'transform', text: enhanced };
  });

  // ── Event: message_end - Clean up the output ────────────────────────

  pi.on('message_end', async (event, ctx) => {
    // When the agent outputs the enhanced prompt in ---ENHANCED--- blocks,
    // we can optionally clean up the display, but the agent already
    // executed the enhanced version, so this is just cosmetic
    if (event.message.role === 'assistant') {
      // The agent will output the enhanced prompt then execute it.
      // We leave the output as-is so the user can see the enhancement.
    }
  });

  // ── Event: session_start ───────────────────────────────────────────

  pi.on('session_start', async (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setStatus('enhancer', 'Ready');
      ctx.ui.notify(
        '✨ Prompt Enhancer loaded. /enhance on|off|stats',
        'info'
      );
    }
  });
}
