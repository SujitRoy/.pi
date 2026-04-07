---
name: data
description: Database design, migrations, queries, and data integrity best practices
---

- Use parameterized queries — never string-concat SQL.
- Add indexes for frequently queried columns before they become slow.
- Migrations must be forward-only and rollback-safe.
- No N+1 queries — use eager loading or batch queries.
- Enforce constraints at the database level, not just in application code.
- Use transactions for multi-step data changes.
- Back up before destructive operations in production.
- Log slow queries and investigate — do not ignore them.
