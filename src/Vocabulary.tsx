import { number } from "./format";
import { Button, Select, TextField, TextArea } from "./components/ui";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { VocabularyProfile } from "./domain";
export const cleanTerms = (text: string) => {
  const seen = new Set<string>();
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(
      (s) =>
        s &&
        !seen.has(s.toLocaleLowerCase()) &&
        !!seen.add(s.toLocaleLowerCase()),
    );
};
export const profilePrompt = (p: VocabularyProfile) =>
  [p.whisper_prompt.trim(), cleanTerms(p.terms.join("\n")).join(", ")]
    .filter(Boolean)
    .join("\n");
type Action = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;
export default function Vocabulary({
  profiles,
  action,
  guard,
  installed,
  busy,
  initialProfileId,
}: {
  profiles: VocabularyProfile[];
  initialProfileId?: string | null;
  installed: boolean;
  busy: boolean;
  action: Action;
  guard: MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const initialProfile =
    profiles.find((p) => p.id === initialProfileId) ?? profiles[0];
  const [draft, setDraft] = useState<VocabularyProfile | null>(
    initialProfile ?? null,
  );
  const [original, setOriginal] = useState<VocabularyProfile | null>(
    initialProfile ?? null,
  );
  const [termsText, setTermsText] = useState(
    initialProfile?.terms.join("\n") ?? "",
  );
  const [quick, setQuick] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const terms = cleanTerms(termsText);
  const edited = draft ? { ...draft, terms } : null;
  const dirty =
    !!edited &&
    (!edited.id || JSON.stringify(edited) !== JSON.stringify(original));
  const load = (profile: VocabularyProfile | null) => {
    setDraft(profile);
    setOriginal(profile);
    setTermsText(profile?.terms.join("\n") ?? "");
    setQuick("");
    setError("");
  };
  useEffect(() => {
    if (!draft && profiles.length) load(profiles[0]);
  }, [profiles, draft]);
  useEffect(() => {
    const mayLeave = async () =>
      !dirty ||
      (await action("confirm_action", {
        message: "Quitter le profil sans enregistrer les modifications ?",
      })) === true;
    guard.current = mayLeave;
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      guard.current = null;
      window.removeEventListener("beforeunload", before);
    };
  }, [dirty, guard, action]);
  const attempt = async (work: () => Promise<void>) => {
    setSaving(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };
  const choose = (profile: VocabularyProfile) => {
    void attempt(async () => {
      if ((await guard.current?.()) !== false) load(profile);
    });
  };
  const add = () => {
    const value = quick.trim();
    if (value) {
      setTermsText(cleanTerms(termsText + "\n" + value).join("\n"));
      setQuick("");
    }
  };
  const promptBytes = edited
    ? new TextEncoder().encode(profilePrompt(edited)).length
    : 0;
  const promptText = edited ? profilePrompt(edited) : "";
  const latestPrompt = useRef(promptText);
  latestPrompt.current = promptText;
  const [counted, setCounted] = useState<{
    text: string;
    count: number;
    used: number;
    limit: number;
  } | null>(null);
  const [countError, setCountError] = useState("");
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  useEffect(() => {
    if (
      !installed ||
      busy ||
      counted?.text === promptText ||
      failedPrompt === promptText
    )
      return;
    const timer = setTimeout(() => {
      void action("prompt_info", { prompt: promptText })
        .then((result) => {
          if (
            latestPrompt.current === promptText &&
            result &&
            typeof result === "object" &&
            "count" in result
          ) {
            setCounted({
              text: promptText,
              ...(result as { count: number; used: number; limit: number }),
            });
            setCountError("");
          }
        })
        .catch(() => {
          if (latestPrompt.current === promptText) {
            setCountError("Compteur exact temporairement indisponible.");
            setFailedPrompt(promptText);
          }
        });
    }, 1200);
    return () => clearTimeout(timer);
  }, [promptText, installed, busy, counted?.text, failedPrompt, action]);
  return (
    <>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="vocabulary-layout">
        <aside
          className="panel profile-list"
          aria-label="Profils de vocabulaire"
        >
          {profiles.map((p) => (
            <Button
              key={p.id}
              className={
                draft?.id === p.id ? "profile-item active" : "profile-item"
              }
              onClick={() => choose(p)}
            >
              <strong>{p.name}</strong>
              <span>
                {p.language.toUpperCase()} · {number(p.terms.length)} termes
                {p.builtin ? " · Fourni" : ""}
              </span>
            </Button>
          ))}
          <div className="button-row">
            <Button
              disabled={saving}
              onClick={() =>
                choose({
                  id: "",
                  name: "Nouveau profil",
                  language: "fr",
                  terms: [],
                  whisper_prompt: "",
                  builtin: false,
                })
              }
            >
              Nouveau profil
            </Button>
            <Button
              disabled={!edited || saving}
              onClick={() =>
                edited &&
                choose({
                  ...edited,
                  id: "",
                  name: `${edited.name} — copie`,
                  builtin: false,
                })
              }
            >
              Dupliquer
            </Button>
            <Button
              disabled={!draft?.id || draft.builtin || saving}
              onClick={() =>
                void attempt(async () => {
                  if (
                    (await action("confirm_action", {
                      message: `Supprimer le profil « ${draft!.name} » ?`,
                    })) !== true
                  )
                    return;
                  await action("delete_profile", { id: draft!.id });
                  load(profiles.find((p) => p.id !== draft!.id) ?? null);
                })
              }
            >
              Supprimer
            </Button>
            {draft?.builtin && (
              <Button
                disabled={saving}
                onClick={() =>
                  void attempt(async () => {
                    if (
                      (await action("confirm_action", {
                        message:
                          "Réinitialiser ce profil avec les termes et l’invite fournis ?",
                      })) === true
                    )
                      load(
                        (await action("reset_profile", {
                          id: draft.id,
                        })) as VocabularyProfile,
                      );
                  })
                }
              >
                Réinitialiser
              </Button>
            )}
            <Button
              disabled={saving}
              onClick={() =>
                void attempt(async () => {
                  if ((await guard.current?.()) === false) return;
                  const p = await action("import_profile");
                  if (p) load(p as VocabularyProfile);
                })
              }
            >
              Importer .json
            </Button>
            <Button
              disabled={!draft?.id || dirty || saving}
              onClick={() =>
                void attempt(async () => {
                  await action("export_profile", { id: draft!.id });
                })
              }
            >
              Exporter .json
            </Button>
          </div>
        </aside>
        {draft && (
          <section
            className="panel profile-detail"
            aria-label="Éditer le profil"
          >
            <label>
              Nom du profil
              <TextField
                aria-label="Nom du profil"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Langue du profil
              <Select
                aria-label="Langue du profil"
                value={draft.language}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    language: e.target.value as "fr" | "en",
                  })
                }
              >
                <option value="fr">Français</option>
                <option value="en">Anglais</option>
              </Select>
            </label>
            <label>
              Termes du profil
              <TextArea
                rows={10}
                aria-label="Termes du profil"
                value={termsText}
                onChange={(e) => setTermsText(e.target.value)}
                spellCheck={false}
              />
            </label>
            <small role="status">
              {number(terms.length)} termes · Une entrée par ligne ; doublons et
              lignes vides ignorés.
            </small>
            <div className="button-row">
              <TextField
                aria-label="Ajouter un terme"
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              <Button onClick={add}>+ Ajouter</Button>
            </div>
            <label>
              Invite Whisper
              <TextArea
                rows={4}
                aria-label="Invite Whisper"
                value={draft.whisper_prompt}
                onChange={(e) =>
                  setDraft({ ...draft, whisper_prompt: e.target.value })
                }
              />
            </label>
            <p>
              Cette invite et les termes sont transmis à Whisper avant
              transcription pour orienter l’orthographe. Ultra utilise les
              termes uniquement pour la relecture.
            </p>
            <small role="status">
              {counted?.text === promptText
                ? `${number(counted.count)} tokens · ${number(counted.used)} transmis · limite ${number(counted.limit)}`
                : installed
                  ? busy
                    ? "Comptage disponible après le traitement en cours."
                    : "Calcul des tokens Whisper…"
                  : `≤ ${number(promptBytes)} tokens (borne UTF-8 prudente). Installez Whisper Turbo pour le comptage exact.`}{" "}
              {countError}
            </small>
            {(counted?.text === promptText
              ? counted.count > counted.limit
              : promptBytes > 224) && (
              <p className="alert" role="status">
                L’invite et les termes peuvent dépasser la limite. Whisper les
                tronquera à une frontière de token ; privilégiez les termes
                importants au début.
              </p>
            )}
            <div className="button-row">
              <Button
                className="primary"
                disabled={saving || !draft.name.trim()}
                onClick={() =>
                  void attempt(async () =>
                    load(
                      (await action("save_profile", {
                        profile: edited,
                      })) as VocabularyProfile,
                    ),
                  )
                }
              >
                Enregistrer
              </Button>
              <Button
                disabled={saving || !dirty}
                onClick={() =>
                  load(original?.id ? original : (profiles[0] ?? null))
                }
              >
                Annuler
              </Button>
              <span>
                {dirty ? "Modifications non enregistrées" : "Profil enregistré"}
              </span>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
