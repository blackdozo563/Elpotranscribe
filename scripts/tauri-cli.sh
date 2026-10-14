#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# GitHub expands absent secrets to empty strings. Tauri treats present certificate
# variables as configured, so remove empty optional bindings before calling it.
for variable in APPLE_CERTIFICATE APPLE_CERTIFICATE_PASSWORD APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [[ -z "${!variable:-}" ]]; then unset "$variable"; fi
done
mkdir -p target
set +e
npm run tauri -- "$@" 2>&1 | tee target/tauri-build.log
status=${PIPESTATUS[0]}
set -e
if [[ "$status" -ne 0 && "${GITHUB_ACTIONS:-}" == true ]]; then
  python3 scripts/report-build-errors.py target/tauri-build.log
fi
exit "$status"
