# ELPOTRANSCRIBE

Transcription audio pour macOS 14+ Apple Silicon. Interface française, traitement local, édition et exports SRT/TXT/VTT/ZIP.

La [préversion publiée 1.1.0](https://github.com/blackdozo563/Elpotranscribe/releases/tag/v1.1.0) propose Parakeet Ultra, Whisper et leur double vérification locale. L’utilisateur rapporte un bon résultat avec Ultra sur **M2 8 Go** ; les nouveaux parcours restent à mesurer sur cette configuration.

## Préversion 1.1.0

- **Rapide : Parakeet Ultra**, moteur par défaut.
- **Qualité : Whisper large-v3-turbo Q5_0**, exécuté avec whisper.cpp et Metal. Base et Small restent disponibles comme options plus légères. « Qualité » indique le choix du moteur, pas une supériorité garantie pour chaque audio.
- **Double vérification : deux moteurs locaux au choix**, utilisés successivement. Le bouton « Inverser les moteurs » échange le principal et le second avis. Un nouveau résultat conserve le texte et les temps du principal ; les divergences lexicales sont proposées à la relecture. Accepter une proposition modifie uniquement le texte, avec possibilité d’annuler. Aucun pourcentage de confiance inventé ni correction silencieuse.
- **Mises à jour des modèles :** vérification de métadonnées au démarrage puis toutes les six heures lorsque l’application est ouverte et libre, désactivable dans les paramètres ; vérification manuelle et téléchargement explicite dans Modèles IA. Les nouveaux fichiers sont téléchargés et initialisés dans un dossier séparé ; le manifeste est remplacé atomiquement après réussite. Une erreur conserve le modèle précédent. Une ancienne installation sans provenance affiche une version inconnue, jamais « à jour » sans preuve.
- **Entièrement local, sans Gemini.** Les connexions servent aux métadonnées de versions et aux téléchargements demandés. Aucun audio n’est envoyé. La transcription après installation ne nécessite pas de compte cloud.
- Qwen3-ASR 0.6B/1.7B reste un chantier séparé, désactivé dans les sélecteurs et absent du DMG 1.1.0. Canary et le nettoyage par LLM ne sont pas intégrés.

La [validation native du code 1.1.0](https://github.com/blackdozo563/Elpotranscribe/actions/runs/38608950390) a réussi : DMG ARM64, installations sans poids en cache, Ultra, Whisper Base/Small/Turbo, file, SRT, annulation, intégrité, métadonnées de versions et double vérification dans les deux sens. Contrôles : 18 tests Rust, 5 TypeScript, 6 navigateur (IPC simulé), 10 Swift et 5 scénarios natifs. Cela ne remplace pas un benchmark de précision ou les essais physiques M1/M2 8 Go. Voir [docs/VALIDATION.md](docs/VALIDATION.md).

## Fonctions

Import de fichiers/dossiers, jusqu’à dix audios par lot, file séquentielle, annulation du processus d’inférence, historique local et reprise des erreurs. Horodatages issus des moteurs, segmentation et contrôle de chronologie ; aucun alignement réparti artificiellement sur la durée audio.

Édition du texte et des temps, écoute, scission/fusion, annuler/rétablir, sauvegarde, exports atomiques avec confirmation avant écrasement. La prochaine préversion 1.1.1 ajoute une barre Rechercher / Remplacer (⌘F ou Ctrl+F) : recherche littérale dans toute la transcription, précédent/suivant, remplacement unique ou global, casse et mots entiers Unicode. Un remplacement global est annulable en une action et conserve les horodatages. Export SRT dans le dossier de chaque source et ZIP des résultats du lot. L’historique conserve une référence à l’audio, sans en faire une copie ; un fichier déplacé peut être relié.

Les poids sont téléchargés à la demande et restent locaux ; ils ne sont pas inclus dans le DMG. Les empreintes SHA-256 sont revérifiées avant transcription. Pour Whisper, le téléchargement est aussi comparé au SHA-256 publié par le dépôt du modèle via HTTPS. Les empreintes locales ne constituent pas une signature indépendante du fournisseur.

## Développement

Node 24, npm, Rust 1.93.0. Utiliser le checkout existant, avec les dépendances verrouillées :

```sh
npm ci
npm run build
npm test
cargo test -p elpo-core --locked
cargo clippy -p elpo-core --locked -- -D warnings
npx playwright install chromium
npm run test:browser
```

Sur Linux cloud avec un répertoire personnel en lecture seule :

```sh
export npm_config_cache=/workspace/.npm-cache
export CARGO_HOME=/workspace/.cargo RUSTUP_HOME=/workspace/.rustup
export PATH=/workspace/.cargo/bin:$PATH
ELPO_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

`npm run dev` démarre l’interface web pour les contrôles internes. Les tests navigateur simulent l’IPC ; ils ne prouvent pas l’inférence ou les dialogues macOS.

### Application et DMG sur Mac

Mac ARM64, macOS 14+, Xcode 26 / Swift 6.2+, CMake, Node et Rust. La CI utilise `macos-15` ARM64 avec Xcode 26.3 sélectionné explicitement.

```sh
npm ci
npm run native:build
swift test --package-path native/swift
npm run tauri -- dev
```

Pour produire et vérifier un DMG :

```sh
npm run native:build
npm run tauri -- build --target aarch64-apple-darwin -- --locked
bash scripts/validate-dmg.sh target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
```

La validation monte le DMG, vérifie ARM64 et les signatures, exécute une vraie transcription avec Ultra et chaque modèle Whisper, produit des SRT, vérifie la file, les exports par dossier, l’annulation, le rejet des poids altérés, les métadonnées de versions et la double vérification dans les deux sens. Qwen est évalué séparément dans `qwen-validation.yml`.

Les utilisateurs du DMG n’ont besoin ni de Python, ni de Node, ni de Homebrew. La signature par défaut est ad hoc, non notariée. Vérifier la provenance et SHA-256 ; si nécessaire, utiliser l’autorisation ciblée de macOS, sans désactiver Gatekeeper globalement. Voir [docs/MACOS.md](docs/MACOS.md).

## Utilisation

1. Installer l’application depuis une [Release validée](https://github.com/blackdozo563/Elpotranscribe/releases).
2. Télécharger le moteur souhaité dans Modèles IA.
3. Importer les audios, choisir le moteur et la langue, puis lancer la file. Anglais couvre les variantes US/UK, sans garantie spécifique à chaque accent.
4. Ouvrir un résultat pour l’éditer ou utiliser Double vérification avec un autre moteur installé.
5. Enregistrer et exporter. Les exports automatiques conservent les fichiers existants ; l’éditeur permet de confirmer leur remplacement.

## Limites

- Les performances Turbo et la double vérification sur **M1/M2 physiques 8 Go** restent à mesurer. Un seul processus d’inférence tourne à la fois ; un contrôle de mémoire physique et un arrêt sur pression mémoire critique ne garantissent pas l’absence de swap ou d’épuisement mémoire.
- Deux modèles peuvent faire la même erreur. Les divergences sont lexicales ; elles ne constituent ni une détection exhaustive d’erreurs, ni un jugement sur le bon texte. L’alignement mot à mot reste à évaluer contre une vérité terrain.
- Ultra ne prend pas l’arabe en charge. Whisper le propose ; Qwen ASR le reconnaît mais son aligneur officiel ne le prend pas en charge dans cette intégration SRT.
- MP3/WAV/M4A/AAC/FLAC/AIFF utilisent AVFoundation. OGG et WebM dépendent des codecs système ; les fichiers non décodables sont refusés. Aucun FFmpeg embarqué.
- Les dialogues, Finder, l’installation sur Mac propre et les essais entièrement déconnectés restent à vérifier manuellement. Pas de sandbox App Store ni de signets de sécurité persistants.
- Le vocabulaire personnalisé sert de référence pour la relecture, sans correction automatique. La fermeture interrompt le traitement ; le résultat principal déjà obtenu est conservé pour une vérification interrompue.

Voir [architecture](docs/ARCHITECTURE.md), [moteurs](docs/ADVANCED-ENGINES.md), [validation](docs/VALIDATION.md) et [licences](LICENSES.md).
