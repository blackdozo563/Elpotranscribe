use crate::{segment, validate_passages, Cue, Error, Result, SubtitleSettings, Word};

pub struct Transcript {
    pub cues: Vec<Cue>,
    pub comparison_units: Vec<Word>,
    pub model_version: String,
    pub timing_note: Option<String>,
}
/// Decode native output without manufacturing word times from passage times.
pub fn transcript(value: &serde_json::Value, settings: &SubtitleSettings) -> Result<Transcript> {
    settings.validate()?;
    let model_version = value["modelVersion"]
        .as_str()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| Error::Invalid("Version du moteur absente".into()))?
        .to_owned();
    let whisper = value["engine"]
        .as_str()
        .is_some_and(|v| v.starts_with("whisper-"));
    if !whisper || value["segments"].as_array().is_none_or(|v| v.is_empty()) {
        let words: Vec<Word> = serde_json::from_value(value["words"].clone())
            .map_err(|e| Error::Invalid(e.to_string()))?;
        match segment(&words, settings) {
            Ok(cues) => {
                return Ok(Transcript {
                    cues,
                    comparison_units: words,
                    model_version,
                    timing_note: None,
                })
            }
            Err(error) => {
                if !whisper || value["segments"].as_array().is_none_or(|v| v.is_empty()) {
                    return Err(error);
                }
            }
        }
    }
    if !whisper {
        return Err(Error::Invalid(
            "Mode de temps par passages réservé à Whisper".into(),
        ));
    }
    let mut cues: Vec<Cue> = serde_json::from_value(value["segments"].clone())
        .map_err(|e| Error::Invalid(e.to_string()))?;
    let mut grouped: Vec<Cue> = Vec::new();
    let mut needs_next = false;
    for mut cue in cues {
        if cue.text.trim().is_empty() {
            continue;
        }
        let invalid = cue.end_ms <= cue.start_ms;
        if cue.end_ms < cue.start_ms {
            std::mem::swap(&mut cue.start_ms, &mut cue.end_ms);
        }
        if let Some(previous) = grouped.last_mut() {
            if invalid || needs_next || previous.end_ms > cue.start_ms {
                previous.start_ms = previous.start_ms.min(cue.start_ms);
                previous.end_ms = previous.end_ms.max(cue.end_ms);
                previous.text.push(' ');
                previous.text.push_str(&cue.text);
                needs_next = previous.end_ms == previous.start_ms;
                continue;
            }
        }
        grouped.push(cue);
        needs_next = invalid;
    }
    cues = grouped;
    for cue in &mut cues {
        let words: Vec<_> = cue.text.split_whitespace().collect();
        // Keep each real passage intact, in at most two lines. Long passages
        // may exceed preferred line length/duration; never distribute their time.
        let length =
            words.iter().map(|w| w.chars().count()).sum::<usize>() + words.len().saturating_sub(1);
        let target = settings.line_length.max(length.div_ceil(2));
        let mut text = String::new();
        let mut first = 0;
        let mut wrapped = false;
        for word in words {
            if !text.is_empty() {
                if settings.max_lines == 2 && !wrapped && first + 1 + word.chars().count() > target
                {
                    text.push('\n');
                    wrapped = true;
                } else {
                    text.push(' ');
                }
            }
            text.push_str(word);
            if !wrapped {
                first += word.chars().count() + usize::from(first > 0);
            }
        }
        cue.text = text;
    }
    validate_passages(&cues, true)?;
    let comparison_units = cues
        .iter()
        .map(|cue| Word {
            start_ms: cue.start_ms,
            end_ms: cue.end_ms,
            text: cue.text.clone(),
        })
        .collect();
    let point_only = cues.iter().any(|c| c.end_ms == c.start_ms);
    let note = if point_only {
        "Whisper a fourni du texte sans durée positive. Texte conservé ; corrigez les limites dans l’éditeur avant export. Aucun temps inventé."
    } else {
        "Horodatages par passages Whisper : limites réelles du moteur conservées, sans dépendre des temps de mots. Les passages invalides ou chevauchants sont regroupés ; certains peuvent dépasser la longueur ou la durée souhaitée."
    };
    Ok(Transcript {
        cues,
        comparison_units,
        model_version,
        timing_note: Some(note.into()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn french_passage_fallback_preserves_all_text_and_real_bounds() {
        let text = "Ce soir nous allons parler de la transcription en français et des difficultés rencontrées avec les petits mots et la ponctuation.";
        let value = json!({"engine":"whisper-turbo","modelVersion":"test","timingGranularity":"segment","words":[],"segments":[{"startMs":120,"endMs":8300,"text":text}]});
        let result = transcript(&value, &SubtitleSettings::default()).unwrap();
        assert_eq!(
            (result.cues[0].start_ms, result.cues[0].end_ms),
            (120, 8300)
        );
        assert_eq!(
            result.cues[0]
                .text
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" "),
            text
        );
        assert!(result.cues[0].text.lines().count() <= 2);
        assert!(result.timing_note.is_some());
        assert!(crate::srt(&result.cues)
            .unwrap()
            .contains("00:00:00,120 --> 00:00:08,300"));
    }
    #[test]
    fn zero_and_inverted_segments_keep_text_and_real_outer_bounds() {
        for (start, end) in [(900, 900), (900, 600)] {
            let value = json!({"engine":"whisper-turbo","modelVersion":"test","segments":[
                {"startMs":100,"endMs":500,"text":"Bonjour"},
                {"startMs":start,"endMs":end,"text":"ce soir"}]});
            let result = transcript(&value, &SubtitleSettings::default()).unwrap();
            assert_eq!(result.cues.len(), 1);
            assert_eq!(result.cues[0].text, "Bonjour ce soir");
            assert_eq!((result.cues[0].start_ms, result.cues[0].end_ms), (100, 900));
            assert!(crate::srt(&result.cues).is_ok());
        }
    }
    #[test]
    fn point_only_output_completes_as_text_but_cannot_export_invented_duration() {
        let value = json!({"engine":"whisper-turbo","modelVersion":"test","segments":[{"startMs":120,"endMs":120,"text":"soir"}]});
        let result = transcript(&value, &SubtitleSettings::default()).unwrap();
        assert_eq!((result.cues[0].start_ms, result.cues[0].end_ms), (120, 120));
        assert!(crate::srt(&result.cues).is_err());
        assert!(result.timing_note.unwrap().contains("avant export"));
    }
    #[test]
    fn empty_output_is_an_error() {
        let value =
            json!({"engine":"whisper-turbo","modelVersion":"test","segments":[],"words":[]});
        assert!(transcript(&value, &SubtitleSettings::default()).is_err());
    }
    #[test]
    fn nonchronological_words_fall_back_to_real_passages() {
        let value = json!({"engine":"whisper-turbo","modelVersion":"test",
            "words":[{"startMs":2000,"endMs":2500,"text":"Bonjour"},{"startMs":500,"endMs":900,"text":"Paris"}],
            "segments":[{"startMs":100,"endMs":3000,"text":"Bonjour Paris"}]});
        let result = transcript(&value, &SubtitleSettings::default()).unwrap();
        assert!(result.timing_note.is_some());
        assert_eq!(
            (result.cues[0].start_ms, result.cues[0].end_ms),
            (100, 3000)
        );
        assert_eq!(result.cues[0].text, "Bonjour Paris");
    }
    #[test]
    fn word_output_keeps_existing_segmentation_and_no_warning() {
        let value = json!({"engine":"whisper-turbo","modelVersion":"test","words":[{"startMs":120,"endMs":400,"text":"Bonjour"},{"startMs":410,"endMs":800,"text":"Paris."}]});
        let result = transcript(&value, &SubtitleSettings::default()).unwrap();
        assert!(result.timing_note.is_none());
        assert_eq!(result.cues[0].text, "Bonjour Paris.");
    }
}
