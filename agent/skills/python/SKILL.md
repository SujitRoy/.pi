---
name: python
description: Python development best practices, tooling, and conventions
---

- PEP 8: Follow Python style guide consistently.
- Type hints: Add for function signatures and complex returns.
- Virtual envs: Use venv or poetry for dependency isolation.
- Requirements: Pin versions in requirements.txt or pyproject.toml.
- Testing: pytest with fixtures, coverage reporting.
- Error handling: Use specific exceptions, not bare except.
- Performance: Use comprehensions, generators, built-ins.
- Logging: Structured JSON logs, appropriate levels.
- Security: No eval(), sanitize inputs, hash passwords.
- Async: Use asyncio for I/O-bound operations.