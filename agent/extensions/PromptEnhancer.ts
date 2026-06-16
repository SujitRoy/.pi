/**
 * Prompt Enhancer Extension — Opt-in via /enhance command
 *
 * Enhances a user's prompt for clarity before sending it to the agent.
 * Only triggered explicitly via the /enhance slash command — NEVER automatic.
 * No input-event listener is registered: every user message is delivered as-is unless
 * the user explicitly invokes `/enhance <text>`.
 *
 * Flow:
 *   1. User types: /enhance refactor search() to use async/await
 *   2. Command wraps the text in a meta-instruction (clarify, then execute)
 *   3. In TUI/RPC: opens an editor so the user can review/edit the enhanced
 *      prompt and submit it, or press Escape to cancel
 *   4. In print/JSON mode: sends the enhanced prompt directly
 *   5. On submit, ctx.sendUserMessage() delivers it to the agent
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/**
 * Wrap the user's prompt in a meta-instruction that asks the agent to
 * first rewrite it for clarity, then immediately execute the rewrite.
 */
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

export default function (pi: ExtensionAPI) {
    // ── /enhance command (opt-in only) ──────────────────────────────────
    pi.registerCommand('enhance', {
        description: 'Enhance a prompt for clarity, preview it, then send to the agent',
        handler: async (args, ctx) => {
            const text = args.trim();

            if (!text) {
                if (ctx.hasUI) {
                    ctx.ui.notify('Usage: /enhance <your prompt>', 'info');
                }
                return;
            }

            const enhanced = buildEnhancedPrompt(text);

            // TUI / RPC: show the enhanced prompt in an editor for review.
            // The user can edit it, then submit. Escape cancels.
            if (ctx.hasUI) {
                const reviewed = await ctx.ui.editor(
                    '✨ Enhanced Prompt — edit if needed, then submit',
                    enhanced,
                );

                if (reviewed === undefined) {
                    ctx.ui.notify('Cancelled — prompt not sent', 'info');
                    return;
                }

                // Send the reviewed (possibly edited) enhanced prompt
                ctx.sendUserMessage(reviewed);
            } else {
                // Print / JSON mode: no editor, send the enhanced version directly
                ctx.sendUserMessage(enhanced);
            }
        },
    });

    // ── session_start: notify that the command is available ─────────────
    pi.on('session_start', async (_event, ctx) => {
        if (ctx.hasUI) {
            ctx.ui.setStatus('enhancer', 'Ready');
            ctx.ui.notify(
                '✨ Prompt Enhancer loaded. Use /enhance <prompt> to enhance a message.',
                'info',
            );
        }
    });
}
