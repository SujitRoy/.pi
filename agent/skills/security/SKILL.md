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
- Scan dependencies for vulnerabilities — pin versions, no floating tags.
- Python: Use safety, pip-audit, and require-hashes in requirements.
- Verify package integrity (lock files) — block known malicious packages.
- JWT: short-lived access tokens, refresh tokens for renewal.
- API keys for machine-to-machine — never in client-side code.
- Rate limit per key/IP/user with exponential backoff.
- Use vault solutions for secrets (Hashicorp Vault, AWS Secrets Manager).
- Rotate secrets regularly, automate rotation where possible.
- Audit secret access, implement just-in-time access.
