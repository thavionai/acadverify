"""AcadVerify anomaly detector.

Polls Loki for container logs and derives security/health signals:

  1. Fake-certificate detection — repeated INVALID_PROOF results from one
     source IP mean someone is iterating on forged credentials (a forged
     credential cannot produce a valid proof, so failed proofs ARE the
     forgery signal on Midnight). Offending IPs go on a blocklist that the
     backend enforces (docs/observability.md §Blocklist).
  2. Credential enumeration — one credentialId proven at abnormal volume.
  3. Verification-rate anomaly — z-score of the current window against a
     rolling baseline; catches both spikes (abuse) and drops (outage).
  4. Error bursts — ERROR-level log lines per container.

Log contract (docs/observability.md): backend/chain-service log verification
events as single lines containing `event=verification`, `status=<VALID|
REVOKED|INVALID_PROOF>`, `ip=<addr>`, `credentialId=<id>`. The regexes below
also tolerate JSON logs with the same field names.

All signals are exported as Prometheus metrics on :9700; alert rules live in
observability/prometheus/alerts.yml.
"""

import json
import os
import re
import statistics
import time
from collections import defaultdict, deque
from pathlib import Path

import requests
from prometheus_client import Counter, Gauge, start_http_server

LOKI_URL = os.environ.get("LOKI_URL", "http://loki:3100")
POLL_SECONDS = int(os.environ.get("POLL_SECONDS", "15"))
WINDOW_MINUTES = int(os.environ.get("WINDOW_MINUTES", "5"))
INVALID_PROOF_THRESHOLD = int(os.environ.get("INVALID_PROOF_THRESHOLD", "5"))
CREDENTIAL_PROBE_THRESHOLD = int(os.environ.get("CREDENTIAL_PROBE_THRESHOLD", "20"))
ERROR_BURST_THRESHOLD = int(os.environ.get("ERROR_BURST_THRESHOLD", "20"))
ZSCORE_THRESHOLD = float(os.environ.get("ZSCORE_THRESHOLD", "3.0"))
BLOCKLIST_PATH = Path(os.environ.get("BLOCKLIST_PATH", "/data/blocklist.json"))
BASELINE_WINDOWS = 40  # rolling baseline size for the z-score

VERIFICATIONS = Counter(
    "acadverify_verifications_total", "Verification events seen in logs", ["status"]
)
FAKE_CERT_ALERTS = Counter(
    "acadverify_fake_cert_alerts_total",
    "IPs that crossed the INVALID_PROOF threshold (forged-credential probing)",
)
CREDENTIAL_PROBE_ALERTS = Counter(
    "acadverify_credential_probe_alerts_total",
    "Credentials proven at abnormal volume (enumeration/scraping)",
)
LOG_ERRORS = Counter(
    "acadverify_log_errors_total", "ERROR-level log lines", ["container"]
)
ERROR_BURSTS = Counter(
    "acadverify_error_burst_alerts_total", "Error-burst alerts", ["container"]
)
BLOCKLIST_SIZE = Gauge("acadverify_blocklist_size", "IPs currently blocklisted")
RATE_ZSCORE = Gauge(
    "acadverify_verification_rate_zscore",
    "Z-score of current verification rate vs rolling baseline",
)
LAST_POLL_OK = Gauge(
    "acadverify_detector_last_poll_success",
    "1 if the last Loki poll succeeded, else 0",
)

# `status=VALID` / "status":"VALID" / status: INVALID_PROOF
STATUS_RE = re.compile(r'status["\s:=]+([A-Z_]+)')
IP_RE = re.compile(r'ip["\s:=]+([0-9a-fA-F.:]+)')
CREDENTIAL_RE = re.compile(r'credential[_]?[iI]d["\s:=]+([\w-]+)')
ERROR_RE = re.compile(r"\b(ERROR|error|Err|panic|Traceback)\b")
VERIFICATION_EVENT_RE = re.compile(r'event["\'\s:=]+verification')


class Blocklist:
    def __init__(self, path: Path):
        self.path = path
        self.ips: dict[str, float] = {}
        if path.exists():
            try:
                self.ips = json.loads(path.read_text())
            except (json.JSONDecodeError, OSError):
                self.ips = {}
        BLOCKLIST_SIZE.set(len(self.ips))

    def add(self, ip: str) -> bool:
        if ip in self.ips:
            return False
        self.ips[ip] = time.time()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.ips, indent=2))
        BLOCKLIST_SIZE.set(len(self.ips))
        return True


def query_loki(start_ns: int, end_ns: int) -> list[tuple[str, str]]:
    """Return (container, line) pairs for the interval."""
    resp = requests.get(
        f"{LOKI_URL}/loki/api/v1/query_range",
        params={
            "query": '{container=~".+"}',
            "start": start_ns,
            "end": end_ns,
            "limit": 5000,
            "direction": "forward",
        },
        timeout=10,
    )
    resp.raise_for_status()
    out = []
    for stream in resp.json().get("data", {}).get("result", []):
        container = stream.get("stream", {}).get("container", "unknown")
        out.extend((container, v[1]) for v in stream.get("values", []))
    return out


def main() -> None:
    start_http_server(9700)
    blocklist = Blocklist(BLOCKLIST_PATH)
    window_secs = WINDOW_MINUTES * 60
    invalid_by_ip: deque[tuple[float, str]] = deque()
    proofs_by_cred: deque[tuple[float, str]] = deque()
    rate_baseline: deque[int] = deque(maxlen=BASELINE_WINDOWS)
    alerted_creds: set[str] = set()
    last_end = time.time() - POLL_SECONDS

    print(f"[detector] polling {LOKI_URL} every {POLL_SECONDS}s", flush=True)
    while True:
        now = time.time()
        try:
            lines = query_loki(int(last_end * 1e9), int(now * 1e9))
            LAST_POLL_OK.set(1)
        except requests.RequestException as exc:
            print(f"[detector] loki poll failed: {exc}", flush=True)
            LAST_POLL_OK.set(0)
            time.sleep(POLL_SECONDS)
            continue
        last_end = now

        window_verifications = 0
        errors_this_poll: dict[str, int] = defaultdict(int)

        for container, line in lines:
            if ERROR_RE.search(line):
                LOG_ERRORS.labels(container=container).inc()
                errors_this_poll[container] += 1

            if not VERIFICATION_EVENT_RE.search(line):
                continue
            status_m = STATUS_RE.search(line)
            if not status_m:
                continue
            status = status_m.group(1)
            VERIFICATIONS.labels(status=status).inc()
            window_verifications += 1

            ip_m = IP_RE.search(line)
            cred_m = CREDENTIAL_RE.search(line)
            if status == "INVALID_PROOF" and ip_m:
                invalid_by_ip.append((now, ip_m.group(1)))
            if cred_m:
                proofs_by_cred.append((now, cred_m.group(1)))

        cutoff = now - window_secs
        while invalid_by_ip and invalid_by_ip[0][0] < cutoff:
            invalid_by_ip.popleft()
        while proofs_by_cred and proofs_by_cred[0][0] < cutoff:
            proofs_by_cred.popleft()

        # 1. Fake-certificate probing: INVALID_PROOF per IP over the window
        per_ip: dict[str, int] = defaultdict(int)
        for _, ip in invalid_by_ip:
            per_ip[ip] += 1
        for ip, count in per_ip.items():
            if count >= INVALID_PROOF_THRESHOLD and blocklist.add(ip):
                FAKE_CERT_ALERTS.inc()
                print(
                    f"[ALERT] fake-cert probing: {ip} produced {count} "
                    f"INVALID_PROOF in {WINDOW_MINUTES}m — blocklisted",
                    flush=True,
                )

        # 2. Credential enumeration
        per_cred: dict[str, int] = defaultdict(int)
        for _, cred in proofs_by_cred:
            per_cred[cred] += 1
        for cred, count in per_cred.items():
            if count >= CREDENTIAL_PROBE_THRESHOLD and cred not in alerted_creds:
                alerted_creds.add(cred)
                CREDENTIAL_PROBE_ALERTS.inc()
                print(
                    f"[ALERT] credential {cred} proven {count}x in "
                    f"{WINDOW_MINUTES}m — enumeration?",
                    flush=True,
                )

        # 3. Verification-rate anomaly (needs a few windows of baseline first)
        if len(rate_baseline) >= 10:
            mean = statistics.fmean(rate_baseline)
            stdev = statistics.pstdev(rate_baseline) or 1.0
            RATE_ZSCORE.set(abs(window_verifications - mean) / stdev)
        rate_baseline.append(window_verifications)

        # 4. Error bursts
        for container, count in errors_this_poll.items():
            if count >= ERROR_BURST_THRESHOLD:
                ERROR_BURSTS.labels(container=container).inc()
                print(
                    f"[ALERT] error burst: {container} logged {count} errors "
                    f"in one poll",
                    flush=True,
                )

        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
