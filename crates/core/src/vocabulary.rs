use crate::{atomic_save, Error, Result};
use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::Path};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub language: String,
    pub terms: Vec<String>,
    pub whisper_prompt: String,
    pub builtin: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profiles {
    pub version: u32,
    pub profiles: Vec<Profile>,
}
pub fn deduplicate(terms: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    terms
        .iter()
        .map(|t| t.trim())
        .filter(|t| !t.is_empty() && seen.insert(t.to_lowercase()))
        .map(str::to_owned)
        .collect()
}
pub fn defaults() -> Profiles {
    let data = [
        ("liturgy-fr", "Liturgie FR", "fr", "Évangile|Épître|Psaume|Agnus Dei|Kyrie|Magnificat|Notre Père|Je vous salue Marie|Credo|Gloria|Jérémie|Ézéchiel|Isaïe|Thessaloniciens|Corinthiens|Éphésiens|Philippiens|Apocalypse|Saint-Esprit|Eucharistie|homélie|intercession|miséricorde|Alléluia|Seigneur|Sauveur|résurrection|sanctification", "L’homélie évoque l’Évangile, la miséricorde du Seigneur et l’Eucharistie ; nous prions le Notre Père et chantons l’Agnus Dei."),
        ("psychology-fr", "Psychologie FR", "fr", "TCC|thérapie cognitivo-comportementale|DSM-5|CIM-11|psychanalyse|transfert|contre-transfert|refoulement|inconscient|pulsion|attachement|théorie de l'attachement|dissociation|rumination|comorbidité|dysrégulation émotionnelle|psychoéducation|exposition graduée|restructuration cognitive|distorsion cognitive|pleine conscience|Freud|Lacan|Winnicott|Bowlby|Dolto|Cyrulnik|Beck|Linehan|Rogers|résilience|traumatisme|état de stress post-traumatique", "Cette formation en psychologie aborde les TCC, la théorie de l’attachement de Bowlby, la dissociation et la restructuration cognitive de Beck."),
        ("psychology-en-us", "Psychologie EN-US", "en", "DSM-5|CBT|DBT|ACT|attachment theory|cognitive distortion|rumination|dissociation|comorbidity|Bowlby|Winnicott|Beck|Yalom|Linehan|Kahneman|Rogers|psychoeducation|dysregulation|intrusive thoughts|exposure therapy|cognitive restructuring|mindfulness|PTSD|resilience", "This psychology lecture discusses CBT, DBT, attachment theory, cognitive restructuring, mindfulness, PTSD and Linehan’s work."),
    ];
    Profiles {
        version: 1,
        profiles: data
            .into_iter()
            .map(|(id, name, language, terms, prompt)| Profile {
                id: id.into(),
                name: name.into(),
                language: language.into(),
                terms: terms.split('|').map(str::to_owned).collect(),
                whisper_prompt: prompt.into(),
                builtin: true,
            })
            .collect(),
    }
}
impl Profile {
    pub fn clean(mut self) -> Result<Self> {
        self.name = self.name.trim().into();
        self.terms = deduplicate(&self.terms);
        self.whisper_prompt = self.whisper_prompt.trim().into();
        if self.id.is_empty()
            || self.id.len() > 100
            || self.name.is_empty()
            || self.name.chars().count() > 100
            || !["fr", "en"].contains(&self.language.as_str())
            || self.terms.len() > 1000
            || self
                .terms
                .iter()
                .any(|t| t.chars().count() > 160 || t.contains(['\n', '\r', '\0']))
            || self.whisper_prompt.len() > 32000
        {
            return Err(Error::Invalid("Profil invalide : nom, langue FR/EN, 1 000 termes maximum et invite limitée à 32 Ko.".into()));
        }
        Ok(self)
    }
}
impl Profiles {
    pub fn save(&self, path: &Path) -> Result<()> {
        let bytes = serde_json::to_vec_pretty(self).map_err(|e| Error::Invalid(e.to_string()))?;
        if bytes.len() > 8 * 1024 * 1024 {
            return Err(Error::Invalid(
                "Maximum 8 Mo pour les profils ; version enregistrée conservée.".into(),
            ));
        }
        atomic_save(path, &bytes, true)
    }
    pub fn upsert(&mut self, profile: Profile) -> Result<Profile> {
        let mut profile = profile.clean()?;
        let builtin = defaults().profiles.iter().any(|p| p.id == profile.id);
        profile.builtin = builtin;
        if let Some(old) = self.profiles.iter_mut().find(|p| p.id == profile.id) {
            *old = profile.clone();
        } else {
            if self.profiles.len() >= 1000 {
                return Err(Error::Invalid("Maximum 1 000 profils.".into()));
            }
            self.profiles.push(profile.clone());
        }
        Ok(profile)
    }
    pub fn remove(&mut self, id: &str) -> Result<()> {
        if self.profiles.iter().any(|p| p.id == id && p.builtin) {
            return Err(Error::Invalid(
                "Un profil fourni ne peut pas être supprimé.".into(),
            ));
        }
        self.profiles.retain(|p| p.id != id);
        Ok(())
    }
    pub fn reset(&mut self, id: &str) -> Result<Profile> {
        let profile = defaults()
            .profiles
            .into_iter()
            .find(|p| p.id == id)
            .ok_or_else(|| Error::Invalid("Ce profil n’a pas de valeurs par défaut.".into()))?;
        self.upsert(profile)
    }
}
pub fn load(path: &Path, legacy: &[String]) -> Result<Profiles> {
    if path.exists() {
        let bytes = fs::read(path)?;
        if bytes.len() > 8 * 1024 * 1024 {
            return Err(Error::Invalid("Fichier de profils trop volumineux.".into()));
        }
        let loaded: Profiles = serde_json::from_slice(&bytes)
            .map_err(|e| Error::Invalid(format!("Profils illisibles, fichier conservé : {e}")))?;
        if loaded.version != 1 {
            return Err(Error::Invalid(
                "Version de profils non prise en charge ; fichier conservé.".into(),
            ));
        }
        let mut checked = Profiles {
            version: 1,
            profiles: vec![],
        };
        for profile in loaded.profiles {
            checked.upsert(profile)?;
        }
        for default in defaults().profiles {
            if !checked.profiles.iter().any(|p| p.id == default.id) {
                checked.upsert(default)?;
            }
        }
        return Ok(checked);
    }
    let mut profiles = defaults();
    profiles.upsert(Profile {
        id: "my-vocabulary".into(),
        name: "Mon vocabulaire".into(),
        language: "fr".into(),
        terms: legacy.to_vec(),
        whisper_prompt: String::new(),
        builtin: false,
    })?;
    profiles.save(path)?;
    Ok(profiles)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn migration_preserves_unicode_and_runs_only_once() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("profiles.json");
        let first = load(
            &path,
            &[" Évangile ".into(), "ÉVANGILE".into(), "Freud".into()],
        )
        .unwrap();
        assert_eq!(
            first
                .profiles
                .iter()
                .find(|p| p.id == "my-vocabulary")
                .unwrap()
                .terms,
            ["Évangile", "Freud"]
        );
        let second = load(&path, &["autre".into()]).unwrap();
        assert_eq!(second.profiles, first.profiles);
    }
    #[test]
    fn edits_persist_builtins_reset_and_cannot_be_deleted() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("profiles.json");
        let mut profiles = defaults();
        let mut profile = profiles.profiles[0].clone();
        profile.terms = vec!["Mon terme".into()];
        profiles.upsert(profile.clone()).unwrap();
        profiles.save(&path).unwrap();
        let mut loaded = load(&path, &[]).unwrap();
        assert_eq!(loaded.profiles[0].terms, profile.terms);
        assert!(loaded.remove(&profile.id).is_err());
        assert!(loaded
            .reset(&profile.id)
            .unwrap()
            .terms
            .contains(&"Évangile".into()));
        assert!(defaults()
            .profiles
            .iter()
            .all(|p| p.builtin && !p.terms.is_empty()));
    }
    #[test]
    fn corrupt_profiles_are_not_overwritten() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("profiles.json");
        fs::write(&path, b"broken").unwrap();
        assert!(load(&path, &[]).is_err());
        assert_eq!(fs::read(path).unwrap(), b"broken");
    }
}

/// Full prompt text; the model's tokenizer, not a character estimate, caps it.
pub fn build_prompt(profile: &Profile) -> String {
    [
        profile.whisper_prompt.trim().to_owned(),
        deduplicate(&profile.terms).join(", "),
    ]
    .into_iter()
    .filter(|s| !s.is_empty())
    .collect::<Vec<_>>()
    .join("\n")
}
pub fn fold(text: &str) -> String {
    use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};
    text.nfd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .collect::<String>()
}
pub fn contains_term(text: &str, terms: &[String]) -> bool {
    let text = fold(text);
    terms
        .iter()
        .map(|t| fold(t))
        .filter(|t| !t.is_empty())
        .any(|term| {
            text.match_indices(&term).any(|(at, _)| {
                text[..at]
                    .chars()
                    .next_back()
                    .is_none_or(|c| !c.is_alphanumeric())
                    && text[at + term.len()..]
                        .chars()
                        .next()
                        .is_none_or(|c| !c.is_alphanumeric())
            })
        })
}
pub fn rank_review(review: &mut crate::review::Review, profile: &Profile) {
    for difference in &mut review.differences {
        difference.profile_term = contains_term(&difference.primary_text, &profile.terms)
            || contains_term(
                difference
                    .candidate_text
                    .as_deref()
                    .unwrap_or(&difference.alternative_text),
                &profile.terms,
            );
    }
    review.differences.sort_by_key(|d| !d.profile_term);
}
#[cfg(test)]
mod usage_tests {
    use super::*;
    #[test]
    fn prompt_deduplicates_and_terms_rank_accent_insensitively_without_changing_times() {
        let mut profile = defaults().profiles.remove(0);
        profile.terms = vec![" Évangile ".into(), "ÉVANGILE".into()];
        assert!(build_prompt(&profile).ends_with("Évangile"));
        assert!(contains_term("EVANGILE selon saint Jean", &profile.terms));
        assert!(!contains_term("évangiles", &profile.terms));
        let cues = vec![
            crate::Cue {
                start_ms: 0,
                end_ms: 1000,
                text: "ce foir".into(),
            },
            crate::Cue {
                start_ms: 1100,
                end_ms: 2000,
                text: "Une pause.".into(),
            },
            crate::Cue {
                start_ms: 2100,
                end_ms: 3000,
                text: "Evengile".into(),
            },
        ];
        let words = vec![
            crate::Word {
                start_ms: 0,
                end_ms: 1000,
                text: "ce soir".into(),
            },
            crate::Word {
                start_ms: 1100,
                end_ms: 2000,
                text: "Une pause.".into(),
            },
            crate::Word {
                start_ms: 2100,
                end_ms: 3000,
                text: "Évangile".into(),
            },
        ];
        let mut review = crate::review::compare(&cues, &words).unwrap();
        rank_review(&mut review, &profile);
        assert!(review.differences[0].profile_term);
        assert_eq!(review.differences[0].cue_index, 2);
        assert!(!review.differences[1].profile_term);
        assert_eq!(cues[0].start_ms, 0);
        assert_eq!(cues[2].text, "Evengile");
    }
}
