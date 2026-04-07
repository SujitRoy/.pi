---
name: test
description: Add and improve tests matching existing framework and style
---

- Match the existing test framework and style exactly.
- Cover normal behavior, edge cases, and failure paths.
- Add regression tests for every bug fix.
- Prefer behavior-based tests over implementation-coupled tests.
- Keep tests focused, readable, and deterministic.
- No flaky tests — if it fails intermittently, fix it immediately.
- Run tests before claiming verification.
- Contract testing: verify API contracts between services, test backward compatibility.
- Performance testing: load test with realistic traffic, measure 95th/99th percentile response times.
- Establish performance baselines — alert on degradation.
- Chaos engineering: test failure scenarios in staging, verify circuit breakers and fallbacks.
- Document failure modes and recovery procedures.
