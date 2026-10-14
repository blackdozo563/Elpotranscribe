# Changelog

## 1.1.0 — préversion publiée le 14 octobre 2026

- Whisper Base/Small et large-v3-turbo Q5_0 via whisper.cpp/Metal, modèles téléchargés à la demande et contrôle SHA-256.
- Double vérification locale séquentielle, moteurs inversables et propositions annulables conservant les temps du principal.
- Notifications de versions des modèles, téléchargement explicite et activation atomique après vérification.
- Suppression de Gemini ; aucun compte cloud requis.
- DMG ARM64, installations à neuf, vraie inférence des quatre moteurs, métadonnées et double vérification validés en CI.
- Contrôles : 18 Rust, 5 TypeScript, 6 navigateur, 10 Swift et 5 scénarios natifs ; tests physiques des nouveaux parcours sur M1/M2 8 Go en attente.

## 1.0.0 — préversion de validation

- Application Tauri 2 / React française et pont natif Swift Parakeet Ultra.
- Lots séquentiels, historique local, édition et exports SRT/TXT/VTT/ZIP.
- Préservation des noms et dossiers, confirmation des écrasements, arrêt et nettoyage du moteur.
- Validation réelle en CI ARM64 : moteur du DMG, file, erreurs, annulation, exports et signatures ad hoc.
- Tests : 13 Rust, 5 TypeScript, 3 navigateur, 3 Swift et 1 scénario natif réel.
