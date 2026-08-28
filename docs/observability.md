# AcadVerify — Observability & Security Monitoring (SRE)

Everything lives in `observability/` and runs as its own compose project so it
never interferes with the app stack.

## Quick start

```bash
docker compose -f observability/docker-compose.observability.yml -p acadverify-obs up -d
```

| Surface | URL | Login |
|---|---|---|
| **Grafana** (dashboards) | http://localhost:3001 | `admin` / `acadverify` |
| Prometheus (metrics + alert state) | http://localhost:9090 | — |
| Loki (log API) | http://localhost:3100 | — |
| cAdvisor (raw container stats) | http://localhost:8081 | — |
| Detector metrics | http://localhost:9700/metrics | — |

The stack observes **every container on the host** — the three Midnight
services, DynamoDB Local, MinIO, and the app services as they land — via the
Docker socket (logs) and cgroups (resources). No app changes are required for
logs and resource monitoring; verification-security signals need the log
contract below.

## What's included

| Concern | Component | Dashboard |
|---|---|---|
| Live log monitoring | Loki + Promtail (Docker service discovery) | **AcadVerify — Live Logs** |
| System resources (containers + host) | cAdvisor + node-exporter → Prometheus | **AcadVerify — System Resources** |
| Fake-cert detection, anomaly detection, blocklist | `anomaly-detector` (Python) | **AcadVerify — Security & Anomalies** |
| Alerting rules | Prometheus (`observability/prometheus/alerts.yml`) | Prometheus → Alerts |
| CI security | gitleaks + Trivy + compose validation | `.github/workflows/security.yml` |

## The log contract (backend + chain-service teams: read this)

The detector derives its security signals from log lines. Log every
verification attempt as **one line** containing these `key=value` tokens (JSON
logs with the same field names also work):

```
event=verification status=VALID|REVOKED|INVALID_PROOF ip=<client-ip> credentialId=<id>
```

FastAPI example:

```python
logger.info("event=verification status=%s ip=%s credentialId=%s",
            result.status, request.client.host, credential_id)
```

Without these lines the system/log dashboards still work; the verification
panels on the Security dashboard stay empty.

## Detection logic (`observability/anomaly-detector/detector.py`)

On Midnight, a forged credential **cannot produce a valid proof** — so failed
proofs are the forgery signal. The detector polls Loki every 15s and maintains:

1. **Fake-certificate probing** — ≥5 `INVALID_PROOF` results from one IP within
   5 minutes → alert + the IP is written to the blocklist. Someone iterating on
   a doctored certificate hits this on their fifth try.
2. **Credential enumeration** — one `credentialId` proven ≥20× in 5 minutes →
   alert (scraping/stalking pattern, or a viral share — investigate, don't
   auto-block).
3. **Traffic anomaly** — z-score of the current verification rate against a
   rolling baseline (~40 windows). Fires at |z| > 3 — catches both attack spikes
   and silent outages (a drop is also an anomaly).
4. **Error bursts** — ≥20 ERROR-level lines from one container in one poll.

Thresholds are env vars on the `anomaly-detector` service — tune in the compose
file. All signals are exported as Prometheus metrics (`acadverify_*`), so alert
rules and dashboards stay in one system.

## Security protection

**Blocklist enforcement.** The detector writes offending IPs to the
`detector-data` volume as `blocklist.json` (`{ip: unix_ts}`). The backend
enforces it with a middleware that re-reads the file at most once per second:

```python
# FastAPI middleware sketch — backend team wires this up
@app.middleware("http")
async def enforce_blocklist(request: Request, call_next):
    if request.client.host in load_blocklist():   # cached, 1s TTL
        return JSONResponse({"error": {"code": "RATE_LIMITED"}}, status_code=429)
    return await call_next(request)
```

Return **429, not 403** — don't confirm to an attacker that they were flagged.
Mount the volume read-only into the backend container.

**Also active:**
- CI: gitleaks (leaked secrets), Trivy fs scan (CRITICAL/HIGH block the PR),
  compose validation — `.github/workflows/security.yml`
- Rate limiting on `/verify` remains an app-level control per `api-spec.md`
  (per-IP; the blocklist is the escalation above it)
- Secrets hygiene per `deployment.md` (Secrets Manager; nothing in the repo)

## Alert catalog

| Alert | Severity | Meaning |
|---|---|---|
| `MidnightServiceDown` | critical | node / indexer / proof-server container gone >60s — verification is down |
| `FakeCertProbing` | critical | IP crossed the INVALID_PROOF threshold; blocklisted |
| `HostMemoryLow` | critical | <10% RAM free — proof server OOM turns into 503s on /verify |
| `CredentialEnumeration` | warning | one credential hammered — investigate first |
| `AnomalousVerificationRate` | warning | traffic ±3σ from baseline |
| `ErrorLogBurst` | warning | error spike in one container |
| `ContainerHighCpu` | warning | sustained >90% of a core (proof server: saturated worker pool) |
| `HostDiskLow` / `BlocklistGrowing` | warning | housekeeping |

Alerts are visible in Prometheus (→ Alerts) and on the dashboards. Routing to
Slack/PagerDuty via Alertmanager is a post-hackathon step; in AWS these map to
CloudWatch alarms + SNS per `deployment.md`.

## Demo tip

The Security dashboard is itself demo material: run the smoke test's forge step
(`npm run smoke` in the chain-service) a few times from one machine and watch
the INVALID_PROOF panel spike, the fake-cert alert fire, and the IP land on the
blocklist — live fraud detection on stage.

## Production mapping (AWS)

| Local | Production |
|---|---|
| Prometheus + cAdvisor/node-exporter | CloudWatch Container Insights (ECS) |
| Loki + Promtail | CloudWatch Logs + Logs Insights |
| Grafana | Amazon Managed Grafana (or CloudWatch dashboards) |
| anomaly-detector | Same container as an ECS service; blocklist in DynamoDB; escalation to WAF IP set |
| Prometheus alerts | CloudWatch alarms → SNS |
