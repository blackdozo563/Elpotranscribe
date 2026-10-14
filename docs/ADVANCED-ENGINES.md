# Moteurs locaux

Seuls Parakeet Ultra (FluidAudio/Core ML) et Whisper large-v3-turbo Q5_0 (whisper.cpp/Metal) sont proposés. Les poids restent locaux et sont téléchargés explicitement. Les passages Whisper fournissent les temps SRT ; aucun temps de mot n’est exigé ni inventé.

La double vérification exécute et termine deux processus successifs, garde les temps du principal et propose les divergences à la validation humaine. Elle ne constitue pas un vote de vérité et ne fabrique pas de score de confiance.
