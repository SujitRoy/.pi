---
name: api
description: REST API design, contracts, versioning, and endpoint conventions
---

- Use proper HTTP methods: GET (read), POST (create), PUT/PATCH (update), DELETE (remove).
- Return correct status codes: 200, 201, 204, 400, 401, 403, 404, 422, 500.
- Version APIs: `/api/v1/resource` — never break contracts without migration.
- Use pagination on every list endpoint.
- Return consistent response structure: `{ data, error, meta }`.
- Validate all inputs — reject bad data early with clear error messages.
- Document every endpoint with request/response examples.
- Rate limit public endpoints — no unbounded access.
