# ELPOTRANSCRIBE

- Application macOS 14+, Apple Silicon ; Tauri 2, React, Rust, pont Swift FluidAudio.
- Utiliser le checkout existant. Ne pas créer de worktree sauf demande explicite.
- Lire README.md et docs/VALIDATION.md avant de déclarer un livrable prêt.
- Ne jamais présenter une interface ou une simulation IPC comme preuve d’inférence.
- `npm ci`, `npm run build`, `npm test`, `npm run test:browser`.
- `cargo test -p elpo-core --locked` et `cargo clippy -p elpo-core --locked -- -D warnings`.
- macOS ARM64 + Xcode 26 / Swift 6.2+ nécessaires pour `npm run native:build`, `swift test --package-path native/swift`, `npm run tauri -- build --target aarch64-apple-darwin -- --locked`.
- Ne pas inventer de temps de mots, de scores, de progression, de disponibilité moteur ni de résultats M1/M2.
- Ne pas committer de modèles, d’audios utilisateurs, de secrets ni d’artefacts DMG.
- Préserver les accents et les noms d’origine ; protéger les audios et demander avant tout écrasement d’export.
