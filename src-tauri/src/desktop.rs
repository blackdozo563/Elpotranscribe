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
    archived: bool,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
    language: String,
    auto_save: bool,
    subtitles: SubtitleSettings,
    vocabulary: Vec<String>,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
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
    platform: String,
}
#[derive(Default)]
struct Runtime {
    busy: bool,
    active: Option<String>,
    child: Option<Child>,
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
    fn helper(
        &self,
        request: serde_json::Value,
        id: Option<&str>,
    ) -> Result<serde_json::Value, String> {
        let out = tempfile::NamedTempFile::new().map_err(err)?;
        let stderr = tempfile::NamedTempFile::new().map_err(err)?;
        {
            let mut r = self.data.runtime.lock().map_err(err)?;
            if let Some(id) = id {
                let s = self.data.store.lock().map_err(err)?;
                if s.jobs.iter().any(|j| j.id == id && j.status == "cancelled") {
                    return Err("Annulé".into());
                }
            }
            let mut child = Command::new(&self.data.helper)
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
            r.active = None;
        }
        let mut text = String::new();
        out.reopen()
            .map_err(err)?
            .read_to_string(&mut text)
            .map_err(err)?;
        // Swift SDK diagnostics may precede the single JSON protocol line.
        let value=text.lines().rev().find_map(|line|serde_json::from_str::<serde_json::Value>(line).ok()).ok_or_else(||format!("Le moteur natif s’est arrêté ({status}). Consultez Console, sous-système FluidAudio."))?;
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
            model_installed: self.models().join("verified.json").is_file(),
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
    fn reserve(&self) -> Result<(), String> {
        let mut r = self.data.runtime.lock().map_err(err)?;
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
                    engine: "Parakeet Ultra · Core ML".into(),
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
async fn install_model(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let state = state.inner().clone();
    state.reserve()?;
    tauri::async_runtime::spawn_blocking(move || {
        let result = state.helper(
            serde_json::json!({"action":"install","models":state.models()}),
            None,
        );
        state.release();
        result?;
        state.snapshot()
    })
    .await
    .map_err(err)?
}
#[tauri::command]
async fn remove_model(state: State<'_, AppState>) -> Result<Snapshot, String> {
    let state = state.inner().clone();
    state.reserve()?;
    let result = fs::remove_dir_all(state.models()).map_err(err);
    state.release();
    result?;
    state.snapshot()
}
fn process_queue(state: AppState) {
    loop {
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
        let result = (|| -> Result<Vec<Cue>, String> {
            let result=state.helper(serde_json::json!({"action":"transcribe","models":state.models(),"source":job.source,"language":settings.language}),Some(&job.id))?;
            let words: Vec<Word> = serde_json::from_value(result["words"].clone()).map_err(err)?;
            core::segment(&words, &settings.subtitles).map_err(err)
        })();
        let saved = state.modify(&job.id, |j| {
            if j.status == "cancelled" {
                return;
            }
            match result {
                Ok(cues) => {
                    j.cues = cues;
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
    if !state.models().join("verified.json").is_file() {
        return Err("Installez Parakeet Ultra dans Modèles IA".into());
    }
    state.reserve()?;
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
    settings.subtitles.validate().map_err(err)?;
    if !["auto", "fr", "en", "es", "de", "it", "pt"].contains(&settings.language.as_str()) {
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
            for j in &mut store.jobs {
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
            confirm_discard,
            import_files,
            install_model,
            remove_model,
            start_batch,
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
        .run(tauri::generate_context!())
        .expect("Impossible de démarrer ELPOTRANSCRIBE");
}

#[cfg(test)]
mod integration_tests {
    use super::*;
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
            archived: false,
        };
        let mut settings = Settings::default();
        settings.language = "en".into();
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
    }
}
