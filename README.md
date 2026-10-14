# ELPOTRANSCRIBE

Transcription audio intelligente pour macOS Apple Silicon. Interface française, traitement local, édition de sous-titres et exports SRT/TXT/VTT/ZIP.

**Version du projet : 1.0.0, en développement. Aucun DMG ni résultat d’inférence macOS n’a encore été validé dans cet environnement Linux. Ce dépôt n’est pas une livraison finale conforme à tout le cahier des charges.**

Dépôt prévu : https://github.com/blackdozo563/Elpotranscribe

## Ce que contient le code

- Interface React/Tauri 2 sombre, navigation clavier, icône originale, préférences locales.
- Dialogues macOS, glisser-déposer, import de dossiers et contrôle de dix fichiers par lot ; contrôle du décodage via AVFoundation.
- File de traitement native séquentielle ; annulation par arrêt du processus d’inférence, reprise des erreurs et détection des interruptions au redémarrage.
- Pont Swift **Parakeet Ultra**, épinglé à FluidAudio `224de0fb3c304b41bbae24e85e1801900865ff3e`. Pas de substitution de modèle.
- Installation explicite, initialisation Core ML, empreintes SHA-256 locales des fichiers et revérification avant chaque transcription. Le premier téléchargement fait confiance à HTTPS et au SDK ; ces empreintes locales ne sont pas une signature indépendante du fournisseur.
- Mode d’inférence avec réseau désactivé dans FluidAudio. Traitement audio sur disque par le SDK pour limiter les buffers ; arrêt du moteur sur pression mémoire critique.
- Horodatages réels des mots ; segmentation, conservation des pauses, Unicode, validation chronologique. Aucun alignement inventé.
- Éditeur texte/temps avec écoute et recherche audio, scission à la position choisie, fusion, suppression, ajout, annuler/rétablir et sauvegarde locale.
- Exports atomiques, confirmation d’écrasement, conservation des noms, ZIP avec collisions résolues, révélation Finder.
- Historique JSON écrit atomiquement dans Application Support, sans duplication de l’audio ; bouton Nouveau lot pour conserver les résultats et libérer la file ; liaison d’un audio déplacé.

Le pont natif et ces parcours macOS sont **implémentés mais non exécutés ici**. Les preuves obtenues sous Linux sont séparées dans [docs/VALIDATION.md](docs/VALIDATION.md).

## Développement

Node 24, npm, Rust 1.93.0. Les dépendances sont verrouillées dans `package-lock.json` et `Cargo.lock`.

```sh
npm ci
npm run build
npm test
cargo test -p elpo-core --locked
npx playwright install chromium
npm run test:browser
```

Sur Linux cloud, si le répertoire personnel est en lecture seule : `export npm_config_cache=/workspace/.npm-cache CARGO_HOME=/workspace/.cargo RUSTUP_HOME=/workspace/.rustup PATH=/workspace/.cargo/bin:$PATH`. Chromium déjà installé : `ELPO_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser`.

L’aperçu web `npm run dev` vérifie l’interface. Les opérations natives exigent l’application Tauri sur Mac ; aucun faux résultat de transcription n’est fourni.

### Exécution macOS

Mac ARM64, macOS 14+, Xcode 26 (Swift 6.2+) et les outils de développement ci-dessus :

```sh
npm ci
npm run native:build
swift test --package-path native/swift
npm run tauri -- dev
```

Les utilisateurs du futur DMG n’auront besoin ni de Python, ni de Node, ni de Homebrew. Python 3 n’est utilisé que par les scripts de validation et de benchmark des développeurs.

### Compilation du DMG

```sh
npm run native:build
npm run tauri -- build --target aarch64-apple-darwin -- --locked
bash scripts/validate-dmg.sh target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
```

La CI `.github/workflows/release-macos.yml` utilise le runner ARM64 officiel `macos-26`, lance les contrôles portables, compile le pont Swift, teste Rust/Swift, produit le DMG puis exécute une **vraie inférence à partir du moteur contenu dans le DMG** avant de déposer l’artefact nommé `ELPOTRANSCRIBE-macOS-Apple-Silicon-v1.0.0.dmg`.

L’existence du label est vérifiée dans `actions/runner-images` ; les droits de ce dépôt, le budget Actions et la disponibilité effective du runner n’ont pas pu être vérifiés via l’API GitHub. Aucun workflow réussi n’est revendiqué. Un tag `v1.0.0` ou le déclenchement manuel avec `publish=true` publie une préversion uniquement après succès des contrôles. Ne créer le tag qu’après revue de l’état réel du projet.

La signature par défaut est ad hoc, non notariée. Pour une distribution Developer ID, fournir les secrets Apple appropriés dans GitHub Actions ; voir [docs/MACOS.md](docs/MACOS.md). Ne jamais incorporer les clés au code.

## Utilisation du futur build validé

1. Télécharger le DMG depuis un véritable artefact ou une release réussie ; aucune URL de téléchargement n’existe encore dans cette livraison.
2. Déplacer ELPOTRANSCRIBE.app vers Applications, puis l’ouvrir. Un build ad hoc peut être bloqué par Gatekeeper ; vérifier sa provenance et sa somme SHA-256, puis utiliser l’autorisation ciblée dans Réglages Système → Confidentialité et sécurité si macOS le propose. Ne pas désactiver Gatekeeper globalement.
3. Dans Modèles IA, choisir Installer Parakeet Ultra. La connexion est nécessaire uniquement pour cette installation explicite. L’attente est indéterminée, sans pourcentage inventé.
4. Importer jusqu’à dix audios, choisir une langue européenne, puis Tout transcrire. Les fichiers sont traités un à un.
5. Activer « Enregistrer les SRT dans les dossiers d’origine » pour autoriser l’enregistrement automatique. Un fichier existant est conservé ; ouvrir le résultat pour confirmer son remplacement ou choisir Exporter vers… et le renommer.
6. Ouvrir un résultat pour corriger le texte et les temps. Enregistrer les modifications conserve l’édition dans l’historique ; « SRT à côté de l’audio » met à jour l’export, avec confirmation si nécessaire. « Afficher dans le Finder » révèle le dernier SRT enregistré.
7. « Tous les SRT en ZIP » rassemble uniquement les résultats terminés du lot courant. « Nouveau lot » les conserve dans l’historique et libère la file.

## Limites actuelles

- Inférence Ultra, backend Tauri, DMG, Finder et permissions macOS : validation sur Mac en attente.
- M1 8 Go et M2 8 Go : objectifs, **pas de certification ni de benchmark réalisé**. La surveillance mémoire est une protection supplémentaire, pas une garantie contre tout épuisement mémoire.
- Qwen3-ASR 0.6B/1.7B, whisper.cpp, comparaison IA, Gemini/Keychain, vocabulaire conditionnant le modèle, import de dictionnaires, nettoyage fluide, forme d’onde et mise à jour automatique : non implémentés. Aucun moteur incomplet n’est proposé à la sélection.
- L’arabe n’est pas pris en charge par le moteur Ultra de cette version ; les fonctions d’édition/export Unicode sont testées avec du texte arabe.
- MP3/WAV/M4A/AAC/FLAC/AIFF passent par AVFoundation. OGG et WebM dépendent des codecs système ; les formats non décodables sont refusés, sans FFmpeg embarqué actuellement.
- La liste de vocabulaire est une référence locale pour la relecture ; elle ne corrige pas automatiquement la transcription.
- Pas encore de sandbox App Store ni de signets de sécurité persistants. L’application distribuée hors App Store utilise les permissions standard macOS et un accès Tauri limité aux fichiers importés.
- La fermeture avec une tâche active interrompt celle-ci ; au lancement suivant, elle est marquée en erreur et peut être relancée.

Voir [docs/VALIDATION.md](docs/VALIDATION.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) et [LICENSES.md](LICENSES.md).
