---
name: review
description: Code review focused on correctness, security, performance, maintainability, tests
---

Review in this order — stop at the first blocker:
1. Correctness — does it work as intended?
2. Security — can it be exploited?
3. Performance — will it scale?
4. Maintainability — can someone else read and change it?
5. Tests — are edge cases and failures covered?

- Focus on high-impact issues first. Be concrete and actionable.
- Avoid low-value style comments unless they affect clarity or safety.
- If it works but is fragile, say so with specifics.
