#!/usr/bin/env bash
# Installed app only; macOS tools, no Python/Node/Homebrew/dev toolchain.
set -euo pipefail
script_dir="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -x "$script_dir/../MacOS/elpotranscribe" ]]; then
  binary="$script_dir/../MacOS/elpotranscribe"
else
  binary="${ELPO_APP:-/Applications/ELPOTRANSCRIBE.app}/Contents/MacOS/elpotranscribe"
fi
if [[ ! -x "$binary" ]]; then
  echo 'Installez ELPOTRANSCRIBE 1.2.0 dans Applications ou définissez ELPO_APP.' >&2
  exit 1
fi
exec "$binary" --bench-local "$@"
