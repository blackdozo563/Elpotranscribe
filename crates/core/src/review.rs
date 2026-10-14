use crate::{validate, Cue, Error, Result, Word};
use serde::{Deserialize, Serialize};
use similar::{capture_diff_slices_deadline, Algorithm, DiffTag};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewDifference {
    pub cue_index: usize,
    pub primary_text: String,
    pub candidate_text: Option<String>,
    pub alternative_text: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Review {
    pub differences: Vec<ReviewDifference>,
    pub approximate: bool,
}
struct Token {
    normalized: String,
    cue: usize,
    start: usize,
    end: usize,
}
fn normalize(word: &str) -> String {
    word.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}
/// Lexical comparison only. No confidence score and no new audio timestamps.
pub fn compare(primary: &[Cue], secondary: &[Word]) -> Result<Review> {
    validate(primary)?;
    let old: Vec<_> = primary
        .iter()
        .enumerate()
        .flat_map(|(cue, c)| {
            c.text.split_whitespace().filter_map(move |text| {
                let normalized = normalize(text);
                let start = text.as_ptr() as usize - c.text.as_ptr() as usize;
                (!normalized.is_empty()).then_some(Token {
                    normalized,
                    cue,
                    start,
                    end: start + text.len(),
                })
            })
        })
        .collect();
    let new: Vec<_> = secondary
        .iter()
        .flat_map(|word| word.text.split_whitespace())
        .filter_map(|text| {
            let normalized = normalize(text);
            (!normalized.is_empty()).then_some((text, normalized))
        })
        .collect();
    if old.len() + new.len() > 100_000 {
        return Err(Error::Invalid("Texte trop volumineux pour cette comparaison ; divisez l’audio. La transcription principale est conservée.".into()));
    }
    let old_normalized: Vec<_> = old.iter().map(|token| &token.normalized).collect();
    let new_normalized: Vec<_> = new.iter().map(|token| &token.1).collect();
    let started = Instant::now();
    let ops = capture_diff_slices_deadline(
        Algorithm::Myers,
        &old_normalized,
        &new_normalized,
        Some(started + Duration::from_secs(2)),
    );
    let approximate = started.elapsed() >= Duration::from_secs(2);
    let mut edits: Vec<Vec<(usize, usize, String)>> = vec![vec![]; primary.len()];
    let mut alternatives: Vec<Vec<String>> = vec![vec![]; primary.len()];
    let mut flagged = vec![false; primary.len()];
    let mut ambiguous = vec![false; primary.len()];
    for op in ops {
        if op.tag() == DiffTag::Equal {
            continue;
        }
        let before = op.old_range();
        let after = op.new_range();
        let replacement = new[after]
            .iter()
            .map(|token| token.0)
            .collect::<Vec<_>>()
            .join(" ");
        // A long replacement may cover thousands of cues. Store bounded
        // context per cue instead of duplicating the entire second transcript.
        let mut characters = replacement.chars();
        let mut context: String = characters.by_ref().take(320).collect();
        if characters.next().is_some() {
            context.push('…');
        }
        if !before.is_empty() {
            let first = &old[before.start];
            let last = &old[before.end - 1];
            for cue in first.cue..=last.cue {
                flagged[cue] = true;
                alternatives[cue].push(context.clone());
                if first.cue != last.cue {
                    ambiguous[cue] = true;
                }
            }
            if first.cue == last.cue {
                edits[first.cue].push((first.start, last.end, replacement));
            }
        } else if !old.is_empty() {
            let index = before.start;
            let next = old.get(index);
            let previous = index.checked_sub(1).and_then(|i| old.get(i));
            if let (Some(previous), Some(next)) = (previous, next) {
                if previous.cue != next.cue {
                    for cue in [previous.cue, next.cue] {
                        flagged[cue] = true;
                        ambiguous[cue] = true;
                        alternatives[cue].push(context.clone());
                    }
                    continue;
                }
            }
            let anchor = next.or(previous).unwrap();
            let (at, text) = if next.is_some() {
                (anchor.start, format!("{replacement} "))
            } else {
                (anchor.end, format!(" {replacement}"))
            };
            flagged[anchor.cue] = true;
            alternatives[anchor.cue].push(context);
            edits[anchor.cue].push((at, at, text));
        }
    }
    let mut differences = vec![];
    for (index, cue) in primary.iter().enumerate() {
        if !flagged[index] {
            continue;
        }
        let candidate_text = if ambiguous[index] {
            None
        } else {
            let mut text = cue.text.clone();
            edits[index].sort_by_key(|(start, end, _)| std::cmp::Reverse((*start, *end)));
            for (start, end, replacement) in &edits[index] {
                text.replace_range(*start..*end, replacement);
            }
            let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
            (!text.is_empty()).then_some(text)
        };
        differences.push(ReviewDifference {
            cue_index: index,
            primary_text: cue.text.clone(),
            candidate_text,
            alternative_text: alternatives[index].join(" … "),
        });
    }
    Ok(Review {
        differences,
        approximate,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn cue(text: &str) -> Cue {
        Cue {
            start_ms: 120,
            end_ms: 2400,
            text: text.into(),
        }
    }
    fn words(text: &str) -> Vec<Word> {
        vec![Word {
            start_ms: 100,
            end_ms: 2500,
            text: text.into(),
        }]
    }
    #[test]
    fn ce_foir_is_flagged_and_primary_times_are_untouched() {
        let primary = vec![cue("Nous viendrons ce foir.")];
        let result = compare(&primary, &words("Nous viendrons ce soir.")).unwrap();
        assert_eq!(result.differences.len(), 1);
        assert_eq!(
            result.differences[0].candidate_text.as_deref(),
            Some("Nous viendrons ce soir.")
        );
        assert_eq!(primary[0].text, "Nous viendrons ce foir.");
        assert_eq!((primary[0].start_ms, primary[0].end_ms), (120, 2400));
    }
    #[test]
    fn models_can_be_inverted_without_claiming_a_correct_winner() {
        let result = compare(&[cue("ce soir")], &words("ce foir")).unwrap();
        assert_eq!(result.differences[0].primary_text, "ce soir");
        assert_eq!(
            result.differences[0].candidate_text.as_deref(),
            Some("ce foir")
        );
    }
    #[test]
    fn punctuation_case_and_segmentation_are_ignored() {
        let primary = vec![cue("Bonjour, Paris !")];
        assert!(compare(&primary, &words("bonjour paris"))
            .unwrap()
            .differences
            .is_empty());
    }
    #[test]
    fn long_disagreement_bounds_context_without_inventing_a_correction() {
        let primary = vec![
            cue("bonjour"),
            Cue {
                start_ms: 2600,
                end_ms: 4000,
                text: "Paris".into(),
            },
        ];
        let secondary = words(&"different ".repeat(1000));
        let review = compare(&primary, &secondary).unwrap();
        assert_eq!(review.differences.len(), 2);
        for difference in review.differences {
            assert!(difference.candidate_text.is_none());
            assert!(difference.alternative_text.chars().count() <= 321);
        }
    }
    #[test]
    fn unicode_insertions_deletions_and_ambiguous_boundaries() {
        let result = compare(&[cue("Été à Paris")], &words("Cet été à Paris demain")).unwrap();
        assert_eq!(
            result.differences[0].candidate_text.as_deref(),
            Some("Cet Été à Paris demain")
        );
        let result = compare(&[cue("غدا مساء")], &words("اليوم مساء")).unwrap();
        assert_eq!(
            result.differences[0].candidate_text.as_deref(),
            Some("اليوم مساء")
        );
        let primary = vec![
            cue("ce soir"),
            Cue {
                start_ms: 2600,
                end_ms: 4000,
                text: "à Paris".into(),
            },
        ];
        let result = compare(&primary, &words("ce soir demain à Paris")).unwrap();
        assert_eq!(result.differences.len(), 2);
        assert!(result
            .differences
            .iter()
            .all(|difference| difference.candidate_text.is_none()));
    }
}
