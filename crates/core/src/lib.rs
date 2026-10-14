pub mod native;
pub mod vocabulary;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use thiserror::Error;
pub mod review;

#[derive(Debug, Error)]
pub enum Error {
    #[error("{0}")]
    Invalid(String),
    #[error("Le fichier existe déjà : {0}")]
    Exists(String),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Zip(#[from] zip::result::ZipError),
}
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cue {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubtitleSettings {
    pub line_length: usize,
    pub max_lines: usize,
    pub max_duration_ms: u64,
}
impl Default for SubtitleSettings {
    fn default() -> Self {
        Self {
            line_length: 42,
            max_lines: 2,
            max_duration_ms: 5000,
        }
    }
}
impl SubtitleSettings {
    pub fn validate(&self) -> Result<()> {
        if !(12..=80).contains(&self.line_length)
            || !(1..=2).contains(&self.max_lines)
            || !(1000..=10000).contains(&self.max_duration_ms)
        {
            return Err(Error::Invalid("Réglages de sous-titres invalides".into()));
        }
        Ok(())
    }
}
pub fn validate(cues: &[Cue]) -> Result<()> {
    validate_passages(cues, false)
}
pub(crate) fn validate_passages(cues: &[Cue], allow_point: bool) -> Result<()> {
    if cues.is_empty() {
        return Err(Error::Invalid("Aucun sous-titre à exporter".into()));
    }
    let mut previous = 0;
    for c in cues {
        if c.start_ms < previous
            || c.end_ms < c.start_ms
            || (!allow_point && c.end_ms == c.start_ms)
            || c.end_ms > 359_999_999
            || c.text.trim().is_empty()
            || c.text.contains('\0')
            || c.text.lines().count() > 2
            || c.text.contains("-->")
            || c.text.contains('\r')
            || c.text.split('\n').any(|l| l.trim().is_empty())
        {
            return Err(Error::Invalid(
                "Sous-titres vides, chevauchants ou horodatages invalides".into(),
            ));
        }
        previous = c.end_ms;
    }
    Ok(())
}
pub fn timestamp(ms: u64) -> String {
    format!(
        "{:02}:{:02}:{:02},{:03}",
        ms / 3_600_000,
        ms / 60_000 % 60,
        ms / 1000 % 60,
        ms % 1000
    )
}
pub fn srt(cues: &[Cue]) -> Result<String> {
    validate(cues)?;
    Ok(cues
        .iter()
        .enumerate()
        .map(|(i, c)| {
            format!(
                "{}\n{} --> {}\n{}\n\n",
                i + 1,
                timestamp(c.start_ms),
                timestamp(c.end_ms),
                c.text.trim()
            )
        })
        .collect())
}
pub fn vtt(cues: &[Cue]) -> Result<String> {
    validate(cues)?;
    Ok(format!(
        "WEBVTT\n\n{}",
        cues.iter()
            .enumerate()
            .map(|(i, c)| format!(
                "{}\n{} --> {}\n{}\n\n",
                i + 1,
                timestamp(c.start_ms).replace(',', "."),
                timestamp(c.end_ms).replace(',', "."),
                c.text.trim()
            ))
            .collect::<String>()
    ))
}
pub fn txt(cues: &[Cue]) -> Result<String> {
    validate(cues)?;
    Ok(cues
        .iter()
        .map(|c| c.text.replace('\n', " "))
        .collect::<Vec<_>>()
        .join("\n"))
}
pub fn output_name(source: &Path, extension: &str) -> Result<String> {
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| Error::Invalid("Nom de fichier invalide".into()))?;
    if !["srt", "vtt", "txt"].contains(&extension) {
        return Err(Error::Invalid("Format inconnu".into()));
    }
    Ok(format!("{stem}.{extension}"))
}
pub fn audio_paths(paths: &[PathBuf], already: &[PathBuf]) -> Result<Vec<PathBuf>> {
    let mut seen: HashSet<_> = already.iter().cloned().collect();
    let mut out = Vec::new();
    for p in paths {
        let p = p.canonicalize()?;
        let ext = p
            .extension()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if ![
            "mp3", "wav", "m4a", "aac", "flac", "ogg", "aiff", "aif", "webm",
        ]
        .contains(&ext.as_str())
            || !p.is_file()
            || fs::metadata(&p)?.len() == 0
        {
            return Err(Error::Invalid(format!(
                "Audio non pris en charge ou vide : {}",
                p.display()
            )));
        }
        if seen.insert(p.clone()) {
            out.push(p);
        }
    }
    if already.len() + out.len() > 10 {
        return Err(Error::Invalid("Maximum 10 fichiers par lot".into()));
    }
    Ok(out)
}
// Never split audio time evenly. Every boundary below comes from a recognized word.
pub fn segment(words: &[Word], settings: &SubtitleSettings) -> Result<Vec<Cue>> {
    settings.validate()?;
    let mut cues: Vec<Cue> = Vec::new();
    let mut group: Vec<&Word> = Vec::new();
    let flush = |g: &mut Vec<&Word>, out: &mut Vec<Cue>| {
        if let Some(first) = g.first() {
            let mut lines = vec![String::new()];
            for w in g.iter() {
                let line = lines.last_mut().unwrap();
                if !line.is_empty()
                    && line.chars().count() + 1 + w.text.chars().count() > settings.line_length
                {
                    lines.push(w.text.clone());
                } else {
                    if !line.is_empty() {
                        line.push(' ');
                    }
                    line.push_str(&w.text);
                }
            }
            out.push(Cue {
                start_ms: first.start_ms,
                end_ms: g.iter().map(|w| w.end_ms).max().unwrap(),
                text: lines.join("\n"),
            });
        }
        g.clear();
    };
    let mut previous_start = 0;
    let mut group_end = 0;
    for w in words {
        if w.start_ms < previous_start || w.end_ms <= w.start_ms || w.text.trim().is_empty() {
            return Err(Error::Invalid(
                "Horodatages du moteur invalides ; aucune synchronisation inventée".into(),
            ));
        }
        if w.text.chars().count() > settings.line_length {
            return Err(Error::Invalid(
                "Mot trop long : augmentez la longueur de ligne".into(),
            ));
        }
        if let Some(first) = group.first() {
            let mut line = 0;
            let mut count = 1;
            for text in group
                .iter()
                .map(|x| x.text.as_str())
                .chain(std::iter::once(w.text.as_str()))
            {
                let n = text.chars().count();
                if line > 0 && line + 1 + n > settings.line_length {
                    count += 1;
                    line = n;
                } else {
                    line += n + usize::from(line > 0);
                }
            }
            let over_lines = count > settings.max_lines;
            let sentence = group
                .iter()
                .any(|word| word.text.ends_with(['.', '!', '?', '؟']));
            // TDT may emit consecutive words on the same encoder frame. Keep
            // their actual spans in one cue; do not shift or invent timestamps.
            let can_split = w.start_ms >= group_end;
            if can_split
                && (over_lines
                    || sentence
                    || w.end_ms.saturating_sub(first.start_ms) > settings.max_duration_ms
                    || w.start_ms.saturating_sub(group_end) > 800)
            {
                flush(&mut group, &mut cues);
                group_end = 0;
            } else if over_lines {
                return Err(Error::Invalid("Zone de mots superposés trop longue : augmentez la longueur de ligne ; aucun temps artificiel créé".into()));
            }
        }
        group.push(w);
        previous_start = w.start_ms;
        group_end = group_end.max(w.end_ms);
    }
    flush(&mut group, &mut cues);
    validate(&cues)?;
    Ok(cues)
}
pub fn atomic_save(path: &Path, data: &[u8], overwrite: bool) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| Error::Invalid("Dossier absent".into()))?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent)?;
    tmp.write_all(data)?;
    tmp.as_file().sync_all()?;
    if overwrite {
        tmp.persist(path).map_err(|e| Error::Io(e.error))?;
    } else {
        tmp.persist_noclobber(path).map_err(|e| {
            if e.error.kind() == std::io::ErrorKind::AlreadyExists {
                Error::Exists(path.display().to_string())
            } else {
                Error::Io(e.error)
            }
        })?;
    }
    Ok(())
}
pub fn zip_srt(entries: &[(PathBuf, Vec<Cue>)]) -> Result<Vec<u8>> {
    if entries.is_empty() {
        return Err(Error::Invalid("Aucun résultat terminé".into()));
    }
    let cursor = std::io::Cursor::new(Vec::new());
    let mut writer = zip::ZipWriter::new(cursor);
    let mut names = HashSet::new();
    for (path, cues) in entries {
        let base = output_name(path, "srt")?;
        let mut name = base.clone();
        let mut i = 2;
        while !names.insert(name.clone()) {
            name = format!("{} ({i}).srt", base.strip_suffix(".srt").unwrap_or(&base));
            i += 1;
        }
        writer.start_file(name, zip::write::SimpleFileOptions::default())?;
        writer.write_all(srt(cues)?.as_bytes())?;
    }
    Ok(writer.finish()?.into_inner())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn cue() -> Cue {
        Cue {
            start_ms: 1001,
            end_ms: 4200,
            text: "Été français مرحبا".into(),
        }
    }
    #[test]
    fn srt_precision_unicode() {
        assert_eq!(
            srt(&[cue()]).unwrap(),
            "1\n00:00:01,001 --> 00:00:04,200\nÉté français مرحبا\n\n"
        );
    }
    #[test]
    fn numbering_and_invalid() {
        let c = cue();
        let mut d = c.clone();
        d.start_ms = 4300;
        d.end_ms = 5000;
        assert!(srt(&[c.clone(), d]).unwrap().contains("2\n"));
        assert!(srt(&[c.clone(), c]).is_err());
        assert!(srt(&[]).is_err());
    }
    #[test]
    fn reject_empty_injection_zero() {
        for text in ["", "a\n\nb", "a --> b", "a\rb", "a\nb\nc"] {
            let mut c = cue();
            c.text = text.into();
            assert!(validate(&[c]).is_err());
        }
        let mut c = cue();
        c.end_ms = c.start_ms;
        assert!(validate(&[c]).is_err());
    }
    #[test]
    fn filenames() {
        for name in [
            "Ma formation",
            "Audio Français Final",
            "episode.final.v2",
            "A_01-ب",
        ] {
            assert_eq!(
                output_name(Path::new(&format!("/a/{name}.mp3")), "srt").unwrap(),
                format!("{name}.srt")
            );
        }
    }
    #[test]
    fn writes_never_clobber() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.srt");
        atomic_save(&p, b"one", false).unwrap();
        assert!(atomic_save(&p, b"two", false).is_err());
        assert_eq!(fs::read(&p).unwrap(), b"one");
        atomic_save(&p, b"two", true).unwrap();
        assert_eq!(fs::read(&p).unwrap(), b"two");
    }
    #[test]
    fn zip_collisions() {
        let data = zip_srt(&[
            ("/one/A.mp3".into(), vec![cue()]),
            ("/two/A.wav".into(), vec![cue()]),
        ])
        .unwrap();
        let mut z = zip::ZipArchive::new(std::io::Cursor::new(data)).unwrap();
        assert_eq!(z.len(), 2);
        assert!(z.by_name("A.srt").is_ok());
        assert!(z.by_name("A (2).srt").is_ok());
    }
    #[test]
    fn real_word_boundaries() {
        let w = vec![
            Word {
                start_ms: 120,
                end_ms: 500,
                text: "Bonjour".into(),
            },
            Word {
                start_ms: 600,
                end_ms: 900,
                text: "Paris.".into(),
            },
            Word {
                start_ms: 2200,
                end_ms: 2600,
                text: "مرحبا".into(),
            },
        ];
        let c = segment(&w, &SubtitleSettings::default()).unwrap();
        assert_eq!(c.len(), 2);
        assert_eq!((c[0].start_ms, c[0].end_ms), (120, 900));
        assert_eq!(c[1].start_ms, 2200);
    }
    #[test]
    fn wrapping() {
        let w = (0..12)
            .map(|i| Word {
                start_ms: i * 100,
                end_ms: i * 100 + 90,
                text: "bonjour".into(),
            })
            .collect::<Vec<_>>();
        let c = segment(&w, &SubtitleSettings::default()).unwrap();
        for c in c {
            assert!(c.text.lines().count() <= 2);
            assert!(c.text.lines().all(|l| l.chars().count() <= 42));
        }
    }
    #[test]
    fn ten_files_and_dedup() {
        let d = tempfile::tempdir().unwrap();
        let p = (0..11)
            .map(|i| {
                let p = d.path().join(format!("{i}.wav"));
                fs::write(&p, b"RIFF").unwrap();
                p
            })
            .collect::<Vec<_>>();
        assert_eq!(audio_paths(&p[..10], &[]).unwrap().len(), 10);
        assert!(audio_paths(&p, &[]).is_err());
        assert_eq!(
            audio_paths(&[p[0].clone(), p[0].clone()], &[])
                .unwrap()
                .len(),
            1
        );
    }
    #[test]
    fn unsupported_and_empty() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("a.txt");
        fs::write(&p, b"x").unwrap();
        assert!(audio_paths(&[p], &[]).is_err());
        let p = d.path().join("a.wav");
        fs::write(&p, b"").unwrap();
        assert!(audio_paths(&[p], &[]).is_err());
    }
    #[test]
    fn no_fabricated_timing() {
        assert!(segment(
            &[Word {
                start_ms: 10,
                end_ms: 10,
                text: "a".into()
            }],
            &SubtitleSettings::default()
        )
        .is_err());
    }
    #[test]
    fn vtt_keeps_punctuation() {
        let mut c = cue();
        c.text = "Bonjour, Paris.".into();
        let data = vtt(&[c]).unwrap();
        assert!(data.contains("Bonjour, Paris."));
        assert!(data.contains("00:00:01.001"));
    }
    #[test]
    fn overlapping_model_words_keep_real_outer_bounds() {
        let words = vec![
            Word {
                start_ms: 100,
                end_ms: 300,
                text: "Bonjour.".into(),
            },
            Word {
                start_ms: 250,
                end_ms: 500,
                text: "Paris".into(),
            },
            Word {
                start_ms: 900,
                end_ms: 1100,
                text: "encore.".into(),
            },
        ];
        let cues = segment(&words, &SubtitleSettings::default()).unwrap();
        assert_eq!(cues.len(), 2);
        assert_eq!((cues[0].start_ms, cues[0].end_ms), (100, 500));
        assert_eq!(cues[0].text, "Bonjour. Paris");
        assert_eq!(cues[1].start_ms, 900);
    }
}
