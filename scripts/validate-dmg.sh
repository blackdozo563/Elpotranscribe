#!/usr/bin/env bash
set -euo pipefail
image="$1"
mount_dir="$(mktemp -d)"
cleanup() { hdiutil detach "$mount_dir" -quiet || true; rmdir "$mount_dir" || true; }
trap cleanup EXIT
hdiutil verify "$image"
hdiutil attach "$image" -readonly -nobrowse -mountpoint "$mount_dir" -quiet
app="$mount_dir/ELPOTRANSCRIBE.app"
test -L "$mount_dir/Applications"
test -x "$app/Contents/MacOS/elpotranscribe"
test -x "$app/Contents/MacOS/elpo-asr"
test -f "$app/Contents/Resources/bench-local.sh"
bash -n "$app/Contents/Resources/bench-local.sh"
file "$app/Contents/MacOS/elpotranscribe" | grep -q arm64
file "$app/Contents/MacOS/elpo-asr" | grep -q arm64
codesign --verify --deep --strict --verbose=2 "$app"
for binary in "$app/Contents/MacOS/elpotranscribe" "$app/Contents/MacOS/elpo-asr"; do
  otool -L "$binary"
  if otool -L "$binary" | grep -E '/opt/homebrew|/usr/local|/Users/runner|/workspace'; then
    echo 'Dépendance de développement externe détectée' >&2; exit 1
  fi
done
if [[ "${ELPO_VALIDATION_MODE:-short}" == long ]]; then
  python3 scripts/smoke-long.py "$app/Contents/MacOS/elpo-asr"
else
  python3 scripts/smoke-release.py "$app/Contents/MacOS/elpo-asr"
fi
echo 'DMG, ARM64, signatures ad hoc et inférence du moteur empaqueté validés.'
