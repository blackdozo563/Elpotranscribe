import { number } from "./format";
import { Button, Select, TextField, TextArea } from "./components/ui";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { VocabularyProfile } from "./domain";
export { cleanTerms } from "./vocabularyTerms";
import { cleanTerms, appendTerms } from "./vocabularyTerms";
import { showNativeMenu } from "./components/ui/showNativeMenu";
import { Plus, Minus, MoreHorizontal, X } from "lucide-react";
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
  const [filter, setFilter] = useState("");
  const [duplicates, setDuplicates] = useState<string[]>([]);
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
    setFilter("");
    setDuplicates([]);
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
  const add = (value = quick) => {
    const result = appendTerms(terms, value);
    setTermsText(result.terms.join("\n"));
    setDuplicates(result.duplicates);
    setQuick("");
  };
  const removeProfile = () =>
    void attempt(async () => {
      if (!draft?.id || draft.builtin) return;
      if (
        (await action("confirm_action", {
          message: `Supprimer le profil « ${draft.name} » ?`,
        })) !== true
      )
        return;
      await action("delete_profile", { id: draft.id });
      load(profiles.find((p) => p.id !== draft.id) ?? null);
    });
  const options = () =>
    void showNativeMenu([
      {
        id: "duplicate",
        text: "Dupliquer",
        enabled: !!edited && !saving,
        action: () => {
          if (edited)
            choose({
              ...edited,
              id: "",
              name: `${edited.name} — copie`,
              builtin: false,
            });
        },
      },
      {
        id: "reset",
        text: "Réinitialiser",
        enabled: !!draft?.builtin && !saving,
        action: () =>
          void attempt(async () => {
            if (
              (await action("confirm_action", {
                message:
                  "Réinitialiser ce profil avec les termes et la phrase de contexte fournis ?",
              })) === true
            )
              load(
                (await action("reset_profile", {
                  id: draft!.id,
                })) as VocabularyProfile,
              );
          }),
      },
      {
        id: "import",
        text: "Importer .json",
        enabled: !saving,
        action: () =>
          void attempt(async () => {
            if ((await guard.current?.()) === false) return;
            const profile = await action("import_profile");
            if (profile) load(profile as VocabularyProfile);
          }),
      },
      {
        id: "export",
        text: "Exporter .json",
        enabled: !!draft?.id && !dirty && !saving,
        action: () =>
          void attempt(async () => {
            await action("export_profile", { id: draft!.id });
          }),
      },
    ]).catch((error) => setError(String(error)));
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
        <aside className="profile-list" aria-label="Profils de vocabulaire">
          <div className="profile-items">
            {profiles.map((p) => (
              <Button
                key={p.id}
                disabled={saving}
                aria-pressed={draft?.id === p.id}
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
          </div>
          <div className="profile-list-actions">
            <Button
              aria-label="Nouveau profil"
              title="Nouveau profil"
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
              <Plus size={15} />
            </Button>
            <Button
              aria-label="Supprimer le profil"
              title="Supprimer le profil"
              disabled={!draft?.id || draft.builtin || saving}
              onClick={removeProfile}
            >
              <Minus size={15} />
            </Button>
            <Button
              aria-label="Options du profil"
              title="Options du profil"
              disabled={saving}
              onClick={options}
            >
              <MoreHorizontal size={16} />
            </Button>
          </div>
        </aside>
        {draft && (
          <section className="profile-detail" aria-label="Éditer le profil">
            <label>
              Nom du profil
              <TextField
                disabled={saving}
                aria-label="Nom du profil"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Langue du profil
              <Select
                disabled={saving}
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
            <section className="profile-terms" aria-label="Termes du profil">
              <div className="profile-terms-heading">
                <h2>Termes du profil</h2>
                <span>{number(terms.length)} termes</span>
              </div>
              {terms.length > 20 && (
                <TextField
                  type="search"
                  aria-label="Filtrer les termes"
                  placeholder="Filtrer les termes…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              )}
              <ul
                className="term-tags"
                aria-label="Termes enregistrés dans le profil"
              >
                {terms
                  .filter(
                    (term) =>
                      terms.length <= 20 ||
                      term
                        .toLocaleLowerCase()
                        .includes(filter.toLocaleLowerCase()),
                  )
                  .map((term) => (
                    <li key={term}>
                      <span>{term}</span>
                      <Button
                        variant="quiet"
                        aria-label={`Retirer ${term}`}
                        disabled={saving}
                        onClick={() => {
                          setTermsText(
                            terms.filter((t) => t !== term).join("\n"),
                          );
                          setDuplicates([]);
                        }}
                      >
                        <X size={12} />
                      </Button>
                    </li>
                  ))}
              </ul>
              {terms.length === 0 && (
                <p className="profile-help">Aucun terme.</p>
              )}
              {filter &&
                terms.length > 20 &&
                !terms.some(
                  (term) =>
                    terms.length <= 20 ||
                    term
                      .toLocaleLowerCase()
                      .includes(filter.toLocaleLowerCase()),
                ) && <p className="profile-help">Aucun terme ne correspond.</p>}
              <TextField
                aria-label="Ajouter un terme"
                placeholder="Ajouter un terme…"
                value={quick}
                disabled={saving}
                onChange={(e) => setQuick(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    add();
                  }
                }}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (/[\r\n]/u.test(text)) {
                    e.preventDefault();
                    add(text);
                  }
                }}
              />
              <p className="profile-help">
                Entrée pour ajouter. Vous pouvez coller plusieurs lignes.
              </p>
              <p className="profile-duplicates" role="status">
                {duplicates.length
                  ? `Déjà présent${duplicates.length > 1 ? "s" : ""} : ${duplicates.join(", ")}`
                  : ""}
              </p>
            </section>
            <label>
              Phrase de contexte
              <TextArea
                rows={4}
                disabled={saving}
                aria-label="Phrase de contexte"
                value={draft.whisper_prompt}
                onChange={(e) =>
                  setDraft({ ...draft, whisper_prompt: e.target.value })
                }
              />
            </label>
            <p className="profile-help">
              Cette phrase et les termes sont transmis à Whisper large-v3-turbo
              avant transcription pour orienter l’orthographe. Parakeet Ultra
              utilise les termes uniquement pour la relecture.
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
