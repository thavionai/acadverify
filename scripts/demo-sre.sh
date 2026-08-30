#!/usr/bin/env bash
#
# Drives the observability demo: issue a real credential, verify it honestly a
# few times, forge it, then hammer the forged copy until the anomaly detector
# notices and blocklists the source.
#
# Watch it land on the Grafana "Security & Anomalies" dashboard:
#   http://localhost:3001/d/acad-security   (admin / acadverify)
#
# Requires CHAIN_MODE=live and ALLOW_DEBUG_ENDPOINTS=true.
set -euo pipefail

API=${API:-http://127.0.0.1:8080/api/v1}
CHAIN=${CHAIN:-http://127.0.0.1:8090}
ISSUER=${ISSUER:-mn_shield-addr1_sre_demo}

say() { printf "\n\033[1;33m>> %s\033[0m\n" "$1"; }

say "Registering the institution"
curl -s -o /dev/null -X PUT "$API/institutions/me" \
  -H 'Content-Type: application/json' -H "X-Issuer-Address: $ISSUER" \
  -d '{"name":"SRE Demo University","website":"https://sre.example","contactEmail":"ops@sre.example","country":"CA"}'

say "Issuing a credential on-chain (real zero-knowledge proof, about 25s)"
ID=$(curl -s --max-time 400 -X POST "$API/credentials" \
  -H 'Content-Type: application/json' -H "X-Issuer-Address: $ISSUER" \
  -d '{"studentName":"SRE Demo","studentId":"S-9","degree":"BSc Computer Science",
       "graduationDate":"2026-06-15","institution":"SRE Demo University","major":"CS",
       "honors":"","gpa":"3.80"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')
echo "   credential: $ID"

say "Three honest verifications -- these count as VALID"
for i in 1 2 3; do
  printf "   %s\n" "$(curl -s --max-time 60 "$API/verify/$ID" \
    | python3 -c 'import json,sys; print("status:", json.load(sys.stdin)["status"])')"
done

say "Tampering with the credential's private data (simulating a forger)"
curl -s -o /dev/null -w "   tamper endpoint: %{http_code}\n" -X POST "$CHAIN/chain/debug/tamper/$ID"

say "Six verification attempts against the forged credential"
for i in 1 2 3 4 5 6; do
  printf "   %s\n" "$(curl -s --max-time 60 "$API/verify/$ID" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); print("status:", d.get("status") or d.get("error",{}).get("code"))')"
done

say "Waiting for the detector's polling window"
sleep 35

say "What the anomaly detector concluded"
curl -s "http://127.0.0.1:9700/metrics" \
  | grep -E '^acadverify_(verifications_total|fake_cert_alerts_total)' | sed 's/^/   /'

echo
docker compose -f observability/docker-compose.observability.yml logs --tail=40 anomaly-detector 2>/dev/null \
  | grep -i "fake-cert" | tail -2 | sed 's/^/   /'
echo
