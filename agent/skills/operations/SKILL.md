---
name: operations
description: Production operations, incident response, disaster recovery, and cost optimization
---

- Health checks: every service needs readiness and liveness probes.
- Incident response: declare early, maintain runbooks, postmortems within 48 hours.
- Rollback procedures: test before deployment, automate where possible.
- Capacity planning: monitor 95th percentile latency, error budgets, SLO/SLI tracking.
- Disaster recovery: define RTO and RPO, run regular drills.
- Backup verification: regular restore tests, backup integrity checks.
- Change management: risk assessment, approval workflow, canary deployments.
- Cost optimization: right-size resources, spot instances for stateless workloads.
- Capacity management: load testing before traffic spikes, autoscaling rules, rate limiting.
