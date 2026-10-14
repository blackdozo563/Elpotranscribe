use elpo_core::{self as core, Cue, SubtitleSettings, Word};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, State};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Job {
    id: String,
    source: PathBuf,
    name: String,
    size: u64,
    duration_ms: u64,
    status: String,
    cues: Vec<Cue>,
    error: Option<String>,
    export_path: Option<PathBuf>,
    dirty: bool,
    created_at: u64,
    language: String,
    engine: String,
    #[serde(default)]
    model_version: Option<String>,
    #[serde(default)]
    verification: Option<Verification>,
    #[serde(default)]
    verification_status: Option<String>,
    #[serde(default)]
    verification_error: Option<String>,
    #[serde(default)]
    archived: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Verification {
    secondary_engine: String,
    secondary_version: String,
    reference_cues: Vec<Cue>,
    review: core::review::Review,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    #[serde(default = "default_engine")]
    engine: String,
    #[serde(default = "default_update_checks")]
    auto_model_updates: bool,
    language: String,
    auto_save: bool,
    subtitles: SubtitleSettings,
    vocabulary: Vec<String>,
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
        }
    }
}
#[derive(Clone, Default, Serialize, Deserialize)]
struct Store {
    jobs: Vec<Job>,
    settings: Settings,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    jobs: Vec<Job>,
    settings: Settings,
    busy: bool,
    model_installed: bool,
    installed_models: Vec<String>,
    model_updates: Vec<serde_json::Value>,
    platform: String,
}
#[derive(Default)]
struct Runtime {
    busy: bool,
    active: Option<String>,
    child: Option<Child>,
    temporary: Option<tempfile::TempDir>,
    shutting_down: bool,
}
struct Inner {
    store: Mutex<Store>,
    runtime: Mutex<Runtime>,
    root: PathBuf,
    helper: PathBuf,
    platform: String,
}
#[derive(Clone)]
struct AppState {
    data: Arc<Inner>,
}
impl AppState {
    fn persist(&self, s: &Store) -> Result<(), String> {
        core::atomic_save(
            &self.data.root.join("history.json"),
            &serde_json::to_vec_pretty(s).map_err(err)?,
            true,
        )
        .map_err(err)
    }
    fn modify(&self, id: &str, f: impl FnOnce(&mut Job)) -> Result<(), String> {
        let mut s = self.data.store.lock().map_err(err)?;
        let j = s
            .jobs
            .iter_mut()
            .find(|j| j.id == id)
            .ok_or("Transcription inconnue")?;
        f(j);
        self.persist(&s)
    }
    fn models(&self) -> PathBuf {
        self.data.root.join("models")
    }
    fn installed(&self, engine: &str) -> bool {
        self.model_marker(engine).is_file()
    }
    fn qwen_helper(&self) -> PathBuf {
        let bundled = self.data.helper.with_file_name("elpo-qwen");
        if bundled.is_file() {
            bundled
        } else {
            self.data
                .helper
                .with_file_name("elpo-qwen-aarch64-apple-darwin")
        }
    }
    fn model_marker(&self, engine: &str) -> PathBuf {
        self.models().join(if engine == "ultra" {
            "verified.json".into()
        } else {
            format!("{engine}.json")
        })
    }
    fn remember_model_version(&self, engine: &str, checked_at: u128) -> Result<(), String> {
        let manifest: serde_json::Value =
            serde_json::from_slice(&fs::read(self.model_marker(engine)).map_err(err)?)
                .map_err(err)?;
        let revisions = manifest["sources"].as_array().map(|sources| {
            sources
                .iter()
                .filter_map(|source| source["revision"].as_str())
                .collect::<Vec<_>>()
                .join(" / ")
        });
        if let Some(revision) = revisions {
            let path = self.data.root.join("model-updates.json");
            let mut updates: Vec<serde_json::Value> = fs::read(&path)
                .ok()
                .and_then(|data| serde_json::from_slice(&data).ok())
                .unwrap_or_default();
            updates.retain(|value| value["engine"].as_str() != Some(engine));
            updates.push(serde_json::json!({"engine":engine,"status":"current","installedRevision":revision,"latestRevision":revision,"checkedAt":checked_at,"error":null}));
            core::atomic_save(&path, &serde_json::to_vec(&updates).map_err(err)?, true)
                .map_err(err)?;
        }
        Ok(())
    }
    fn helper(
        &self,
        request: serde_json::Value,
        id: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let out = tempfile::NamedTempFile::new().map_err(err)?;
        let stderr = tempfile::NamedTempFile::new().map_err(err)?;
        {
            let mut r = self.data.runtime.lock().map_err(err)?;
            if r.shutting_down {
                return Err("Application en cours de fermeture".into());
            }
            if let Some(id) = id {
                let s = self.data.store.lock().map_err(err)?;
                if s.jobs.iter().any(|j| {
                    j.id == id
                        && (j.status == "cancelled"
                            || j.verification_status.as_deref() == Some("cancelled"))
                }) {
                    return Err("Annulé".into());
                }
            }
            let temporary = tempfile::Builder::new()
                .prefix("elpotranscribe-")
                .tempdir()
                .map_err(err)?;
            let helper =
                if ["qwen-0.6b", "qwen-1.7b"].contains(&request["engine"].as_str().unwrap_or("")) {
                    self.qwen_helper()
                } else {
                    self.data.helper.clone()
                };
            let mut child = Command::new(helper)
                .env("TMPDIR", temporary.path())
                .stdin(Stdio::piped())
                .stdout(Stdio::from(out.reopen().map_err(err)?))
                .stderr(Stdio::from(stderr.reopen().map_err(err)?))
                .spawn()
                .map_err(|e| format!("Moteur natif indisponible : {e}"))?;
            let write = child
                .stdin
                .take()
                .ok_or_else(|| "Entrée du moteur absente".to_string())
                .and_then(|mut stdin| stdin.write_all(request.to_string().as_bytes()).map_err(err));
            if let Err(e) = write {
                let _ = child.kill();
                let _ = child.wait();
                return Err(e);
            }
            r.active = id.map(str::to_owned);
            r.child = Some(child);
            r.temporary = Some(temporary);
        }
        let status = loop {
            let status = {
                let mut r = self.data.runtime.lock().map_err(err)?;
                r.child
                    .as_mut()
                    .ok_or("Processus absent")?
                    .try_wait()
                    .map_err(err)?
            };
            if let Some(s) = status {
                break s;
            }
            std::thread::sleep(Duration::from_millis(100));
        };
        {
            let mut r = self.data.runtime.lock().map_err(err)?;
            r.child.take();
            r.temporary.take();
            r.active = None;
        }
        let mut text = String::new();
        out.reopen()
            .map_err(err)?
            .read_to_string(&mut text)
            .map_err(err)?;
        // Swift SDK diagnostics may precede the single JSON protocol line.
        let value=text.lines().rev().find_map(|line|serde_json::from_str::<serde_json::Value>(line).ok()).ok_or_else(||format!("Le moteur natif s’est arrêté ({status}). Consultez Console macOS pour le diagnostic natif."))?;
        if let Some(e) = value.get("error").and_then(|v| v.as_str()) {
            return Err(e.into());
        }
        if !status.success() {
            return Err(format!("Échec du moteur : {status}"));
        }
        Ok(value)
    }
    fn snapshot(&self) -> Result<Snapshot, String> {
        let busy = self.data.runtime.lock().map_err(err)?.busy;
        let s = self.data.store.lock().map_err(err)?;
        Ok(Snapshot {
            jobs: s.jobs.clone(),
            settings: s.settings.clone(),
            busy,
            model_installed: self.installed(&s.settings.engine),
            installed_models: [
                "ultra",
                "whisper-base",
                "whisper-small",
                "whisper-turbo",
                "qwen-0.6b",
                "qwen-1.7b",
            ]
            .into_iter()
            .filter(|e| self.installed(e))
            .map(str::to_owned)
            .collect(),
            model_updates: fs::read(self.data.root.join("model-updates.json"))
                .ok()
                .and_then(|data| serde_json::from_slice(&data).ok())
                .unwrap_or_default(),
            platform: self.data.platform.clone(),
        })
    }
    fn cancel(&self, id: &str) -> Result<(), String> {
        // Publish cancellation while holding the process lock, before killing.
        // Otherwise the worker could record a failure before the cancel state.
        let mut runtime = self.data.runtime.lock().map_err(err)?;
        self.modify(id, |j| {
            if ["pending", "transcribing"].contains(&j.status.as_str()) {
                j.status = "cancelled".into();
            }
            if j.verification_status.as_deref() == Some("processing") {
                j.verification_status = Some("cancelled".into());
                if !j.cues.is_empty() {
                    j.status = "completed".into();
                }
            }
        })?;
        if runtime.active.as_deref() == Some(id) {
            if let Some(child) = runtime.child.as_mut() {
                if let Err(error) = child.kill() {
                    if child.try_wait().map_err(err)?.is_none() {
                        return Err(err(error));
                    }
                }
            }
        }
        Ok(())
    }
    fn shutdown(&self) {
        if let Ok(mut runtime) = self.data.runtime.lock() {
            runtime.shutting_down = true;
            if let Some(child) = runtime.child.as_mut() {
                let _ = child.kill();
                let _ = child.wait();
            }
            runtime.child.take();
            runtime.temporary.take();
            runtime.active = None;
            runtime.busy = false;
        }
    }
    fn reserve(&self) -> Result<(), String> {
        let mut r = self.data.runtime.lock().map_err(err)?;
        if r.shutting_down {
            return Err("Application en cours de fermeture".into());
        }
        if r.busy {
            return Err("Une opération est déjà en cours".into());
        }
        r.busy = true;
        Ok(())
    }
    fn release(&self) {
        if let Ok(mut r) = self.data.runtime.lock() {
            r.busy = false;
            r.active = None;
        }
    }
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn default_engine() -> String {
    "ultra".into()
}
fn default_update_checks() -> bool {
    true
}
fn infer_words(
    state: &AppState,
    engine: &str,
    job: &Job,
    language: &str,
) -> Result<(Vec<Word>, String), String> {
    let result = state.helper(serde_json::json!({"action":"transcribe", "models":state.models(), "source":job.source, "language":language, "engine":engine}), Some(&job.id))?;
    let expected = if engine == "ultra" {
        "Parakeet Ultra"
    } else {
        engine
    };
    if result["engine"].as_str() != Some(expected) {
        return Err("Le moteur exécuté ne correspond pas au moteur choisi".into());
    }
    Ok((
        serde_json::from_value(result["words"].clone()).map_err(err)?,
        result["modelVersion"]
            .as_str()
            .ok_or("Version du moteur absente")?
            .to_owned(),
    ))
}
fn process_verification(state: AppState, job: Job, settings: Settings, secondary: String) {
    let result = (|| {
        let (primary_words, version) = infer_words(&state, &job.engine, &job, &job.language)?;
        let cues = core::segment(&primary_words, &settings.subtitles).map_err(err)?;
        // Persist the primary result before loading the independent second model.
        state.modify(&job.id, |current| {
            current.cues = cues.clone();
            current.model_version = Some(version);
            current.dirty = true;
        })?;
        let comparison = (|| {
            let (secondary_words, secondary_version) =
                infer_words(&state, &secondary, &job, &job.language)?;
            core::segment(&secondary_words, &settings.subtitles).map_err(err)?;
            let review = core::review::compare(&cues, &secondary_words).map_err(err)?;
            Ok::<_, String>(Verification {
                secondary_engine: secondary,
                secondary_version,
                reference_cues: cues,
                review,
            })
        })();
        state.modify(&job.id, |current| {
            if current.status == "cancelled"
                || current.verification_status.as_deref() == Some("cancelled")
            {
                return;
            }
            current.status = "completed".into();
            match comparison {
                Ok(verification) => {
                    current.verification = Some(verification);
                    current.verification_status = Some("completed".into());
                }
                Err(error) => {
                    current.verification_status = Some("failed".into());
                    current.verification_error = Some(error);
                }
            }
        })
    })();
    if let Err(error) = result {
        let _ = state.modify(&job.id, |current| {
            if current.status != "cancelled"
                && current.verification_status.as_deref() != Some("cancelled")
            {
                current.status = "failed".into();
                current.verification_status = Some("failed".into());
                current.verification_error = Some(error);
            }
        });
    }
    state.release();
}
#[tauri::command]
fn start_verification(
    state: State<'_, AppState>,
    id: String,
    primary: String,
    secondary: String,
) -> Result<String, String> {
    check_engine(&primary)?;
    check_engine(&secondary)?;
    if primary == secondary {
        return Err("Choisissez deux moteurs différents".into());
    }
    if !state.installed(&primary) || !state.installed(&secondary) {
        return Err("Téléchargez les deux modèles dans Modèles IA avant la comparaison".into());
    }
    state.reserve()?;
    let prepared = (|| {
        let mut store = state.data.store.lock().map_err(err)?;
        let mut job = store
            .jobs
            .iter()
            .find(|job| job.id == id)
            .ok_or("Audio inconnu")?
            .clone();
        if !job.source.is_file() {
            return Err("L’audio a été déplacé. Reliez-le avant la comparaison".into());
        }
        let settings = store.settings.clone();
        if job.language == "ar"
            && (primary == "ultra"
                || secondary == "ultra"
                || primary.starts_with("qwen-")
                || secondary.starts_with("qwen-"))
        {
            return Err("Pour l’arabe, choisissez deux modèles Whisper ; l’aligneur Qwen et Ultra ne prennent pas cette langue en charge".into());
        }
        job.id = uuid::Uuid::new_v4().to_string();
        job.created_at = now();
        job.archived = true;
        job.engine = primary;
        job.model_version = None;
        job.status = "transcribing".into();
        job.cues.clear();
        job.dirty = false;
        job.export_path = None;
        job.error = None;
        job.verification = None;
        job.verification_error = None;
        job.verification_status = Some("processing".into());
        store.jobs.push(job.clone());
        state.persist(&store)?;
        Ok::<_, String>((job, settings))
    })();
    match prepared {
        Ok((job, settings)) => {
            let id = job.id.clone();
            let state = state.inner().clone();
            std::thread::spawn(move || process_verification(state, job, settings, secondary));
            Ok(id)
        }
        Err(error) => {
            state.release();
            Err(error)
        }
    }
}
fn check_engine(engine: &str) -> Result<(), String> {
    if [
        "ultra",
        "whisper-base",
        "whisper-small",
        "whisper-turbo",
        "qwen-0.6b",
        "qwen-1.7b",
    ]
    .contains(&engine)
    {
        Ok(())
    } else {
        Err("Moteur non pris en charge".into())
    }
}
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
#[tauri::command]
async fn confirm_discard() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::MessageDialog::new()
            .set_title("Modifications non enregistrées")
            .set_description("Quitter sans enregistrer les modifications des sous-titres ?")
            .set_buttons(rfd::MessageButtons::YesNo)
            .show()
            == rfd::MessageDialogResult::Yes
    })
    .await
    .map_err(err)
}
#[tauri::command]
fn snapshot(state: State<'_, AppState>) -> Result<Snapshot, String> {
    state.snapshot()
}
#[tauri::command]
async fn check_model_updates(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let state = state.inner().clone();
    state.reserve()?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = (|| {
            let value = state.helper(
                serde_json::json!({"action":"check-updates", "models":state.models()}),
                None,
            )?;
            let updates = value
                .get("updates")
                .filter(|v| v.is_array())
                .ok_or("Catalogue de versions invalide")?;
            core::atomic_save(
                &state.data.root.join("model-updates.json"),
                &serde_json::to_vec(updates).map_err(err)?,
                true,
            )
            .map_err(err)
        })();
        state.release();
        result?;
        state.snapshot()
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn import_files(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    folder: bool,
    paths: Option<Vec<PathBuf>>,
) -> Result<Snapshot, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        state.reserve()?;
        let result = (|| {
            let paths = if let Some(paths) = paths {
                paths
            } else if folder {
                match rfd::FileDialog::new().pick_folder() {
                    Some(p) => fs::read_dir(p)
                        .map_err(err)?
                        .filter_map(|e| e.ok())
                        .map(|e| e.path())
                        .filter(|p| {
                            p.extension()
                                .and_then(|v| v.to_str())
                                .map(|e| {
                                    [
                                        "mp3", "wav", "m4a", "aac", "flac", "ogg", "aiff", "aif",
                                        "webm",
                                    ]
                                    .contains(&e.to_lowercase().as_str())
                                })
                                .unwrap_or(false)
                        })
                        .collect(),
                    None => vec![],
                }
            } else {
                rfd::FileDialog::new()
                    .add_filter(
                        "Audio",
                        &["mp3", "wav", "m4a", "aac", "flac", "ogg", "aiff", "webm"],
                    )
                    .pick_files()
                    .unwrap_or_default()
            };
            let existing = state
                .data
                .store
                .lock()
                .map_err(err)?
                .jobs
                .iter()
                .filter(|j| !j.archived)
                .map(|j| j.source.clone())
                .collect::<Vec<_>>();
            let paths = core::audio_paths(&paths, &existing).map_err(err)?;
            let language = state
                .data
                .store
                .lock()
                .map_err(err)?
                .settings
                .language
                .clone();
            let mut jobs = vec![];
            for path in paths {
                let data =
                    state.helper(serde_json::json!({"action":"probe","source":path}), None)?;
                app.asset_protocol_scope().allow_file(&path).map_err(err)?;
                jobs.push(Job {
                    id: uuid::Uuid::new_v4().to_string(),
                    name: path.file_name().unwrap().to_string_lossy().into(),
                    size: fs::metadata(&path).map_err(err)?.len(),
                    duration_ms: data["durationMs"].as_u64().ok_or("Durée audio absente")?,
                    source: path,
                    status: "pending".into(),
                    cues: vec![],
                    error: None,
                    export_path: None,
                    dirty: false,
                    created_at: now(),
                    language: language.clone(),
                    engine: state
                        .data
                        .store
                        .lock()
                        .map_err(err)?
                        .settings
                        .engine
                        .clone(),
                    model_version: None,
                    verification: None,
                    verification_status: None,
                    verification_error: None,
                    archived: false,
                });
            }
            let mut s = state.data.store.lock().map_err(err)?;
            s.jobs.extend(jobs);
            state.persist(&s)
        })();
        state.release();
        result?;
        state.snapshot()
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn install_model(
    state: State<'_, AppState>,
    engine: Option<String>,
) -> Result<Snapshot, String> {
    let engine = engine.unwrap_or_else(default_engine);
    check_engine(&engine)?;
    let state = state.inner().clone();
    state.reserve()?;
    tauri::async_runtime::spawn_blocking(move || {
        let checked_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        let result = state.helper(
            serde_json::json!({"action":"install","models":state.models(),"engine":engine}),
            None,
        );
        let result = result.and_then(|_| state.remember_model_version(&engine, checked_at));
        state.release();
        result?;
        state.snapshot()
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn remove_model(
    state: State<'_, AppState>,
    engine: Option<String>,
) -> Result<Snapshot, String> {
    let engine = engine.unwrap_or_else(default_engine);
    check_engine(&engine)?;
    let state = state.inner().clone();
    state.reserve()?;
    let result = (|| {
        let marker = state.model_marker(&engine);
        let versioned = fs::read(&marker)
            .ok()
            .and_then(|data| serde_json::from_slice::<serde_json::Value>(&data).ok())
            .and_then(|value| value["directory"].as_str().map(str::to_owned));
        let folder = if engine == "ultra" {
            "parakeet-ultra-coreml"
        } else {
            &engine
        };
        let directory = if let Some(relative) = versioned {
            let parts: Vec<_> = relative.split('/').collect();
            if parts.len() != 2
                || !parts[0].starts_with(&format!("installed-{engine}-"))
                || parts[0].contains("..")
                || parts[1] != folder
            {
                return Err("Chemin du modèle invalide".into());
            }
            state.models().join(parts[0])
        } else {
            state.models().join(folder)
        };
        // Remove availability first, including when a partial installation remains.
        if marker.exists() {
            fs::remove_file(marker).map_err(err)?;
        }
        if directory.exists() {
            fs::remove_dir_all(directory).map_err(err)?;
        }
        Ok::<(), String>(())
    })();
    state.release();
    result?;
    state.snapshot()
}
fn process_queue(state: AppState) {
    loop {
        if state
            .data
            .runtime
            .lock()
            .map(|r| r.shutting_down)
            .unwrap_or(true)
        {
            break;
        }
        let next = (|| -> Result<Option<(Job, Settings)>, String> {
            let mut s = state.data.store.lock().map_err(err)?;
            let settings = s.settings.clone();
            let next = s
                .jobs
                .iter_mut()
                .find(|j| !j.archived && j.status == "pending");
            if let Some(j) = next {
                j.status = "transcribing".into();
                j.error = None;
                j.language = settings.language.clone();
                j.engine = settings.engine.clone();
                let j = j.clone();
                state.persist(&s)?;
                Ok(Some((j, settings)))
            } else {
                Ok(None)
            }
        })();
        let (job, settings) = match next {
            Ok(Some(j)) => j,
            _ => break,
        };
        let result = (|| -> Result<(Vec<Cue>, String), String> {
            let result=state.helper(serde_json::json!({"action":"transcribe","models":state.models(),"source":job.source,"language":settings.language,"engine":settings.engine}),Some(&job.id))?;
            let expected = if settings.engine == "ultra" {
                "Parakeet Ultra"
            } else {
                &settings.engine
            };
            if result["engine"].as_str() != Some(expected) {
                return Err("Le moteur exécuté ne correspond pas au moteur choisi".into());
            }
            let version = result["modelVersion"]
                .as_str()
                .ok_or("Version du moteur absente")?
                .to_owned();
            let words: Vec<Word> = serde_json::from_value(result["words"].clone()).map_err(err)?;
            Ok((
                core::segment(&words, &settings.subtitles).map_err(err)?,
                version,
            ))
        })();
        let saved = state.modify(&job.id, |j| {
            if j.status == "cancelled" {
                return;
            }
            match result {
                Ok((cues, version)) => {
                    j.cues = cues;
                    j.model_version = Some(version);
                    j.status = "completed".into();
                    j.dirty = true;
                    if settings.auto_save {
                        let path = j.source.with_extension("srt");
                        match core::srt(&j.cues)
                            .and_then(|data| core::atomic_save(&path, data.as_bytes(), false))
                        {
                            Ok(()) => {
                                j.export_path = Some(path);
                                j.dirty = false;
                            }
                            Err(e) => {
                                j.error = Some(format!(
                                    "Transcription terminée ; export à confirmer : {e}"
                                ))
                            }
                        }
                    }
                }
                Err(e) => {
                    j.status = "failed".into();
                    j.error = Some(e);
                }
            }
        });
        if saved.is_err() {
            break;
        }
    }
    state.release();
}
#[tauri::command]
fn start_batch(state: State<'_, AppState>) -> Result<(), String> {
    state.reserve()?;
    let engine = state
        .data
        .store
        .lock()
        .map_err(err)?
        .settings
        .engine
        .clone();
    if !state.installed(&engine) {
        state.release();
        return Err("Installez le moteur choisi dans Modèles IA".into());
    }
    let state = state.inner().clone();
    std::thread::spawn(move || process_queue(state));
    Ok(())
}
#[tauri::command]
fn cancel_job(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.cancel(&id)
}
#[tauri::command]
fn retry_job(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut s = state.data.store.lock().map_err(err)?;
    let active = s.jobs.iter().filter(|j| !j.archived).count();
    let j = s
        .jobs
        .iter_mut()
        .find(|j| j.id == id)
        .ok_or("Transcription inconnue")?;
    if j.archived && active >= 10 {
        return Err("Maximum 10 fichiers par lot".into());
    }
    if ["failed", "cancelled"].contains(&j.status.as_str()) {
        j.status = "pending".into();
        j.archived = false;
        j.error = None;
    }
    state.persist(&s)
}
#[tauri::command]
fn remove_job(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut s = state.data.store.lock().map_err(err)?;
    if s.jobs
        .iter()
        .any(|j| j.id == id && j.status == "transcribing")
    {
        return Err("Annulez d’abord ce fichier".into());
    }
    s.jobs.retain(|j| j.id != id);
    state.persist(&s)
}
#[tauri::command]
fn archive_completed(state: State<'_, AppState>) -> Result<(), String> {
    let mut s = state.data.store.lock().map_err(err)?;
    for j in &mut s.jobs {
        if ["completed", "failed", "cancelled"].contains(&j.status.as_str()) {
            j.archived = true;
        }
    }
    state.persist(&s)
}
#[tauri::command]
fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<(), String> {
    let runtime = state.data.runtime.lock().map_err(err)?;
    if runtime.busy {
        return Err("Attendez la fin de l’opération pour changer les réglages".into());
    }
    check_engine(&settings.engine)?;
    settings.subtitles.validate().map_err(err)?;
    if !["auto", "fr", "en", "es", "de", "it", "pt", "ar"].contains(&settings.language.as_str())
        || ((settings.engine == "ultra" || settings.engine.starts_with("qwen-"))
            && settings.language == "ar")
    {
        return Err("Langue non prise en charge".into());
    }
    if settings.vocabulary.len() > 1000 {
        return Err("Maximum 1000 entrées".into());
    }
    let mut s = state.data.store.lock().map_err(err)?;
    s.settings = settings;
    state.persist(&s)
}
#[tauri::command]
fn save_edit(state: State<'_, AppState>, id: String, cues: Vec<Cue>) -> Result<(), String> {
    core::validate(&cues).map_err(err)?;
    state.modify(&id, |j| {
        if j.status == "completed" && j.cues != cues {
            j.cues = cues;
            j.dirty = true;
        }
    })
}
#[tauri::command]
async fn export_job(
    state: State<'_, AppState>,
    id: String,
    format: String,
    original: bool,
) -> Result<Option<PathBuf>, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move||{
  let j=state.data.store.lock().map_err(err)?.jobs.iter().find(|j|j.id==id).cloned().ok_or("Transcription inconnue")?;
  if j.status!="completed" {return Err("Ce fichier n’est pas terminé".into());}
  let data=match format.as_str(){"srt"=>core::srt(&j.cues),"txt"=>core::txt(&j.cues),"vtt"=>core::vtt(&j.cues),_=>return Err("Format inconnu".into())}.map_err(err)?;
  let name=core::output_name(&j.source,&format).map_err(err)?;
  let path=if original {j.source.with_extension(&format)}else{match rfd::FileDialog::new().set_file_name(&name).add_filter(&format,&[&format]).save_file(){Some(p)=>p.with_extension(&format),None=>return Ok(None)}};
  if path==j.source || state.data.store.lock().map_err(err)?.jobs.iter().any(|j|j.source==path){return Err("L’audio original est protégé".into());}
  let overwrite=path.exists();
  if overwrite && rfd::MessageDialog::new().set_title("Remplacer le fichier ?").set_description(format!("{} existe. Choisissez Non pour ignorer ; utilisez Exporter vers… pour le renommer.",path.display())).set_buttons(rfd::MessageButtons::YesNo).show()!=rfd::MessageDialogResult::Yes{return Ok(None);}
  core::atomic_save(&path,data.as_bytes(),overwrite).map_err(err)?;
  let original_cues=j.cues.clone();
  if format=="srt" {state.modify(&id,|j|{if j.cues==original_cues{j.export_path=Some(path.clone());j.dirty=false;j.error=None;}})?;}
  Ok(Some(path))
 }).await.map_err(err)?
}
#[tauri::command]
async fn export_zip(state: State<'_, AppState>) -> Result<Option<PathBuf>, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let entries = state
            .data
            .store
            .lock()
            .map_err(err)?
            .jobs
            .iter()
            .filter(|j| !j.archived && j.status == "completed")
            .map(|j| (j.source.clone(), j.cues.clone()))
            .collect::<Vec<_>>();
        let data = core::zip_srt(&entries).map_err(err)?;
        let path = match rfd::FileDialog::new()
            .set_file_name("ELPOTRANSCRIBE-Transcriptions.zip")
            .save_file()
        {
            Some(p) => p.with_extension("zip"),
            None => return Ok(None),
        };
        if path.exists() {
            return Err("Ce ZIP existe déjà. Choisissez un nouveau nom.".into());
        }
        core::atomic_save(&path, &data, false).map_err(err)?;
        Ok(Some(path))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
fn reveal(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let s = state.data.store.lock().map_err(err)?;
    let path = s
        .jobs
        .iter()
        .find(|j| j.id == id)
        .and_then(|j| j.export_path.as_ref())
        .ok_or("Aucun export")?;
    if !path.is_file() {
        return Err("Export introuvable".into());
    }
    Command::new("/usr/bin/open")
        .arg("-R")
        .arg(path)
        .spawn()
        .map_err(err)?;
    Ok(())
}
#[tauri::command]
async fn relink(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let path = match rfd::FileDialog::new().pick_file() {
            Some(p) => p,
            None => return Ok(()),
        };
        let path = core::audio_paths(&[path], &[]).map_err(err)?.remove(0);
        state.reserve()?;
        let probe = state.helper(serde_json::json!({"action":"probe","source":path}), None);
        state.release();
        let probe = probe?;
        app.asset_protocol_scope().allow_file(&path).map_err(err)?;
        state.modify(&id, |j| {
            j.source = path;
            j.name = j.source.file_name().unwrap().to_string_lossy().into();
            j.duration_ms = probe["durationMs"].as_u64().unwrap_or(j.duration_ms);
        })
    })
    .await
    .map_err(err)?
}
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            fs::create_dir_all(&root)?;
            let history = root.join("history.json");
            let mut store: Store = if history.exists() {
                serde_json::from_slice(&fs::read(&history)?)?
            } else {
                Store::default()
            };
            if check_engine(&store.settings.engine).is_err() {
                store.settings.engine = default_engine();
                if store.settings.language == "ar" {
                    store.settings.language = "auto".into();
                }
            }
            for j in &mut store.jobs {
                if j.verification_status.as_deref() == Some("processing") {
                    j.verification_status = Some("failed".into());
                    j.verification_error =
                        Some("Vérification interrompue. Relancez la comparaison.".into());
                    if !j.cues.is_empty() {
                        j.status = "completed".into();
                    }
                }
                if j.status == "transcribing" {
                    j.status = "failed".into();
                    j.error = Some("Traitement interrompu. Vous pouvez réessayer.".into());
                }
                if j.source.is_file() {
                    app.asset_protocol_scope().allow_file(&j.source)?;
                }
            }
            let helper = std::env::current_exe()?
                .parent()
                .ok_or("Dossier exécutable absent")?
                .join("elpo-asr");
            let helper = if helper.is_file() {
                helper
            } else {
                Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/elpo-asr-aarch64-apple-darwin")
            };
            let cpu = Command::new("/usr/sbin/sysctl")
                .args(["-n", "machdep.cpu.brand_string"])
                .output()
                .ok()
                .filter(|o| o.status.success())
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                .unwrap_or_else(|| std::env::consts::ARCH.into());
            let memory = Command::new("/usr/sbin/sysctl")
                .args(["-n", "hw.memsize"])
                .output()
                .ok()
                .and_then(|o| String::from_utf8(o.stdout).ok())
                .and_then(|s| s.trim().parse::<u64>().ok())
                .map(|bytes| format!("{:.0} Go", bytes as f64 / 1_073_741_824.0))
                .unwrap_or_else(|| "Mémoire inconnue".into());
            let platform = format!("macOS · {cpu} · {memory}");
            app.manage(AppState {
                data: Arc::new(Inner {
                    store: Mutex::new(store),
                    runtime: Mutex::new(Runtime::default()),
                    root,
                    helper,
                    platform,
                }),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            snapshot,
            check_model_updates,
            confirm_discard,
            import_files,
            install_model,
            remove_model,
            start_batch,
            start_verification,
            cancel_job,
            retry_job,
            remove_job,
            save_settings,
            archive_completed,
            save_edit,
            export_job,
            export_zip,
            reveal,
            relink
        ])
        .build(tauri::generate_context!())
        .expect("Impossible de démarrer ELPOTRANSCRIBE")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                if let Some(state) = app.try_state::<AppState>() {
                    state.shutdown();
                }
            }
        });
}

#[cfg(test)]
mod integration_tests {
    use super::*;
    #[test]
    #[ignore = "Requires installed Ultra and Whisper Turbo; run from smoke-native.py"]
    fn real_double_verification_preserves_primary_and_reverses_engines() {
        let helper = PathBuf::from(std::env::var("ELPO_TEST_HELPER").unwrap());
        let models = PathBuf::from(std::env::var("ELPO_TEST_MODELS").unwrap());
        let audio = PathBuf::from(std::env::var("ELPO_TEST_AUDIO").unwrap());
        let root = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(models, root.path().join("models")).unwrap();
        let settings = Settings {
            language: "en".into(),
            ..Settings::default()
        };
        let source: Job = serde_json::from_value(serde_json::json!({
            "id":"original", "source":audio, "name":"jfk.wav", "size":100,
            "durationMs":11000, "status":"completed", "cues":[{"startMs":100,"endMs":1000,"text":"Original preserved"}],
            "error":null,"exportPath":null,"dirty":false,"createdAt":0,
            "language":"en","engine":"ultra"
        })).unwrap();
        let state = AppState {
            data: Arc::new(Inner {
                store: Mutex::new(Store {
                    jobs: vec![source.clone()],
                    settings: settings.clone(),
                }),
                runtime: Mutex::new(Runtime::default()),
                root: root.path().into(),
                helper,
                platform: "Native double verification".into(),
            }),
        };
        for (primary, secondary) in [("ultra", "whisper-turbo"), ("whisper-turbo", "ultra")] {
            let mut job = source.clone();
            job.id = uuid::Uuid::new_v4().to_string();
            job.engine = primary.into();
            job.status = "transcribing".into();
            job.cues.clear();
            job.verification_status = Some("processing".into());
            state.data.store.lock().unwrap().jobs.push(job.clone());
            state.reserve().unwrap();
            process_verification(
                state.clone(),
                job.clone(),
                settings.clone(),
                secondary.into(),
            );
            let snapshot = state.snapshot().unwrap();
            assert!(!snapshot.busy);
            let result = snapshot.jobs.iter().find(|j| j.id == job.id).unwrap();
            assert_eq!(
                result.verification_status.as_deref(),
                Some("completed"),
                "{:?}",
                result.verification_error
            );
            assert_eq!(result.status, "completed");
            assert_eq!(result.engine, primary);
            assert!(!result.model_version.as_deref().unwrap().is_empty());
            let review = result.verification.as_ref().unwrap();
            assert_eq!(review.secondary_engine, secondary);
            assert!(!review.secondary_version.is_empty());
            assert_eq!(
                serde_json::to_value(&result.cues).unwrap(),
                serde_json::to_value(&review.reference_cues).unwrap()
            );
            assert!(core::srt(&result.cues)
                .unwrap()
                .to_lowercase()
                .contains("country"));
            assert_eq!(snapshot.jobs[0].cues[0].text, "Original preserved");
            assert!(state.data.runtime.lock().unwrap().child.is_none());
            let saved: Store =
                serde_json::from_slice(&fs::read(root.path().join("history.json")).unwrap())
                    .unwrap();
            assert_eq!(
                saved.jobs.last().unwrap().verification_status.as_deref(),
                Some("completed")
            );
        }
    }
    // This opt-in test uses actual Core ML inference. It is never counted as a
    // passing unit test when models or the ARM64 macOS runtime are unavailable.
    #[test]
    #[ignore = "Requires real models, audio and packaged helper; run from smoke-native.py"]
    fn real_queue_recovers_and_exports_to_each_source_folder() {
        let helper =
            PathBuf::from(std::env::var("ELPO_TEST_HELPER").expect("packaged helper required"));
        let models =
            PathBuf::from(std::env::var("ELPO_TEST_MODELS").expect("installed models required"));
        let fixture =
            PathBuf::from(std::env::var("ELPO_TEST_AUDIO").expect("real spoken audio required"));
        let root = tempfile::tempdir().unwrap();
        std::os::unix::fs::symlink(models, root.path().join("models")).unwrap();
        let first = root.path().join("Interview Français");
        let second = root.path().join("Autre dossier");
        fs::create_dir_all(&first).unwrap();
        fs::create_dir_all(&second).unwrap();
        let a = first.join("Été.final.v2.wav");
        let b = second.join("Été.final.v2.wav");
        fs::copy(&fixture, &a).unwrap();
        fs::copy(&fixture, &b).unwrap();
        let invalid = first.join("corrompu.wav");
        fs::write(&invalid, b"not a valid audio stream").unwrap();
        let make = |source: PathBuf| Job {
            id: uuid::Uuid::new_v4().to_string(),
            name: source.file_name().unwrap().to_string_lossy().into(),
            size: fs::metadata(&source).unwrap().len(),
            source,
            duration_ms: 11000,
            status: "pending".into(),
            cues: vec![],
            error: None,
            export_path: None,
            dirty: false,
            created_at: now(),
            language: "en".into(),
            engine: "Parakeet Ultra · Core ML".into(),
            model_version: None,
            verification: None,
            verification_status: None,
            verification_error: None,
            archived: false,
        };
        let mut settings = Settings::default();
        settings.language = "en".into();
        settings.engine = std::env::var("ELPO_TEST_ENGINE").unwrap_or_else(|_| default_engine());
        settings.auto_save = true;
        let state = AppState {
            data: Arc::new(Inner {
                store: Mutex::new(Store {
                    jobs: vec![make(invalid), make(a.clone()), make(b.clone())],
                    settings,
                }),
                runtime: Mutex::new(Runtime::default()),
                root: root.path().into(),
                helper,
                platform: "Native CI integration test".into(),
            }),
        };
        state.reserve().unwrap();
        process_queue(state.clone());
        let snapshot = state.snapshot().unwrap();
        assert!(!snapshot.busy);
        assert_eq!(snapshot.jobs[0].status, "failed");
        assert_eq!(
            snapshot.jobs[1].status, "completed",
            "{:?}",
            snapshot.jobs[1].error
        );
        assert_eq!(
            snapshot.jobs[2].status, "completed",
            "{:?}",
            snapshot.jobs[2].error
        );
        for audio in [&a, &b] {
            let output = audio.with_extension("srt");
            let data = fs::read_to_string(&output).unwrap();
            assert!(data.contains("-->"));
            assert!(data.to_lowercase().contains("country"));
            assert_eq!(fs::read(audio).unwrap(), fs::read(&fixture).unwrap());
        }
        let jobs = &snapshot.jobs[1..];
        let zip = core::zip_srt(
            &jobs
                .iter()
                .map(|j| (j.source.clone(), j.cues.clone()))
                .collect::<Vec<_>>(),
        )
        .unwrap();
        assert!(!zip.is_empty());
        assert!(state.data.runtime.lock().unwrap().child.is_none());
        // Exercise the same cancellation path as the UI against a real helper.
        let cancelled = make(a.clone());
        let id = cancelled.id.clone();
        {
            let mut store = state.data.store.lock().unwrap();
            store.jobs = vec![cancelled];
        }
        state.reserve().unwrap();
        let worker_state = state.clone();
        let worker = std::thread::spawn(move || process_queue(worker_state));
        let started = std::time::Instant::now();
        loop {
            if state.data.runtime.lock().unwrap().active.as_deref() == Some(id.as_str()) {
                break;
            }
            assert!(
                started.elapsed() < Duration::from_secs(30),
                "real helper never became active"
            );
            std::thread::sleep(Duration::from_millis(5));
        }
        state.cancel(&id).unwrap();
        worker.join().unwrap();
        assert_eq!(state.snapshot().unwrap().jobs[0].status, "cancelled");
        assert!(state.data.runtime.lock().unwrap().child.is_none());
        assert!(state.data.runtime.lock().unwrap().temporary.is_none());
        let on_exit = make(b.clone());
        let exit_id = on_exit.id.clone();
        {
            state.data.store.lock().unwrap().jobs = vec![on_exit];
        }
        state.reserve().unwrap();
        let exiting = state.clone();
        let worker = std::thread::spawn(move || process_queue(exiting));
        let started = std::time::Instant::now();
        let temporary_path = loop {
            let runtime = state.data.runtime.lock().unwrap();
            if runtime.active.as_deref() == Some(exit_id.as_str()) {
                break runtime.temporary.as_ref().unwrap().path().to_path_buf();
            }
            drop(runtime);
            assert!(started.elapsed() < Duration::from_secs(30));
            std::thread::sleep(Duration::from_millis(5));
        };
        state.shutdown();
        worker.join().unwrap();
        assert!(!temporary_path.exists());
        assert!(state.data.runtime.lock().unwrap().child.is_none());
        assert!(state.reserve().is_err());
    }
}
