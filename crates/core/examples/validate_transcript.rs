fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    if args.len() != 3 {
        return Err("Usage: validate_transcript result.json output.srt".into());
    }
    let result: serde_json::Value = serde_json::from_slice(&std::fs::read(&args[1])?)?;
    let cues =
        elpo_core::native::transcript(&result, &elpo_core::SubtitleSettings::default())?.cues;
    let srt = elpo_core::srt(&cues)?;
    elpo_core::atomic_save(std::path::Path::new(&args[2]), srt.as_bytes(), true)?;
    println!(
        "{} sous-titres issus des horodatages réels validés",
        cues.len()
    );
    Ok(())
}
