---
name: karpathy-coding-guidelines
description: "Coding guidelines to reduce common LLM mistakes - think before coding, simplicity, surgical changes, goal-driven execution"
---

- **Think before coding**: State assumptions explicitly. If uncertain, ask. Present multiple interpretations - do not pick silently. Push back when warranted.
- **Simplicity first**: Minimum code that solves the problem. No features beyond what was asked. No abstractions for single-use code. No flexibility that was not requested.
- **Surgical changes**: Touch only what you must. Do not improve adjacent code, comments, or formatting. Match existing style. Remove only orphans your own changes created.
- **Goal-driven execution**: Transform tasks into verifiable goals. Write tests before fixes. State a brief plan for multi-step tasks: `[step] -> verify: [check]`.
- **These guidelines are working if**: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes.
- Bias toward caution over speed. For trivial tasks, use judgment.
