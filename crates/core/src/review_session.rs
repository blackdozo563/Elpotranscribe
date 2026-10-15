//! Persistent review decisions. Ranges use UTF-16 code units, as in DOM selections.
//! Only text is edited: these operations never derive or adjust audio times.
use crate::{review::Review, Cue, Error, Result};
use serde::{Deserialize, Serialize};
use similar::{capture_diff_slices_deadline, Algorithm, DiffTag};
use std::time::{Duration, Instant};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    Pending,
    Accepted,
    Kept,
    Modified,
    NeedsReview,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Range {
    pub start: usize,
    pub end: usize,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub cue_index: usize,
    pub range: Range,
    pub primary_text: String,
    pub secondary_text: Option<String>,
    pub alternative_text: String,
    pub primary_engine: String,
    pub secondary_engine: String,
    pub profile_term: bool,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Difference {
    pub id: String,
    pub source: Source,
    pub cue_index: usize,
    pub range: Option<Range>,
    pub current_text: Option<String>,
    pub status: Status,
}
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub version: u32,
    pub differences: Vec<Difference>,
    pub anchors: Vec<Cue>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub cue_index: usize,
    pub range: Range,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Decision {
    Accept,
    Keep,
    Modify {
        text: String,
        selection: Option<Selection>,
    },
}
fn invalid(message: &str) -> Error {
    Error::Invalid(message.into())
}
fn units(s: &str) -> usize {
    s.encode_utf16().count()
}
fn byte(s: &str, offset: usize) -> Result<usize> {
    let mut count = 0;
    for (i, c) in s.char_indices() {
        if count == offset {
            return Ok(i);
        }
        count += c.len_utf16();
    }
    if count == offset {
        Ok(s.len())
    } else {
        Err(invalid("Plage de relecture Unicode invalide."))
    }
}
fn bounds(s: &str, range: &Range) -> Result<std::ops::Range<usize>> {
    if range.start > range.end {
        return Err(invalid("Plage de relecture inversée."));
    }
    Ok(byte(s, range.start)?..byte(s, range.end)?)
}
fn words(s: &str) -> Vec<(&str, usize, usize)> {
    s.split_whitespace()
        .map(|w| {
            let start = w.as_ptr() as usize - s.as_ptr() as usize;
            (w, start, start + w.len())
        })
        .collect()
}
impl Session {
    pub fn from_review(
        id: &str,
        primary: &str,
        secondary: &str,
        cues: &[Cue],
        review: &Review,
    ) -> Result<Self> {
        let mut differences = vec![];
        for (index, legacy) in review.differences.iter().enumerate() {
            let cue = cues
                .get(legacy.cue_index)
                .ok_or_else(|| invalid("Segment de comparaison absent."))?;
            let mut patches = vec![];
            if let Some(candidate) = &legacy.candidate_text {
                let old = words(&legacy.primary_text);
                let new = words(candidate);
                if old.len() + new.len() > 100_000 {
                    return Err(invalid("Comparaison trop volumineuse."));
                }
                let a: Vec<_> = old.iter().map(|w| w.0).collect();
                let b: Vec<_> = new.iter().map(|w| w.0).collect();
                for op in capture_diff_slices_deadline(
                    Algorithm::Myers,
                    &a,
                    &b,
                    Some(Instant::now() + Duration::from_secs(2)),
                ) {
                    if op.tag() == DiffTag::Equal {
                        continue;
                    }
                    let o = op.old_range();
                    let n = op.new_range();
                    let mut start = old.get(o.start).map_or(legacy.primary_text.len(), |w| w.1);
                    let mut end = if o.is_empty() {
                        start
                    } else {
                        old[o.end - 1].2
                    };
                    let mut replacement = if n.is_empty() {
                        String::new()
                    } else {
                        candidate[new[n.start].1..new[n.end - 1].2].to_owned()
                    };
                    if o.is_empty() && !replacement.is_empty() {
                        if start < legacy.primary_text.len() {
                            replacement.push(' ');
                        } else if start > 0 {
                            replacement.insert(0, ' ');
                        }
                    } else if n.is_empty() {
                        // Include only the adjacent original separator in a deletion.
                        if end < legacy.primary_text.len() {
                            end = old.get(o.end).map_or(end, |w| w.1);
                        } else if o.start > 0 {
                            start = old[o.start - 1].2;
                        }
                    }
                    patches.push((start, end, Some(replacement)));
                }
            } else {
                // Cross-segment comparisons have no safe automatic allocation.
                patches.push((0, legacy.primary_text.len(), None));
            }
            for (part, (start, end, replacement)) in patches.into_iter().enumerate() {
                let range = Range {
                    start: units(&legacy.primary_text[..start]),
                    end: units(&legacy.primary_text[..end]),
                };
                let fresh = cue.text == legacy.primary_text;
                let text = legacy.primary_text[start..end].to_owned();
                differences.push(Difference {
                    id: format!("{id}:review:{index}:{part}"),
                    source: Source {
                        cue_index: legacy.cue_index,
                        range: range.clone(),
                        primary_text: text.clone(),
                        secondary_text: replacement,
                        alternative_text: legacy.alternative_text.clone(),
                        primary_engine: primary.into(),
                        secondary_engine: secondary.into(),
                        profile_term: legacy.profile_term,
                    },
                    cue_index: legacy.cue_index,
                    range: fresh.then_some(range),
                    current_text: fresh.then_some(text),
                    status: if fresh {
                        Status::Pending
                    } else {
                        Status::NeedsReview
                    },
                });
            }
        }
        Ok(Self {
            version: 1,
            differences,
            anchors: cues.to_vec(),
        })
    }
    pub fn pending(&self) -> usize {
        self.differences
            .iter()
            .filter(|d| matches!(d.status, Status::Pending | Status::NeedsReview))
            .count()
    }
    /// Any external text/timing/structure edit invalidates the affected anchors.
    pub fn reconcile(&mut self, cues: &[Cue]) {
        let structural = cues.len() != self.anchors.len()
            || cues
                .iter()
                .zip(&self.anchors)
                .any(|(a, b)| a.start_ms != b.start_ms || a.end_ms != b.end_ms);
        for d in &mut self.differences {
            if structural || cues.get(d.cue_index) != self.anchors.get(d.cue_index) {
                d.status = Status::NeedsReview;
                d.range = None;
                d.current_text = None;
            }
        }
        self.anchors = cues.to_vec();
    }
    pub fn validate(&self, cues: &[Cue]) -> Result<()> {
        if self.version != 1 || self.anchors != cues {
            return Err(invalid("État de relecture incompatible ou périmé."));
        }
        let mut ids = std::collections::HashSet::new();
        for d in &self.differences {
            if !ids.insert(&d.id) {
                return Err(invalid("Identifiant de divergence dupliqué."));
            }
            match (&d.range, &d.current_text) {
                (Some(r), Some(text)) => {
                    let cue = cues
                        .get(d.cue_index)
                        .ok_or_else(|| invalid("Segment absent."))?;
                    let expected = match d.status {
                        Status::Pending | Status::Kept => Some(d.source.primary_text.as_str()),
                        Status::Accepted => {
                            Some(d.source.secondary_text.as_deref().ok_or_else(|| {
                                invalid("La comparaison n’a pas de proposition applicable.")
                            })?)
                        }
                        Status::Modified | Status::NeedsReview => None,
                    };
                    if expected.is_some_and(|value| value != text) {
                        return Err(invalid(
                            "Le statut ne correspond pas à la lecture enregistrée.",
                        ));
                    }
                    if &cue.text[bounds(&cue.text, r)?] != text {
                        return Err(invalid("Texte de relecture périmé."));
                    }
                }
                (None, None) if d.status == Status::NeedsReview => (),
                _ => return Err(invalid("Plage de relecture absente.")),
            }
        }
        Ok(())
    }
    /// Transactional: no mutation, including status changes, on failure.
    pub fn resolve(&self, cues: &[Cue], id: &str, decision: Decision) -> Result<(Vec<Cue>, Self)> {
        self.validate(cues)?;
        let mut next = self.clone();
        let index = next
            .differences
            .iter()
            .position(|d| d.id == id)
            .ok_or_else(|| invalid("Divergence inconnue."))?;
        let d = &next.differences[index];
        let (text, status, selection) = match decision {
            Decision::Accept => (d.source.secondary_text.clone().ok_or_else(|| invalid("Comparaison à cheval sur plusieurs segments : choisissez une plage et modifiez le texte."))?, Status::Accepted, None),
            Decision::Keep => (d.source.primary_text.clone(), Status::Kept, None),
            Decision::Modify { text, selection } => (text, Status::Modified, selection),
        };
        let (cue_index, range) = if let Some(s) = selection {
            (s.cue_index, s.range)
        } else {
            (
                d.cue_index,
                d.range.clone().ok_or_else(|| {
                    invalid("Texte modifié : choisissez explicitement une nouvelle plage à relire.")
                })?,
            )
        };
        let mut updated = cues.to_vec();
        let cue = updated
            .get_mut(cue_index)
            .ok_or_else(|| invalid("Segment absent."))?;
        let span = bounds(&cue.text, &range)?;
        cue.text.replace_range(span, &text);
        crate::validate_passages(&updated, true)?;
        let delta = units(&text) as isize - (range.end - range.start) as isize;
        for (i, other) in next.differences.iter_mut().enumerate() {
            if i == index || other.cue_index != cue_index {
                continue;
            }
            if let Some(r) = &mut other.range {
                if r.start >= range.end && !(r.start == range.start && r.end == range.end) {
                    r.start = r
                        .start
                        .checked_add_signed(delta)
                        .ok_or_else(|| invalid("Décalage de plage invalide."))?;
                    r.end = r
                        .end
                        .checked_add_signed(delta)
                        .ok_or_else(|| invalid("Décalage de plage invalide."))?;
                } else if r.end > range.start || (r.start == range.start && r.end == range.end) {
                    other.range = None;
                    other.current_text = None;
                    other.status = Status::NeedsReview;
                }
            }
        }
        let d = &mut next.differences[index];
        d.cue_index = cue_index;
        d.range = Some(Range {
            start: range.start,
            end: range.start + units(&text),
        });
        d.current_text = Some(text);
        d.status = status;
        next.anchors = updated.clone();
        next.validate(&updated)?;
        Ok((updated, next))
    }
    /// Restore an editor undo/redo frame, preserving immutable comparison metadata.
    pub fn restore(&self, cues: &[Cue], frame: Self) -> Result<Self> {
        if self.differences.len() != frame.differences.len()
            || self
                .differences
                .iter()
                .zip(&frame.differences)
                .any(|(a, b)| a.id != b.id || a.source != b.source)
        {
            return Err(invalid(
                "La comparaison a changé : cette annulation n’est plus applicable.",
            ));
        }
        crate::validate_passages(cues, true)?;
        frame.validate(cues)?;
        Ok(frame)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{review::ReviewDifference, Word};
    fn cue(text: &str, start: u64) -> Cue {
        Cue {
            start_ms: start,
            end_ms: start + 2000,
            text: text.into(),
        }
    }
    fn session(cues: &[Cue], replacements: &[(usize, Option<&str>)]) -> Session {
        Session::from_review(
            "job",
            "ultra",
            "whisper-turbo",
            cues,
            &Review {
                approximate: false,
                differences: replacements
                    .iter()
                    .map(|(i, text)| ReviewDifference {
                        cue_index: *i,
                        primary_text: cues[*i].text.clone(),
                        candidate_text: text.map(str::to_owned),
                        alternative_text: text.unwrap_or("Contexte ambigu").into(),
                        profile_term: false,
                    })
                    .collect(),
            },
        )
        .unwrap()
    }
    #[test]
    fn resolves_only_word_ranges_preserves_other_segments_and_supports_all_decisions() {
        let cues = vec![
            cue("Je sors ce foir avec vous.", 190),
            cue("Été à Paris.", 3000),
        ];
        let s = session(&cues, &[(0, Some("Je sors ce soir avec vous."))]);
        let d = &s.differences[0];
        assert_eq!(d.source.primary_text, "foir");
        assert_eq!(d.source.secondary_text.as_deref(), Some("soir"));
        let (accepted, a) = s.resolve(&cues, &d.id, Decision::Accept).unwrap();
        assert_eq!(accepted[0].text, "Je sors ce soir avec vous.");
        assert_eq!(accepted[1], cues[1]);
        assert_eq!((accepted[0].start_ms, accepted[0].end_ms), (190, 2190));
        assert_eq!(a.pending(), 0);
        let (kept, k) = a.resolve(&accepted, &d.id, Decision::Keep).unwrap();
        assert_eq!(kept, cues);
        assert_eq!(k.differences[0].status, Status::Kept);
        let (modified, m) = s
            .resolve(
                &cues,
                &d.id,
                Decision::Modify {
                    text: "matin".into(),
                    selection: None,
                },
            )
            .unwrap();
        assert_eq!(modified[0].text, "Je sors ce matin avec vous.");
        assert_eq!(m.differences[0].status, Status::Modified);
        assert_eq!(a.restore(&cues, s.clone()).unwrap(), s);
        assert_eq!(s.restore(&accepted, a.clone()).unwrap(), a);
    }
    #[test]
    fn separate_and_adjacent_differences_shift_without_overwriting_each_other() {
        let cues = vec![cue("abc def ghi", 0)];
        let mut s = session(&cues, &[(0, Some("longue def fin"))]);
        assert_eq!(s.differences.len(), 2);
        let second = s.differences[1].id.clone();
        let (updated, a) = s
            .resolve(&cues, &s.differences[0].id, Decision::Accept)
            .unwrap();
        assert_eq!(a.differences[1].range, Some(Range { start: 11, end: 14 }));
        let (updated, a) = a.resolve(&updated, &second, Decision::Accept).unwrap();
        assert_eq!(updated[0].text, "longue def fin");
        assert_eq!(a.pending(), 0);
        // Two independently stored, immediately adjacent ranges, including their separator.
        s.differences[0].range = Some(Range { start: 0, end: 4 });
        s.differences[0].current_text = Some("abc ".into());
        s.differences[0].source.primary_text = "abc ".into();
        s.differences[0].source.secondary_text = Some("plus long ".into());
        s.differences[1].range = Some(Range { start: 4, end: 7 });
        s.differences[1].current_text = Some("def".into());
        s.differences[1].source.primary_text = "def".into();
        s.differences[1].source.secondary_text = Some("court".into());
        let (updated, a) = s
            .resolve(&cues, &s.differences[0].id, Decision::Accept)
            .unwrap();
        assert_eq!(a.differences[1].range, Some(Range { start: 10, end: 13 }));
        let (updated, _) = a.resolve(&updated, &second, Decision::Accept).unwrap();
        assert_eq!(updated[0].text, "plus long court ghi");
    }
    #[test]
    fn manual_edits_invalidate_ranges_until_explicitly_reanchored() {
        let cues = vec![cue("Ce foir.", 0), cue("Autre segment.", 3000)];
        let mut s = session(&cues, &[(0, Some("Ce soir.")), (1, Some("Autre texte."))]);
        let mut edited = cues.clone();
        edited[0].text = "Cette nuit.".into();
        s.reconcile(&edited);
        let id = s.differences[0].id.clone();
        assert_eq!(s.pending(), 2);
        assert_eq!(s.differences[0].status, Status::NeedsReview);
        assert_eq!(s.differences[1].status, Status::Pending);
        assert!(s.resolve(&edited, &id, Decision::Accept).is_err());
        assert!(s.resolve(&edited, &id, Decision::Keep).is_err());
        let (result, m) = s
            .resolve(
                &edited,
                &id,
                Decision::Modify {
                    text: "soir".into(),
                    selection: Some(Selection {
                        cue_index: 0,
                        range: Range { start: 6, end: 10 },
                    }),
                },
            )
            .unwrap();
        assert_eq!(result[0].text, "Cette soir.");
        assert_eq!(m.differences[0].status, Status::Modified);
        edited[0].end_ms = 1900;
        s.reconcile(&edited);
        assert!(s
            .differences
            .iter()
            .all(|d| d.status == Status::NeedsReview));
    }
    #[test]
    fn actual_cross_segment_comparison_is_manual_only_and_never_changes_other_cues() {
        let cues = vec![cue("Je prends ce", 0), cue("foir demain.", 3000)];
        let secondary = vec![Word {
            start_ms: 0,
            end_ms: 1000,
            text: "Je prends le soir demain.".into(),
        }];
        let review = crate::review::compare(&cues, &secondary).unwrap();
        assert_eq!(review.differences.len(), 2);
        let s = Session::from_review("job", "ultra", "whisper-turbo", &cues, &review).unwrap();
        assert!(s
            .differences
            .iter()
            .all(|d| d.source.secondary_text.is_none()));
        for d in &s.differences {
            assert!(s.resolve(&cues, &d.id, Decision::Accept).is_err());
        }
        let (edited, _) = s
            .resolve(
                &cues,
                &s.differences[0].id,
                Decision::Modify {
                    text: "Je prends le".into(),
                    selection: None,
                },
            )
            .unwrap();
        assert_eq!(edited[1], cues[1]);
        assert_eq!(edited[0].end_ms, cues[0].end_ms);
    }
    #[test]
    fn unicode_insertions_deletions_and_newlines_preserve_real_ranges() {
        for (original, candidate) in [
            ("😀 ce foir à Noël", "😀 ce soir à Noël"),
            ("Un jour vient.", "Un beau jour vient."),
            ("Un beau jour vient.", "Un jour vient."),
            ("Un jour vient.", "Un jour vient. bientôt"),
            ("Un jour vient. bientôt", "Un jour vient."),
            ("Été\nce foir.", "Été ce soir."),
        ] {
            let cues = vec![cue(original, 0)];
            let s = session(&cues, &[(0, Some(candidate))]);
            let mut result = cues.clone();
            let mut next = s.clone();
            for d in &s.differences {
                (result, next) = next.resolve(&result, &d.id, Decision::Accept).unwrap();
            }
            assert_eq!(result[0].text, candidate.replace("Été ce", "Été\nce"));
        }
        let cues = vec![cue("😀 ce foir.", 0)];
        let s = session(&cues, &[(0, Some("😀 ce soir."))]);
        assert_eq!(s.differences[0].range, Some(Range { start: 6, end: 11 }));
        assert!(s
            .resolve(
                &cues,
                &s.differences[0].id,
                Decision::Modify {
                    text: "x".into(),
                    selection: Some(Selection {
                        cue_index: 0,
                        range: Range { start: 1, end: 2 }
                    })
                }
            )
            .is_err());
    }
    #[test]
    fn rejected_decisions_are_atomic_and_undo_cannot_replace_comparison_metadata() {
        let cues = vec![cue("foir", 0)];
        let s = session(&cues, &[(0, Some("soir"))]);
        let before = serde_json::to_string(&s).unwrap();
        assert!(s
            .resolve(
                &cues,
                &s.differences[0].id,
                Decision::Modify {
                    text: "".into(),
                    selection: None
                }
            )
            .is_err());
        assert!(s.resolve(&cues, "missing", Decision::Keep).is_err());
        assert_eq!(serde_json::to_string(&s).unwrap(), before);
        let mut tampered = s.clone();
        tampered.differences[0].source.primary_text = "inventé".into();
        assert!(s.restore(&cues, tampered).is_err());
        let mut tampered = s.clone();
        tampered.differences[0].range = Some(Range { start: 0, end: 2 });
        assert!(s.restore(&cues, tampered).is_err());
    }
    #[test]
    fn empty_comparison_is_valid_and_has_no_pending_items() {
        let cues = vec![cue("Bonjour.", 0)];
        let s = session(&cues, &[]);
        assert_eq!(s.pending(), 0);
        assert!(s.differences.is_empty());
        s.validate(&cues).unwrap();
        assert!(s.resolve(&cues, "missing", Decision::Accept).is_err());
    }
}
