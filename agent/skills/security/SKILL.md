---
name: security
description: Identify vulnerabilities, enforce authentication, and validate secure patterns
---

- Never hardcode secrets, keys, tokens, or credentials.
- Sanitize and validate ALL external inputs — trust nothing.
- Enforce authentication and authorization on every protected endpoint.
- Use parameterized queries — never string-concat SQL or commands.
- Apply principle of least privilege for every access decision.
- Validate against OWASP Top 10 for web-facing code.
- Fail closed — deny by default, allow by explicit exception.
- Flag any data exposure in logs, error messages, or URLs.
