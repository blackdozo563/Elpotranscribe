# Validation réellement effectuée

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

## Développement 1.1.0

Validation portable actuelle : 17 tests Rust (dont quatre de comparaison lexicale), cinq tests TypeScript et six tests navigateur réussis. Les trois nouveaux scénarios navigateur vérifient l’inversion des moteurs, l’application annulable d’une suggestion sans modifier les temps, et le téléchargement explicite depuis la notification de mise à jour. L’IPC y est simulé : aucune inférence prouvée par ces tests.

[La révision 802fe1c a passé la validation native](https://github.com/blackdozo563/Elpotranscribe/actions/runs/38595539654) : DMG ARM64, Ultra, Whisper Base/Small, file et véritables exports SRT. Cette ancienne validation contenait aussi des fonctions retirées depuis. Elle ne valide pas les nouveaux parcours actuels.

La nouvelle CI doit encore confirmer les dix tests Swift, Turbo Q5_0, les mises à jour et la double vérification réelle dans les deux sens depuis le DMG. Qwen a été compilé sur macOS ; son essai d’inférence a échoué au contrôle d’intégrité. Le correctif en développement n’est pas encore validé ; les sélecteurs restent désactivés.
