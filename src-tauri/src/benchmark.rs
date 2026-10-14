use elpo_core as core;
use serde_json::{json, Value};
use std::{
    io::Write,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    time::Instant,
};
fn result_json(bytes: &[u8]) -> Result<Value, String> {
    let value = String::from_utf8_lossy(bytes)
        .lines()
        .rev()
        .find_map(|line| serde_json::from_str::<Value>(line).ok())
        .ok_or("Le moteur n’a pas renvoyé de résultat JSON.")?;
    if let Some(error) = value["error"].as_str() {
        return Err(error.into());
    }
    Ok(value)
}
fn rss(stderr: &str) -> Option<u64> {
    stderr.lines().find_map(|line| {
        line.trim()
            .strip_suffix(" maximum resident set size")
            .and_then(|s| s.trim().parse().ok())
    })
}
struct Measurement {
    transcript: core::native::Transcript,
    seconds: f64,
    rss: u64,
}
fn measure(
    helper: &Path,
    source: &Path,
    models: &Path,
    engine: &str,
    language: &str,
) -> Result<Measurement, String> {
    let started = Instant::now();
    let mut child = Command::new("/usr/bin/time")
        .arg("-l")
        .arg(helper)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    {
        let mut input = child.stdin.take().ok_or("Entrée du moteur absente.")?;
        input.write_all(json!({"action":"transcribe","models":models,"source":source,"engine":engine,"language":language}).to_string().as_bytes()).map_err(|e|e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    let seconds = started.elapsed().as_secs_f64();
    let value = result_json(&output.stdout)?;
    if !output.status.success() {
        return Err(format!("Échec du moteur {engine} : {}", output.status));
    }
    let rss = rss(&String::from_utf8_lossy(&output.stderr))
        .ok_or("Pic RSS indisponible dans les mesures macOS.")?;
    let transcript = core::native::transcript(&value, &core::SubtitleSettings::default())
        .map_err(|e| e.to_string())?;
    Ok(Measurement {
        transcript,
        seconds,
        rss,
    })
}
fn print_row(name: &str, seconds: f64, peak: u64, duration: f64, segments: usize) {
    println!("{name} : temps mural {seconds:.3} s | pic RSS moteur {:.1} Mio | facteur temps réel {:.4} | {segments} segments",peak as f64 / 1_048_576.0,seconds/duration);
}
pub fn run(args: &[String]) -> Result<(), String> {
    if args.is_empty() || args[0] == "--help" {
        println!("Utilisation : bench-local.sh AUDIO [fr|en|auto]\nInstallez Ultra et Whisper Turbo dans l’application avant le test. Aucun export audio ou SRT n’est modifié.");
        return Ok(());
    }
    if std::env::consts::OS != "macos" {
        return Err("Ce benchmark nécessite macOS Apple Silicon.".into());
    }
    let source = PathBuf::from(&args[0])
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let language = args.get(1).map(String::as_str).unwrap_or("fr");
    if !["fr", "en", "auto"].contains(&language) {
        return Err("Langue du benchmark : fr, en ou auto.".into());
    }
    let models = if let Some(path) = std::env::var_os("ELPO_BENCH_MODELS") {
        PathBuf::from(path)
    } else {
        PathBuf::from(std::env::var_os("HOME").ok_or("Dossier utilisateur absent.")?)
            .join("Library/Application Support/com.elpo.elpotranscribe/models")
    };
    for marker in ["verified.json", "whisper-turbo.json"] {
        if !models.join(marker).is_file() {
            return Err(
                "Installez Parakeet Ultra et Whisper Turbo dans Modèles IA avant le benchmark."
                    .into(),
            );
        }
    }
    let helper = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .ok_or("Dossier de l’application absent.")?
        .join("elpo-asr");
    let mut probe = Command::new(&helper)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    probe
        .stdin
        .take()
        .ok_or("Entrée absente")?
        .write_all(
            json!({"action":"probe","source":source})
                .to_string()
                .as_bytes(),
        )
        .map_err(|e| e.to_string())?;
    let output = probe.wait_with_output().map_err(|e| e.to_string())?;
    let duration = result_json(&output.stdout)?["durationMs"]
        .as_f64()
        .filter(|d| *d > 0.0)
        .ok_or("Durée audio absente.")?
        / 1000.0;
    println!("Mesures locales sans profil de vocabulaire. Audio : {duration:.3} s. Un processus moteur à la fois.");
    let ultra = measure(&helper, &source, &models, "ultra", language)?;
    print_row(
        "Ultra",
        ultra.seconds,
        ultra.rss,
        duration,
        ultra.transcript.cues.len(),
    );
    let turbo = measure(&helper, &source, &models, "whisper-turbo", language)?;
    print_row(
        "Whisper Turbo",
        turbo.seconds,
        turbo.rss,
        duration,
        turbo.transcript.cues.len(),
    );
    // Two new real passes: the first process exits before the second starts.
    let started = Instant::now();
    let primary = measure(&helper, &source, &models, "ultra", language)?;
    let secondary = measure(&helper, &source, &models, "whisper-turbo", language)?;
    let review = core::review::compare(
        &primary.transcript.cues,
        &secondary.transcript.comparison_units,
    )
    .map_err(|e| e.to_string())?;
    print_row(
        "Double vérification Ultra puis Turbo",
        started.elapsed().as_secs_f64(),
        primary.rss.max(secondary.rss),
        duration,
        primary.transcript.cues.len(),
    );
    println!("{} divergences à relire. Le pic de la double vérification est le maximum des deux moteurs successifs ; il exclut l’interface et ne somme pas leurs mémoires.",review.differences.len());
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn mac_rss_is_bytes_and_sdk_logs_do_not_hide_json() {
        assert_eq!(
            rss("diagnostic\n  12345678  maximum resident set size\n"),
            Some(12345678)
        );
        assert_eq!(rss("no measurement"), None);
        assert_eq!(
            result_json(b"SDK diagnostic\n{\"durationMs\":2000}\n").unwrap()["durationMs"],
            2000
        );
        assert!(result_json(b"{\"error\":\"annule\"}").is_err());
    }
}
