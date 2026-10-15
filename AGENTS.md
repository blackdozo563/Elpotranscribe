# ELPOTRANSCRIBE

- Application macOS 14+, Apple Silicon ; Tauri 2, React, Rust, pont Swift FluidAudio.
- Utiliser le checkout existant. Ne pas créer de worktree sauf demande explicite.
- Lire README.md et docs/VALIDATION.md avant de déclarer un livrable prêt.
- Ne jamais présenter une interface ou une simulation IPC comme preuve d’inférence.
- `npm ci`, `npm run build`, `npm test`, `npm run test:browser`.
- `cargo test -p elpo-core --locked` et `cargo clippy -p elpo-core --locked -- -D warnings`.
- macOS ARM64 + Xcode 26 / Swift 6.2+ et CMake nécessaires pour `npm run native:build`, `swift test --package-path native/swift`, `npm run tauri -- build --target aarch64-apple-darwin -- --locked`.
- Ne pas inventer de temps de mots, de scores, de progression, de disponibilité moteur ni de résultats M1/M2.
- Ne pas committer de modèles, d’audios utilisateurs, de secrets ni d’artefacts DMG.
- Préserver les accents et les noms d’origine ; protéger les audios et demander avant tout écrasement d’export.

## Design

- App Mac, pas site web : aucun surtitre marketing, aucun fil d’Ariane, aucun texte promotionnel dans l’interface.
- Échelle : texte 13 px, secondaire 12 px, titres de page 22 px semibold. Contrôles de 28 px (32 px pour l’action principale). Lignes de barre latérale de 28 px.
- Couleurs uniquement via les tokens : violet = action principale et sélection, rien d’autre ; ambre = divergences et points à relire ; vert = terminé ou vérifié ; corail = erreur. Fond neutre, sans teinte violette.
- Polices : system-ui pour l’interface, ui-serif pour le texte transcrit, ui-monospace avec tabular-nums pour les temps.
- Séparer par l’espacement et les nuances de fond plutôt que par des bordures. Jamais de carte dans une carte.
- Curseur flèche sur les boutons. Interface non sélectionnable, sauf les champs et le texte transcrit.
- Animations de 300 ms maximum, courbe --ease-mac, désactivées sous prefers-reduced-motion.
- Une seule mention de confidentialité : la pastille « Mode local ».
- Une icône = un sens. Jamais l’icône d’envoi (upload) pour un import local.
- Menus « … » natifs via @tauri-apps/api/menu.
- Nombres et dates au format fr-FR via Intl.
- Refonte sur la branche refonte-interface du checkout existant, sans worktree. Ne pas modifier l’inférence, les horodatages ni le format des exports.
- À chaque phase : build, tests TypeScript et navigateur, tests et Clippy du cœur Rust ; Swift sur macOS uniquement. Tous les contrôles exécutables doivent réussir avant le commit « Phase N — titre » et le démarrage de la phase suivante.
- Captures Playwright avant/après chaque écran modifié dans .ui-captures/ (non versionné). Ces captures montrent uniquement l’interface ; les fixtures IPC ne prouvent jamais l’inférence.
