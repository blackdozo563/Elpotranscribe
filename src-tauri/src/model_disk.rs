//! Read-only measurement of the active installation, without loading a model.
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    path::{Component, Path},
};
#[derive(Deserialize)]
struct Manifest {
    directory: Option<String>,
}
#[derive(Default, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsage {
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub files: u64,
}
pub fn measure(root: &Path, engine: &str) -> Result<DiskUsage, String> {
    let (marker, folder) = match engine {
        "ultra" => ("verified.json", "parakeet-ultra"),
        "whisper-turbo" => ("whisper-turbo.json", "whisper-turbo"),
        _ => return Err("Moteur inconnu".into()),
    };
    let manifest: Manifest =
        serde_json::from_slice(&fs::read(root.join(marker)).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    let relative = manifest.directory.unwrap_or_else(|| folder.into());
    let path = Path::new(&relative);
    let parts: Vec<_> = path.components().collect();
    let valid = relative == folder
        || (parts.len() == 2
            && matches!(parts[0],Component::Normal(value) if value.to_str().is_some_and(|v|v.starts_with(&format!("installed-{engine}-")) && !v.contains("..")))
            && parts[1] == Component::Normal(folder.as_ref()));
    if !valid {
        return Err("Chemin de modèle invalide".into());
    }
    // Resolve macOS /var aliases once, then reject links inside the installation.
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let mut directory = root.clone();
    for part in parts {
        directory.push(part);
        if fs::symlink_metadata(&directory)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("Lien symbolique inattendu dans le modèle".into());
        }
    }
    let mut usage = DiskUsage::default();
    let mut seen = HashSet::new();
    visit(&directory, &mut usage, &mut seen)?;
    Ok(usage)
}
fn visit(path: &Path, usage: &mut DiskUsage, seen: &mut HashSet<(u64, u64)>) -> Result<(), String> {
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
        return Err("Lien symbolique inattendu dans le modèle".into());
    }
    if metadata.is_dir() {
        for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
            visit(&entry.map_err(|e| e.to_string())?.path(), usage, seen)?;
        }
    } else if metadata.is_file() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            if !seen.insert((metadata.dev(), metadata.ino())) {
                return Ok(());
            }
            usage.allocated_bytes = usage
                .allocated_bytes
                .checked_add(
                    metadata
                        .blocks()
                        .checked_mul(512)
                        .ok_or("Taille hors limite")?,
                )
                .ok_or("Taille hors limite")?;
        }
        #[cfg(not(unix))]
        {
            let _ = seen;
            return Err("Mesure des blocs disponible sur macOS uniquement".into());
        }
        usage.logical_bytes = usage
            .logical_bytes
            .checked_add(metadata.len())
            .ok_or("Taille hors limite")?;
        usage.files += 1;
    } else {
        return Err("Fichier de modèle non régulier".into());
    }
    Ok(())
}
#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::os::unix::fs::{symlink, MetadataExt};
    #[test]
    fn legacy_and_versioned_measure_actual_files_and_deduplicate_hard_links() {
        for relative in ["parakeet-ultra", "installed-ultra-test/parakeet-ultra"] {
            let tmp = tempfile::tempdir().unwrap();
            let dir = tmp.path().join(relative);
            fs::create_dir_all(dir.join("nested")).unwrap();
            fs::write(dir.join("weights"), vec![1; 12345]).unwrap();
            fs::write(dir.join("nested/vocab"), "Été").unwrap();
            fs::hard_link(dir.join("weights"), dir.join("alias")).unwrap();
            fs::write(
                tmp.path().join("verified.json"),
                serde_json::json!({"directory":relative}).to_string(),
            )
            .unwrap();
            let usage = measure(tmp.path(), "ultra").unwrap();
            assert_eq!(usage.files, 2);
            assert_eq!(usage.logical_bytes, 12350);
            assert_eq!(
                usage.allocated_bytes,
                (fs::metadata(dir.join("weights")).unwrap().blocks()
                    + fs::metadata(dir.join("nested/vocab")).unwrap().blocks())
                    * 512
            );
        }
    }
    #[test]
    fn invalid_paths_missing_files_and_symlinks_are_errors_not_zero_sizes() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(measure(tmp.path(), "ultra").is_err());
        for relative in ["../outside", "/tmp", "installed-ultra-x/../parakeet-ultra"] {
            fs::write(
                tmp.path().join("verified.json"),
                serde_json::json!({"directory":relative}).to_string(),
            )
            .unwrap();
            assert!(measure(tmp.path(), "ultra").is_err());
        }
        fs::write(tmp.path().join("verified.json"), "{}").unwrap();
        fs::create_dir(tmp.path().join("parakeet-ultra")).unwrap();
        symlink("/tmp", tmp.path().join("parakeet-ultra/link")).unwrap();
        assert!(measure(tmp.path(), "ultra").is_err());
        assert!(measure(tmp.path(), "unknown").is_err());
    }
}
