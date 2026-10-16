//! Deterministic spelling suggestions; never edits text or audio boundaries.
use crate::{
    review_session::{Difference, Range, Session, Source, Status},
    vocabulary::{fold, Profile},
    Cue, Result,
};

fn tokens(text: &str) -> Vec<(usize, usize)> {
    let mut words = vec![];
    let mut start = None;
    for (offset, ch) in text.char_indices() {
        if ch.is_alphanumeric()
            || (start.is_some()
                && (ch == '-' || unicode_normalization::char::is_combining_mark(ch)))
        {
            start.get_or_insert(offset);
        } else if let Some(begin) = start.take() {
            let end = text[begin..offset].trim_end_matches('-').len() + begin;
            words.push((begin, end));
        }
    }
    if let Some(begin) = start {
        words.push((begin, begin + text[begin..].trim_end_matches('-').len()));
    }
    words
}
#[cfg(test)]
fn distance(left: &str, right: &str) -> usize {
    distance_chars(
        &fold(left).chars().collect::<Vec<_>>(),
        &fold(right).chars().collect::<Vec<_>>(),
    )
}
fn distance_chars(a: &[char], b: &[char]) -> usize {
    if a.len().abs_diff(b.len()) > 2 {
        return 3;
    }
    let mut row: Vec<_> = (0..=b.len()).collect();
    for (i, a) in a.iter().enumerate() {
        let mut next = vec![i + 1];
        for (j, b) in b.iter().enumerate() {
            next.push(
                (next[j] + 1)
                    .min(row[j + 1] + 1)
                    .min(row[j] + usize::from(a != b)),
            );
        }
        if *next.iter().min().unwrap_or(&3) > 2 {
            return 3;
        }
        row = next;
    }
    row[b.len()]
}
/// Existing decisions and engine disagreements win over overlapping vocabulary suggestions.
/// No approximate realignment after a manual edit: an invalidated cue stays for manual review.
pub fn append(
    session: &mut Session,
    id: &str,
    engine: &str,
    cues: &[Cue],
    profile: &Profile,
) -> Result<usize> {
    session.validate(cues)?;
    let terms: Vec<_> = profile
        .terms
        .iter()
        .map(|term| {
            (
                term,
                tokens(term).len(),
                fold(term).chars().collect::<Vec<_>>(),
            )
        })
        .collect();
    let before = session.differences.len();
    for (cue_index, cue) in cues.iter().enumerate() {
        if session
            .differences
            .iter()
            .any(|d| d.cue_index == cue_index && d.range.is_none())
        {
            continue;
        }
        let words = tokens(&cue.text);
        let mut i = 0;
        while i < words.len() {
            let mut best = None;
            let mut closest = 3;
            let mut candidates = std::collections::HashMap::new();
            for (term, count, folded) in &terms {
                if *count == 0 || i + count > words.len() {
                    continue;
                }
                let (start, end) = (words[i].0, words[i + count - 1].1);
                let original = &cue.text[start..end];
                if original == term.as_str() {
                    continue;
                }
                let normalized = candidates
                    .entry(*count)
                    .or_insert_with(|| fold(original).chars().collect::<Vec<_>>());
                let candidate = distance_chars(normalized, folded);
                if candidate < closest {
                    closest = candidate;
                    best = Some((start, end, *term, *count));
                }
            }
            let Some((start, end, term, count)) = best else {
                i += 1;
                continue;
            };
            let range = Range {
                start: cue.text[..start].encode_utf16().count(),
                end: cue.text[..end].encode_utf16().count(),
            };
            let key = format!(
                "{id}:vocabulary:{cue_index}:{}:{}:{term}",
                range.start, range.end
            );
            if !session.differences.iter().any(|d| {
                d.id == key
                    || (d.cue_index == cue_index
                        && d.range
                            .as_ref()
                            .is_some_and(|r| r.start < range.end && r.end > range.start))
            }) {
                let original = cue.text[start..end].to_owned();
                session.differences.push(Difference {
                    id: key,
                    source: Source {
                        cue_index,
                        range: range.clone(),
                        primary_text: original.clone(),
                        secondary_text: Some(term.clone()),
                        alternative_text: term.clone(),
                        primary_engine: engine.into(),
                        secondary_engine: "vocabulary".into(),
                        profile_term: true,
                        vocabulary: true,
                    },
                    cue_index,
                    range: Some(range),
                    current_text: Some(original),
                    status: Status::Pending,
                });
            }
            i += count;
        }
    }
    session.validate(cues)?;
    Ok(session.differences.len() - before)
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::review_session::Decision;
    #[test]
    fn suggestions_preserve_real_bounds_persist_decisions_and_never_replace_automatically() {
        let cues = vec![Cue {
            start_ms: 123,
            end_ms: 4000,
            text: "😀 L’Evengile et Notre Pere.".into(),
        }];
        let mut session = Session {
            version: 1,
            differences: vec![],
            anchors: cues.clone(),
        };
        let mut profile = crate::vocabulary::defaults().profiles.remove(0);
        profile.terms = vec!["Évangile".into(), "Notre Père".into()];
        assert_eq!(
            append(&mut session, "job", "ultra", &cues, &profile).unwrap(),
            2
        );
        assert_eq!(session.anchors, cues);
        let first = session.differences[0].id.clone();
        assert_eq!(session.differences[0].range.as_ref().unwrap().start, 5);
        let (kept, session) = session.resolve(&cues, &first, Decision::Keep).unwrap();
        let mut reloaded: Session =
            serde_json::from_slice(&serde_json::to_vec(&session).unwrap()).unwrap();
        assert_eq!(
            append(&mut reloaded, "job", "ultra", &kept, &profile).unwrap(),
            0
        );
        let (accepted, next) = reloaded.resolve(&kept, &first, Decision::Accept).unwrap();
        assert_eq!(accepted[0].text, "😀 L’Évangile et Notre Pere.");
        assert_eq!((accepted[0].start_ms, accepted[0].end_ms), (123, 4000));
        assert_eq!(
            next.restore(&cues, session).unwrap().differences[0].status,
            Status::Kept
        );
    }
    #[test]
    fn exact_terms_overlap_and_stale_ranges_do_not_add_conflicting_suggestions() {
        assert_eq!(distance("ÉVANGILE", "evangile"), 0);
        assert!(distance("inconnu", "Évangile") > 2);
        let cues = vec![Cue {
            start_ms: 0,
            end_ms: 2000,
            text: "Évangile".into(),
        }];
        let mut session = Session {
            version: 1,
            differences: vec![],
            anchors: cues.clone(),
        };
        let mut profile = crate::vocabulary::defaults().profiles.remove(0);
        profile.terms = vec!["Évangile".into()];
        assert_eq!(
            append(&mut session, "job", "ultra", &cues, &profile).unwrap(),
            0
        );
        let cues = vec![Cue {
            text: "Evengile".into(),
            ..cues[0].clone()
        }];
        session.reconcile(&cues);
        assert_eq!(
            append(&mut session, "job", "ultra", &cues, &profile).unwrap(),
            1
        );
        assert_eq!(
            append(&mut session, "job", "ultra", &cues, &profile).unwrap(),
            0
        );
        // An existing engine disagreement covering this word also takes precedence.
        session.differences[0].id = "job:review:engine".into();
        session.differences[0].source.vocabulary = false;
        session.differences[0].source.secondary_engine = "whisper-turbo".into();
        assert_eq!(
            append(&mut session, "job", "ultra", &cues, &profile).unwrap(),
            0
        );
        let changed = vec![Cue {
            text: "Evengille".into(),
            ..cues[0].clone()
        }];
        session.reconcile(&changed);
        assert_eq!(
            append(&mut session, "job", "ultra", &changed, &profile).unwrap(),
            0
        );
    }
}
