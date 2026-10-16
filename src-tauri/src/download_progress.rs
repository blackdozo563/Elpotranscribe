//! A file written atomically by the installer. No elapsed-time or SDK-fraction estimates.
use serde::{Deserialize, Serialize};
use std::path::Path;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DownloadProgress {
    engine: String,
    received_bytes: u64,
    total_bytes: Option<u64>,
    file_name: String,
    phase: String,
}
pub(crate) fn read(path: &Path, engine: &str) -> Option<DownloadProgress> {
    let bytes = std::fs::read(path).ok()?;
    if bytes.len() > 16384 {
        return None;
    }
    let p: DownloadProgress = serde_json::from_slice(&bytes).ok()?;
    let safe = 9_007_199_254_740_991;
    (p.engine == engine
        && p.received_bytes <= safe
        && !p.file_name.is_empty()
        && p.file_name.len() < 2048
        && ["downloading", "validating"].contains(&p.phase.as_str())
        && p.total_bytes
            .is_none_or(|total| total > 0 && total <= safe && p.received_bytes <= total))
    .then_some(p)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_observed_valid_bytes_for_the_current_engine_are_accepted() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("progress.json");
        let write = |received: u64, total: Option<u64>| {
            std::fs::write(&path,serde_json::json!({"engine":"ultra","receivedBytes":received,"totalBytes":total,"fileName":"weights.bin","phase":"downloading"}).to_string()).unwrap()
        };
        write(25, Some(100));
        assert_eq!(read(&path, "ultra").unwrap().received_bytes, 25);
        assert!(read(&path, "whisper-turbo").is_none());
        write(25, None);
        assert!(read(&path, "ultra").unwrap().total_bytes.is_none());
        write(101, Some(100));
        assert!(read(&path, "ultra").is_none());
        write(0, Some(0));
        assert!(read(&path, "ultra").is_none());
        std::fs::write(&path, "{unfinished").unwrap();
        assert!(read(&path, "ultra").is_none());
    }
}
