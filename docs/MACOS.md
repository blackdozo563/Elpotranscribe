# Validation et distribution macOS

## Prérequis et signature

La machine cloud est Linux x86_64 : aucun SDK Apple, Xcode ni outil `hdiutil`. La compilation croisée s’arrête sur Objective-C ; elle ne constitue pas un contrôle complet du backend.

Le runner `macos-26` est ARM64 selon le catalogue officiel consulté le 14 octobre 2026. Son utilisation effective dépend des droits et crédits du dépôt.

Le workflow accepte les secrets GitHub `APPLE_CERTIFICATE` (certificat p12 encodé base64), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` et, pour la notarisation avec identifiant Apple, `APPLE_ID`, `APPLE_PASSWORD` (mot de passe d’application) et `APPLE_TEAM_ID`. Ne fournir ces éléments que si le compte est autorisé. Le moteur Swift embarqué est signé ad hoc pendant sa préparation, puis le bundler Tauri doit le signer avec le bundle si Developer ID est configuré. Vérifier ce comportement sur le DMG final avec `codesign --verify --deep --strict` et `spctl --assess --type execute`.

La configuration Tauri fixe `signingIdentity` à `-` pour le build personnel. Le workflow remplace cette propriété dans une configuration JSON temporaire à partir du secret `APPLE_SIGNING_IDENTITY` si disponible ; le fichier suivi n’est pas modifié. Les variables officielles du bundler transmettent les certificats et la notarisation. Sans ces secrets, aucune notarisation n’est revendiquée.

Pour un build Developer ID, ajouter un contrôle `xcrun stapler validate` et `spctl` avant d’annoncer une distribution notariée. La préversion prévue ne prétend pas l’être.

## Contrôles requis avant une vraie v1.0.0

- Exécuter la CI et examiner les tests Swift, la compilation Rust native et l’inférence de l’exécutable empaqueté.
- Tester sans connexion après installation du modèle, puis sans outils de développement installés.
- Tester M1 et M2 avec 8 Go : longs audios, annulation, pression mémoire, temps de traitement et mémoire maximale.
- Tester les sélecteurs, le glisser-déposer, onze fichiers, un audio corrompu et les codecs réellement installés.
- Tester export dans plusieurs dossiers, fichier existant, autorisation refusée, nouveau nom et audios déplacés.
- Vérifier les bibliothèques `@rpath` et Swift de l’application sur un Mac propre. Le script inspecte les chemins de développement et exécute le moteur embarqué sur le runner ; cela ne remplace pas ce test.
- Tester la fermeture pendant l’édition et les tâches actives, les gros historiques, la précision des sous-titres et les lecteurs externes.

Ne pas publier une release stable sur la seule base des tests portables.
