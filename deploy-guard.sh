#!/bin/bash
# Refuses to deploy unless the deployable source here is identical to origin/main of
# FrankDark007/aries-cloud-dashboard, the only deploy source for the aries.flood.doctor Worker.
# Set ARIES_DASHBOARD_GUARD_OFF=1 to skip (recorded in the output). Undo: see DEPLOY-SOURCE.md.
set -u
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
HERE="$(cd "$(dirname "$0")" && pwd)"
if [ "${ARIES_DASHBOARD_GUARD_OFF:-}" = 1 ]; then echo "deploy-guard: SKIPPED by ARIES_DASHBOARD_GUARD_OFF=1"; exit 0; fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
if ! git clone -q --depth 1 https://github.com/FrankDark007/aries-cloud-dashboard.git "$TMP/o" 2>"$TMP/err"; then
  echo "deploy-guard: cannot fetch origin/main of aries-cloud-dashboard, refusing to deploy"; cat "$TMP/err" | head -3; exit 1
fi
bad=0
for p in src migrations schema.sql package.json tsconfig.json; do
  if ! diff -rq "$TMP/o/$p" "$HERE/$p" >"$TMP/d" 2>&1; then echo "deploy-guard: $p differs from origin/main:"; head -5 "$TMP/d"; bad=1; fi
done
if [ $bad = 1 ]; then
  echo "deploy-guard: REFUSED. Deploy only from a checkout of FrankDark007/aries-cloud-dashboard at origin/main ($(git -C "$TMP/o" rev-parse --short HEAD))."
  exit 1
fi
echo "deploy-guard: source matches aries-cloud-dashboard origin/main $(git -C "$TMP/o" rev-parse --short HEAD)"
