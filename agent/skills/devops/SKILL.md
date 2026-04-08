---
name: devops
description: CI/CD, automation, and deployment best practices for Python and web
---

- CI/CD: Run tests, lint, build before deploy. Python: tox, black, mypy.
- Containers: Multi-stage builds, slim Python images, health checks.
- Deployment: Blue-green or canary for zero downtime.
- Secrets: Environment variables or vault, never in code.
- Monitoring: Application metrics, log aggregation, alerting.
- Infrastructure as Code: Terraform, CloudFormation, version controlled.
- Rollbacks: Always test rollback procedures before deploying.
- Cost: Right-size resources, use spot for stateless.
- Python-specific: Use Gunicorn/Uvicorn with proper workers.
- Static sites: CDN caching, asset optimization, SSL.