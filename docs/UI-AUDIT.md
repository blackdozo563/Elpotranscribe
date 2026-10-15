# Audit UI — point de départ de la refonte

Audit du 15 octobre 2026, code de départ `1ec8c328001b18219b54a9a3091924c8e5f88bb9` (1.2.0), branche `refonte-interface`, checkout existant. Phase 1 : documentation et règles uniquement ; aucun code applicatif modifié. Lecture de `AGENTS.md`, `README.md`, `docs/ARCHITECTURE.md` et `docs/VALIDATION.md` effectuée.

## Écrans et responsabilités actuelles

L’application n’a pas de routeur : `App` possède un indice `page` et un résultat `selected`. Un résultat sélectionné affiche `Editor` à la place de toute page. Le style de tous ces écrans vient de `src/style.css` ; `src/main.tsx` monte l’application. Les noms et indices ci-dessous décrivent l’existant, pas la navigation cible.

| Écran | React et état | IPC utilisé par ses actions |
|---|---|---|
| Tableau de bord (0) | `src/App.tsx`, `App` : statistiques du lot, import, sélecteurs moteur/langue/profil, file non archivée | `import_files` (fichiers/dossier/chemins déposés), `save_settings`, `start_batch`, `retry_job`, `cancel_job`, `confirm_action` puis `remove_job`, `archive_completed`, `export_zip` |
| Nouvelle transcription (1) | Même JSX et mêmes données que le tableau de bord ; ce n’est pas encore une action dédiée | Mêmes commandes que le tableau de bord |
| Mes transcriptions (2) | Même JSX, `visibleJobs = data.jobs` : inclut les archives ; zone d’import masquée mais statistiques et sélecteurs conservés | Mêmes commandes de file et préférences ; « Ouvrir » appelle uniquement `setSelected` |
| Double vérification (3) | `src/App.tsx`, `VerificationPanel`, `PageTitle` : audio existant, principal, second avis, inversion, rapports | `start_verification { id, primary, secondary }`, `install_model { engine }`, `cancel_job { id }` ; ouverture de l’éditeur en état local |
| Modèles IA (4) | `src/App.tsx`, `App`, `PageTitle`, `ModelUpdateStatus` : deux moteurs et suivi des versions | `check_model_updates`, `install_model` (Ultra par défaut ou moteur explicite), `confirm_action` puis `remove_model` |
| Paramètres (5) | `src/App.tsx`, `Preferences`, `PageTitle` : copie locale `s`, sauvegarde explicite ; application/version dans `App` | `save_settings { settings }` ; pas de seconde fenêtre |
| Vocabulaire (6) | `src/Vocabulary.tsx`, `Vocabulary` ; `cleanTerms`, `profilePrompt` ; brouillon avec garde de navigation/fermeture | `save_profile`, `delete_profile`, `reset_profile`, `import_profile`, `export_profile`, `prompt_info`, `confirm_action` |
| Éditeur | `src/App.tsx`, `Editor`, `TimeInput` ; `src/domain.ts` (édition), `src/search.ts` (recherche/remplacement), `src/profileReview.ts` (suggestions proches) | `save_edit { id, cues }`, `export_job { id, format, original }`, `relink { id }`, `add_profile_term { id, term, jobId }`, `confirm_action`, `confirm_discard` |

Infrastructure commune : `snapshot` au montage puis toutes les secondes ; `check_model_updates` si libre, installé et activé, au démarrage puis toutes les six heures. Le frontend appelle `invoke` directement ou via `action`/`run` de `App` : il n’existe pas de module client IPC typé dédié. `action` rafraîchit le snapshot après chaque commande et remonte les erreurs. `confirm_action` et `confirm_discard` utilisent les dialogues natifs RFD côté Rust. `reveal { id }` est aussi appelé dans la barre d’export de l’éditeur pour afficher le dernier SRT dans le Finder.

Les événements frontend actuels concernent le dépôt de fichiers (`getCurrentWebview().onDragDropEvent`) et les fermetures avec modifications non enregistrées (`getCurrentWindow().onCloseRequested` dans l’éditeur et le vocabulaire). Il n’existe pas encore de menu applicatif Rust personnalisé ni d’événement de menu vers React. Le backend arrête le processus lors de la sortie ; pas de confirmation native globale de traitement en cours dans `run()`.

## Double vérification : données et stockage

### Types exacts

`src-tauri/src/desktop.rs` : `Store { jobs: Vec<Job>, settings: Settings }` est écrit dans `history.json` par `AppState::persist`, avec `core::atomic_save`. `Job` est sérialisé en camelCase ; `verification`, `verificationStatus`, `verificationError`, `modelVersion`, `timingNote`, `profileSnapshot` et `archived` ont des valeurs par défaut pour les historiques anciens.

`Verification` contient `secondary_engine: String`, `secondary_version: String`, `secondary_timing_note: Option<String>` (avec défaut), `reference_cues: Vec<Cue>` et `review: core::review::Review`. L’identité du principal est `Job.engine`, sa version `Job.model_version`. Les bornes de référence sont celles de `reference_cues`.

`crates/core/src/review.rs` : `Review { differences: Vec<ReviewDifference>, approximate: bool }`. `ReviewDifference` (camelCase) porte exactement `cue_index: usize`, `primary_text: String`, `candidate_text: Option<String>`, `alternative_text: String`, `profile_term: bool` (défaut false). **Pas d’identifiant stable, pas de plage persistée, pas de statut individuel.**

`src/domain.ts` : `Job.verification` est un objet optionnel et nullable, de même structure en camelCase ; `review.differences` est typé inline. `verificationStatus?: string | null` et `verificationError?: string | null`. Les états de traitement observés côté Rust sont `processing`, `completed`, `cancelled`, `failed` ; ils ne représentent pas les choix de relecture.

### Comparaison et cycle de traitement

`start_verification` exige deux moteurs installés et différents, réserve le processus unique, clone l’audio choisi dans un nouveau `Job` avec nouvel UUID, `archived = true`, date nouvelle et profil figé. **Les deux moteurs retranscrivent** : aucun résultat déjà produit n’est réutilisé. `process_verification` persiste le principal avant de charger le second ; compare le texte puis persiste la vérification. Une erreur du second peut conserver le principal terminé avec une vérification en échec.

`core::review::compare` compare les mots lexicaux normalisés (casse/ponctuation ignorées), avec limite de volume et délai de comparaison. Les offsets internes de `Token` sont des **octets UTF-8 Rust** ; ils ne sont pas sérialisés. Le JSX et les suggestions de vocabulaire utilisent des offsets JavaScript **UTF-16** : prévoir une conversion explicite en phase 6 avant toute plage persistée.

Les opérations sont regroupées par sous-titre : plusieurs différences lexicales peuvent devenir une seule `ReviewDifference`. Une proposition modifie le texte complet du sous-titre. Lorsqu’une opération traverse des sous-titres, ou insère entre deux sous-titres, `candidate_text = None` ; seul le contexte alternatif borné est présenté. Le profil peut faire remonter une divergence avec `profile_term`, sans désigner un gagnant. Les temps du principal ne sont pas remplacés par ceux du second.

### Application, annulation et reprise

Dans `Editor`, une proposition est applicable seulement si texte et temps correspondent encore à `primaryText` et `referenceCues[cueIndex]`. « Utiliser cette proposition » remplace **tout le texte du sous-titre concerné**, laisse ses bornes inchangées et appelle `update` → `change`.

`EditState` (`src/domain.ts`) conserve `past: Cue[][]`, `present: Cue[]`, `future: Cue[][]`. `change` ajoute un état (100 précédents au maximum), vide le futur ; `undo` et `redo` déplacent les instantanés de sous-titres. Les suggestions proches et les remplacements utilisent la même pile. Cette pile n’est pas persistée.

`save_edit` valide les cues et enregistre uniquement les cues modifiés / le marqueur `dirty` du résultat terminé. Le rapport de comparaison de référence reste stocké, mais aucune décision « acceptée / conservée / modifiée » ne l’est. Au retour, « Passage corrigé ou modifié » est seulement déduit de l’écart avec la référence ; garder le principal n’a pas de commande. Sans second avis, `verification` est absent/null et l’éditeur reste utilisable. Il n’existe pas de total global de divergences non résolues.

Points à protéger en phase 6 : migration d’un vrai schéma historique, Unicode/octet contre UTF-16, ambiguïtés sur plusieurs segments, divergences adjacentes, invalidation après édition/scission/fusion/suppression, pile d’annulation commune et décisions persistées. Aucun changement d’inférence, de temps ou de format d’export n’est nécessaire à cette migration.

## Raccourcis réellement présents

| Contexte | Touche | Comportement actuel |
|---|---|---|
| Éditeur, écouteur global `keydown` | ⌘F / Ctrl+F | Ouvre la recherche et place le focus dans son champ |
| Éditeur, même écouteur | Échap | Ferme la recherche |
| Champ de recherche | Entrée | Sélectionne l’occurrence courante |
| Champ de recherche | ⇧Entrée | Sélectionne l’occurrence précédente |
| Ajout rapide de vocabulaire | Entrée | Nettoie/déduplique les termes et ajoute la saisie |

Les boutons Annuler/Rétablir sont reliés à la pile de cues. **Aucun raccourci applicatif ⌘Z / ⇧⌘Z n’est actuellement raccordé à cette pile.** Les opérations standard du navigateur/textarea et les contrôles audio HTML ne constituent pas un raccourci garanti de l’application. Aucun raccourci global d’écoute, ⌘N, ⌘O, ⇧⌘O, ⇧⌘E ou ⌘, n’est défini dans le code actuel. Tab utilise l’ordre de focus HTML normal, pas une navigation de divergences.

## Inventaire des sélecteurs natifs

Neuf `<select>` : huit dans `src/App.tsx`, un dans `src/Vocabulary.tsx`. Les `<option>` sont générées localement ; pas de bibliothèque de contrôle partagé.

| Fichier / composant | Choix | Données / effet |
|---|---|---|
| App / panneau moteur | Moteur de transcription | Ultra ou Whisper Turbo ; `save_settings` |
| App / panneau moteur | Langue | auto/fr/en/es/de/it/pt, ar seulement Whisper ; `save_settings`, profil remis à null |
| App / panneau moteur | Profil de vocabulaire | aucun ou profils locaux ; `save_settings`, langue du profil appliquée |
| VerificationPanel | Audio à vérifier | sources dédupliquées par chemin ; sélection locale |
| VerificationPanel | Moteur principal | Ultra/Turbo, sélection locale ; état installé vérifié séparément |
| VerificationPanel | Second avis | Ultra/Turbo, sélection locale ; inversion des deux états |
| Preferences | Préréglage | Standard/YouTube ou sous-titres courts, copie locale des réglages |
| Preferences | Nombre de lignes | 1 ou 2, copie locale des réglages |
| Vocabulary | Langue du profil | fr/en, brouillon de profil |

## Inventaire des styles

L’inventaire ci-dessous est extrait de `src/style.css` du code de départ. Les références de lignes sont celles de ce fichier, avant refonte. Il inclut les règles responsive et les valeurs de repli. Pas de couleurs inline dans les fichiers React. La fenêtre porte aussi une couleur littérale `#10101c` dans `src-tauri/tauri.conf.json`, hors CSS. Le SVG d’icône dans `src-tauri/icons/source.svg` est un asset, à traiter en phase 11 plutôt qu’un style de contrôle.

Le CSS définit seulement `--muted`, `--border`, `--accent` ; plusieurs sélecteurs n’utilisent pas ces variables. `--accent` n’est pas réutilisé et `.profile-item.active` invoque `--purple` sans définition, avec un repli littéral. Pas de bloc `@theme` ni de tokens de statut.

### Couleurs littérales et occurrences

Les variantes alpha des mêmes couleurs restent distinctes dans cet inventaire. `transparent`, `white` et les couleurs de dégradés/ombres sont incluses. Les lignes permettent de retrouver exactement tous les sélecteurs sans réimprimer la feuille entière.

| Littéral | Lignes de `src/style.css` |
|---|---|
| `#10101b` | 5 |
| `#14131e` | 442 |
| `#15141f` | 102 |
| `#16141e` | 487 |
| `#17151f` | 364 |
| `#18332966` | 544 |
| `#191822` | 404 |
| `#191823` | 308 |
| `#191923` | 759 |
| `#19251f` | 259 |
| `#193329` | 642 |
| `#1c1a29` | 180 |
| `#211c30` | 295 |
| `#22202d` | 452 |
| `#242035` | 180 |
| `#242331` | 31 |
| `#252033` | 648 |
| `#25212d` | 555 |
| `#262035` | 759 |
| `#272033` | 813 |
| `#282033` | 376 |
| `#282331` | 494 |
| `#282434` | 230 |
| `#292334` | 798 |
| `#292335` | 517 |
| `#292838` | 10 |
| `#2c3c32` | 260 |
| `#302838` | 538 |
| `#30283e` | 469 |
| `#30283f` | 1065 |
| `#305541` | 545 |
| `#343146` | 42 |
| `#35212a` | 620 |
| `#365c49` | 643 |
| `#373547` | 30 |
| `#38304b` | 181 |
| `#393046` | 294 |
| `#3b354b` | 440 |
| `#3d344b` | 680 |
| `#40364c` | 537 |
| `#493957` | 470 |
| `#4a355e` | 1105 |
| `#4b242c66` | 549 |
| `#4b395f` | 377 |
| `#4ba37824` | 336 |
| `#514068` | 365 |
| `#55416d` | 1100 |
| `#5cd0a015` | 335 |
| `#5d3ea31c` | 364 |
| `#6245ce` | 135 |
| `#63507d` | 810 |
| `#686072` | 573 |
| `#6c657f` | 356 |
| `#70424a` | 619 |
| `#7252dd` | 57 |
| `#726d85` | 144 |
| `#74404a` | 550 |
| `#754ee92b` | 60 |
| `#7867ad` | 43 |
| `#79c9a4` | 210 |
| `#7c738d` | 612 |
| `#7f798f` | 247 |
| `#8054ed30` | 138 |
| `#82788d` | 401 |
| `#898598` | 128 |
| `#8a839e` | 160 |
| `#8d70ef` | 57 |
| `#8dd4b0` | 334 |
| `#8e6fe61a` | 163 |
| `#91869e` | 486 |
| `#9290a7` | 9 |
| `#92ceac` | 546 |
| `#9375f6` | 64 |
| `#9883a6` | 848 |
| `#9a70f229` | 331 |
| `#9ac0aa` | 261 |
| `#9b78f31b` | 330 |
| `#9c79ec` | 603 |
| `#9d82e328` | 173 |
| `#9d83f6` | 58 |
| `#9e83ff` | 135 |
| `#9e87c4` | 822 |
| `#a28ad0` | 699 |
| `#a28cd2` | 814 |
| `#a28cff` | 11 |
| `#a38bda` | 280 |
| `#a394cf` | 120 |
| `#a499b4` | 676 |
| `#a588ff` | 165 |
| `#a79cb7` | 578 |
| `#a7a1b7` | 154 |
| `#a9a2ba` | 432 |
| `#aaa0c1` | 229 |
| `#ab8af5` | 1064 |
| `#ab99ce` | 201 |
| `#ad93dd` | 743 |
| `#ad96db` | 515 |
| `#ada5b9` | 554 |
| `#b09bfb` | 329 |
| `#b293e9` | 422 |
| `#b295ed` | 379 |
| `#b4e6cc` | 644 |
| `#b59bff` | 168 |
| `#b5a8c9` | 528 |
| `#b5a8ce` | 1068 |
| `#b6a2ec` | 186 |
| `#b6a7d7` | 466 |
| `#b8a5d9` | 649 |
| `#b99759` | 791, 796 |
| `#b99a5b24` | 341 |
| `#baabd9` | 293 |
| `#bbadff` | 53 |
| `#c2aefa` | 174 |
| `#c4afd8` | 539 |
| `#c8b5ff` | 164 |
| `#d1a15e13` | 340 |
| `#d1cbdf` | 255 |
| `#e2bc8b` | 339 |
| `#e3c28a` | 802 |
| `#e5dff2` | 443 |
| `#e7aaad` | 522 |
| `#e9e7f5` | 32 |
| `#ecb1bb` | 551 |
| `#ed7f97` | 852 |
| `#eeedf7` | 4 |
| `#f1dbff` | 1106 |
| `#f2c1cb` | 624 |
| `#fff` | 137 |
| `transparent` | 153, 364, 638, 742, 820, 846 |
| `white` | 59, 299, 541, 752, 1061 |

### Typographie : toutes les déclarations de taille

Les tailles vont de 7 à 35 px. Les contrôles héritent d’abord de `font: inherit`, puis de nombreuses règles les réduisent. Le texte de transcription est actuellement sans-serif ; les temps utilisent `ui-monospace, SFMono-Regular, monospace`, sans `tabular-nums`.

| Ligne | Déclaration |
|---|---|
| 7 | `font-size: 14px;` |
| 73 | `font-size: 35px;` |
| 79 | `font-size: 17px;` |
| 84 | `font-size: 14px;` |
| 92 | `font-size: 11px;` |
| 116 | `font-size: 12px;` |
| 125 | `font-size: 7px;` |
| 142 | `font-size: 9px;` |
| 157 | `font-size: 12px;` |
| 172 | `font-size: 10px;` |
| 191 | `font-size: 12px;` |
| 194 | `font-size: 11px;` |
| 199 | `font-size: 7px;` |
| 219 | `font-size: 9px;` |
| 224 | `font-size: 9px;` |
| 246 | `font-size: 11px;` |
| 264 | `font-size: 10px;` |
| 279 | `font-size: 9px;` |
| 287 | `font-size: 12px;` |
| 298 | `font-size: 9px;` |
| 348 | `font-size: 26px;` |
| 353 | `font-size: 14px;` |
| 359 | `font-size: 14px;` |
| 382 | `font-size: 17px;` |
| 385 | `font-size: 11px;` |
| 399 | `font-size: 9px;` |
| 425 | `font-size: 10px;` |
| 433 | `font-size: 10px;` |
| 448 | `font-size: 11px;` |
| 461 | `font-size: 10px;` |
| 467 | `font-size: 10px;` |
| 483 | `font-size: 8px;` |
| 495 | `font-size: 10px;` |
| 505 | `font-size: 12px;` |
| 511 | `font-size: 9px;` |
| 529 | `font-size: 11px;` |
| 540 | `font-size: 9px;` |
| 562 | `font-size: 9px;` |
| 577 | `font-size: 12px;` |
| 581 | `font-size: 10px;` |
| 592 | `font-size: 10px;` |
| 599 | `font-size: 10px;` |
| 611 | `font-size: 9px;` |
| 628 | `font-size: 12px;` |
| 647 | `font-size: 10px;` |
| 659 | `font-size: 24px;` |
| 663 | `font-size: 12px;` |
| 677 | `font-size: 10px;` |
| 694 | `font-size: 12px;` |
| 712 | `font-size: 11px;` |
| 732 | `font-size: 25px;` |
| 736 | `font-size: 11px;` |
| 744 | `font-size: 11px;` |
| 758 | `font-size: 22px;` |
| 776 | `font-size: 10px;` |
| 803 | `font-size: 12px;` |
| 806 | `font-size: 12px;` |
| 825 | `font-size: 11px;` |
| 835 | `font-size: 10px;` |
| 842 | `font-size: 13px;` |
| 863 | `font-size: 12px;` |
| 866 | `font-size: 9px;` |
| 870 | `font-size: 10px;` |
| 924 | `font-size: 10px;` |
| 952 | `font-size: 0;` |
| 974 | `font-size: 28px;` |
| 989 | `font-size: 9px;` |
| 992 | `font-size: 11px;` |
| 995 | `font-size: 23px;` |
| 1014 | `font-size: 9px;` |
| 1069 | `font-size: 12px;` |

### Hauteurs et dimensions des contrôles

Les hauteurs ne sont pas normalisées : le bouton de base est de hauteur minimale 36 px avec padding 8 px ; la navigation utilise un minimum de 42 px. Les champs calculent leur hauteur par leur texte et le padding. Ces déclarations ne sont donc pas des mesures rendues.

| Ligne | Déclaration de hauteur CSS (tous éléments, y compris structure/icônes) |
|---|---|
| 34 | `min-height: 36px;` |
| 97 | `min-height: 100vh;` |
| 132 | `height: 40px;` |
| 156 | `min-height: 42px;` |
| 209 | `height: 5px;` |
| 240 | `height: 67px;` |
| 321 | `height: 42px;` |
| 372 | `height: 53px;` |
| 564 | `min-height: 28px;` |
| 567 | `min-height: 145px;` |
| 593 | `min-height: 32px;` |
| 605 | `height: 13px;` |
| 636 | `min-height: 22px;` |
| 753 | `min-height: 100px;` |
| 767 | `height: 35px;` |
| 777 | `min-height: 32px;` |
| 841 | `min-height: 65px;` |
| 956 | `height: 44px;` |
| 985 | `height: 32px;` |

Autres dimensions à normaliser : champs/select/textarea padding `9px 10px` ; select min-width 160 px ; panneau moteur label min-width 170 px ; boutons de ligne padding `5px 7px`, min-height 28 px ; boutons de toolbar et footer min-height 32 px ; champs temps largeur 132 px/padding 7 px ; textarea de cue min-height 65 px. La barre supérieure fait 67 px, sidebar 242 px puis 210/65 px selon le breakpoint. À petite largeur, les boutons de navigation ont width/height 44 px mais héritent aussi des autres règles.

Règles actuelles à remplacer progressivement : `cursor: pointer` et `not-allowed`, interface globalement sélectionnable, surfaces violettes et cartes bordées imbriquées, titre 35 px, multiples répétitions de confidentialité et du logo, icône Upload à l’import, animation spin de 1,5 s. `prefers-reduced-motion` existe déjà et désactive animations/transitions.

## Nombres, dates et données réellement disponibles

- Taille de fichier : `size` provient du disque à l’import ; affichage actuel `(size / 1048576).toFixed(1)`, donc point décimal et unité « Mo » malgré division binaire. À formatter en fr-FR avec unité cohérente.
- Durée : `durationMs` vient du probe natif. `time` formate le temps de sous-titre en `HH:mm:ss,SSS` ; ne pas changer le format d’export pour une préférence d’affichage.
- Date : `createdAt` vient de Rust `now()` en **secondes Unix** ; `ModelUpdate.checkedAt` est en **millisecondes Unix** (Swift). L’affichage existant de vérification utilise `toLocaleString("fr-FR")`. Ne pas confondre les deux unités lors de la bibliothèque et des dates relatives.
- Modèle : `Snapshot` expose les moteurs installés, leurs révisions/statuts/date de vérification, mais **pas leur taille installée ni une mesure mémoire**. Il faudra une commande disque dédiée en phase 4 ; ne pas déduire une taille/mémoire de la description du moteur.
- Le frontend ne reçoit actuellement que busy/status global et `verificationStatus`, pas les étapes détaillées du second avis ni les octets de téléchargement. Les animations de progression futures doivent dépendre de données réelles ajoutées à la remontée d’état, ou rester sans pourcentage.

## Captures et validation de la phase 1

Captures locales non versionnées dans `.ui-captures/phase-01/` à 1280 × 800, réalisées par Playwright avec les fixtures IPC des scénarios navigateur existants. Elles couvrent les six pages de `App`, Vocabulaire avec profils, l’éditeur et sa recherche. Aucun écran n’étant modifié en phase 1, elles constituent le point de départ avant la refonte ; pas d’« après » artificiel. Elles ne prouvent ni l’inférence, ni les dialogues macOS, ni l’effet de verre.

Les résultats de la phase sont consignés dans `docs/VALIDATION.md`. Les commandes macOS non exécutées ici sont explicitement listées. La phase suivante est **Phase 2 — Fenêtre native et menus en français** ; aucune modification de fenêtre/menu ne fait partie de cet audit.
