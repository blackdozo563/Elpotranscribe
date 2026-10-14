#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
repository="$PWD"
# Compile the same protocol, checksum and streaming converter sources in each
# helper, keeping FluidAudio and MLX in separate processes/dependency graphs.
mkdir -p native/qwen/Sources/ElpoQwen/Generated
cp native/swift/Sources/ElpoASR/{Support,Audio}.swift native/qwen/Sources/ElpoQwen/Generated/
cd native/qwen
xcodebuild -list -json -clonedSourcePackagesDirPath "$repository/target/qwen-packages" > "$repository/target/qwen-schemes.json"
scheme="$(python3 - "$repository/target/qwen-schemes.json" <<'PY'
import json,sys
value=json.load(open(sys.argv[1]))
schemes=value.get('workspace',value.get('project',{})).get('schemes',[])
for candidate in ['ElpoQwen','elpo-qwen','ElpoQwen-Package']:
    if candidate in schemes:
        print(candidate)
        break
else:
    raise SystemExit('No Qwen scheme in workspace: '+repr(schemes))
PY
)"
xcodebuild -scheme "$scheme" -configuration Release -jobs 3 \
  -destination 'platform=macOS,arch=arm64' -derivedDataPath "$repository/target/qwen-xcode" \
  -clonedSourcePackagesDirPath "$repository/target/qwen-packages" \
  MACOSX_DEPLOYMENT_TARGET=14.0 CODE_SIGNING_ALLOWED=NO build
cd "$repository"
products=target/qwen-xcode/Build/Products/Release
mkdir -p src-tauri/binaries src-tauri/resources/qwen
cp "$products/elpo-qwen" src-tauri/binaries/elpo-qwen-aarch64-apple-darwin
helper=src-tauri/binaries/elpo-qwen-aarch64-apple-darwin
mkdir -p src-tauri/resources/qwen-runtime src-tauri/Frameworks
xcrun swift-stdlib-tool --copy --platform macosx --scan-executable "$helper" --destination src-tauri/resources/qwen-runtime
if ! otool -l "$helper" | grep -Fq '@executable_path/../Frameworks'; then
  install_name_tool -add_rpath '@executable_path/../Frameworks' "$helper"
fi
for library in src-tauri/resources/qwen-runtime/*.dylib; do
  test -f "$library" || continue
  codesign --force --sign - "$library"
  cp "$library" src-tauri/Frameworks/
done
codesign --force --sign - "$helper"
# MLX's compiled Metal resource must travel with the app, never depend on Xcode.
shader="$(find "$products" -name default.metallib -print -quit)"
test -n "$shader"
cp "$shader" src-tauri/resources/qwen/mlx.metallib

cp "$shader" src-tauri/binaries/mlx.metallib
