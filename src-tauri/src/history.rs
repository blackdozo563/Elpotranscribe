use elpo_core::{
    self as core,
    review_session::{Decision, Session},
    Cue, SubtitleSettings,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Job {
    pub(crate) id: String,
    pub(crate) source: PathBuf,
    pub(crate) name: String,
    pub(crate) size: u64,
    pub(crate) duration_ms: u64,
    pub(crate) status: String,
    pub(crate) cues: Vec<Cue>,
    pub(crate) error: Option<String>,
    pub(crate) export_path: Option<PathBuf>,
    pub(crate) dirty: bool,
    pub(crate) created_at: u64,
    pub(crate) language: String,
    pub(crate) engine: String,
    #[serde(default)]
    pub(crate) model_version: Option<String>,
    #[serde(default)]
    pub(crate) timing_note: Option<String>,
    #[serde(default)]
    pub(crate) profile_snapshot: Option<core::vocabulary::Profile>,
    #[serde(default)]
    pub(crate) verification: Option<Verification>,
    #[serde(default)]
    pub(crate) verification_status: Option<String>,
    #[serde(default)]
    pub(crate) verification_error: Option<String>,
    #[serde(default)]
    pub(crate) archived: bool,
    #[serde(default)]
    pub(crate) review_state: Option<Session>,
    #[serde(default)]
    pub(crate) edit_revision: u64,
    #[serde(default)]
    pub(crate) verification_progress: Option<VerificationProgress>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Verification {
    pub(crate) secondary_engine: String,
    pub(crate) secondary_version: String,
    #[serde(default)]
    pub(crate) secondary_timing_note: Option<String>,
    pub(crate) reference_cues: Vec<Cue>,
    pub(crate) review: core::review::Review,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Settings {
    #[serde(default = "default_engine")]
    pub(crate) engine: String,
    #[serde(default = "default_update_checks")]
    pub(crate) auto_model_updates: bool,
    pub(crate) language: String,
    pub(crate) auto_save: bool,
    pub(crate) subtitles: SubtitleSettings,
    pub(crate) vocabulary: Vec<String>,
    #[serde(default)]
    pub(crate) selected_profile_id: Option<String>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            engine: default_engine(),
            auto_model_updates: true,
            language: "fr".into(),
            auto_save: false,
            subtitles: SubtitleSettings::default(),
            vocabulary: vec![],
            selected_profile_id: None,
        }
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
pub(crate) struct Store {
    pub(crate) jobs: Vec<Job>,
    pub(crate) settings: Settings,
    #[serde(default, rename = "settingsRevision")]
    pub(crate) settings_revision: u64,
}
pub(crate) fn default_engine() -> String {
    "ultra".into()
}
fn default_update_checks() -> bool {
    true
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReviewDocument {
    pub(crate) cues: Vec<Cue>,
    pub(crate) review_state: Option<Session>,
    pub(crate) revision: u64,
}
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum VerificationStage {
    Queued,
    Primary,
    Secondary,
    Comparison,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VerificationProgress {
    pub(crate) stage: VerificationStage,
    /// Unix seconds, as for Job.created_at. Set before the worker starts.
    pub(crate) started_at: u64,
    pub(crate) secondary_engine: String,
}
impl VerificationProgress {
    pub(crate) fn queued(started_at: u64, secondary_engine: String) -> Self {
        Self {
            stage: VerificationStage::Queued,
            started_at,
            secondary_engine,
        }
    }
}
impl Job {
    /// Called only at observed worker boundaries, never by a timer or the renderer.
    pub(crate) fn observe_verification(&mut self, stage: VerificationStage) -> Result<(), String> {
        if self.verification_status.as_deref() != Some("processing") || self.status == "cancelled" {
            return Err("Vérification arrêtée.".into());
        }
        let progress = self
            .verification_progress
            .as_mut()
            .ok_or("Étape de vérification absente.")?;
        if !matches!(
            (progress.stage, stage),
            (VerificationStage::Queued, VerificationStage::Primary)
                | (VerificationStage::Primary, VerificationStage::Secondary)
                | (VerificationStage::Secondary, VerificationStage::Comparison)
        ) {
            return Err("Transition de vérification invalide.".into());
        }
        progress.stage = stage;
        Ok(())
    }

    fn migrate(&mut self) -> Result<bool, String> {
        if let Some(session) = &self.review_state {
            return session
                .validate(&self.cues)
                .map(|_| false)
                .map_err(|e| e.to_string());
        }
        let Some(verification) = &self.verification else {
            return Ok(false);
        };
        let mut session = Session::from_review(
            &self.id,
            &self.engine,
            &verification.secondary_engine,
            &verification.reference_cues,
            &verification.review,
        )
        .map_err(|e| e.to_string())?;
        session.reconcile(&self.cues);
        self.review_state = Some(session);
        Ok(true)
    }
    pub(crate) fn prepare_vocabulary(
        &mut self,
        profile: &core::vocabulary::Profile,
    ) -> Result<ReviewDocument, String> {
        self.check_edit(None)?;
        let mut session = self.review_state.clone().unwrap_or(Session {
            version: 1,
            differences: vec![],
            anchors: self.cues.clone(),
        });
        let count = core::vocabulary_review::append(
            &mut session,
            &self.id,
            &self.engine,
            &self.cues,
            profile,
        )
        .map_err(|e| e.to_string())?;
        if count > 0 {
            self.review_state = Some(session);
            self.edit_revision += 1;
        }
        Ok(self.document())
    }
    pub(crate) fn document(&self) -> ReviewDocument {
        ReviewDocument {
            cues: self.cues.clone(),
            review_state: self.review_state.clone(),
            revision: self.edit_revision,
        }
    }
    fn check_edit(&self, revision: Option<u64>) -> Result<(), String> {
        if self.status != "completed" {
            return Err("Ce fichier n’est pas terminé.".into());
        }
        if revision.is_some_and(|r| r != self.edit_revision) {
            return Err("La transcription a changé. Rechargez-la avant de continuer.".into());
        }
        if self.edit_revision == u64::MAX {
            return Err("Révision maximale atteinte.".into());
        }
        Ok(())
    }
    pub(crate) fn save(
        &mut self,
        cues: Vec<Cue>,
        revision: Option<u64>,
    ) -> Result<ReviewDocument, String> {
        self.check_edit(revision)?;
        core::validate(&cues).map_err(|e| e.to_string())?;
        if self.cues != cues {
            if let Some(session) = &mut self.review_state {
                session.reconcile(&cues);
            }
            self.cues = cues;
            self.dirty = true;
            self.edit_revision += 1;
        }
        Ok(self.document())
    }
    pub(crate) fn resolve(
        &mut self,
        id: &str,
        decision: Decision,
        revision: u64,
    ) -> Result<ReviewDocument, String> {
        self.check_edit(Some(revision))?;
        let session = self
            .review_state
            .as_ref()
            .ok_or("Cette transcription n’a pas de suggestion à relire.")?;
        let (cues, session) = session
            .resolve(&self.cues, id, decision)
            .map_err(|e| e.to_string())?;
        self.cues = cues;
        self.review_state = Some(session);
        self.dirty = true;
        self.edit_revision += 1;
        Ok(self.document())
    }
    pub(crate) fn restore(
        &mut self,
        cues: Vec<Cue>,
        frame: Option<Session>,
        revision: u64,
    ) -> Result<ReviewDocument, String> {
        self.check_edit(Some(revision))?;
        core::validate(&cues).map_err(|e| e.to_string())?;
        let frame = match (&self.review_state, frame) {
            (Some(current), Some(frame)) => {
                Some(current.restore(&cues, frame).map_err(|e| e.to_string())?)
            }
            (None, None) => None,
            _ => return Err("La comparaison a changé : annulation impossible.".into()),
        };
        self.cues = cues;
        self.review_state = frame;
        self.dirty = true;
        self.edit_revision += 1;
        Ok(self.document())
    }
}
impl Store {
    /// A failed decision or disk write leaves the visible store unchanged.
    pub(crate) fn edit(
        &mut self,
        id: &str,
        edit: impl FnOnce(&mut Job) -> Result<ReviewDocument, String>,
        persist: impl FnOnce(&Self) -> Result<(), String>,
    ) -> Result<ReviewDocument, String> {
        let mut candidate = self.clone();
        let job = candidate
            .jobs
            .iter_mut()
            .find(|job| job.id == id)
            .ok_or("Transcription inconnue")?;
        let document = edit(job)?;
        persist(&candidate)?;
        *self = candidate;
        Ok(document)
    }
    pub(crate) fn pending_total(&self) -> usize {
        self.jobs
            .iter()
            .filter_map(|j| j.review_state.as_ref())
            .map(Session::pending)
            .sum()
    }
}
/// Upgrade the actual legacy history schema, keeping an untouched, one-time backup.
/// Invalid data is never overwritten. No backup or rewrite for histories without comparisons.
pub(crate) fn load(path: &Path) -> Result<Store, String> {
    if !path.exists() {
        return Ok(Store::default());
    }
    let original = fs::read(path).map_err(|e| e.to_string())?;
    let mut store: Store = serde_json::from_slice(&original).map_err(|e| e.to_string())?;
    let mut changed = false;
    for job in &mut store.jobs {
        changed |= job.migrate()?;
    }
    if changed {
        let backup = path.with_file_name("history.pre-review-v1.json");
        if !backup.exists() {
            core::atomic_save(&backup, &original, false).map_err(|e| e.to_string())?;
        }
        core::atomic_save(
            path,
            &serde_json::to_vec(&store).map_err(|e| e.to_string())?,
            true,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(store)
}

#[cfg(test)]
mod tests {
    use super::*;
    use elpo_core::review_session::Status;
    const LEGACY: &[u8] = include_bytes!("../../tests/fixtures/history-v1.2.0.json");
    fn fixture() -> (tempfile::TempDir, PathBuf, Store) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("history.json");
        fs::write(&path, LEGACY).unwrap();
        let store = load(&path).unwrap();
        (dir, path, store)
    }
    #[test]
    fn verification_progress_follows_observed_boundaries_and_never_resurrects_cancelled_work() {
        let (_dir, _path, mut store) = fixture();
        let job = &mut store.jobs[0];
        assert!(job.verification_progress.is_none());
        job.status = "transcribing".into();
        job.verification_status = Some("processing".into());
        assert!(job
            .observe_verification(VerificationStage::Primary)
            .is_err());
        job.verification_progress = Some(VerificationProgress::queued(123, "whisper-turbo".into()));
        assert!(job
            .observe_verification(VerificationStage::Comparison)
            .is_err());
        for stage in [
            VerificationStage::Primary,
            VerificationStage::Secondary,
            VerificationStage::Comparison,
        ] {
            job.observe_verification(stage).unwrap();
            assert_eq!(job.verification_progress.as_ref().unwrap().stage, stage);
            assert_eq!(job.verification_progress.as_ref().unwrap().started_at, 123);
        }
        assert!(job
            .observe_verification(VerificationStage::Primary)
            .is_err());
        // A valid next transition must still be rejected after cancellation.
        job.verification_progress = Some(VerificationProgress::queued(123, "whisper-turbo".into()));
        job.observe_verification(VerificationStage::Primary)
            .unwrap();
        job.status = "completed".into(); // primary text can survive cancellation
        job.verification_status = Some("cancelled".into());
        let before = serde_json::to_vec(job).unwrap();
        assert!(job
            .observe_verification(VerificationStage::Secondary)
            .is_err());
        assert_eq!(serde_json::to_vec(job).unwrap(), before);
        job.verification_status = Some("completed".into());
        assert!(job
            .observe_verification(VerificationStage::Secondary)
            .is_err());
    }
    #[test]
    fn vocabulary_preparation_is_atomic_repeatable_and_decisions_survive_reload() {
        let (_dir, path, mut store) = fixture();
        let id = store.jobs[1].id.clone();
        store.jobs[1].cues[0].text = "L’Evengile.".into();
        let cues = store.jobs[1].cues.clone();
        let mut profile = core::vocabulary::defaults().profiles.remove(0);
        profile.terms = vec!["Évangile".into()];
        let before = serde_json::to_vec(&store).unwrap();
        assert!(store
            .edit(
                &id,
                |job| job.prepare_vocabulary(&profile),
                |_| Err("Disque indisponible".into())
            )
            .is_err());
        assert_eq!(serde_json::to_vec(&store).unwrap(), before);
        let prepared = store
            .edit(
                &id,
                |job| job.prepare_vocabulary(&profile),
                |candidate| {
                    core::atomic_save(&path, &serde_json::to_vec(candidate).unwrap(), true)
                        .map_err(|e| e.to_string())
                },
            )
            .unwrap();
        assert_eq!(prepared.cues, cues);
        assert_eq!(prepared.revision, 1);
        let difference = prepared.review_state.as_ref().unwrap().differences[0]
            .id
            .clone();
        let job = &mut store.jobs[1];
        assert_eq!(job.prepare_vocabulary(&profile).unwrap().revision, 1);
        job.resolve(&difference, Decision::Keep, 1).unwrap();
        core::atomic_save(&path, &serde_json::to_vec(&store).unwrap(), true).unwrap();
        let mut reloaded = load(&path).unwrap();
        let doc = reloaded.jobs[1].prepare_vocabulary(&profile).unwrap();
        assert_eq!(doc.revision, 2);
        assert_eq!(doc.review_state.as_ref().unwrap().differences.len(), 1);
        assert_eq!(
            doc.review_state.as_ref().unwrap().differences[0].status,
            Status::Kept
        );
        assert_eq!(doc.cues, cues);
    }
    #[test]
    fn legacy_history_migrates_once_with_exact_backup_and_stable_ids() {
        let (dir, path, store) = fixture();
        assert_eq!(
            fs::read(dir.path().join("history.pre-review-v1.json")).unwrap(),
            LEGACY
        );
        let before: Store = serde_json::from_slice(LEGACY).unwrap();
        assert_eq!(store.jobs[0].cues, before.jobs[0].cues);
        assert_eq!(store.jobs[0].export_path, before.jobs[0].export_path);
        assert_eq!(store.settings.vocabulary, before.settings.vocabulary);
        assert!(store.jobs[1].review_state.is_none());
        assert_eq!(store.pending_total(), 1);
        assert_eq!(
            store.jobs[0].review_state.as_ref().unwrap().differences[0]
                .source
                .primary_text,
            "foir,"
        );
        let serialized = fs::read(&path).unwrap();
        let reloaded = load(&path).unwrap();
        assert_eq!(store.jobs[0].review_state, reloaded.jobs[0].review_state);
        assert_eq!(fs::read(&path).unwrap(), serialized);
    }
    #[test]
    fn decisions_persist_and_editor_frames_undo_redo_without_changing_times() {
        let (_dir, path, mut store) = fixture();
        let job = &mut store.jobs[0];
        let before = job.document();
        let id = before.review_state.as_ref().unwrap().differences[0]
            .id
            .clone();
        let accepted = job.resolve(&id, Decision::Accept, 0).unwrap();
        assert_eq!(job.cues[0].text, "Demain ce soir, à Paris.");
        assert_eq!(job.cues[0].start_ms, 190);
        assert_eq!(job.cues[0].end_ms, 4720);
        assert_eq!(job.cues[1], before.cues[1]);
        let saved = serde_json::to_vec(&store).unwrap();
        core::atomic_save(&path, &saved, true).unwrap();
        let mut reloaded = load(&path).unwrap();
        assert_eq!(reloaded.pending_total(), 0);
        let job = &mut reloaded.jobs[0];
        assert_eq!(
            job.review_state.as_ref().unwrap().differences[0].status,
            Status::Accepted
        );
        job.restore(before.cues.clone(), before.review_state.clone(), 1)
            .unwrap();
        assert_eq!(job.cues, before.cues);
        assert_eq!(job.review_state, before.review_state);
        job.restore(accepted.cues, accepted.review_state.clone(), 2)
            .unwrap();
        assert_eq!(job.review_state, accepted.review_state);
        let snapshot = serde_json::to_vec(job).unwrap();
        assert!(job.resolve(&id, Decision::Keep, 1).is_err());
        assert_eq!(serde_json::to_vec(job).unwrap(), snapshot);
    }
    #[test]
    fn legacy_manual_edits_and_new_manual_edits_are_needs_review() {
        let (dir, path, mut store) = fixture();
        let job = &mut store.jobs[0];
        let id = job.review_state.as_ref().unwrap().differences[0].id.clone();
        let mut cues = job.cues.clone();
        cues[0].text = "Un autre texte.".into();
        job.save(cues.clone(), Some(0)).unwrap();
        assert!(job.resolve(&id, Decision::Accept, 1).is_err());
        assert_eq!(
            job.review_state.as_ref().unwrap().differences[0].status,
            Status::NeedsReview
        );
        // An old edited history has no decision state yet: migration must not guess.
        job.review_state = None;
        fs::write(&path, serde_json::to_vec(&store).unwrap()).unwrap();
        let reloaded = load(&path).unwrap();
        assert_eq!(reloaded.jobs[0].cues, cues);
        assert_eq!(
            reloaded.jobs[0].review_state.as_ref().unwrap().differences[0].status,
            Status::NeedsReview
        );
        assert_eq!(
            fs::read(dir.path().join("history.pre-review-v1.json")).unwrap(),
            LEGACY
        );
    }
    #[test]
    fn failed_disk_write_or_stale_edit_does_not_publish_a_partial_decision() {
        let (_dir, path, mut store) = fixture();
        let before = serde_json::to_vec(&store).unwrap();
        let id = store.jobs[0].review_state.as_ref().unwrap().differences[0]
            .id
            .clone();
        let fail = store.edit(
            "legacy-comparison",
            |job| job.resolve(&id, Decision::Accept, 0),
            |_| Err("Disque indisponible".into()),
        );
        assert!(fail.is_err());
        assert_eq!(serde_json::to_vec(&store).unwrap(), before);
        assert!(store
            .edit(
                "legacy-comparison",
                |job| job.resolve(&id, Decision::Accept, 99),
                |_| panic!("must not persist a stale edit")
            )
            .is_err());
        assert!(store
            .edit(
                "unknown",
                |_| panic!("unknown job"),
                |_| panic!("must not persist")
            )
            .is_err());
        store
            .edit(
                "legacy-comparison",
                |job| job.resolve(&id, Decision::Accept, 0),
                |candidate| {
                    core::atomic_save(&path, &serde_json::to_vec(candidate).unwrap(), true)
                        .map_err(|e| e.to_string())
                },
            )
            .unwrap();
        assert_eq!(store.pending_total(), 0);
        assert_eq!(load(&path).unwrap().pending_total(), 0);
    }
    #[test]
    fn plain_and_corrupt_or_future_histories_are_not_overwritten() {
        let (dir, path, mut store) = fixture();
        let plain = &mut store.jobs[1];
        assert!(plain.resolve("unknown", Decision::Accept, 0).is_err());
        let doc = plain.document();
        plain.restore(doc.cues.clone(), None, 0).unwrap();
        plain.save(doc.cues, Some(1)).unwrap();
        store.jobs[0].review_state.as_mut().unwrap().version = 99;
        let bytes = serde_json::to_vec(&store).unwrap();
        fs::write(&path, &bytes).unwrap();
        assert!(load(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), bytes);
        fs::write(&path, b"{broken").unwrap();
        assert!(load(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"{broken");
        let plain_path = dir.path().join("plain.json");
        store.jobs.remove(0);
        let bytes = serde_json::to_vec(&store).unwrap();
        fs::write(&plain_path, &bytes).unwrap();
        load(&plain_path).unwrap();
        assert_eq!(fs::read(&plain_path).unwrap(), bytes);
        assert!(load(&dir.path().join("missing.json"))
            .unwrap()
            .jobs
            .is_empty());
    }
}
