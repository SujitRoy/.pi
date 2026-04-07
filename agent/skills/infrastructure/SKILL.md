---
name: infrastructure
description: Docker, CI/CD, cloud deployment, and infrastructure-as-code best practices
---

- Containerize with minimal base images (alpine, distroless, scratch).
- No hardcoded config — use environment variables or config maps.
- CI/CD pipelines must lint, test, and build before deploy.
- Infrastructure-as-code: version everything, test changes, rollback-safe.
- Multi-stage builds to keep production images small.
- Health checks on every service — no silent failures.
- Pin dependency versions — no floating tags in production.
- Secrets via vault or env injection, never in Dockerfiles or repos.
