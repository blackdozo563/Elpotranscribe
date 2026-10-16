# Architecture

React rend l’interface, sans accès direct au disque ni réseau cloud. Les commandes Tauri contrôlent les dialogues, la file, les chemins, l’historique et les exports. Le protocole asset n’autorise que les audios importés. Aucune permission shell ou HTTP générique n’est exposée au frontend.

Rust lance un unique exécutable Swift à la fois avec des arguments de protocole JSON sur stdin ; il n’utilise pas de shell. Le protocole renvoie des résultats JSON sur stdout. Les sorties temporaires bornent l’utilisation des tubes ; les ressources temporaires sont supprimées après traitement. Le processus est arrêté pour annuler l’inférence et libérer les modèles.

Le pont Swift utilise FluidAudio épinglé pour `AsrModelVersion.ultra`, ou whisper.cpp épinglé avec Metal pour large-v3-turbo Q5_0. Installation et transcription sont des processus distincts. Les téléchargements explicites et les recherches de métadonnées de versions utilisent le réseau ; les transcriptions restent locales. Ultra active `ModelHub.offlineMode` et son parcours audio sur disque ; Whisper utilise des échantillons rééchantillonnés dans un fichier temporaire. Les empreintes SHA-256 sont contrôlées avant inférence. Les temps viennent des moteurs ; Rust ne crée aucune durée artificielle.


`elpo-core` est indépendant du GUI pour tester les noms, les imports, la segmentation, SRT/VTT/TXT, les écritures atomiques sans écrasement et les ZIP. Les tests de décodage et d’inférence sont natifs et distincts des tests UI utilisant une simulation IPC.

Les données sont dans `~/Library/Application Support/com.elpo.elpotranscribe/` (chemin fourni par Tauri), comprenant `history.json`, `model-updates.json` et `models/`. Le bouton Nouveau lot archive les résultats et libère dix emplacements. La suppression d’historique ne supprime pas les exports, les modèles ni les audios.

La révision Swift est épinglée dans Package.swift. SwiftPM doit encore produire un Package.resolved lors de la première résolution macOS ; avec les traits désactivés, le manifeste FluidAudio n’introduit pas de dépendances de paquets supplémentaires. Les outils et les versions Rust/npm sont verrouillés séparément.

## Relecture persistante

`elpo-core::review` conserve la comparaison historique. `review_session` en dérive des divergences identifiées, avec des lectures d’origine immuables et des plages UTF-16. La résolution modifie uniquement la plage textuelle validée ; les temps restent ceux du principal. Les modifications manuelles invalident les plages concernées. Les comparaisons ambiguës entre plusieurs segments exigent une correction humaine.

`src-tauri/src/history.rs` définit les types réels de `history.json`, migre les comparaisons existantes après copie de sauvegarde et contrôle la révision de chaque document. Une transaction valide et persiste un candidat avant de remplacer l’état en mémoire. Les commandes `list_review`, `resolve_review` et `restore_review` exposent ces opérations ; `restore_review` sert à l’annulation comme au rétablissement et vérifie les métadonnées de comparaison.

L’éditeur charge le document courant à l’ouverture, ajoute textes et décisions à sa pile commune et enregistre chaque résolution/annulation. Il bloque les nouvelles modifications pendant l’écriture. `Review.tsx` affiche les plages reçues, la gouttière et la proposition ancrée ; il ne fait ni inférence ni alignement. Les touches de relecture sont limitées à ce mode et suspendues dans les champs de saisie. Le lecteur existant est utilisé avec les temps réels du segment. La feuille de second avis, accessible depuis l’éditeur et le menu de bibliothèque, lance les deux analyses successives dans un nouveau résultat. « À relire » regroupe les divergences non traitées, archives comprises.


`Job.verificationProgress`, facultatif pour les anciens historiques, contient `stage` (`queued`, `primary`, `secondary`, `comparison`), `startedAt` en secondes Unix et `secondaryEngine`. Rust publie ces étapes aux frontières réelles du worker, avant chaque moteur et après le retour du second moteur, sans changer l’inférence. La transition est validée, persistée puis exposée aux snapshots ; un travail annulé ne peut pas avancer. Le frontend ne déduit aucune étape du temps écoulé. Les étapes très brèves peuvent passer entre deux snapshots, interrogés chaque seconde : elles ne sont pas prolongées artificiellement pour être affichées.

Le frontend suit uniquement le résultat qu’il vient de demander. Une fois terminé, il l’ouvre en relecture si l’écran de suivi est toujours actif ; sinon, il affiche une notification et préserve l’éditeur ou le profil en cours. Après annulation/échec, un principal déjà terminé reste consultable. Les commandes IPC existantes `start_verification` et `cancel_job` restent inchangées.

## Réglages entre fenêtres

`menus::open_settings` crée ou remet au premier plan une seconde fenêtre Tauri `settings`, de taille fixe 740 × 620. La même entrée frontend rend `SettingsWindow` avec `?window=settings`. La fenêtre principale et son éditeur restent montés. La capacité dédiée autorise les événements et sa fermeture, sans shell ni accès générique aux fichiers ou au réseau. Les actions du menu de l’éditeur sont désactivées quand les réglages ont le focus ; Fermer vise alors cette fenêtre.

Le frontend utilise `update_settings` avec un patch des seuls champs modifiés. `preferences.rs` applique le patch à l’état courant, valide le candidat et le persiste avant de publier une révision croissante `settingsRevision` dans le store. Les historiques sans ce champ commencent à zéro. Les événements Tauri `settings-changed` contiennent le document et sa révision ; chaque fenêtre ignore les réponses de réglages plus anciennes, y compris celles des snapshots interrogés chaque seconde. La sélection ou l’édition d’un profil actualise aussi cette révision et cet événement. L’ancienne commande `save_settings` reste compatible mais le frontend utilise les patches pour éviter les pertes entre fenêtres.

Les contrôles des réglages attendent l’écriture courante avant d’accepter un autre changement ; les erreurs annulent l’aperçu optimiste et ne montrent pas de confirmation. Fermer la fenêtre de réglages attend son écriture en cours ; si celle-ci échoue, la fenêtre reste ouverte avec son erreur. Comme auparavant, les préférences sont bloquées pendant un traitement. Le modèle de Mac vient de `sysctl hw.model`, la version de `app.package_info()` ; aucune donnée matérielle n’est déduite de la machine cloud.

`settingsPreview.ts` ne produit aucun cue ni temps nouveau : il met en lignes le texte d’un segment terminé, affiche ses deux bornes réelles une seule fois et calcule les caractères Unicode par seconde sur toute sa durée. Plusieurs groupes de texte indiquent une limite dépassée ; aucune durée n’est distribuée entre eux. Les limites de segmentation du moteur et les formats d’export restent inchangés.
