# Licences et redistribution

Le code original ELPOTRANSCRIBE est livré sans décision de licence de distribution publique : tous droits réservés au titulaire, en attendant son choix. Aucune visibilité publique du dépôt n’a été demandée ni modifiée.

Dépendances principales : Tauri (MIT/Apache-2.0), Rust crates serde/serde_json/tempfile/thiserror (MIT/Apache-2.0), zip (MIT), React/Vite/Tailwind (MIT), Lucide (ISC), Playwright (Apache-2.0, développement seulement), FluidAudio (Apache-2.0 selon le fichier LICENSE de la révision retenue). `scripts/collect-licenses.py` rassemble les notices des dépendances Rust/npm résolues et du SDK FluidAudio pour les embarquer dans les ressources du bundle. Vérifier leur exhaustivité avant une distribution finale. Consulter les fichiers LICENSE des dépendances résolues ; cette liste n’est pas un audit juridique exhaustif.

Modèle Parakeet Ultra : consulter les conditions et licences effectives de `FluidInference/parakeet-ultra-coreml` et du modèle d’origine `moondream/parakeet-ultra` avant redistribution. Les poids ne sont pas inclus dans Git ni le DMG préparé ; ils sont téléchargés par l’utilisateur via le SDK. Aucune licence de modèle non vérifiée n’est présentée comme acquise.

Fixture `fixtures/jfk.json` : extrait du discours présidentiel américain du 20 janvier 1961, enregistrement du gouvernement fédéral, domaine public aux États-Unis (17 USC 105), distribué par les exemples de whisper.cpp. URL et SHA-256 épinglés ; téléchargement uniquement pendant les tests, aucun audio utilisateur committé. Vérifier les droits applicables à la destination de distribution.

L’icône SVG a été créée pour ce projet, sans marque tierce.
