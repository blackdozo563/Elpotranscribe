# Intégrations 1.1.0 en cours de validation

La version publiée 1.0.0 contient uniquement Parakeet Ultra. Le code de développement 1.1.0 ajoute les parcours suivants ; la présence du code ne prouve pas leur validation sur les Mac cibles.

## Whisper

whisper.cpp 1.8.3 est épinglé à `2eeeba56e9edd762b4b38467bab96c2517163158`. CMake compile les bibliothèques statiques et embarque les sources Metal dans le binaire. Le pont C s’exécute dans le processus Swift géré par Rust, ce qui conserve l’arrêt et le nettoyage sur annulation. Aucun exécutable Homebrew n’est requis chez l’utilisateur.

Base, Small et large-v3-turbo Q5_0 sont téléchargés explicitement depuis une révision Hugging Face épinglée au moment de l’installation. Le SHA-256 publié dans les métadonnées LFS est vérifié avant initialisation. Le manifeste conserve la provenance et les SHA-256 locaux, revérifiés avant chaque transcription. Les modèles ne sont pas inclus dans le DMG.

AVFoundation décode et rééchantillonne par buffers vers un fichier Float32 16 kHz mono. whisper.cpp lit une projection mémoire de ce fichier. Les jetons UTF-8 sont regroupés en mots avec leurs temps calculés par whisper.cpp. Une chronologie manquante ou invalide provoque une erreur, jamais une distribution uniforme sur la durée audio.

La CI doit exécuter Base, Small et Turbo depuis le moteur du DMG, produire de vrais SRT, puis vérifier la file, l’export dans chaque dossier, l’annulation, le nettoyage et le rejet d’un modèle altéré. Whisper Base et Small ont passé la validation du DMG ; large-v3-turbo Q5 et le nouveau suivi de versions restent à valider.

## Qwen

Pont expérimental séparé `elpo-qwen` (non embarqué dans le DMG 1.1.0), sans chargement de FluidAudio dans ce processus. MLX Audio Swift est épinglé à `8d86630ade569728aaea3dc1a29fc44e2efa719b`, MLX Swift à 0.31.4 et MLX Swift LM à 3.31.4. Swift 6.2 et Xcode sont nécessaires pour compiler les shaders Metal ; une simple compilation SwiftPM ne suffit pas.

Modèles : `mlx-community/Qwen3-ASR-0.6B-4bit`, `mlx-community/Qwen3-ASR-1.7B-4bit` et `mlx-community/Qwen3-ForcedAligner-0.6B-4bit`. Téléchargement à la demande, contrôle SHA-256 local, lecture par blocs de 30 secondes, cache MLX borné. Le modèle ASR est libéré avant le chargement de l’aligneur. La limite MLX de mémoire ne constitue pas une certification M1/M2 8 Go.

Le pont utilise directement les classes temporelles prédites par l’aligneur. Il n’appelle pas son parcours de correction qui peut interpoler des anomalies. Les résultats invalides sont refusés. L’arabe est pris en charge par l’ASR Qwen, mais **pas par son aligneur officiel** : cette intégration SRT ne propose donc pas encore Qwen pour l’arabe. Whisper constitue l’alternative.

Qwen n’est pas proposé dans le sélecteur tant que sa validation native n’a pas réussi. Le workflow dédié `qwen-validation.yml` mesure une vraie reconnaissance anglaise et un alignement brut pour chaque variante. Une validation dans le DMG et dans la file reste ensuite nécessaire.


## Suivi des versions et double vérification

Les métadonnées distantes sont comparées aux fichiers pertinents du modèle, sans considérer une modification du README comme une mise à jour des poids. Une installation ancienne sans provenance reste « inconnue ». Le téléchargement d’une mise à jour utilise un répertoire temporaire, vérifie/initialise le modèle, puis publie atomiquement un manifeste pointant sur un nouveau dossier. L’ancien dossier est supprimé seulement après activation réussie.

La double vérification lance deux processus d’inférence successifs. Le premier est complètement terminé avant le chargement du second. Le texte et les horodatages du premier sont sauvegardés avant la seconde passe ; son échec ne les détruit pas. La comparaison lexicale ignore casse et ponctuation, signale les différences par sous-titre et conserve les cas ambigus pour relecture manuelle. Elle ne fabrique aucun score de confiance. Une proposition n’est applicable que si le sous-titre correspond encore à sa référence ; elle change uniquement son texte.
