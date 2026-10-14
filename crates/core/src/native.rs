use crate::{segment, validate, Cue, Error, Result, SubtitleSettings, Word};

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
    if value["timingGranularity"].as_str() != Some("segment") {
        let words: Vec<Word> = serde_json::from_value(value["words"].clone())
            .map_err(|e| Error::Invalid(e.to_string()))?;
        return Ok(Transcript {
            cues: segment(&words, settings)?,
            comparison_units: words,
            model_version,
            timing_note: None,
        });
    }
    if !value["engine"]
        .as_str()
        .is_some_and(|v| v.starts_with("whisper-"))
    {
        return Err(Error::Invalid(
            "Mode de temps par passages réservé à Whisper".into(),
        ));
    }
    let mut cues: Vec<Cue> = serde_json::from_value(value["segments"].clone())
        .map_err(|e| Error::Invalid(e.to_string()))?;
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
    validate(&cues)?;
    let comparison_units = cues
        .iter()
        .map(|cue| Word {
            start_ms: cue.start_ms,
            end_ms: cue.end_ms,
            text: cue.text.clone(),
        })
        .collect();
    Ok(Transcript { cues, comparison_units, model_version, timing_note: Some("Horodatages par passages Whisper : les temps mot à mot sont incomplets. Le texte et les limites réelles des passages sont conservés ; certains passages peuvent dépasser la longueur ou la durée souhaitée.".into()) })
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
    fn invalid_passages_still_fail_instead_of_creating_times() {
        for (start, end) in [(0, 0), (1000, 500)] {
            let value = json!({"engine":"whisper-turbo","modelVersion":"test","timingGranularity":"segment","segments":[{"startMs":start,"endMs":end,"text":"ce soir"}]});
            assert!(transcript(&value, &SubtitleSettings::default()).is_err());
        }
    }
    #[test]
    fn word_output_keeps_existing_segmentation_and_no_warning() {
        let value = json!({"engine":"whisper-turbo","modelVersion":"test","words":[{"startMs":120,"endMs":400,"text":"Bonjour"},{"startMs":410,"endMs":800,"text":"Paris."}]});
        let result = transcript(&value, &SubtitleSettings::default()).unwrap();
        assert!(result.timing_note.is_none());
        assert_eq!(result.cues[0].text, "Bonjour Paris.");
    }
}
