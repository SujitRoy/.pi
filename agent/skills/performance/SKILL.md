---
name: performance
description: Profile, identify bottlenecks, optimize, measure, and validate improvements
---

- Profile first — never optimize based on assumptions.
- Fix algorithmic complexity before micro-optimizing.
- Use caching strategically — invalidation is harder than insertion.
- Measure and validate every improvement with real data.
- Balance performance gains against complexity and maintainability.
- Watch for N+1 queries, unbounded loops, and synchronous I/O in hot paths.
- Optimize the 20% of code that costs 80% of the time.
