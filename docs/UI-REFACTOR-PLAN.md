# Plan de refonte demandé

Document de référence fourni par l’utilisateur le 15 octobre 2026. État courant : phases 1 à 3 implémentées, contrôles Linux réussis ; validation native Mac non effectuée. Reprendre **la phase 4**, sans sauter les contrôles et commits par phase. Voir [audit](UI-AUDIT.md) et [preuves](VALIDATION.md).

---

Tu vas refondre l'interface d'Elpotranscribe en 11 phases, dans l'ordre, au cours de cette session.

VISION D'ENSEMBLE
Faire d'Elpotranscribe une vraie app Mac premium, et non une page web dans une fenêtre :
- une interface dense et sobre ;
- une confiance exprimée une seule fois ;
- la double vérification transformée en mode « Relecture », au cœur de l'éditeur.
Navigation finale de la barre latérale : Bibliothèque, À relire, Vocabulaire, Modèles IA. « Nouvelle transcription » devient une action (⌘N) et les Paramètres deviennent une fenêtre Réglages (⌘,).

MÉTHODE
- Lis d'abord AGENTS.md, README.md, docs/ARCHITECTURE.md et docs/VALIDATION.md. Leurs règles restent prioritaires : n'invente jamais de temps, de score, de progression, de taille, de mémoire, de disponibilité moteur ni de résultat de test. Quand une information n'existe pas dans le code, affiche moins plutôt qu'une approximation.
- Crée une branche refonte-interface dans le checkout existant (pas de worktree).
- Ne touche ni à l'inférence, ni aux horodatages, ni au format des exports.
- Aucune nouvelle dépendance d'exécution sans justification écrite dans le compte rendu.
- À la fin de chaque phase :
  - lance npm run build, npm test, npm run test:browser, cargo test -p elpo-core --locked et cargo clippy -p elpo-core --locked -- -D warnings ;
  - lance aussi swift test --package-path native/swift si tu es sur macOS ;
  - corrige jusqu'à ce que tout passe, puis fais un commit « Phase N — titre » ;
  - ne passe jamais à la phase suivante avec un test en échec.
- Si l'environnement n'est pas macOS, ne prétends à aucun résultat natif : note les commandes que je devrai lancer sur mon Mac.
- Prends des captures Playwright avant et après chaque écran modifié, dans un dossier non versionné ajouté au .gitignore. Ces captures prouvent l'interface, jamais l'inférence.
- Si tu manques de temps ou de contexte, arrête-toi proprement à la fin d'une phase terminée et indique la phase suivante.

PHASE 1 — Cartographie et règles (aucun code applicatif modifié)
1. Crée docs/UI-AUDIT.md avec :
   - chaque écran (Tableau de bord, Mes transcriptions, Double vérification, Modèles IA, Paramètres, Vocabulaire, éditeur) et ses fichiers React ;
   - les commandes IPC appelées par chaque écran ;
   - la représentation actuelle de la double vérification : types Rust et TypeScript, stockage dans history.json, application d'une proposition, annulation ;
   - les raccourcis clavier existants de l'éditeur ;
   - l'inventaire des <select>, des couleurs codées en dur, des tailles de police et des hauteurs de contrôle.
2. Ajoute à AGENTS.md une section « Design » :
   - App Mac, pas site web : aucun surtitre marketing, aucun fil d'Ariane, aucun texte promotionnel dans l'interface.
   - Échelle : texte 13 px, secondaire 12 px, titres de page 22 px semibold. Contrôles de 28 px (32 px pour l'action principale). Lignes de barre latérale de 28 px.
   - Couleurs uniquement via les tokens : violet = action principale et sélection, rien d'autre ; ambre = divergences et points à relire ; vert = terminé ou vérifié ; corail = erreur. Fond neutre, sans teinte violette.
   - Polices : system-ui pour l'interface, ui-serif pour le texte transcrit, ui-monospace avec tabular-nums pour les temps.
   - Séparer par l'espacement et les nuances de fond plutôt que par des bordures. Jamais de carte dans une carte.
   - Curseur flèche sur les boutons. Interface non sélectionnable, sauf les champs et le texte transcrit.
   - Animations de 300 ms maximum, courbe --ease-mac, désactivées sous prefers-reduced-motion.
   - Une seule mention de confidentialité : la pastille « Mode local ».
   - Une icône = un sens. Jamais l'icône d'envoi (upload) pour un import local.
   - Menus « … » natifs via @tauri-apps/api/menu.
   - Nombres et dates au format fr-FR via Intl.

PHASE 2 — Fenêtre native et menus en français
1. Fenêtre, dans tauri.conf.json. Vérifie chaque clé dans le schéma de la version de Tauri installée ; si une clé n'existe pas, ignore-la et adapte la mise en page.
   - titleBarStyle "Overlay", hiddenTitle true ;
   - trafficLightPosition aligné verticalement sur la barre d'outils ;
   - transparent true et windowEffects { effects: ["sidebar"], state: "followsWindowActiveState" } ;
   - app.macOSPrivateApi true, avec la feature Cargo correspondante si la compilation l'exige ;
   - minWidth et minHeight raisonnables.
2. Barre d'outils de 52 px en haut de la zone principale, avec l'attribut data-tauri-drag-region et la permission core:window:allow-start-dragging. La barre latérale a un fond transparent pour laisser passer l'effet de verre, et son contenu commence sous les boutons de fenêtre.
3. Menus en Rust (MenuBuilder, SubmenuBuilder, PredefinedMenuItem avec libellés français) :
   - Elpotranscribe : À propos d'Elpotranscribe ; Réglages… ⌘, (provisoirement l'écran Paramètres, relié à la fenêtre Réglages en phase 9) ; Services ; Masquer Elpotranscribe ⌘H ; Masquer les autres ⌥⌘H ; Tout afficher ; Quitter Elpotranscribe ⌘Q.
   - Fichier : Nouvelle transcription ⌘N ; Importer des fichiers audio… ⌘O ; Importer un dossier… ⇧⌘O ; Exporter… ⇧⌘E ; Fermer la fenêtre ⌘W.
   - Édition : Annuler ⌘Z ; Rétablir ⇧⌘Z ; Couper ; Copier ; Coller ; Tout sélectionner ; Rechercher… ⌘F.
   - Présentation : Masquer la barre latérale ⌃⌘S (ajoute le repli de la barre latérale s'il n'existe pas) ; Plein écran.
   - Fenêtre : Placer dans le Dock ⌘M ; Réduire/agrandir.
   - Aide.
   Règles pour ces menus :
   - Les actions personnalisées émettent un événement vers React, qui réutilise les fonctions existantes, sans logique dupliquée.
   - ⌘Z et ⇧⌘Z déclenchent toujours l'annulation de l'éditeur, et ⌘F la barre Rechercher/Remplacer existante.
   - Une action sans contexte est grisée, jamais factice.
   - Si une transcription est en cours, ⌘W et ⌘Q demandent confirmation.
4. Ajoute src-tauri/Info.plist avec CFBundleDevelopmentRegion = fr.
5. productName devient « Elpotranscribe ». Ne change surtout pas l'identifiant com.elpo.elpotranscribe, qui fixe le chemin des données utilisateur. Mets à jour les scripts, la CI et les noms d'artefacts concernés.

PHASE 3 — Fondations visuelles (aucun changement de comportement)
1. Dans le CSS global :
   - ajoute :root { color-scheme: dark } ;
   - crée un bloc @theme Tailwind avec ces tokens : fond #111114, panneau #18181C, surélevé #1F1F24, séparateur rgba(255,255,255,0.07), texte #EDEEF2, texte secondaire #8B8E99, action #8B7CF6, attention #FFB547, succès #34C77B, erreur #FF6B5E ;
   - définis les polices ui (system-ui, -apple-system), lecture (ui-serif, "New York", Georgia) et temps (ui-monospace, "SF Mono", Menlo) ;
   - définis --ease-mac: cubic-bezier(0.32, 0.72, 0, 1) ;
   - remplace toutes les couleurs codées en dur relevées dans l'audit.
2. Règles natives :
   - user-select: none sur l'interface, sauf les champs, les zones éditables et le texte transcrit ;
   - cursor: default sur les boutons et les liens ;
   - overscroll-behavior: none ;
   - -webkit-user-drag: none sur les images et les SVG ;
   - -webkit-font-smoothing: antialiased ;
   - anneau de focus visible, dans la couleur action.
3. Composants partagés dans src/components/ui :
   - Button : principal, secondaire, discret, destructif ; 28 px, ou 32 px en grande taille ;
   - Select : appearance: none avec un chevron Lucide, menu natif conservé au clic, même hauteur que les champs, texte trop long coupé en fin avec « … » et un attribut title ;
   - TextField ;
   - NumberStepper compact, d'une largeur adaptée au contenu ;
   - StatusPill ;
   - Popover ;
   - une fonction showNativeMenu(items) basée sur Menu de @tauri-apps/api/menu, avec la capability minimale nécessaire.
4. Remplace tous les <select>, boutons et champs existants par ces composants. Applique l'échelle typographique de la section Design.
5. Contrôle : à 1280 × 800, aucun libellé de bouton ne passe sur deux lignes.

PHASE 4 — Nettoyage global et Modèles IA
1. Supprime les surtitres en capitales, les phrases d'accroche sous les titres et le fil d'Ariane. Le titre de la page va dans la barre d'outils.
2. Confidentialité : garde seulement la pastille « Mode local ».
   - Au clic, elle ouvre un popover : traitement local, aucune télémétrie, connexions réseau limitées aux métadonnées de versions et aux téléchargements demandés, état actuel du réglage de vérification.
   - Supprime la carte « Votre audio reste chez vous » de la barre latérale et le badge « 100 % local après installation ».
   - Supprime aussi le bloc logo et version du bas ; la version ira dans Réglages > Application.
3. Barre latérale : lignes de 28 px, une icône distincte pour chaque entrée, logo affiché une seule fois.
4. Remplace les cartes imbriquées et les pastilles bordées par de l'espacement et des nuances de fond.
5. Tous les nombres et dates passent par Intl.NumberFormat et Intl.DateTimeFormat en fr-FR (par exemple « 19,3 Mo »).
6. Modèles IA :
   - Supprime la pastille « Taille et mémoire réelles à mesurer… ».
   - Ajoute une commande Rust qui calcule la taille réelle sur disque des fichiers installés, et affiche-la.
   - N'affiche la mémoire que si une vraie mesure existe (par exemple issue du benchmark intégré). Sinon, n'affiche rien.
   - Un seul statut : « ✓ À jour · vérifié aujourd'hui », en date relative fr-FR.
   - L'empreinte et la date exacte vont dans une section repliable « Détails techniques ».
   - Action principale : « Utiliser par défaut », ou le statut « Moteur par défaut » si c'est déjà le cas. Vérifier l'intégrité, Réinstaller et Supprimer passent dans un menu natif « … ».
   - La carte « Versions des modèles » tient sur une seule ligne.
7. Ajoute un test Playwright qui échoue si un texte de travail interne (« à mesurer », « TODO ») apparaît dans l'interface.

PHASE 5 — Bibliothèque unique
1. Fusionne Tableau de bord et Mes transcriptions en un seul écran « Bibliothèque ». Supprime les cartes de statistiques.
2. Barre d'outils :
   - « Nouvelle transcription » (⌘N) ;
   - recherche plein texte dans l'historique (titres et texte) ;
   - un bouton résumé « Moteur · Langue · Profil » qui ouvre un popover et remplace la grande carte « Moteur de transcription ».
   « Nouvelle transcription » quitte la barre latérale : c'est une action, pas un lieu.
3. Glisser des fichiers n'importe où dans la fenêtre affiche un voile de dépôt. La grande zone de dépôt n'apparaît que si la bibliothèque est vide. Son icône : un fichier audio ou une flèche vers le bas, jamais l'icône d'envoi.
4. Tableau compact et triable (nom, durée, moteur, date, statut) :
   - nom sur une ligne, coupé avec « … » et un title, et une ligne secondaire « 19,3 Mo · Whisper Turbo » ;
   - un double-clic ouvre l'éditeur ;
   - menu natif « … » par ligne : Ouvrir, Demander un second avis, Exporter, Supprimer de l'historique ;
   - le bouton « Ouvrir » perd sa flèche ↗.
5. Remplace l'avertissement Whisper répété sous chaque fichier par une icône d'information avec infobulle. Si c'est calculable à partir des segments réels, affiche plutôt « N sous-titres dépassent la longueur ou la durée choisie ».
6. Le compteur « x / 10 » n'apparaît qu'à l'approche de la limite, avec une explication.

PHASE 6 — Relecture : modèle de données (sans interface)
Pars de la représentation actuelle des divergences. La lecture de l'historique existant ne doit jamais casser : migration rétrocompatible et testée.
1. Chaque divergence porte :
   - un identifiant stable ;
   - le segment concerné et sa position dans le texte du moteur principal ;
   - la lecture du principal, celle du second avis, et le nom des deux moteurs ;
   - un statut : « à traiter », « acceptée » (lecture du second avis), « conservée » (lecture du principal) ou « modifiée » (texte saisi par l'utilisateur, puisque les deux moteurs peuvent se tromper).
2. Résoudre une divergence ne modifie que le texte de la plage concernée : jamais les horodatages, jamais un autre segment. Chaque résolution est annulable et rétablissable via la pile d'annulation existante de l'éditeur.
3. Les statuts sont enregistrés avec la transcription, pour pouvoir reprendre une relecture après fermeture.
4. Traite explicitement et teste ces cas limites :
   - une divergence à cheval sur deux segments ;
   - des divergences adjacentes ;
   - un segment modifié à la main après la comparaison : la divergence devient « à revoir » au lieu d'appliquer une plage périmée ;
   - une transcription sans second avis.
5. Expose au frontend : la liste des divergences d'une transcription, la résolution, l'annulation, et le total global des divergences à traiter.
6. Tests :
   - Rust : application, annulation, horodatages inchangés, migration d'un history.json existant (ajoute une fixture), cas limites ;
   - TypeScript : types et client IPC.

PHASE 7 — Relecture : interface dans l'éditeur
Réutilise le lecteur audio et les raccourcis existants de l'éditeur.
1. Bouton « Relecture » dans la barre d'outils de l'éditeur, visible quand la transcription a des divergences, avec un compteur du type « 7 divergences · 3 traitées ».
2. Dans le texte, les divergences à traiter sont soulignées en couleur attention. Les divergences traitées gardent une marque discrète en couleur succès.
3. Gouttière à droite du texte : un trait ambre par divergence à traiter, placé à sa hauteur dans le document. Un clic y amène directement.
4. Popover ancré sur la divergence active, qui montre :
   - les deux lectures, avec le nom de chaque moteur ;
   - les boutons « Garder (Échap) », « Accepter (Entrée) » et « Modifier… (M) » ;
   - « Écouter », qui joue l'audio du segment à partir d'une seconde avant son début (temps réels du principal, sans descendre sous 0).
5. Clavier, actif seulement en mode Relecture et jamais pendant une saisie :
   - Tab et ⇧Tab : divergence suivante ou précédente ;
   - Entrée : accepter ; Échap : garder ; M : modifier ;
   - le raccourci de lecture existant pour écouter ;
   - ⌘Z et ⇧⌘Z : annuler et rétablir.
   La divergence active défile en douceur dans la vue.
6. À la résolution, le soulignement ambre glisse vers la couleur succès et le mot change en fondu, en environ 250 ms avec --ease-mac. Aucun mouvement sous prefers-reduced-motion.
7. Quand tout est traité : état « Relecture terminée », avec l'action « Exporter ».
8. Accessibilité : annonce aria-live du type « Divergence 4 sur 7 », libellés VoiceOver sur chaque action, focus entièrement utilisable au clavier.
9. Honnêteté : aucun score, aucun pourcentage. Rappel discret : « L'accord entre moteurs ne garantit pas l'absence d'erreur ».
10. Tests :
   - tests unitaires de la logique de navigation ;
   - test Playwright avec IPC simulé sur une fixture : parcours avec Tab, Entrée, Échap, Modifier et ⌘Z, mise à jour du compteur, reprise après rechargement.

PHASE 8 — Intégrer la double vérification au parcours
1. Action « Demander un second avis » dans la barre d'outils de l'éditeur et dans le menu « … » des lignes de la bibliothèque. Elle ouvre une feuille avec :
   - le moteur principal et le second avis (seulement des moteurs installés et différents) ;
   - un bouton ⇄ entre les deux pour les inverser ;
   - un rappel de ce qui va se passer.
   Si le traitement actuel relance les deux moteurs, dis-le tel quel : « Les deux moteurs vont analyser l'audio l'un après l'autre ». Ne réutilise le résultat existant que si c'est simple et testé.
2. Pendant le traitement, affiche uniquement des étapes réelles (en file, moteur principal, second avis, comparaison), d'après les événements déjà émis par les processus Swift et Rust. Ajoute le temps écoulé. Aucune barre de pourcentage inventée. L'annulation existante reste en place.
3. À la fin du traitement, l'éditeur s'ouvre directement en mode Relecture.
4. Dans la barre latérale, « Double vérification » devient « À relire », avec le total des divergences à traiter.
   - L'écran liste les transcriptions qui ont des divergences : nom, nombre restant, date. Un clic ouvre l'éditeur en mode Relecture.
   - État vide : une courte explication et un bouton « Demander un second avis ».
5. Supprime l'ancienne page formulaire une fois le nouveau parcours testé. Garde le réglage d'inversion des moteurs.
6. Mets à jour docs/VALIDATION.md et le scénario natif de double vérification si des commandes ont changé.

PHASE 9 — Fenêtre Réglages
1. Réglages… (⌘,) ouvre une fenêtre dédiée : seconde fenêtre Tauri, taille fixe, onglets Sous-titres, Modèles et réseau, Application. Paramètres quitte la barre latérale.
2. Chaque réglage s'applique immédiatement, avec une confirmation discrète. Plus de bouton « Enregistrer ».
3. La case de vérification des mises à jour des modèles va dans l'onglet Modèles et réseau. Les champs numériques deviennent des NumberStepper compacts.
4. Onglet Sous-titres :
   - aperçu en direct d'un vrai segment de la dernière transcription, découpé avec les réglages en cours ;
   - sa vitesse de lecture en caractères par seconde, calculée sur les temps réels ;
   - l'aperçu est masqué s'il n'existe aucune transcription.
5. Préréglages : Standard / YouTube (l'actuel), Vertical (Shorts, Reels : une ligne), Personnalisé.
6. Onglet Application : version, modèle de Mac, mention « Aucune télémétrie ».
7. Les réglages se synchronisent entre les fenêtres via un événement Tauri.

PHASE 10 — Vocabulaire
1. Liste des profils compacte et alignée à gauche, façon Notes, avec des boutons + et − dessous. Un menu natif « … » propose Dupliquer, Réinitialiser, Importer .json et Exporter .json (format JSON inchangé).
2. Panneau de droite avec une marge intérieure correcte et des textes d'aide à 12 px.
3. Les termes deviennent des étiquettes supprimables, avec un seul champ « Ajouter un terme… » validé par Entrée.
   - Coller plusieurs lignes crée plusieurs termes.
   - Un filtre de recherche apparaît au-delà de 20 termes.
   - Les doublons sont signalés.
4. « Invite Whisper » devient « Phrase de contexte », avec la liste des moteurs qui l'utilisent réellement d'après le code. N'affirme rien qui ne soit pas vérifié.
5. En mode Relecture, signale les mots proches d'un terme du vocabulaire comme des suggestions (même interface, mêmes statuts), sans aucune correction automatique.

PHASE 11 — Identité et finitions
1. Crée assets/logo.svg avec exactement ce contenu :
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="fond" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#23212F"/>
      <stop offset="1" stop-color="#0F0F14"/>
    </linearGradient>
    <linearGradient id="trait" gradientUnits="userSpaceOnUse" x1="120" y1="0" x2="392" y2="0">
      <stop offset="0" stop-color="#8B7CF6"/>
      <stop offset="1" stop-color="#F4F2FF"/>
    </linearGradient>
  </defs>
  <rect x="50" y="50" width="412" height="412" rx="92" fill="url(#fond)"/>
  <rect x="50.5" y="50.5" width="411" height="411" rx="91.5" fill="none" stroke="#fff" stroke-opacity=".08"/>
  <g fill="url(#trait)">
    <rect x="120" y="211" width="28" height="90" rx="14"/>
    <rect x="164" y="171" width="28" height="170" rx="14"/>
    <rect x="208" y="196" width="28" height="120" rx="14"/>
    <rect x="256" y="186" width="136" height="28" rx="14"/>
    <rect x="256" y="242" width="112" height="28" rx="14"/>
    <rect x="256" y="298" width="72" height="28" rx="14"/>
  </g>
</svg>
2. Convertis ce SVG en PNG de 1024 × 1024 avec un outil disponible (sinon, note-le pour moi), puis génère les icônes avec npm run tauri -- icon.
3. Le logo n'apparaît qu'une fois dans l'interface. Remplace les usages décoratifs de l'icône Lucide « audio-lines ».
4. Animations, de 300 ms maximum et désactivées sous prefers-reduced-motion :
   - l'indicateur de sélection de la barre latérale glisse d'un élément à l'autre ;
   - les nouvelles lignes de la file apparaissent avec @starting-style ;
   - le voile de dépôt s'illumine au survol ;
   - une coche se dessine en SVG à la fin d'un export ;
   - le téléchargement d'un modèle affiche un anneau basé sur les octets réels.
5. Ajoute un thème clair qui suit prefers-color-scheme, construit sur les mêmes tokens.
6. Dans l'éditeur, ajoute « Copier les chapitres YouTube » :
   - propose des chapitres aux longues pauses réelles, avec comme titres provisoires les premiers mots, modifiables avant la copie ;
   - respecte les règles de YouTube : premier chapitre à 00:00, au moins trois chapitres, chacun d'au moins 10 secondes.

COMPTE RENDU FINAL
Pour chaque phase : les fichiers modifiés, les choix faits, les tests lancés et leurs résultats.
Termine par la liste précise de ce que je dois vérifier moi-même sur mon Mac :
- l'effet de verre et la position des boutons de fenêtre ;
- les menus et les raccourcis ;
- une relecture complète au clavier sur une vraie transcription ;
- une double vérification réelle avec les deux moteurs ;
- l'icône dans le Dock ;
- le thème clair.
