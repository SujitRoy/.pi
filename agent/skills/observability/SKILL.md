---
name: observability
description: Logging, metrics, tracing, and alerting for production systems
---

- Structured logging only (JSON) — no free-form text in production logs.
- Log levels: ERROR (actionable), WARN (investigate), INFO (audit), DEBUG (dev).
- No secrets, tokens, or PII in logs — ever.
- Add metrics for request rates, error rates, and latency percentiles.
- Tracing across service boundaries for multi-step requests.
- Alert on symptoms, not causes — alert fatigue kills reliability.
- Dashboards must show SLO status, not just raw numbers.
- If it is not monitored, it does not exist in production.
