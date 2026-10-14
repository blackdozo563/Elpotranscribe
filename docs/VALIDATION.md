# Validation réellement effectuée

Machine : Linux x86_64, Node 24.19.0, Rust 1.93.0. Date : 14 octobre 2026.

| Contrôle | Résultat |
|---|---|
| Installation npm et lockfile | Réussie |
| TypeScript et build Vite de production | Réussis |
| Tests Rust `elpo-core` | 12 réussis, 0 échoué, 0 ignoré |
| Tests TypeScript de l’éditeur | 5 réussis |
| Chromium / Playwright | 3 réussis ; le test d’édition simule uniquement l’IPC |
| Formatage Rust et Clippy du cœur | Réussis |
| Schéma JSON Tauri, version CLI installée | Valide |
| Syntaxe shell/Python des scripts | Vérifiée |
| Audit npm des dépendances d’exécution | Aucune vulnérabilité signalée au moment du contrôle |
| Backend Rust macOS | Non validé : compilation croisée bloquée sur Objective-C faute de SDK Apple |
| Pont Swift / tests Swift | Compilation réussie et étape de tests réussie sur le runner macOS ARM64, [CI #1](https://github.com/blackdozo563/Elpotranscribe/actions/runs/38556817791) ; non exécutables sur la machine Linux |
| Initialisation et inférence Parakeet Ultra | Non exécutées ici ; test réel prévu dans la CI macOS |
| DMG, ARM64, signatures et Finder | Non validés ; aucun DMG généré ici |
| M1 8 Go / M2 8 Go | Aucun test matériel ni mesure mémoire réalisé |
| Qwen / Whisper / Gemini | Non implémentés, non testés, non sélectionnables |

Les tests Rust couvrent millisecondes/numérotation/chronologie, Unicode français et arabe, enveloppement des lignes, conservation des noms, doublons, limite de dix imports, rejet des formats/vides, écritures atomiques sans écrasement, collisions ZIP, absence de temps inventés et conservation de la ponctuation VTT.

Les tests TypeScript couvrent validation des temps, chevauchements, modification/annuler/rétablir, scission manuelle et fusion. Les tests navigateur couvrent interface vide, distinction web/native, indisponibilité des moteurs avancés et édition/export via une simulation IPC clairement identifiée. Ils ne vérifient ni Core ML, ni le disque, ni les dialogues macOS.

La CI native doit exécuter `scripts/smoke-native.py` avec l’exécutable **extrait du DMG monté**. Elle télécharge un vrai extrait audio à URL/révision et empreinte verrouillées, installe Ultra, exige du texte et des horodatages reconnus puis valide un SRT avec le même cœur Rust. Ce contrôle n’a pas été remplacé par un transcript simulé. Tant qu’il n’a pas réussi sur Mac, l’application ne doit pas être annoncée opérationnelle de bout en bout.
