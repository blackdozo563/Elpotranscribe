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
file "$app/Contents/MacOS/elpotranscribe" | grep -q arm64
file "$app/Contents/MacOS/elpo-asr" | grep -q arm64
codesign --verify --deep --strict --verbose=2 "$app"
for binary in "$app/Contents/MacOS/elpotranscribe" "$app/Contents/MacOS/elpo-asr"; do
  otool -L "$binary"
  if otool -L "$binary" | grep -E '/opt/homebrew|/usr/local|/Users/runner|/workspace'; then
    echo 'Dépendance de développement externe détectée' >&2; exit 1
  fi
done
python3 scripts/smoke-native.py "$app/Contents/MacOS/elpo-asr"
echo 'DMG, ARM64, signatures ad hoc et inférence du moteur empaqueté validés.'
