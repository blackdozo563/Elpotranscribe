#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin || "$(uname -m)" != arm64 ]]; then
  echo 'La compilation native nécessite macOS Apple Silicon et Xcode 26 (Swift 6.2+).' >&2
  exit 1
fi
swift build --package-path native/swift --configuration release --arch arm64
mkdir -p src-tauri/binaries
cp native/swift/.build/arm64-apple-macosx/release/elpo-asr src-tauri/binaries/elpo-asr-aarch64-apple-darwin
codesign --force --sign - src-tauri/binaries/elpo-asr-aarch64-apple-darwin
file src-tauri/binaries/elpo-asr-aarch64-apple-darwin | /usr/bin/grep -q arm64
