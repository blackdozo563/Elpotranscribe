#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
repository="$PWD"
# Compile the same protocol, checksum and streaming converter sources in each
# helper, keeping FluidAudio and MLX in separate processes/dependency graphs.
mkdir -p native/qwen/Sources/ElpoQwen/Generated
cp native/swift/Sources/ElpoASR/{Support,Audio}.swift native/qwen/Sources/ElpoQwen/Generated/
cd native/qwen
xcodebuild -scheme elpo-qwen -configuration Release \
  -destination 'platform=macOS,arch=arm64' -derivedDataPath "$repository/target/qwen-xcode" \
  -clonedSourcePackagesDirPath "$repository/target/qwen-packages" \
  MACOSX_DEPLOYMENT_TARGET=14.0 CODE_SIGNING_ALLOWED=NO build
cd "$repository"
products=target/qwen-xcode/Build/Products/Release
mkdir -p src-tauri/binaries src-tauri/resources/qwen
cp "$products/elpo-qwen" src-tauri/binaries/elpo-qwen-aarch64-apple-darwin
codesign --force --sign - src-tauri/binaries/elpo-qwen-aarch64-apple-darwin
# MLX's compiled Metal resource must travel with the app, never depend on Xcode.
shader="$(find "$products" -name default.metallib -print -quit)"
test -n "$shader"
cp "$shader" src-tauri/resources/qwen/mlx.metallib
