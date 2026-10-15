# Validation réellement effectuée

## Refonte de l’interface — Phase 2 (15 octobre 2026)

Fenêtre et menus français implémentés ; **validation native macOS non exécutée dans cet environnement Linux**. Aucun résultat natif n’est déduit des tests navigateur.

Fichiers / choix :

- `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/capabilities/default.json`, `src-tauri/Info.plist` : Overlay, titre masqué, position des boutons `{ x: 16, y: 18 }`, fenêtre transparente et effet `sidebar` suivant l’activité, feature `macos-private-api`, permission de déplacement, région française. Minimum existant 960 × 650 conservé. Toutes les clés et valeurs de configuration ont été validées contre le schéma de la CLI Tauri 2.12.2 installée avec Python jsonschema (outil de validation déjà disponible ; pas de dépendance d’exécution ajoutée).
- `src-tauri/src/menus.rs`, `src-tauri/src/main.rs`, `src-tauri/src/desktop.rs` : menus applicatifs français ; actions personnalisées via `app-menu` vers React ; commandes contextuelles grisées, pas de doublon d’implémentation de l’éditeur. Les signatures des API ont été vérifiées dans les sources de Tauri 2.12.3 installées, **pas compilées pour macOS ici**. Aide reste désactivé tant qu’aucune aide n’est fournie. Les fermetures/sorties passent par la garde du frontend après son abonnement ; l’arrêt natif existant intervient lors de la sortie autorisée.
- `src/nativeMenu.ts`, `src/App.tsx`, `src/Vocabulary.tsx`, `src/style.css` : barre de 52 px déplaçable, espace au-dessus de la navigation, sidebar transparente/repliable, lien provisoire Réglages → Paramètres, une garde commune de fermeture/navigation pour les brouillons, confirmation de traitement en cours, ⌘Z/⇧⌘Z vers la pile de l’éditeur et ⌘F vers sa recherche. Le menu Exporter réutilise l’export SRT existant avec dialogue, actif uniquement dans un éditeur valide.
- `scripts/validate-dmg.sh`, `scripts/bench-local.sh`, `.github/workflows/release-macos.yml`, `README.md` : nouveau produit `Elpotranscribe.app`, artefacts futurs avec la même casse, validation du nom de bundle depuis la configuration ; identifiant **com.elpo.elpotranscribe inchangé**. Aucun tag ni asset de la 1.2.0 publiée n’est remplacé. La README distingue explicitement le nom du bundle publié de celui de cette branche.
- `tests/nativeMenu.test.ts`, `tests/browser/app.spec.ts` : abonnement avant disponibilité, nettoyage en cas d’échec, événements inconnus ignorés ; réglages/import/repli, pile d’annulation commune (boutons, menus simulés et clavier), recherche, export sans changement de temps, refus de fermeture avec brouillon et confirmation explicite de sortie pendant un traitement.

| Commande | Résultat |
|---|---|
| `npm run build` | Réussi |
| `npm test` | 13 tests réussis dans 4 fichiers |
| `ELPO_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser` | 19 tests réussis, IPC simulé |
| `cargo test -p elpo-core --locked` | 28 tests réussis, aucun échec/ignoré |
| `cargo clippy -p elpo-core --locked -- -D warnings` | Réussi |
| `cargo fmt --all --check` | Réussi |
| `bash -n scripts/bench-local.sh scripts/validate-dmg.sh` | Réussi |
| Validation JSON Schema Tauri + lecture plist | Réussies |

Captures : neuf vues initiales dans `.ui-captures/phase-01/`, puis neuf vues après le changement de fenêtre/barre dans `.ui-captures/phase-02/`, à 1280 × 800. Deux scénarios de capture ont réussi. La transparence dans Chromium ne reproduit pas le verre AppKit. L’aspect dense et les boutons sur une ligne relèvent de la phase 3, encore à effectuer.

À exécuter sur Mac : les commandes natives listées ci-dessous, puis vérifier les boutons de fenêtre/verre, tous les menus et leurs raccourcis, le retour au focus après un dialogue, les commandes grisées, ⌘W/⌘Q et le bouton rouge avec traitement et/ou brouillon. Aucune modification de Swift, de la comparaison, des temps ou des formats d’export. Prochaine phase : **Phase 3 — Fondations visuelles**.

## Refonte de l’interface — Phase 1 (15 octobre 2026)

Branche `refonte-interface`, base `1ec8c32`. Fichiers de la phase : `docs/UI-AUDIT.md` (écrans/IPC/relecture/raccourcis/styles), `AGENTS.md` (règles Design), `.gitignore` (captures locales), présente section. Aucun fichier applicatif, moteur, temps ou export modifié ; aucune dépendance ajoutée. L’audit inventorie neuf sélecteurs et 130 littéraux de couleur distincts dans le CSS.

Contrôles exécutés dans l’environnement Linux :

| Commande | Résultat |
|---|---|
| `npm run build` | TypeScript et production Vite réussis |
| `npm test` | 11 tests réussis, 3 fichiers |
| `ELPO_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser` | 15 tests réussis ; IPC simulé |
| `cargo test -p elpo-core --locked` | 28 tests réussis ; 0 échec, 0 ignoré ; aucun doctest présent |
| `cargo clippy -p elpo-core --locked -- -D warnings` | Réussi |

Captures initiales à 1280 × 800 dans `.ui-captures/phase-01/` : Tableau de bord, Nouvelle transcription, Mes transcriptions, Double vérification, Modèles IA, Paramètres, Vocabulaire, éditeur et recherche. Fixtures IPC uniquement ; aucun écran modifié pendant l’audit. Les captures ne valident pas l’inférence, l’effet de verre ou les dialogues natifs.

Non exécuté ici (Linux) : `swift test --package-path native/swift`. Pour valider les changements natifs des phases suivantes sur Mac ARM64 avec Xcode 26 / Swift 6.2+ :

```sh
npm ci
npm run native:build
swift test --package-path native/swift
cargo test -p elpotranscribe --locked
npm run tauri -- build --target aarch64-apple-darwin -- --locked
```

Cette phase n’est pas une nouvelle version livrable et ne modifie pas la préversion 1.2.0 publiée. Prochaine phase : fenêtre native et menus en français.

## Préversion 1.2.0 publiée

Source : `56b49eda1e0444e1a86cd3e1eea95be2e14e87f7`, tag `v1.2.0`. [Contrôle natif réussi](https://github.com/blackdozo563/Elpotranscribe/actions/runs/38654475393/job/116161737492), [publication réussie](https://github.com/blackdozo563/Elpotranscribe/actions/runs/38654475393/job/116167765439), [DMG](https://github.com/blackdozo563/Elpotranscribe/releases/download/v1.2.0/ELPOTRANSCRIBE-macOS-Apple-Silicon-v1.2.0.dmg).

SHA-256 : `1fee109164179c025d7bb018496527d2cbe82932b3969bbb9695359897377ce8`. Téléchargement public revérifié : 6 273 475 octets, SHA identique au fichier publié, au digest GitHub et aux notes de version ; pied UDIF `koly` présent. Sur Mac, montage, architecture ARM64, signatures ad hoc et version interne 1.2.0 sont vérifiés avant les inférences.

| Changement ou contrôle | Preuve |
|---|---|
| Passages Whisper prioritaires, mots facultatifs, conservation du texte et des bornes | Tests Rust `native::tests` et Swift `WhisperFallbackTests` : mots absents, durée nulle, inversion, passage unique, sortie vide. Un résultat sans durée positive est conservé ; l’export reste refusé plutôt que d’inventer une durée |
| Reproduction du MP3 français long après le correctif de passages | [CI de l’étape 1 réussie](https://github.com/blackdozo563/Elpotranscribe/actions/runs/38650697528) sur `d804bcd` : test `real_long_french_mp3_default_engine_and_history` terminé, SRT et suppression persistée. Audio synthétique de 20 minutes ; pas l’enregistrement utilisateur |
| Suppression immédiate, sans Nouveau lot | Tests navigateur `un résultat terminé disparaît immédiatement…` et `suppression native…` (IPC simulé), puis suppression réelle dans les tests natifs de file avec contrôle du JSON rechargé, audio et export conservés |
| Mémoire et séquence des moteurs | Swift `MemorySafetyTests` et `ModelLeaseTests`, Rust `one_process_reservation_and_shutdown_reap_before_reuse`, double vérification native dans les deux sens. Le helper détient le verrou système jusqu’à sa sortie ; aucun chargement concurrent via le benchmark |
| Migration et sauvegarde des profils | Tests Rust `vocabulary::tests` : migration Unicode une seule fois, édition persistée, réinitialisation, protection des profils fournis et fichier corrompu conservé |
| Gestionnaire Vocabulaire et utilisation dans l’éditeur | 4 scénarios de `tests/browser/profiles.spec.ts` : création/collage/Entrée/sauvegarde/redémarrage, réinitialisation et garde des modifications, langue et lien du profil, correction annulable et ajout persistant. IPC simulé, pas de preuve des dialogues macOS |
| Classement des divergences et suggestions | Rust `vocabulary::usage_tests`, TypeScript `profileReview.test.ts` : accents/casse ignorés, priorité des termes, horodatages inchangés, correction annulable et élisions françaises conservées |
| Budget de l’invite | Dans le moteur empaqueté, une invite dépasse le budget : le vrai tokenizer compte ses tokens ; le nombre transmis reste dans la limite du modèle, au maximum 224. Assertions du contrôle `smoke-release.py` |
| Benchmark installé | Ressource `bench-local.sh` présente et syntaxe vérifiée ; CLI du `.app` exécute Ultra, Turbo et deux nouvelles passes pour la double vérification. Temps mural, RSS, facteur temps réel et segments exigés. Le test Rust du parseur confirme les unités RSS macOS et la lecture du protocole |
| Totaux | 28 tests Rust du cœur, 2 tests Rust de l’application sur Mac, 21 XCTest, 11 TypeScript et 15 navigateur réussis. Formatage, Clippy et build de production réussis |

Le contrôle court utilise une voix française synthétique de **9 198 ms** (moins de 90 s). Il exécute les vrais Ultra et Turbo, la file, les exports, la suppression persistée, l’annulation, la double vérification dans les deux sens, le compteur/plafond de tokens et le benchmark. Ce n’est pas une mesure de précision sur parole humaine.

Le job de 20 minutes propre à 1.2.0 continue séparément, avec `continue-on-error: true`, sans conditionner la publication ; son résultat final n’est pas revendiqué ici. Tous les jobs du nouveau workflow sont limités à 60 minutes. Le code de l’étape 1 a déjà passé cette reproduction longue ; les changements ultérieurs de profils et de tokenizer sont validés par le contrôle court ci-dessus.

**Non vérifié sur M2 8 Go physique :** vitesse, mémoire unifiée totale, swap et précision sur les prières/contenus psychologiques réels. Le benchmark fourni permet ces mesures. Les dialogues macOS, Finder, l’installation sur un Mac propre et l’usage physiquement déconnecté restent à vérifier manuellement. Les tests navigateur utilisent une simulation IPC. La signature est ad hoc, sans notarisation. L’audio utilisateur français de 17,8 Mo et 20 minutes n’a pas été fourni ; il n’est pas prétendu reproduit.

## Historique des validations antérieures

Date : 14 octobre 2026. Source fonctionnelle validée : `74edaba`. [CI macOS ARM64 réussie](https://github.com/blackdozo563/Elpotranscribe/actions/runs/38561351957).

La machine cloud est Linux x86_64 (Node 24.19.0, Rust 1.93.0). Les contrôles Apple ont été exécutés sur le véritable runner `macos-26` ARM64 de GitHub Actions.

| Contrôle | Résultat |
|---|---|
| Installation npm et lockfiles | Réussie |
| TypeScript et build Vite de production | Réussis localement et en CI |
| Tests Rust `elpo-core` | 13 réussis, 0 échoué, 0 ignoré |
| Tests TypeScript de l’éditeur | 5 réussis |
| Chromium / Playwright | 3 réussis ; le test d’édition simule uniquement l’IPC |
| Tests Swift XCTest | 3 exécutés et réussis, nombre vérifié par le workflow |
| Backend Rust macOS et pont Swift | Compilation native réussie |
| Initialisation et inférence Parakeet Ultra | Réussies depuis le moteur contenu dans le DMG |
| SRT réel | Généré depuis les mots reconnus et validé avec le même cœur Rust que l’application |
| Test de file native opt-in | 1 exécuté et réussi, sans moteur simulé |
| DMG, bundle et architecture | Créés ; montage, ARM64, composants natifs et raccourci Applications vérifiés |
| Signatures | Ad hoc, vérifiées avec `codesign --verify --deep --strict` ; pas de notarisation |
| Formatage Rust, Clippy et schéma JSON Tauri | Réussis |
| Audit npm des dépendances d’exécution | Aucune vulnérabilité signalée au moment du contrôle |
| Interface graphique macOS, dialogues et Finder | Non testés manuellement ; ne pas assimiler la simulation IPC à ces contrôles |
| M1 8 Go / M2 8 Go physiques | Retour utilisateur positif sur la qualité de Parakeet Ultra sur M2 8 Go ; protocole complet et mesures non réalisés. M1 non testé |

Le test natif utilise un vrai extrait de parole à URL et empreinte verrouillées. Il exige les mots attendus et des horodatages reconnus, puis produit un SRT. Il exécute ensuite la file réelle avec deux copies de cet audio dans des dossiers différents, avec des accents et plusieurs points dans le nom. Il vérifie les exports à côté de chaque source, la conservation des audios et la poursuite après un audio corrompu. Il démarre et annule un vrai processus, puis teste l’arrêt à la sortie et la suppression du répertoire temporaire. Le compteur de tests doit être positif : un test ignoré ou un passage sans tests ne suffit pas.

Les tests Rust couvrent millisecondes/numérotation/chronologie, français et arabe Unicode, lignes, noms, doublons, dix imports, formats/vides, écritures atomiques sans écrasement, collisions ZIP, ponctuation VTT et regroupement des mots dont les vrais temps se chevauchent. Les tests Swift couvrent les temps invalides, la modification des empreintes et leur stabilité via un lien de dossier.

Les tests navigateur couvrent l’interface vide, la distinction web/native, l’indisponibilité des moteurs avancés et l’édition/export via une simulation IPC. Ils ne valident pas l’inférence, les dialogues ou le disque macOS. Les codecs autres que le WAV du scénario natif restent à tester individuellement sur les Mac cibles.

Le rapport `target/smoke-result.json` mesure le temps mural, le facteur temps réel et la mémoire maximale du processus moteur sur le runner. Il ne représente pas la consommation totale de l’application ni un benchmark M1/M2 8 Go. L’alignement mot à mot n’a pas été évalué contre une vérité terrain manuelle.

Le flag réseau désactivé de FluidAudio est utilisé pendant chaque transcription après l’installation. Un essai physique totalement déconnecté et une installation sans outils de développement restent à effectuer avant une livraison stable.

## Retour utilisateur sur matériel physique

Le 14 octobre 2026, l’utilisateur indique avoir testé la version avec Parakeet Ultra sur un **Mac M2 8 Go**, avec un résultat jugé « top ». Ce retour confirme un essai utilisateur réussi de transcription sur cette configuration. Version de macOS, identifiant exact du build, durée/format/langue de l’audio, temps de calcul et pic mémoire non communiqués. Il ne valide pas les nouveaux moteurs et ne remplace pas le protocole complet de tests physiques.

## Préversion 1.1.0

Source : `26d89ff7a28e26a8740f1e1f28c3c4dd5e282444`, tag `v1.1.0`. [Validation native de publication](https://github.com/blackdozo563/Elpotranscribe/actions/runs/38608950390), runner macOS 15 ARM64, Xcode 26.3 / Swift 6.2.

| Contrôle | Résultat |
|---|---|
| Build TypeScript/Vite et tests de l’éditeur | Réussis ; 5 tests |
| Rust `elpo-core`, formatage, Clippy | Réussis ; 18 tests, dont cinq de comparaison |
| Chromium/Playwright | 6 réussis, IPC simulé uniquement |
| Swift XCTest | 10 exécutés et réussis |
| App et DMG ARM64 | Créés, montés et signatures ad hoc vérifiées |
| Installation des modèles | Réussie dans un dossier temporaire sans poids en cache |
| Inférence depuis le DMG | Ultra, Whisper large-v3-turbo Q5_0 réussis |
| File native, exports et annulation | 4 scénarios, un par moteur, réussis ; audios préservés, dossiers distincts, erreur récupérée et temporaires nettoyés |
| Intégrité Whisper | Poids altérés refusés avant inférence pour Base, Small et Turbo |
| Métadonnées de modèles | Les quatre installations sont reconnues à jour après installation |
| Double vérification native | 1 scénario réussi : Ultra puis Turbo, et Turbo puis Ultra ; texte/temps du principal et historique préservés |

Les tests navigateur vérifient notamment l’inversion des moteurs, l’application annulable d’une suggestion sans modifier les temps, et le téléchargement explicite depuis la notification de mise à jour. Ils ne prouvent pas l’inférence : celle-ci est exercée séparément sur Mac avec le vrai extrait JFK anglais.

Les tests Swift couvrent les empreintes et chemins relatifs (y compris les alias `/var` et `/private/var`), la conservation de l’ancienne installation après échec d’activation, la sélection atomique d’un nouveau dossier, les chemins invalides et la distinction entre changement du README et changement des poids. Le test de disposition Ultra compare le dossier attendu au nom fourni par le SDK. Le vocabulaire et les modèles Ultra utilisent la même révision distante épinglée.

Les tests Rust de comparaison couvrent « ce foir »/« ce soir », les moteurs inversés sans attribuer arbitrairement une victoire, la casse/ponctuation, Unicode, les insertions/suppressions, les frontières ambiguës et le contexte borné pour les longues divergences. Ce sont des tests de comparaison textuelle ; aucun essai acoustique du passage utilisateur « ce soir » n’a été effectué, son audio n’étant pas fourni.


## Préversion 1.1.1 : publication bloquée par le test long

Source : `7bbd18e`, tag `v1.1.1`. [Suivi de la validation et de la publication conditionnelle du DMG](https://github.com/blackdozo563/Elpotranscribe/actions/runs/38620458984). Le tag déclenche les contrôles ; il ne constitue pas, à lui seul, une preuve de réussite ou de disponibilité du téléchargement.

Contrôles Linux réussis : installation verrouillée npm, build TypeScript/Vite, 8 tests TypeScript, 10 tests navigateur à IPC simulé, 22 tests Rust, formatage et Clippy. Les nouveaux tests de recherche couvrent casse, mots entiers français et arabes, caractères littéraux, remplacement global annulable et conservation des temps. Le parcours navigateur vérifie navigation et sélection des occurrences, remplacement unique/global, annulation, recherche vide de résultats et horodatages conservés.

Le correctif Whisper conserve les vrais temps des passages lorsque les temps de mots manquent ou leur chronologie empêche une segmentation valide. Il affiche alors un avertissement : certains passages peuvent dépasser la longueur ou la durée souhaitée. Aucun temps de mot n’est inventé. Le correctif de suppression utilise un dialogue natif ; la suppression retire le résultat du lot et de l’historique et conserve l’audio source et les exports. Nouveau lot archive les résultats.

La validation native est complétée par un MP3 français synthétique, stéréo 44,1 kHz, de 20 minutes, traité avec Whisper Turbo dans la vraie file à moteur par défaut. Ce scénario doit vérifier SRT, conservation de l’audio et suppression persistée. Ce scénario a échoué après 1 953,74 secondes : des temps de passages Whisper étaient invalides. La publication a été bloquée ; aucun DMG 1.1.1 n’a été publié. L’utilisateur décrit un MP3 français de 17,8 Mo et 20 minutes ; cet enregistrement n’a pas été fourni et n’est pas prétendu reproduit.

## Préversion 1.1.2 en cours de validation

Source : `d174f65`, tag `v1.1.2`. [Validation de publication](https://github.com/blackdozo563/Elpotranscribe/actions/runs/38645820249). Le texte des passages de durée nulle est regroupé avec un passage voisin en conservant les bornes extérieures fournies par le moteur ; les passages qui se chevauchent sont regroupés de même. Une suite sans aucune durée positive reste refusée, ainsi que les temps négatifs ou inversés. Aucun temps de mot n’est créé. Trois tests Swift supplémentaires couvrent ces cas ; leur exécution native reste à confirmer. Les tests Linux de build, 8 tests TypeScript et 22 tests Rust ont réussi.
