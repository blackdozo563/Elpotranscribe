use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InferenceProgress {
    #[serde(default)]
    job_id: String,
    engine: String,
    phase: String,
    percent: Option<u8>,
}
pub(crate) fn read(path: &Path, engine: &str, job_id: &str) -> Option<InferenceProgress> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() > 4096 {
        return None;
    }
    let mut progress: InferenceProgress = serde_json::from_slice(&bytes).ok()?;
    if progress.engine != engine
        || !["loading", "preparing", "transcribing"].contains(&progress.phase.as_str())
        || progress
            .percent
            .is_some_and(|p| p > 100 || progress.phase != "transcribing")
    {
        return None;
    }
    progress.job_id = job_id.into();
    Some(progress)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_engine_phase_and_percentage_and_binds_active_job() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("inference.json");
        let write = |phase: &str, percent: serde_json::Value| {
            std::fs::write(&path, serde_json::json!({"jobId":"untrusted", "engine":"ultra","phase":phase,"percent":percent}).to_string()).unwrap();
        };
        write("loading", serde_json::Value::Null);
        assert!(read(&path, "ultra", "active").unwrap().percent.is_none());
        for percent in [0, 42, 100] {
            write("transcribing", percent.into());
            let p = read(&path, "ultra", "active").unwrap();
            assert_eq!(p.percent, Some(percent));
            assert_eq!(p.job_id, "active");
            assert!(read(&path, "whisper-turbo", "active").is_none());
        }
        for percent in [-1, 101] {
            write("transcribing", percent.into());
            assert!(read(&path, "ultra", "active").is_none());
        }
        write("loading", 42.into());
        assert!(read(&path, "ultra", "active").is_none());
        write("invented", serde_json::Value::Null);
        assert!(read(&path, "ultra", "active").is_none());
        std::fs::write(&path, "{partial").unwrap();
        assert!(read(&path, "ultra", "active").is_none());
    }
}
