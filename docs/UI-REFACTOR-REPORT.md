# Compte rendu des onze phases

Branche `refonte-interface`, 16 octobre 2026. Implémentation et contrôles portables terminés. Les tests navigateur utilisent un IPC simulé ; ils ne prouvent pas l’inférence, les menus AppKit ou la copie système. Le [DMG 1.3.0](https://github.com/blackdozo563/Elpotranscribe/releases/download/v1.3.0/Elpotranscribe-macOS-Apple-Silicon-v1.3.0.dmg) est maintenant publié et son téléchargement/SHA-256 vérifié ; voir le compte rendu de livraison dans [VALIDATION.md](VALIDATION.md). Le détail des preuves et limites de chaque phase figure dans [VALIDATION.md](VALIDATION.md).

Les nombres ci-dessous sont les totaux exécutés à la fin de chaque phase, repris des rapports de validation ; ils ne s’additionnent pas. « — » signifie non consigné pour cette phase. Build TypeScript/Vite et Clippy du cœur ont réussi à chaque phase. Les résultats par phase ci-dessous sont historiques. La livraison 1.3.0 a depuis réussi les contrôles Swift/macOS en CI ; les essais interactifs sur votre Mac restent nécessaires.

| Phase | Commit | Tests TypeScript | Navigateur | Cœur Rust | App Rust portable |
|---|---|---:|---:|---:|---:|
| 1 — Cartographie et règles | `b11b522` | 11 | 15 | 28 | — |
| 2 — Fenêtre native et menus | `bad39ee` | 13 | 19 | 28 | — |
| 3 — Fondations visuelles | `7bffaeb` | 14 | 21 | 28 | — |
| 4 — Nettoyage global et modèles IA | `20ed53a` | 16 | 23 | 28 | 3 |
| 5 — Bibliothèque unique | `9504b51` | 19 | 26 | 28 | — |
| 6 — Relecture persistante | `f32945e` | 23 | 26 | 35 | 8 |
| 7 — Relecture dans l’éditeur | `1a70a01` | 27 | 31 | 35 | 8 |
| 8 — Parcours du second avis | `433e4bc` | 30 | 39 | 35 | 9 |
| 9 — Fenêtre Réglages | `0154d72` | 37 | 42 | 35 | 12 |
| 10 — Vocabulaire | `8d4176f` | 38 | 46 | 37 | 13 |
| 11 — Identité et finitions | commit de ce rapport | 41 | 53 | 37 | 14 |

## Phase 1 — Cartographie et règles

Audit des écrans, IPC, raccourcis, styles et règles de design ; aucun code applicatif modifié.

Fichiers modifiés :

- [.gitignore](../.gitignore)
- [AGENTS.md](../AGENTS.md)
- [docs/UI-AUDIT.md](../docs/UI-AUDIT.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)

Validation portable : build réussi, 11 tests TypeScript, 15 scénarios navigateur et 28 tests du cœur Rust réussis ; Clippy du cœur réussi.

## Phase 2 — Fenêtre native et menus

Barre de titre macOS et menus français reliés aux actions de l’éditeur ; confirmations existantes conservées.

Fichiers modifiés :

- [.github/workflows/release-macos.yml](../.github/workflows/release-macos.yml)
- [README.md](../README.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)
- [scripts/bench-local.sh](../scripts/bench-local.sh)
- [scripts/validate-dmg.sh](../scripts/validate-dmg.sh)
- [src-tauri/Cargo.toml](../src-tauri/Cargo.toml)
- [src-tauri/Info.plist](../src-tauri/Info.plist)
- [src-tauri/capabilities/default.json](../src-tauri/capabilities/default.json)
- [src-tauri/src/desktop.rs](../src-tauri/src/desktop.rs)
- [src-tauri/src/main.rs](../src-tauri/src/main.rs)
- [src-tauri/src/menus.rs](../src-tauri/src/menus.rs)
- [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json)
- [src/App.tsx](../src/App.tsx)
- [src/Vocabulary.tsx](../src/Vocabulary.tsx)
- [src/nativeMenu.ts](../src/nativeMenu.ts)
- [src/style.css](../src/style.css)
- [tests/browser/app.spec.ts](../tests/browser/app.spec.ts)
- [tests/nativeMenu.test.ts](../tests/nativeMenu.test.ts)

Validation portable : build réussi, 13 tests TypeScript, 19 scénarios navigateur et 28 tests du cœur Rust réussis ; Clippy du cœur réussi.

## Phase 3 — Fondations visuelles

Tokens sémantiques, échelle compacte, composants communs et respect du mouvement réduit.

Fichiers modifiés :

- [README.md](../README.md)
- [docs/UI-AUDIT.md](../docs/UI-AUDIT.md)
- [docs/UI-REFACTOR-PLAN.md](../docs/UI-REFACTOR-PLAN.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)
- [src-tauri/capabilities/default.json](../src-tauri/capabilities/default.json)
- [src/App.tsx](../src/App.tsx)
- [src/Vocabulary.tsx](../src/Vocabulary.tsx)
- [src/components/ui/Button.tsx](../src/components/ui/Button.tsx)
- [src/components/ui/NumberStepper.tsx](../src/components/ui/NumberStepper.tsx)
- [src/components/ui/Popover.tsx](../src/components/ui/Popover.tsx)
- [src/components/ui/Select.tsx](../src/components/ui/Select.tsx)
- [src/components/ui/StatusPill.tsx](../src/components/ui/StatusPill.tsx)
- [src/components/ui/TextField.tsx](../src/components/ui/TextField.tsx)
- [src/components/ui/index.ts](../src/components/ui/index.ts)
- [src/components/ui/showNativeMenu.ts](../src/components/ui/showNativeMenu.ts)
- [src/style.css](../src/style.css)
- [tests/browser/app.spec.ts](../tests/browser/app.spec.ts)
- [tests/contextMenu.test.ts](../tests/contextMenu.test.ts)

Validation portable : build réussi, 14 tests TypeScript, 21 scénarios navigateur et 28 tests du cœur Rust réussis ; Clippy du cœur réussi.

## Phase 4 — Nettoyage global et modèles IA

Titre et confidentialité uniques, modèles compacts, détails techniques repliés et taille mesurée sur disque.

Fichiers modifiés :

- [README.md](../README.md)
- [docs/UI-REFACTOR-PLAN.md](../docs/UI-REFACTOR-PLAN.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)
- [native/swift/Sources/ElpoASR/ElpoASR.swift](../native/swift/Sources/ElpoASR/ElpoASR.swift)
- [native/swift/Sources/ElpoASR/Support.swift](../native/swift/Sources/ElpoASR/Support.swift)
- [native/swift/Tests/ElpoASRTests/TimingTests.swift](../native/swift/Tests/ElpoASRTests/TimingTests.swift)
- [src-tauri/src/desktop.rs](../src-tauri/src/desktop.rs)
- [src-tauri/src/main.rs](../src-tauri/src/main.rs)
- [src-tauri/src/model_disk.rs](../src-tauri/src/model_disk.rs)
- [src/App.tsx](../src/App.tsx)
- [src/Models.tsx](../src/Models.tsx)
- [src/Vocabulary.tsx](../src/Vocabulary.tsx)
- [src/format.ts](../src/format.ts)
- [src/style.css](../src/style.css)
- [tests/browser/app.spec.ts](../tests/browser/app.spec.ts)
- [tests/format.test.ts](../tests/format.test.ts)

Validation portable : build réussi, 16 tests TypeScript, 23 scénarios navigateur et 28 tests du cœur Rust réussis ; Clippy du cœur réussi. App Rust : 3 tests portables réussis.

## Phase 5 — Bibliothèque unique

Archives et lot dans une liste recherchable et triable, menus par ligne et import par dépôt.

Fichiers modifiés :

- [README.md](../README.md)
- [docs/UI-REFACTOR-PLAN.md](../docs/UI-REFACTOR-PLAN.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)
- [src/App.tsx](../src/App.tsx)
- [src/Library.tsx](../src/LibraryView.tsx)
- [src/Models.tsx](../src/Models.tsx)
- [src/library.ts](../src/library.ts)
- [src/style.css](../src/style.css)
- [tests/browser/app.spec.ts](../tests/browser/app.spec.ts)
- [tests/browser/profiles.spec.ts](../tests/browser/profiles.spec.ts)
- [tests/library.test.ts](../tests/library.test.ts)

Validation portable : build réussi, 19 tests TypeScript, 26 scénarios navigateur et 28 tests du cœur Rust réussis ; Clippy du cœur réussi.

## Phase 6 — Relecture persistante

Plages UTF-16, identifiants et décisions persistants, transactions et annulation ; migration sauvegardée.

Fichiers modifiés :

- [README.md](../README.md)
- [crates/core/src/lib.rs](../crates/core/src/lib.rs)
- [crates/core/src/review_session.rs](../crates/core/src/review_session.rs)
- [docs/UI-REFACTOR-PLAN.md](../docs/UI-REFACTOR-PLAN.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)
- [src-tauri/src/desktop.rs](../src-tauri/src/desktop.rs)
- [src-tauri/src/history.rs](../src-tauri/src/history.rs)
- [src-tauri/src/main.rs](../src-tauri/src/main.rs)
- [src/domain.ts](../src/domain.ts)
- [src/review.ts](../src/review.ts)
- [src/reviewClient.ts](../src/reviewClient.ts)
- [tests/fixtures/history-v1.2.0.json](../tests/fixtures/history-v1.2.0.json)
- [tests/review.test.ts](../tests/review.test.ts)

Validation portable : build réussi, 23 tests TypeScript, 26 scénarios navigateur et 35 tests du cœur Rust réussis ; Clippy du cœur réussi. App Rust : 8 tests portables réussis.

## Phase 7 — Relecture dans l’éditeur

Soulignements, proposition ancrée, navigation clavier et décision sur la plage exacte ; aucune correction automatique.

Fichiers modifiés :

- [README.md](../README.md)
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [docs/UI-REFACTOR-PLAN.md](../docs/UI-REFACTOR-PLAN.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)
- [src/App.tsx](../src/App.tsx)
- [src/Review.tsx](../src/ReviewComponents.tsx)
- [src/reviewNavigation.ts](../src/reviewNavigation.ts)
- [src/style.css](../src/style.css)
- [tests/browser/app.spec.ts](../tests/browser/app.spec.ts)
- [tests/browser/review.spec.ts](../tests/browser/review.spec.ts)
- [tests/browser/reviewFixture.ts](../tests/browser/reviewFixture.ts)
- [tests/reviewNavigation.test.ts](../tests/reviewNavigation.test.ts)

Validation portable : build réussi, 27 tests TypeScript, 31 scénarios navigateur et 35 tests du cœur Rust réussis ; Clippy du cœur réussi. App Rust : 8 tests portables réussis.

## Phase 8 — Parcours du second avis

Feuille inversable et étapes observées, écran À relire ; protection des saisies en cours.

Fichiers modifiés :

- [README.md](../README.md)
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [docs/UI-REFACTOR-PLAN.md](../docs/UI-REFACTOR-PLAN.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)
- [src-tauri/src/desktop.rs](../src-tauri/src/desktop.rs)
- [src-tauri/src/history.rs](../src-tauri/src/history.rs)
- [src/App.tsx](../src/App.tsx)
- [src/SecondOpinion.tsx](../src/SecondOpinionViews.tsx)
- [src/domain.ts](../src/domain.ts)
- [src/secondOpinion.ts](../src/secondOpinion.ts)
- [src/style.css](../src/style.css)
- [tests/browser/app.spec.ts](../tests/browser/app.spec.ts)
- [tests/browser/reviewFixture.ts](../tests/browser/reviewFixture.ts)
- [tests/browser/secondOpinion.spec.ts](../tests/browser/secondOpinion.spec.ts)
- [tests/secondOpinion.test.ts](../tests/secondOpinion.test.ts)

Validation portable : build réussi, 30 tests TypeScript, 39 scénarios navigateur et 35 tests du cœur Rust réussis ; Clippy du cœur réussi. App Rust : 9 tests portables réussis.

## Phase 9 — Fenêtre Réglages

Fenêtre dédiée, patches synchronisés et aperçu d’un vrai segment sans nouvelles durées.

Fichiers modifiés :

- [README.md](../README.md)
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [docs/UI-REFACTOR-PLAN.md](../docs/UI-REFACTOR-PLAN.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)
- [src-tauri/capabilities/settings.json](../src-tauri/capabilities/settings.json)
- [src-tauri/src/desktop.rs](../src-tauri/src/desktop.rs)
- [src-tauri/src/history.rs](../src-tauri/src/history.rs)
- [src-tauri/src/main.rs](../src-tauri/src/main.rs)
- [src-tauri/src/menus.rs](../src-tauri/src/menus.rs)
- [src-tauri/src/preferences.rs](../src-tauri/src/preferences.rs)
- [src/App.tsx](../src/App.tsx)
- [src/Library.tsx](../src/LibraryView.tsx)
- [src/Models.tsx](../src/Models.tsx)
- [src/SettingsWindow.tsx](../src/SettingsWindow.tsx)
- [src/domain.ts](../src/domain.ts)
- [src/main.tsx](../src/main.tsx)
- [src/settingsClient.ts](../src/settingsClient.ts)
- [src/settingsPreview.ts](../src/settingsPreview.ts)
- [src/style.css](../src/style.css)
- [tests/browser/app.spec.ts](../tests/browser/app.spec.ts)
- [tests/browser/profiles.spec.ts](../tests/browser/profiles.spec.ts)
- [tests/browser/settings.spec.ts](../tests/browser/settings.spec.ts)
- [tests/browser/settingsFixture.ts](../tests/browser/settingsFixture.ts)
- [tests/settingsClient.test.ts](../tests/settingsClient.test.ts)
- [tests/settingsPreview.test.ts](../tests/settingsPreview.test.ts)

Validation portable : build réussi, 37 tests TypeScript, 42 scénarios navigateur et 35 tests du cœur Rust réussis ; Clippy du cœur réussi. App Rust : 12 tests portables réussis.

## Phase 10 — Vocabulaire

Étiquettes, collage, filtre, menu natif et suggestions utilisant les décisions persistantes.

Fichiers modifiés :

- [README.md](../README.md)
- [crates/core/src/lib.rs](../crates/core/src/lib.rs)
- [crates/core/src/review_session.rs](../crates/core/src/review_session.rs)
- [crates/core/src/vocabulary_review.rs](../crates/core/src/vocabulary_review.rs)
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [docs/UI-REFACTOR-PLAN.md](../docs/UI-REFACTOR-PLAN.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)
- [src-tauri/src/desktop.rs](../src-tauri/src/desktop.rs)
- [src-tauri/src/history.rs](../src-tauri/src/history.rs)
- [src/App.tsx](../src/App.tsx)
- [src/Review.tsx](../src/ReviewComponents.tsx)
- [src/Vocabulary.tsx](../src/Vocabulary.tsx)
- [src/review.ts](../src/review.ts)
- [src/reviewClient.ts](../src/reviewClient.ts)
- [src/style.css](../src/style.css)
- [src/vocabularyTerms.ts](../src/vocabularyTerms.ts)
- [tests/browser/profiles.spec.ts](../tests/browser/profiles.spec.ts)
- [tests/browser/review.spec.ts](../tests/browser/review.spec.ts)
- [tests/browser/reviewFixture.ts](../tests/browser/reviewFixture.ts)
- [tests/profileReview.test.ts](../tests/profileReview.test.ts)

Validation portable : build réussi, 38 tests TypeScript, 46 scénarios navigateur et 37 tests du cœur Rust réussis ; Clippy du cœur réussi. App Rust : 13 tests portables réussis.

## Phase 11 — Identité et finitions

SVG exact, icônes, thèmes système, animations bornées, octets observés par fichier et chapitres issus des pauses.

Fichiers modifiés :

- [README.md](../README.md)
- [assets/logo.png](../assets/logo.png)
- [assets/logo.svg](../assets/logo.svg)
- [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [docs/UI-REFACTOR-PLAN.md](../docs/UI-REFACTOR-PLAN.md)
- [docs/UI-REFACTOR-REPORT.md](../docs/UI-REFACTOR-REPORT.md)
- [docs/VALIDATION.md](../docs/VALIDATION.md)
- [native/swift/Sources/ElpoASR/ElpoASR.swift](../native/swift/Sources/ElpoASR/ElpoASR.swift)
- [native/swift/Sources/ElpoASR/InstallProgress.swift](../native/swift/Sources/ElpoASR/InstallProgress.swift)
- [native/swift/Sources/ElpoASR/ModelUpdates.swift](../native/swift/Sources/ElpoASR/ModelUpdates.swift)
- [native/swift/Sources/ElpoASR/Whisper.swift](../native/swift/Sources/ElpoASR/Whisper.swift)
- [native/swift/Tests/ElpoASRTests/InstallProgressTests.swift](../native/swift/Tests/ElpoASRTests/InstallProgressTests.swift)
- [src-tauri/icons/128x128.png](../src-tauri/icons/128x128.png)
- [src-tauri/icons/128x128@2x.png](../src-tauri/icons/128x128@2x.png)
- [src-tauri/icons/32x32.png](../src-tauri/icons/32x32.png)
- [src-tauri/icons/64x64.png](../src-tauri/icons/64x64.png)
- [src-tauri/icons/icon.icns](../src-tauri/icons/icon.icns)
- [src-tauri/icons/icon.png](../src-tauri/icons/icon.png)
- `src-tauri/icons/source.svg` (supprimé)
- [src-tauri/src/desktop.rs](../src-tauri/src/desktop.rs)
- [src-tauri/src/download_progress.rs](../src-tauri/src/download_progress.rs)
- [src-tauri/src/main.rs](../src-tauri/src/main.rs)
- [src/App.tsx](../src/App.tsx)
- [src/Chapters.tsx](../src/YouTubeChapters.tsx)
- [src/Models.tsx](../src/Models.tsx)
- [src/chapters.ts](../src/chapters.ts)
- [src/domain.ts](../src/domain.ts)
- [src/downloadProgress.ts](../src/downloadProgress.ts)
- [src/style.css](../src/style.css)
- [src/vite-env.d.ts](../src/vite-env.d.ts)
- [tests/browser/finishing.spec.ts](../tests/browser/finishing.spec.ts)
- [tests/chapters.test.ts](../tests/chapters.test.ts)

Validation portable : build réussi, 41 tests TypeScript, 53 scénarios navigateur et 37 tests du cœur Rust réussis ; Clippy du cœur réussi. App Rust : 14 tests portables réussis.

## Limites précises de la phase 11

- Les repères YouTube commencent à 00:00 conformément à la demande. Les autres suivent des débuts de segments après une pause d’au moins trois secondes, arrondis vers le bas à la seconde ; aucune frontière de sous-titre ni export SRT/VTT/TXT n’est modifié. Il faut trois chapitres de dix secondes minimum, dernier compris ; sinon la copie reste indisponible. Les titres provisoires sont modifiables, sans détection sémantique automatique.
- L’anneau concerne le **fichier en cours**, pas un pourcentage global d’installation. Whisper utilise les compteurs URLSession ; Ultra observe les fichiers `.partial` du téléchargeur du SDK épinglé. La taille totale vient des métadonnées du fichier lorsqu’elle existe. Les périodes sans octets observables et la validation n’ont aucun avancement inventé. La compilation et le téléchargement réels restent à vérifier sur Mac.
- Deux nouveaux tests Swift couvrent le fichier partiel, le total inconnu, la phase de validation et la compatibilité des métadonnées ; ils sont ajoutés mais **non exécutés sous Linux**.

## Validation à effectuer sur votre Mac

Compiler et exécuter les tests natifs depuis cette branche :

```sh
npm run native:build
swift test --package-path native/swift
cargo test -p elpotranscribe --locked
npm run tauri -- build --target aarch64-apple-darwin -- --locked
bash scripts/validate-dmg.sh target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
```

Puis vérifier avec vos vrais audios et modèles :

- L’effet de verre et la position des boutons de fenêtre.
- Les menus, raccourcis, Réglages séparés et la fermeture de la fenêtre active.
- Une relecture complète au clavier sur une vraie transcription, y compris vocabulaire et annulation après réouverture.
- Une vraie double vérification avec les deux moteurs, dans les deux ordres, avec maintien des temps du principal.
- La nouvelle icône dans le Dock et Finder.
- Le thème clair et le basculement système dans les deux fenêtres.
- Une installation/mise à jour de chaque modèle : octets et fichier courant, absence de faux pourcentage global, maintien de l’ancien modèle en cas d’échec.
- Les chapitres sur un audio avec pauses : titres relus, copie dans une description YouTube, absence de modification des sous-titres.
- Les performances et la mémoire sur le M2 8 Go, notamment la préparation du vocabulaire sur les fichiers longs.
