---
name: architecture
description: System design, patterns, boundaries, and structural decision guidance
---

- Single responsibility per module, service, and function.
- Prefer composition over inheritance.
- Define clear boundaries between layers — no leaking abstractions.
- No circular dependencies — ever.
- Choose boring, proven technology unless there is a measured need otherwise.
- Design for failure — every component must handle downstream errors.
- Document architectural decisions with context, options, and trade-offs.
- YAGNI: do not build what you do not need today.
