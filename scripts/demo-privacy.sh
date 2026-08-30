#!/usr/bin/env bash
#
# The Midnight privacy story, in two halves:
#
#   1. The real contract compiles -- 4 circuits, prover and verifier keys.
#   2. A copy with a deliberate privacy leak REFUSES to compile.
#
# The second half is the point. In Compact, leaking a witness value is not a
# code-review question or a runtime check somebody can forget. It is a build
# failure, and the compiler names the exact path the data would have taken.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/midnight/contracts/academic_credential.compact"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

say()  { printf "\n\033[1;33m>> %s\033[0m\n" "$1"; }
good() { printf "\033[1;32m%s\033[0m\n" "$1"; }
bad()  { printf "\033[1;31m%s\033[0m\n" "$1"; }

say "What the contract keeps private"
grep -n "^witness" "$SRC" | sed 's/^/   /'
echo
echo "   These are PLONK private inputs. They never reach the chain."

say "What a verification is allowed to return"
sed -n '/^export struct DisclosedClaim/,/^}/p' "$SRC" | sed 's/^/   /'
echo
good "   Note what is missing: studentId. There is no field for it."
echo "   Hiding the holder's identity is not a rule we remember to follow."
echo "   It is unrepresentable in the type."

say "Compiling the real contract"
cd "$ROOT/midnight/chain-service"
if npm run compact 2>&1 | grep -E "Compiling|circuit"; then
  good "   Compiled."
  echo
  echo "   Artifacts produced:"
  ls managed/academic_credential/keys 2>/dev/null | sed 's/^/     /'
fi

say "Now the same contract with ONE line added, leaking the student's id on-chain"
cp "$SRC" "$WORK/leaky.compact"
python3 - "$WORK/leaky.compact" <<'PY'
import io, sys
p = sys.argv[1]; s = io.open(p, encoding="utf-8").read()
s = s.replace(
'''  assert(issuers.member(disclose(pk)), "issuer not authorized");''',
'''  assert(issuers.member(disclose(pk)), "issuer not authorized");
  credentials.insert(fields.studentId, fields.studentId);   // <-- the leak''', 1)
io.open(p, 'w').write(s)
PY
grep -n "the leak" "$WORK/leaky.compact" | sed 's/^/   /'

say "Asking the compiler to build it"
cd "$WORK"
if compact compile +0.31.1 leaky.compact ./out 2>&1 | sed 's/^/   /'; then
  bad "   It compiled. That would be a problem."
else
  echo
  good "   REFUSED. The compiler traced the leak and stopped the build."
  echo "   A privacy bug here cannot reach production, because it cannot"
  echo "   reach a binary."
fi
echo
