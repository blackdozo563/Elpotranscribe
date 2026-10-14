# Architecture

React rend l’interface, sans accès direct au disque ni réseau cloud. Les commandes Tauri contrôlent les dialogues, la file, les chemins, l’historique et les exports. Le protocole asset n’autorise que les audios importés. Aucune permission shell ou HTTP générique n’est exposée au frontend.

Rust lance un unique exécutable Swift à la fois avec des arguments de protocole JSON sur stdin ; il n’utilise pas de shell. Le protocole renvoie des résultats JSON sur stdout. Les sorties temporaires bornent l’utilisation des tubes ; les ressources temporaires sont supprimées après traitement. Le processus est arrêté pour annuler l’inférence et libérer les modèles.

Le pont Swift utilise FluidAudio épinglé pour `AsrModelVersion.ultra`, ou whisper.cpp épinglé avec Metal pour large-v3-turbo Q5_0. Installation et transcription sont des processus distincts. Les téléchargements explicites et les recherches de métadonnées de versions utilisent le réseau ; les transcriptions restent locales. Ultra active `ModelHub.offlineMode` et son parcours audio sur disque ; Whisper utilise des échantillons rééchantillonnés dans un fichier temporaire. Les empreintes SHA-256 sont contrôlées avant inférence. Les temps viennent des moteurs ; Rust ne crée aucune durée artificielle.


`elpo-core` est indépendant du GUI pour tester les noms, les imports, la segmentation, SRT/VTT/TXT, les écritures atomiques sans écrasement et les ZIP. Les tests de décodage et d’inférence sont natifs et distincts des tests UI utilisant une simulation IPC.

Les données sont dans `~/Library/Application Support/com.elpo.elpotranscribe/` (chemin fourni par Tauri), comprenant `history.json`, `model-updates.json` et `models/`. Le bouton Nouveau lot archive les résultats et libère dix emplacements. La suppression d’historique ne supprime pas les exports, les modèles ni les audios.

La révision Swift est épinglée dans Package.swift. SwiftPM doit encore produire un Package.resolved lors de la première résolution macOS ; avec les traits désactivés, le manifeste FluidAudio n’introduit pas de dépendances de paquets supplémentaires. Les outils et les versions Rust/npm sont verrouillés séparément.
