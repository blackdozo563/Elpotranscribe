# ELPOTRANSCRIBE

Application française de transcription locale pour macOS 14+ Apple Silicon. Deux moteurs : **Parakeet Ultra** par défaut et **Whisper large-v3-turbo Q5_0**, avec whisper.cpp, Metal et flash attention. Les modèles sont téléchargés explicitement dans Modèles IA ; les audios ne quittent pas le Mac.

La **préversion 1.2.0 est publiée** : [télécharger le DMG Apple Silicon](https://github.com/blackdozo563/Elpotranscribe/releases/download/v1.2.0/ELPOTRANSCRIBE-macOS-Apple-Silicon-v1.2.0.dmg). Le contrôle court natif a réussi et le téléchargement a été revérifié. SHA-256 : `1fee109164179c025d7bb018496527d2cbe82932b3969bbb9695359897377ce8`. Signature ad hoc, non notariée. Le test long reste indépendant ; les performances sur M2 8 Go physique sont à mesurer.

La refonte en cours sur `refonte-interface` conserve les moteurs et données de 1.2.0. Les phases 1 à 10 (audit, fenêtre/menus, fondations visuelles, nettoyage/modèles, bibliothèque unique, relecture, parcours du second avis, réglages et vocabulaire) sont implémentées et validées côté Linux ; la phase 11 reste à faire, ainsi que la compilation et la validation native macOS de cette branche. Son bundle porte le nom `Elpotranscribe.app` ; le DMG **déjà publié ci-dessus conserve son ancien nom** `ELPOTRANSCRIBE.app`. Adaptez le chemin des commandes de benchmark si vous utilisez ce DMG. Les phases validées sont décrites dans [l’audit UI](docs/UI-AUDIT.md) et [le rapport de validation](docs/VALIDATION.md). Aucune nouvelle préversion de la refonte n’est encore publiée.

Les phases 6 et 7 ajoutent les décisions persistantes de relecture, leurs plages Unicode, leur interface dans le texte et leur annulation dans la pile de l’éditeur. Au premier chargement d’un ancien historique contenant des comparaisons, une copie `history.pre-review-v1.json` est conservée à côté de `history.json`.

## Transcrire et relire

Importer jusqu’à dix fichiers par lot, choisir le moteur, la langue et éventuellement un profil. Les traitements sont séquentiels. Le changement de profil fixe sa langue ; « Aucun profil » conserve une transcription sans invite de domaine.

Whisper utilise en priorité les temps réels de ses passages ; les mots horodatés sont facultatifs. Les passages de durée nulle, inversés ou chevauchants sont regroupés en conservant le texte et les bornes fournies par le moteur. Aucun temps de mot n’est inventé. Si le moteur ne fournit qu’un point sans durée, le texte reste terminé et consultable ; corriger les limites dans l’éditeur avant export. Un passage regroupé peut dépasser les cibles de longueur/durée.

La double vérification est inversable : Ultra puis Turbo ou Turbo puis Ultra. Le premier processus est terminé avant de charger le second. Les temps du principal restent inchangés ; chaque correction exige une acceptation. Un terme du profil présent dans l’un des résultats signale et priorise la divergence, sans déterminer automatiquement quel moteur a raison.

Dans l’éditeur, **Relecture** ouvre les divergences soulignées : ambre pour celles à traiter, vert discret pour celles traitées. Tab / ⇧Tab naviguent ; Entrée accepte, Échap garde le principal, M ouvre votre propre lecture et Espace écoute à partir d’une seconde avant le segment. Ces commandes de relecture sont suspendues pendant la saisie. ⌘Z et ⇧⌘Z annulent et rétablissent une décision hors du champ de proposition. Les décisions sont enregistrées immédiatement ; un segment modifié exige une nouvelle sélection explicite. « Relecture terminée » signifie que les divergences ont été traitées, sans garantir l’absence d’autres erreurs. Demandez le second avis depuis la barre d’outils de l’éditeur ou le menu « … » de la bibliothèque. La feuille ne propose que les moteurs installés et permet de les inverser ; les deux moteurs réanalysent toujours l’audio. À relire regroupe les divergences encore à traiter, archives comprises. Le suivi montre les étapes observées et le temps écoulé, sans pourcentage. Si cet écran reste ouvert, le nouveau résultat s’ouvre directement en relecture ; ailleurs, une notification évite d’interrompre une saisie.


L’éditeur permet l’écoute, la modification des textes et des temps, la scission/fusion et l’annulation. Rechercher / Remplacer (⌘F ou Ctrl+F) propose précédent/suivant, compteur, casse, mot entier, remplacement unique/global annulable. Les suggestions de vocabulaire proches (distance de Levenshtein ≤ 2, accents ignorés) sont surlignées et applicables en un clic annulable. Sélectionner un mot puis « Ajouter au profil » enrichit le profil actif.

« Supprimer » retire le résultat du lot et de l’historique après confirmation native, sans supprimer l’audio source ni ses exports. « Nouveau lot » archive. Sur la branche de refonte, la Bibliothèque conserve ces archives dans la même liste, avec recherche dans les noms et textes, tri, menus par ligne et réglages de transcription regroupés. Les exports SRT/TXT/VTT/ZIP sont atomiques ; l’export automatique conserve un SRT existant et l’éditeur demande confirmation pour l’écraser.

Sur la branche de refonte, **Réglages… (⌘,)** ouvre une fenêtre dédiée de 740 × 620, indépendante de l’éditeur : Sous-titres, Modèles et réseau, Application. Les changements sont enregistrés immédiatement et synchronisés entre fenêtres. Le préréglage Vertical utilise 24 caractères et une ligne ; Standard / YouTube conserve 42 caractères et deux lignes. L’aperçu prend un segment réel de la dernière transcription terminée, calcule sa vitesse sur ses temps d’origine et signale les limites dépassées sans inventer de nouvelles durées. Sans transcription, aucun exemple fictif n’est affiché. L’onglet Application lit la version du bundle et l’identifiant matériel du Mac ; ces informations restent indiquées indisponibles si leur lecture échoue.

## Profils de vocabulaire

La navigation **Vocabulaire**, également accessible par **Modifier le profil…** à côté du sélecteur du lot, propose :

- **Liturgie FR** : noms bibliques, prières et vocabulaire liturgique, dont Évangile, Eucharistie, Magnificat et Agnus Dei.
- **Psychologie FR** : vocabulaire clinique, TCC/psychanalyse et auteurs.
- **Psychologie EN-US** : vocabulaire clinique anglais, CBT/DBT/ACT et auteurs.

Les trois profils fournis sont éditables et réinitialisables. La liste existante est migrée dans **Mon vocabulaire**, sans effacement des entrées. Sur la branche de refonte, la liste compacte affiche profils, langue et nombre de termes, avec +/− et le menu natif « … » pour Dupliquer, Réinitialiser et Importer/Exporter .json. Les termes sont des étiquettes supprimables ; le champ « Ajouter un terme… » accepte Entrée ou le collage de plusieurs lignes, signale les doublons et propose un filtre au-delà de 20 termes. « Phrase de contexte » remplace le libellé « Invite Whisper », sans changer le format JSON. Création, duplication, suppression des profils personnels, import/export JSON, sauvegarde, annulation et protection des modifications non enregistrées sont disponibles.

À l’ouverture de l’éditeur avec un profil, les mots proches de ses termes peuvent aussi apparaître dans **Relecture**, avec l’origine « Suggestion de vocabulaire ». Garder, Accepter et Modifier utilisent les mêmes statuts persistants et la même annulation que les divergences entre moteurs. Une suggestion ne corrige rien automatiquement ; elle doit être validée à l’écoute. Les plages déjà couvertes par une divergence ou devenues périmées ne sont pas devinées à nouveau.

Les lignes sont nettoyées et dédupliquées sans tenir compte de la casse. Whisper reçoit l’invite et les termes ; son vrai tokenizer limite le préfixe transmis à **224 tokens au maximum** (et à la limite du modèle si inférieure). Le compteur exact est disponible une fois Turbo installé ; avant installation, une borne UTF-8 prudente est explicitement indiquée. Le comptage ne charge jamais un second moteur pendant une inférence. Les termes orientent l’orthographe, sans garantie de précision. Ultra n’accepte pas d’invite : les termes servent seulement à la relecture.

Les données restent dans `~/Library/Application Support/com.elpo.elpotranscribe/` : `profiles.json`, `history.json`, `model-updates.json`, `models/`. Un fichier de profils corrompu est conservé et signalé, sans remplacement par des valeurs vides. Les mises à jour de modèles sont vérifiées automatiquement lorsque l’application est libre (désactivable), ou manuellement ; leur téléchargement reste explicite et une activation ratée conserve les poids précédents.

## Mesurer sur votre M2 8 Go

Installer les deux modèles puis quitter l’application pendant les mesures. Le script est inclus dans le `.app` ; **ni Python, ni Node, ni Homebrew, ni Xcode ne sont nécessaires**. Dans Terminal, remplacer les chemins des audios :

```sh
bash "/Applications/Elpotranscribe.app/Contents/Resources/bench-local.sh" "$HOME/Music/extrait-2-minutes.mp3" fr
bash "/Applications/Elpotranscribe.app/Contents/Resources/bench-local.sh" "$HOME/Music/enregistrement-20-minutes.mp3" fr
```

Pour un fichier anglais, remplacer `fr` par `en`. Chaque commande effectue Ultra, Turbo, puis une vraie double vérification Ultra → Turbo (deux nouvelles passes), sans profil et sans modifier l’audio ni ses exports. Elle affiche temps mural, pic RSS du moteur, facteur temps réel et nombre de segments. Un facteur inférieur à 1 signifie un traitement plus rapide que la durée de l’audio. Le pic RSS de la double vérification est le maximum des deux processus successifs, pas leur somme ; il exclut l’interface et ne mesure pas toute la mémoire unifiée ni le swap. Le verrou des modèles protège aussi contre deux lancements indépendants du benchmark.

**Les mesures sur M2 physique restent à faire par l’utilisateur.** Son retour sur Ultra était positif ; il ne constitue pas une mesure de Turbo. Le contrôle de mémoire physique exige au moins 8 Go et la pression mémoire critique arrête le moteur ; cela ne garantit ni l’absence de swap, ni une vitesse donnée.

## Validation et développement

Le contrôle de publication utilise un audio français synthétique court (≤ 90 s) : Ultra, Turbo, export, suppression persistée, annulation et double vérification. Le benchmark empaqueté et le plafond réel de tokens sont également exercés. Le test MP3 de 20 minutes tourne dans un job indépendant, `continue-on-error: true`, sans bloquer la publication. Tous les jobs ont une limite de 60 minutes. Les runners GitHub ne constituent pas un benchmark M2 8 Go. Voir [validation](docs/VALIDATION.md).

Node 24, Rust 1.93.0 pour le développement portable :

```sh
npm ci
npm run build
npm test
npm run test:browser
cargo test -p elpo-core --locked
cargo clippy -p elpo-core --locked -- -D warnings
```

En cloud Linux, utiliser les caches inscriptibles si nécessaire :

```sh
export npm_config_cache=/workspace/.npm-cache
export CARGO_HOME=/workspace/.cargo RUSTUP_HOME=/workspace/.rustup
export PATH=/workspace/.cargo/bin:$PATH
ELPO_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser
```

Sur Mac ARM64 : Xcode 26 / Swift 6.2+, CMake, Node et Rust sont requis **pour compiler**, pas pour utiliser l’application :

```sh
npm run native:build
swift test --package-path native/swift
cargo test -p elpotranscribe --locked
npm run tauri -- build --target aarch64-apple-darwin -- --locked
bash scripts/validate-dmg.sh target/aarch64-apple-darwin/release/bundle/dmg/*.dmg
```

Les tests navigateur utilisent un IPC simulé : ils ne prouvent pas l’inférence ou les dialogues macOS. Les codecs système décodent MP3/WAV/M4A/AAC/FLAC/AIFF ; OGG/WebM dépendent de macOS. L’installation sur un Mac propre, Finder, les dialogues natifs et l’utilisation physiquement déconnectée restent à vérifier manuellement. La précision de transcription et l’alignement n’ont pas été mesurés contre une vérité terrain annotée.

Voir [architecture](docs/ARCHITECTURE.md), [moteurs](docs/ADVANCED-ENGINES.md), [licences](LICENSES.md) et [installation macOS](docs/MACOS.md).
