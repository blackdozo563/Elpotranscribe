#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
revision=2eeeba56e9edd762b4b38467bab96c2517163158
source_dir="$PWD/target/whisper/source"
mkdir -p target/whisper
if [[ ! -d "$source_dir/.git" ]]; then
  git clone https://github.com/ggml-org/whisper.cpp.git "$source_dir"
fi
git -C "$source_dir" checkout --detach "$revision"
test "$(git -C "$source_dir" rev-parse HEAD)" = "$revision"
cmake -S "$source_dir" -B target/whisper/build \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=14.0 -DBUILD_SHARED_LIBS=OFF \
  -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_EXAMPLES=OFF \
  -DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DGGML_NATIVE=OFF \
  -DGGML_BLAS=ON -DGGML_ACCELERATE=ON
cmake --build target/whisper/build --config Release --parallel 3
mkdir -p target/whisper/lib
find target/whisper/build -name '*.a' -exec cp '{}' target/whisper/lib/ \;
