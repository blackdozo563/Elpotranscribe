//! Preference changes are field patches applied to the current store, never stale snapshots.
use crate::history::{Settings, Store};
use elpo_core::vocabulary::Profile;
use serde::{Deserialize, Serialize};

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SettingsPatch {
    pub(crate) engine: Option<String>,
    pub(crate) language: Option<String>,
    pub(crate) auto_save: Option<bool>,
    pub(crate) auto_model_updates: Option<bool>,
    pub(crate) line_length: Option<usize>,
    pub(crate) max_lines: Option<usize>,
    pub(crate) max_duration_ms: Option<u64>,
    pub(crate) profile_id: Option<String>,
    #[serde(default)]
    pub(crate) clear_profile: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SettingsDocument {
    pub(crate) settings: Settings,
    pub(crate) revision: u64,
}
impl SettingsPatch {
    fn apply(self, mut settings: Settings, profiles: &[Profile]) -> Result<Settings, String> {
        if let Some(value) = self.engine {
            settings.engine = value;
        }
        if let Some(value) = self.language {
            settings.language = value;
        }
        if let Some(value) = self.auto_save {
            settings.auto_save = value;
        }
        if let Some(value) = self.auto_model_updates {
            settings.auto_model_updates = value;
        }
        if let Some(value) = self.line_length {
            settings.subtitles.line_length = value;
        }
        if let Some(value) = self.max_lines {
            settings.subtitles.max_lines = value;
        }
        if let Some(value) = self.max_duration_ms {
            settings.subtitles.max_duration_ms = value;
        }
        if self.clear_profile && self.profile_id.is_some() {
            return Err("Sélection de profil contradictoire.".into());
        }
        if self.clear_profile {
            settings.selected_profile_id = None;
        }
        if let Some(value) = self.profile_id {
            settings.selected_profile_id = Some(value);
        }
        if let Some(id) = &settings.selected_profile_id {
            settings.language = profiles
                .iter()
                .find(|p| &p.id == id)
                .ok_or("Profil inconnu")?
                .language
                .clone();
        }
        validate(&settings)?;
        Ok(settings)
    }
}
pub(crate) fn validate(settings: &Settings) -> Result<(), String> {
    if !["ultra", "whisper-turbo"].contains(&settings.engine.as_str()) {
        return Err("Moteur local non pris en charge.".into());
    }
    if !["auto", "fr", "en", "es", "de", "it", "pt", "ar"].contains(&settings.language.as_str())
        || (settings.engine == "ultra" && settings.language == "ar")
    {
        return Err("Langue non prise en charge".into());
    }
    settings.subtitles.validate().map_err(|e| e.to_string())?;
    if settings.vocabulary.len() > 1000 {
        return Err("Maximum 1000 entrées".into());
    }
    Ok(())
}
impl Store {
    pub(crate) fn settings_document(&self) -> SettingsDocument {
        SettingsDocument {
            settings: self.settings.clone(),
            revision: self.settings_revision,
        }
    }
    pub(crate) fn patch_settings(
        &mut self,
        patch: SettingsPatch,
        profiles: &[Profile],
        persist: impl FnOnce(&Self) -> Result<(), String>,
    ) -> Result<SettingsDocument, String> {
        let mut candidate = self.clone();
        candidate.settings = patch.apply(candidate.settings, profiles)?;
        candidate.settings_revision = candidate
            .settings_revision
            .checked_add(1)
            .ok_or("Révision maximale atteinte")?;
        persist(&candidate)?;
        *self = candidate;
        Ok(self.settings_document())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn independent_window_patches_merge_without_losing_other_values() {
        let mut store = Store::default();
        store
            .patch_settings(
                SettingsPatch {
                    line_length: Some(28),
                    ..Default::default()
                },
                &[],
                |_| Ok(()),
            )
            .unwrap();
        let doc = store
            .patch_settings(
                SettingsPatch {
                    auto_model_updates: Some(false),
                    ..Default::default()
                },
                &[],
                |_| Ok(()),
            )
            .unwrap();
        assert_eq!(doc.settings.subtitles.line_length, 28);
        assert!(!doc.settings.auto_model_updates);
        assert_eq!(doc.revision, 2);
        let bytes = serde_json::to_vec(&store).unwrap();
        let reloaded: Store = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(reloaded.settings_revision, 2);
        let legacy: Store =
            serde_json::from_slice(include_bytes!("../../tests/fixtures/history-v1.2.0.json"))
                .unwrap();
        assert_eq!(legacy.settings_revision, 0);
    }
    #[test]
    fn validation_and_failed_disk_writes_leave_the_visible_store_unchanged() {
        let mut store = Store::default();
        let before = serde_json::to_vec(&store).unwrap();
        assert!(store
            .patch_settings(
                SettingsPatch {
                    max_lines: Some(3),
                    ..Default::default()
                },
                &[],
                |_| panic!("invalid settings must not persist")
            )
            .is_err());
        assert!(store
            .patch_settings(
                SettingsPatch {
                    auto_save: Some(true),
                    ..Default::default()
                },
                &[],
                |_| Err("Disque indisponible".into())
            )
            .is_err());
        assert_eq!(serde_json::to_vec(&store).unwrap(), before);
        assert!(store
            .patch_settings(
                SettingsPatch {
                    engine: Some("unsupported".into()),
                    ..Default::default()
                },
                &[],
                |_| Ok(())
            )
            .is_err());
    }
    #[test]
    fn profile_language_and_clear_selection_are_applied_atomically() {
        let mut store = Store::default();
        let profiles = elpo_core::vocabulary::defaults().profiles;
        let profile = profiles.iter().find(|p| p.language == "en").unwrap();
        let doc = store
            .patch_settings(
                SettingsPatch {
                    profile_id: Some(profile.id.clone()),
                    ..Default::default()
                },
                &profiles,
                |_| Ok(()),
            )
            .unwrap();
        assert_eq!(doc.settings.language, "en");
        let doc = store
            .patch_settings(
                SettingsPatch {
                    clear_profile: true,
                    language: Some("fr".into()),
                    ..Default::default()
                },
                &profiles,
                |_| Ok(()),
            )
            .unwrap();
        assert!(doc.settings.selected_profile_id.is_none());
        assert_eq!(doc.settings.language, "fr");
        assert!(store
            .patch_settings(
                SettingsPatch {
                    profile_id: Some("missing".into()),
                    ..Default::default()
                },
                &profiles,
                |_| Ok(())
            )
            .is_err());
    }
}
