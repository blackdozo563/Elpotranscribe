# Architecture

React rend l’interface, sans accès direct au disque ni réseau cloud. Les commandes Tauri contrôlent les dialogues, la file, les chemins, l’historique et les exports. Le protocole asset n’autorise que les audios importés. Aucune permission shell ou HTTP générique n’est exposée au frontend.

Rust lance un unique exécutable Swift à la fois avec des arguments de protocole JSON sur stdin ; il n’utilise pas de shell. Le protocole renvoie des résultats JSON sur stdout. Les sorties temporaires bornent l’utilisation des tubes ; les ressources temporaires sont supprimées après traitement. Le processus est arrêté pour annuler l’inférence et libérer les modèles.

Le pont Swift utilise FluidAudio à une révision exacte ayant `AsrModelVersion.ultra`. Installation et transcription sont des processus distincts. Seule l’installation accède au réseau. La transcription active `ModelHub.offlineMode`, vérifie le manifeste SHA-256 puis appelle le parcours audio sur disque du SDK. Les horodatages retournés sont agrégés en mots par `buildWordTimings` ; Rust ne crée aucune durée artificielle.

`elpo-core` est indépendant du GUI pour tester les noms, les imports, la segmentation, SRT/VTT/TXT, les écritures atomiques sans écrasement et les ZIP. Les tests de décodage et d’inférence sont natifs et distincts des tests UI utilisant une simulation IPC.

Les données sont dans `~/Library/Application Support/com.elpo.elpotranscribe/` (chemin fourni par Tauri), comprenant `history.json` et `models/`. Le bouton Nouveau lot archive les résultats et libère dix emplacements. La suppression d’historique ne supprime pas les exports, les modèles ni les audios.

La révision Swift est épinglée dans Package.swift. SwiftPM doit encore produire un Package.resolved lors de la première résolution macOS ; avec les traits désactivés, le manifeste FluidAudio n’introduit pas de dépendances de paquets supplémentaires. Les outils et les versions Rust/npm sont verrouillés séparément.
