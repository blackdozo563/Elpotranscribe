# Validation réellement effectuée

## Refonte de l’interface — Phase 7 (15 octobre 2026)

Mode Relecture intégré à l’éditeur, sans changement d’inférence, de segmentation, d’horodatages, de format d’export ni de dépendances.

- `src/App.tsx` : initialisation depuis le document enregistré via `list_review`, bouton et compteur Relecture, branchement des décisions et de la pile commune sur `resolve_review`/`restore_review`, enregistrement immédiat et protection pendant les écritures. Une révision de bibliothèque périmée ne remplace pas le document courant. Les raccourcis et commandes d’annulation de relecture ne modifient pas le document pendant la saisie d’une proposition. La recherche existante repasse au mode d’édition du texte ; l’ancienne application d’une proposition au sous-titre entier est retirée.
- `src/Review.tsx` : plages exactes soulignées, marque des décisions traitées, gouttière mesurée sur les éléments réels, proposition ancrée avec moteur principal et second avis, Garder/Accepter/Modifier/Écouter, fermeture au clic extérieur et bouton dédié. Une plage périmée impose une sélection explicite dans le texte actuel ; les flèches avec Majuscule permettent de sélectionner des graphèmes complets dans le champ en lecture seule, y compris sous Chromium. Les propositions ambiguës ne sont pas applicables automatiquement.
- `src/reviewNavigation.ts` : navigation cyclique, prochaine divergence non traitée, découpage exact du texte et sélection Unicode au clavier. Le rendu ignore les plages périmées et ne recherche pas un mot ressemblant pour les reconstituer.
- `src/style.css` : états ambre/vert, sélection, panneau flottant dans la fenêtre, fondu et transition de 250 ms, suppression des animations sous `prefers-reduced-motion`. Pas de couleur littérale ajoutée.

| Commande | Résultat |
|---|---|
| `npm run build` | TypeScript et Vite réussis |
| `npm test` | 27 tests réussis, 9 fichiers ; 4 tests de navigation/rendu/sélection ajoutés |
| `ELPO_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser` | 31 tests réussis, IPC simulé ; 5 nouveaux scénarios et remplacement du test de l’ancienne proposition |
| `cargo test -p elpo-core --locked` | 35 tests réussis |
| `cargo test -p elpotranscribe --locked` | 8 tests portables réussis ; desktop macOS exclu |
| `cargo clippy -p elpo-core --locked -- -D warnings` | Réussi |
| `cargo fmt --all --check` | Réussi |

Les scénarios navigateur couvrent Tab/⇧Tab, Entrée, Échap, M, saisie manuelle, conservation des temps, annulation/rétablissement et reprise après rechargement. Ils couvrent aussi une sélection périmée réellement choisie au clavier, le retour à l’état avant édition manuelle, les échecs d’enregistrement et d’annulation sans faux changement visuel, la gouttière alignée, la demande de lecture à `startMs − 1 000` bornée à zéro, la suspension des raccourcis pendant la saisie (y compris l’événement de menu simulé), le mouvement réduit et une bibliothèque dont la révision est en retard. Le lecteur est simulé dans cette fixture ; cela ne prouve pas un décodage ni une lecture audio native.

Captures : état avant et cinq états après dans `.ui-captures/phase-07/`, hors Git, à 1280 × 800. Deux scénarios de capture après réussis ; vues Relecture, plage périmée et Relecture terminée inspectées. Elles ne prouvent ni inférence ni menus ou VoiceOver natifs. Le lecteur existant, les rôles/libellés et l’annonce `aria-live` sont présents ; l’usage réel avec VoiceOver reste à vérifier sur Mac.

À vérifier sur macOS ARM64 : `npm run native:build`, `swift test --package-path native/swift`, `cargo test -p elpotranscribe --locked`, puis `npm run tauri -- build --target aarch64-apple-darwin -- --locked`. Tester dans WKWebView les raccourcis/menu, la sélection manuelle, les graphèmes, l’écoute, la fermeture/reprise et les exports avec un historique réel. Aucun de ces contrôles natifs ni essai M2 8 Go de cette branche n’a été exécuté ici. Aucun nouveau DMG publié. Prochaine phase : **8 — Intégrer le second avis au parcours**.

## Refonte de l’interface — Phase 6 (15 octobre 2026)

Données de relecture ajoutées, sans changement visuel, moteur, horodatage ou format d’export. Aucune dépendance ajoutée.

- `crates/core/src/review_session.rs` : identifiants persistants, lectures et moteurs d’origine, plages UTF-16, états `pending`, `accepted`, `kept`, `modified`, `needsReview`. Les propositions applicables sont décomposées en plages de mots ; les autres segments et les limites audio ne changent pas. Une comparaison à cheval sur plusieurs segments reste manuelle. Toute modification externe du segment invalide ses plages ; un changement de structure ou de temps invalide prudemment toutes les plages. Une nouvelle sélection explicitement fournie permet une correction manuelle. Les autres divergences du même segment sont décalées après une résolution, ou invalidées si la nouvelle plage les recouvre.
- `src-tauri/src/history.rs` : les types de stockage utilisés par l’application sont désormais testables sur Linux. Migration du schéma précédent, copie initiale intacte `history.pre-review-v1.json`, absence de réécriture au chargement suivant, décisions et révisions enregistrées. Une erreur de décision, une révision périmée ou un échec de persistance n’exposent pas de mutation partielle. Les sauvegardes classiques restent compatibles et invalident les anciennes plages après une édition manuelle.
- `src-tauri/src/desktop.rs` : chargement migré, initialisation d’une session après une nouvelle comparaison, remise à zéro de la session lors d’une nouvelle double vérification. Commandes `list_review`, `resolve_review`, `restore_review`, `review_pending_total` ; `save_edit` accepte une révision optionnelle et renvoie le document enregistré. Le snapshot ajoute `reviewPendingTotal`.
- `src/review.ts`, `src/reviewClient.ts`, `src/domain.ts` : types et client IPC ; `changeReviewed`, `change`, `undo` et `redo` conservent les états de relecture dans la pile d’édition existante, limitée à 100 modifications. Le branchement des nouveaux contrôles sur ces commandes est réservé à la phase 7 ; l’interface de proposition historique reste en place jusque-là.
- `tests/fixtures/history-v1.2.0.json` : fixture JSON synthétique conforme au véritable schéma de stockage antérieur, avec comparaison et transcription sans second avis ; aucun historique utilisateur ni audio privé n’a été utilisé.

| Commande | Résultat |
|---|---|
| `npm run build` | TypeScript et Vite réussis |
| `npm test` | 23 tests réussis, 8 fichiers |
| `ELPO_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser` | 26 tests réussis, IPC simulé |
| `cargo test -p elpo-core --locked` | 35 tests réussis, dont 7 nouveaux tests de session |
| `cargo test -p elpotranscribe --locked` | 8 tests portables réussis, dont 5 tests du véritable stockage historique ; module desktop macOS exclu sur Linux |
| `cargo clippy -p elpo-core --locked -- -D warnings` | Réussi |

Les tests Rust couvrent acceptation/conservation/modification, annulation/rétablissement, temps et autres segments inchangés, divergences adjacentes, désaccord réel à cheval sur deux segments, plages Unicode et séparateurs, éditions périmées, métadonnées immuables, absence de second avis, migration répétée avec sauvegarde exacte, reprise après fermeture, JSON corrompu/future version et échec d’écriture. Les quatre nouveaux tests TypeScript couvrent la pile commune, l’invalidation, les paramètres IPC et la propagation d’une révision périmée. Les tests navigateur existants vérifient l’absence de régression de l’éditeur ; ils ne testent pas encore les nouveaux contrôles de relecture.

Aucun écran modifié : pas de nouvelles captures pour cette phase. À vérifier sur Mac : `npm run native:build`, `swift test --package-path native/swift`, `cargo test -p elpotranscribe --locked`, puis `npm run tauri -- build --target aarch64-apple-darwin -- --locked`. Ni compilation Tauri, ni migration d’un historique utilisateur réel, ni essai M2 8 Go de cette branche n’ont été réalisés. Aucun nouveau DMG publié. Prochaine phase : **7 — Relecture dans l’éditeur**.

## Refonte de l’interface — Phase 5 (15 octobre 2026)

Bibliothèque unique implémentée. `src/Library.tsx`, `src/library.ts`, `src/App.tsx` et `src/style.css` remplacent Tableau de bord/Mes transcriptions et les cartes statistiques par la liste complète, archives incluses. Nouvelle transcription est une action (bouton avec ⌘N et menu natif existant), plus une entrée de navigation. La barre de commandes sous le titre contient création, recherche et résumé moteur/langue/profil ; ce dernier ouvre les mêmes réglages dans un popover. Le titre reste dans la barre native de 52 px.

Recherche locale dans les titres et cues, insensible à la casse/aux accents, avec espaces normalisés et recherche entre deux sous-titres. Tri par nom naturel fr-FR, durée, moteur, date ou libellé français du statut, dans les deux sens. Aucun ordre du Store n’est modifié. Noms tronqués avec title, taille décimale et moteur sur la ligne secondaire, dates converties depuis les vraies secondes Unix, durées depuis durationMs. Une donnée absente est affichée « — ».

Double-clic et Ouvrir ouvrent l’éditeur ; menus natifs par ligne : ouvrir, second avis, export SRT via le dialogue existant, suppression avec confirmation. Un second avis sur une copie déjà vérifiée du même audio conserve l’ID choisi dans l’ancien formulaire, même après déduplication des sources. Le remplacement de ce formulaire reste la phase 8 ; aucun nouveau calcul ou pourcentage d’inférence n’est ajouté.

Zone de dépôt uniquement dans la bibliothèque vide, avec icône audio ; voile de dépôt global piloté par les événements de dépôt (Tauri sur Mac, événements DOM pour l’aperçu navigateur). Le compteur du lot apparaît à partir de huit fichiers avec son explication. Les notes de temps sont remplacées dans la liste par une icône d’information ; les dépassements sont comptés sur les textes/bornes réels et les réglages actuels, sans créer de temps. Nouveau lot archive : les lignes restent visibles dans cette bibliothèque unique. La suppression continue de retirer la ligne immédiatement ; source et exports ne sont pas supprimés par la commande existante.

`src/Models.tsx` reçoit également deux ajustements de suivi : une réinstallation efface l’ancien message « Intégrité vérifiée », et les tailles sont relues quand les métadonnées de version changent. Le scénario du menu de modèle teste maintenant cette disparition du message ; pas de nouveau chargement d’inférence.

`tests/library.test.ts`, `tests/browser/app.spec.ts`, `tests/browser/profiles.spec.ts` couvrent recherche Unicode/archives/phrase entre cues, tris naturels et français, dépassements calculés sans changer les cues, ouverture, second avis sur une source dupliquée, export, dépôt, compteur proche de la limite, suppression effective et archivage conservateur. Les fixtures de snapshot renvoient maintenant une copie structurée, comme une vraie réponse IPC, plutôt qu’un objet partagé par référence avec le renderer. Les aides de test exposant l’état simulé restent uniquement dans les tests.

| Contrôle exécuté en fin de phase | Résultat |
|---|---|
| `npm run build` | TypeScript / Vite réussis |
| `npm test` | **19 tests réussis**, 7 fichiers |
| `ELPO_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser` | **26 réussis**, IPC simulé |
| `cargo test -p elpo-core --locked` | **28 réussis**, aucun échec ni ignoré |
| `cargo clippy -p elpo-core --locked -- -D warnings` | Réussi |
| `cargo fmt --all --check`, `git diff --check` | Réussis |

Captures avant/après dans `.ui-captures/phase-05/` (non versionné) : les neuf vues précédentes sont conservées avant fusion ; dix vues après, dont bibliothèque, liste vide, réglages, dépôt, modèles, paramètres, vocabulaire et éditeur/recherche. Deux scénarios de capture réussis à 1280 × 800 ; bibliothèque et popover inspectés visuellement. Animations terminées pour les captures déterministes. Ces vues ne prouvent ni l’inférence ni les menus/dépôts AppKit.

**Point d’arrêt propre : fin de phase 5. Reprendre à la phase 6 — Relecture : modèle de données.** Les phases 6 à 11 restent à faire : décisions stables et persistées, relecture intégrée, nouveau parcours du second avis, fenêtre Réglages, vocabulaire et finitions. Aucun début de migration de history.json n’est laissé dans cette phase. Pas de dépendance d’exécution ajoutée ; aucune modification des moteurs, des temps ou des formats d’export. La version publique 1.2.0 et ses assets restent inchangés ; pas de nouveau DMG de la refonte publié.

Contrôles Mac encore nécessaires : compiler le pont et l’application (`npm run native:build`, `swift test --package-path native/swift`, `cargo test -p elpotranscribe --locked`, `npm run tauri -- build --target aarch64-apple-darwin -- --locked`), puis vérifier le verre/boutons de fenêtre, les vrais menus et raccourcis, le dépôt Finder, le second avis et l’export/suppression sur de vrais fichiers. Après les phases 6–11 : relecture entièrement au clavier, double vérification réelle, icône Dock et thème clair. Aucun résultat natif de cette branche n’est revendiqué sous Linux.

## Refonte de l’interface — Phase 4 (15 octobre 2026)

Nettoyage global et Modèles IA. `src/App.tsx`, `src/Vocabulary.tsx`, `src/style.css` : titre unique dans la barre, suppression des surtitres/accroches/fil d’Ariane et répétitions de confidentialité, logo unique, icônes de navigation distinctes, import avec fichier audio. La pastille Mode local ouvre un popover indiquant le traitement local, l’absence de télémétrie, les usages réseau et le réglage réel de vérification. Les panneaux imbriqués et pastilles sont séparés par les fonds/espacements.

`src/Models.tsx` : deux entrées, statut de version unique et date relative française ; révision complète et date exacte repliées dans Détails techniques. Le choix par défaut utilise la commande de réglages existante. Les actions d’intégrité/réinstallation/suppression sont dans un menu natif. Les tailles inconnues et la mémoire non mesurée sont omises. Les étapes d’installation/intégrité affichées correspondent à une commande réellement en cours, sans pourcentage.

`src/format.ts`, `tests/format.test.ts` : nombres, unités décimales et dates via Intl fr-FR ; test de 19 300 000 octets → 19,3 Mo, séparateur de milliers, aujourd’hui/hier/date ancienne/date absente. Les formats techniques d’horodatage/export restent inchangés.

`src-tauri/src/model_disk.rs`, `src-tauri/src/main.rs`, `src-tauri/src/desktop.rs` : commande de mesure en lecture seule de l’installation active, compatible avec les manifestes anciens et versionnés. Taille logique et blocs réellement alloués du système de fichiers (blocs × 512) distincts ; liens physiques dédupliqués, liens symboliques internes et traversées de chemin refusés. Le chiffre affiché est celui des blocs des fichiers, sans les anciens téléchargements ni les métadonnées de dossiers ; les blocs APFS éventuellement partagés ne sont pas une mesure d’espace exclusivement récupérable.

`native/swift/Sources/ElpoASR/ElpoASR.swift`, `Support.swift` et `Tests/ElpoASRTests/TimingTests.swift` : nouvelle action de métadonnées verify utilisant le calcul SHA-256 existant, sans chargement de moteur ni réseau, sous le verrou existant. Aucun changement du chemin de transcription ni de ses temps. Le test ajouté `InstalledIntegrityTests` couvre les deux moteurs et les poids altérés ; **non exécuté ici sous Linux**, à lancer sur Mac.

Contrôles exécutés : `npm run build` réussi ; `npm test` **16 réussis** ; `npm run test:browser` avec Chromium système **23 réussis**, IPC simulé ; `cargo test -p elpo-core --locked` **28 réussis** ; Clippy du cœur réussi. En plus : `cargo test -p elpotranscribe --locked` **3 tests portables réussis** (benchmark et deux tests de mesure), et Clippy de l’application avec `--all-targets -- -D warnings` réussi. Ces tests de l’application sur Linux ne compilent pas le module desktop macOS.

Les scénarios navigateur interdisent « à mesurer »/« TODO » sur les sept écrans, contrôlent le titre/confidentialité uniques, l’état réel du réglage dans le popover, sa fermeture au clavier, les tailles issues de l’IPC, le choix par défaut, les trois actions du menu et le routage du contrôle d’intégrité. En navigateur sans Tauri, les installations sont désormais grisées : le test exige cet état, sans prétendre qu’un moteur natif y est disponible.

Captures avant/après : neuf écrans dans `.ui-captures/phase-04/`, hors Git ; deux scénarios de capture réussis à 1280 × 800 et écran Modèles IA inspecté visuellement. Elles ne prouvent pas l’inférence, les dialogues ni l’exécution de la nouvelle action Swift.

À vérifier sur Mac : `npm run native:build`, `swift test --package-path native/swift`, `cargo test -p elpotranscribe --locked`, puis compilation Tauri ; mesurer les deux installations réelles, ouvrir les menus natifs, vérifier un modèle puis des poids altérés dans un dossier de test. La préversion 1.2.0 publiée reste inchangée. Prochaine phase : **5 — Bibliothèque unique**.

## Refonte de l’interface — Phase 3 (15 octobre 2026)

Fondations visuelles implémentées, sans changement du moteur, de la segmentation, des temps, de la comparaison ou du format des exports.

Fichiers / choix :

- `src/style.css` : bloc `@theme` avec les dix couleurs demandées, dérivés de surfaces via `color-mix`, polices UI/lecture/temps et courbe `--ease-mac`. Les 130 littéraux relevés dans les règles CSS sont remplacés par des tokens ; seuls les tokens de palette contiennent des valeurs couleur. Fond neutre, couleurs d’action/sélection et d’état séparées, échelle 13/12/22 px, contrôles 28 px (action principale 32), navigation 28 px. Flèche sur les boutons, sélection réservée aux champs et à la transcription, focus visible, anti-aliasing, absence de rebond, réduction des mouvements.
- `src/components/ui/Button.tsx`, `Select.tsx`, `TextField.tsx`, `NumberStepper.tsx`, `StatusPill.tsx`, `Popover.tsx`, `showNativeMenu.ts`, `index.ts` : composants sans nouvelle dépendance d’exécution. Le select conserve le vrai `<select>` et ses options, avec chevron Lucide, texte tronqué et titre complet. Le stepper garde une saisie numérique et des commandes bornées par les limites existantes. Le popover prévoit Échap/clic extérieur/focus ; son utilisation dans les écrans vient aux phases suivantes. Le menu Tauri garde sa ressource vivante après `popup` (la promesse ne représente pas une sélection) et libère le menu précédent au prochain affichage.
- `src/App.tsx`, `src/Vocabulary.tsx` : remplacement de tous les boutons, sélecteurs et champs par les composants partagés, sans modifier les commandes métier. Les textarea conservent leurs refs, accès de sélection, recherche et édition. Deux réglages numériques utilisent le stepper ; le statut des fichiers utilise `StatusPill`. Le défilement de recherche respecte maintenant la préférence de réduction des mouvements.
- `src-tauri/capabilities/default.json` : uniquement `core:menu:allow-new` et `core:menu:allow-popup` ajoutées pour les futurs menus contextuels. Les permissions génériques de shell/réseau/disque ne sont pas ajoutées.
- `tests/contextMenu.test.ts`, `tests/browser/app.spec.ts` : durée de vie de la ressource de menu, sélecteur conservé, incrément/décrément et transmission des mêmes unités de réglages, mesure de la barre à 52 px et de la navigation à 28 px. Un scénario parcourt les sept pages à 1280 × 800 et vérifie les lignes rendues de chaque texte de bouton visible.
- `docs/UI-AUDIT.md` : précision de l’inventaire sur la commande Finder `reveal`, utilisée par l’éditeur. Le reste de l’audit décrit toujours la base avant refonte.

| Commande | Résultat |
|---|---|
| `npm run build` | TypeScript et Vite réussis, sans avertissement de syntaxe CSS |
| `npm test` | 14 tests réussis dans 5 fichiers |
| `ELPO_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:browser` | 21 tests réussis, IPC simulé |
| `cargo test -p elpo-core --locked` | 28 tests réussis ; aucun échec/ignoré |
| `cargo clippy -p elpo-core --locked -- -D warnings` | Réussi |
| `cargo fmt --all --check` | Réussi |

Captures avant : `.ui-captures/phase-02/`. Après : neuf vues dans `.ui-captures/phase-03/`, avec contrôle des libellés également pendant les deux scénarios de capture. Les captures tableau de bord et vocabulaire ont été inspectées visuellement. Ces captures sont exclues de Git ; elles ne prouvent jamais une inférence ni un menu AppKit.

**Point de reprise : Phase 4 — Nettoyage global et Modèles IA.** Les phases 4 à 11 ne sont pas implémentées. Les surtitres, les répétitions de confidentialité, les cartes de statistiques et l’ancien parcours de double vérification restent donc présents à ce stade. Le popover et les menus contextuels sont des fondations ; leur intégration métier n’est pas revendiquée avant ces phases. Pas de nouveau DMG publié, pas de tag modifié.

À vérifier sur Mac avant de considérer cette branche comme une app livrable : compilation Tauri avec la feature privée, XCTest et tests Rust de l’application ; effet de verre/position des boutons ; vrais menus et raccourcis, dialogue d’export, fermeture/annulation avec traitement ou brouillon, lecteur audio et sélection du texte. Après les phases encore à faire : relecture complète au clavier, double vérification réelle, icône Dock et thème clair. Les commandes natives sont indiquées dans la section phase 1 ci-dessous. Aucun résultat macOS de cette branche n’est revendiqué.

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
