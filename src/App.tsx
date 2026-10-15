import { ReviewText, ReviewPopover, ReviewGutter } from "./Review";
import {
  adjacentReview,
  nextPendingReview,
  isPendingReview,
} from "./reviewNavigation";
import { listReview, restoreReview, resolveReview } from "./reviewClient";
import type { ReviewDecision } from "./review";
import Library from "./Library";
import Models from "./Models";
import { number } from "./format";
import {
  Button,
  Popover,
  Select,
  TextField,
  TextArea,
  NumberStepper,
} from "./components/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { findMatches, replaceMatches } from "./search";
import Vocabulary from "./Vocabulary";
import {
  connectNativeMenu,
  menuEvent,
  editorMenuEvent,
  type MenuAction,
  type EditorMenuContext,
} from "./nativeMenu";
import { nearMisses } from "./profileReview";
import {
  AudioLines,
  LibraryBig,
  Plus,
  History,
  ScanText,
  Boxes,
  Settings2,
  ArrowUpRight,
  FolderOpen,
  Play,
  Download,
  X,
  RotateCcw,
  LoaderCircle,
  Check,
  FileAudio,
  BookOpen,
  PanelLeft,
  Save,
  Undo2,
  Redo2,
  Scissors,
  Combine,
  Trash2,
  Link,
  AlertCircle,
} from "lucide-react";
import {
  type Cue,
  type VocabularyProfile,
  type EditState,
  type Job,
  type Settings,
  type Snapshot,
  time,
  parseTime,
  change,
  changeReviewed,
  undo,
  redo,
  split,
  merge,
  validate,
} from "./domain";
const navigation = [
  "Bibliothèque",
  "Nouvelle transcription",
  "Bibliothèque",
  "Double vérification",
  "Modèles IA",
  "Paramètres",
  "Vocabulaire",
];
const icons = [LibraryBig, Plus, History, ScanText, Boxes, Settings2, BookOpen];
const localEngines = [
  { id: "ultra", name: "Parakeet Ultra", disabled: false },
  { id: "whisper-turbo", name: "Whisper large-v3-turbo Q5_0", disabled: false },
];
const engineName = (id: string) =>
  localEngines.find((engine) => engine.id === id)?.name ?? id;
const initial: Snapshot = {
  jobs: [],
  busy: false,
  modelInstalled: false,
  installedModels: [],
  modelUpdates: [],
  platform: "macOS 14+ · Apple Silicon",
  settings: {
    engine: "ultra",
    language: "fr",
    autoSave: false,
    autoModelUpdates: true,
    subtitles: { lineLength: 42, maxLines: 2, maxDurationMs: 5000 },
    vocabulary: [],
  },
};
export default function App() {
  const [page, setPage] = useState(0),
    [data, setData] = useState(initial),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [working, setWorking] = useState(false),
    [operation, setOperation] = useState<string | null>(null),
    [selected, setSelected] = useState<Job | null>(null);
  const profileGuard = useRef<(() => Promise<boolean>) | null>(null);
  const [verificationSource, setVerificationSource] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [localOpen, setLocalOpen] = useState(false);
  const localAnchor = useRef<HTMLButtonElement>(null);
  const closeLocal = useCallback(() => setLocalOpen(false), []);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [editorMenu, setEditorMenu] = useState<EditorMenuContext>({
    canUndo: false,
    canRedo: false,
    canExport: false,
  });
  const navigate = async (target: number) => {
    if ((await profileGuard.current?.()) === false) return false;
    setSelected(null);
    setPage(target);
    return true;
  };
  const desktop = isTauri() || "__TAURI_INTERNALS__" in window;
  const refresh = useCallback(async () => {
    if (desktop) setData(await invoke<Snapshot>("snapshot"));
  }, [desktop]);
  const lastModelCheck = useRef(0);
  useEffect(() => {
    if (
      !desktop ||
      !data.settings.autoModelUpdates ||
      data.busy ||
      !data.installedModels?.length
    )
      return;
    const check = () => {
      if (Date.now() - lastModelCheck.current < 6 * 60 * 60 * 1000) return;
      lastModelCheck.current = Date.now();
      void invoke("check_model_updates")
        .then(() => refresh())
        .catch(() => {});
    };
    check();
    const timer = setInterval(check, 6 * 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [
    desktop,
    data.settings.autoModelUpdates,
    data.busy,
    data.installedModels?.length,
    refresh,
  ]);
  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
    const timer = setInterval(
      () => refresh().catch((e) => setError(String(e))),
      1000,
    );
    return () => clearInterval(timer);
  }, [refresh]);
  const action = useCallback(
    async (command: string, args?: Record<string, unknown>) => {
      if (!desktop) {
        setError(
          "Ouvrez ELPOTRANSCRIBE.app sur un Mac Apple Silicon pour utiliser les fonctions natives.",
        );
        return;
      }
      setWorking(true);
      setOperation(command);
      setError("");
      setNotice("");
      try {
        const result = await invoke(command, args);
        await refresh();
        return result;
      } catch (e) {
        setError(String(e));
        throw e;
      } finally {
        setOperation(null);
        setWorking(false);
      }
    },
    [desktop, refresh],
  );
  const run = (command: string, args?: Record<string, unknown>) => {
    void action(command, args).catch(() => {});
  };
  useEffect(() => {
    if (!desktop) return;
    let dispose: (() => void) | undefined;
    let closed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        setDragOver(["enter", "over"].includes(event.payload.type));
        if (event.payload.type === "drop")
          void action("import_files", {
            folder: false,
            paths: event.payload.paths,
          }).catch(() => {});
      })
      .then((fn) => {
        if (closed) fn();
        else dispose = fn;
      })
      .catch((e) => setError(String(e)));
    return () => {
      closed = true;
      dispose?.();
    };
  }, [desktop, action]);
  const batch = data.jobs.filter((j) => !j.archived);
  const menuHandler = useRef<(action: MenuAction) => Promise<void>>(
    async () => {},
  );
  const closing = useRef(false);
  menuHandler.current = async (command) => {
    if (command === "close" || command === "quit") {
      if (closing.current) return;
      closing.current = true;
      try {
        if ((await profileGuard.current?.()) === false) return;
        if (
          data.busy &&
          (await action("confirm_action", {
            message:
              "Un traitement est en cours. L’arrêter et " +
              (command === "quit"
                ? "quitter Elpotranscribe ?"
                : "fermer la fenêtre ?"),
          })) !== true
        )
          return;
        await action("finish_window_action", { quit: command === "quit" });
      } finally {
        closing.current = false;
      }
    } else if (command === "sidebar") setSidebarHidden((value) => !value);
    else if (command === "settings") await navigate(5);
    else if (["new", "import-audio", "import-folder"].includes(command)) {
      if (data.busy || working || batch.length >= 10) return;
      if (await navigate(0))
        await action("import_files", { folder: command === "import-folder" });
    } else if (selected) {
      window.dispatchEvent(
        new CustomEvent(editorMenuEvent, { detail: command }),
      );
    }
  };
  useEffect(() => {
    const handler = (event: Event) => {
      void menuHandler
        .current((event as CustomEvent<MenuAction>).detail)
        .catch((e) => setError(String(e)));
    };
    window.addEventListener(menuEvent, handler);
    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (desktop)
      void connectNativeMenu()
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        })
        .catch((e) => setError(String(e)));
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener(menuEvent, handler);
    };
  }, [desktop]);
  useEffect(() => {
    if (!desktop) return;
    void invoke("sync_menu_context", {
      context: {
        editor: !!selected,
        canUndo: !!selected && editorMenu.canUndo,
        canRedo: !!selected && editorMenu.canRedo,
        canExport: !!selected && editorMenu.canExport && !data.busy && !working,
        canImport: !data.busy && !working && batch.length < 10,
      },
    }).catch((e) => setError(String(e)));
  }, [
    desktop,
    !!selected,
    editorMenu.canUndo,
    editorMenu.canRedo,
    editorMenu.canExport,
    data.busy,
    working,
    batch.length,
  ]);
  return (
    <div
      className={`shell${sidebarHidden ? " sidebar-hidden" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (event.dataTransfer.types.includes("Files")) setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        if (!desktop) run("import_files", { folder: false });
      }}
    >
      {dragOver && (
        <div className="drop-overlay" role="status">
          <FileAudio size={38} />
          <strong>Déposez vos fichiers audio</strong>
        </div>
      )}
      <aside className="sidebar">
        <div className="brand">
          <span className="brandmark">
            <AudioLines size={24} />
          </span>
          <div>
            ELPO<span>TRANSCRIBE</span>
          </div>
        </div>
        <nav>
          {[0, 3, 6, 4, 5].map((i) => {
            const label = navigation[i];
            const Icon = icons[i];
            return (
              <Button
                key={label}
                className={page === i ? "nav active" : "nav"}
                onClick={() => {
                  void navigate(i).catch((e) => setError(String(e)));
                }}
              >
                <Icon size={18} />
                {label}
                {i === 2 && data.jobs.length > 0 && (
                  <span className="count">{number(data.jobs.length)}</span>
                )}
              </Button>
            );
          })}
        </nav>
      </aside>
      <main>
        <header className="topbar" data-tauri-drag-region>
          <Button
            aria-label={
              sidebarHidden
                ? "Afficher la barre latérale"
                : "Masquer la barre latérale"
            }
            aria-expanded={!sidebarHidden}
            onClick={() => setSidebarHidden((value) => !value)}
          >
            <PanelLeft size={17} />
          </Button>
          <h1>{selected ? selected.name : navigation[page]}</h1>
          <div className="local-control">
            <Button
              ref={localAnchor}
              className="local"
              aria-expanded={localOpen}
              onClick={() => setLocalOpen((value) => !value)}
            >
              Mode local
            </Button>
            <Popover
              open={localOpen}
              onClose={closeLocal}
              anchorRef={localAnchor}
              label="Mode local"
            >
              <p>
                Les transcriptions sont traitées sur ce Mac. Aucune télémétrie.
              </p>
              <p>
                Les connexions réseau servent aux métadonnées de versions et aux
                téléchargements demandés.
              </p>
              <p>
                Vérification automatique des versions :{" "}
                {data.settings.autoModelUpdates ? "activée" : "désactivée"}.
              </p>
            </Popover>
          </div>
        </header>
        <div className="content">
          {error && (
            <div role="alert" className="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <Button
                aria-label="Fermer le message"
                onClick={() => setError("")}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              <Check size={18} />
              {notice}
            </div>
          )}
          {data.modelUpdates?.some(
            (update) =>
              update.status === "available" &&
              data.installedModels.includes(update.engine),
          ) && (
            <div role="status" className="alert">
              <Download size={18} />
              <span>
                Mise à jour de modèles disponible. Téléchargez les nouvelles
                versions sur ce Mac.
              </span>
              <Button
                onClick={() => {
                  void navigate(4);
                }}
              >
                Voir les modèles
              </Button>
            </div>
          )}
          {!desktop && (
            <div className="browser-notice">
              Interface de développement web · Les fichiers et les moteurs
              natifs sont accessibles dans l’application macOS.
            </div>
          )}
          {selected ? (
            <Editor
              profile={
                data.profiles?.find(
                  (p) =>
                    p.id ===
                    (selected.profileSnapshot?.id ??
                      data.settings.selectedProfileId),
                ) ??
                selected.profileSnapshot ??
                null
              }
              job={selected}
              guard={profileGuard}
              onMenuContext={setEditorMenu}
              action={action}
              close={() => {
                setSelected(null);
                void refresh();
              }}
            />
          ) : (
            <>
              {(page === 0 || page === 1 || page === 2) && (
                <Library
                  data={data}
                  disabled={data.busy || working}
                  desktop={desktop}
                  action={action}
                  onError={setError}
                  onOpen={setSelected}
                  onSecondOpinion={(job) => {
                    setVerificationSource(job.id);
                    setPage(3);
                  }}
                  settingsPanel={
                    <section className="panel engine-panel">
                      <label>
                        Mode
                        <Select
                          aria-label="Moteur de transcription"
                          value={data.settings.engine}
                          disabled={data.busy || working}
                          onChange={(e) =>
                            run("save_settings", {
                              settings: {
                                ...data.settings,
                                engine: e.target.value,
                                language:
                                  e.target.value === "ultra" &&
                                  data.settings.language === "ar"
                                    ? "auto"
                                    : data.settings.language,
                              },
                            })
                          }
                        >
                          <option value="ultra">Rapide — Parakeet Ultra</option>
                          <option value="whisper-turbo">
                            Qualité — Whisper large-v3-turbo · Q5_0 · Metal
                          </option>
                        </Select>
                      </label>
                      <label>
                        Langue
                        <Select
                          aria-label="Langue"
                          value={data.settings.language}
                          disabled={data.busy}
                          onChange={(e) =>
                            run("save_settings", {
                              settings: {
                                ...data.settings,
                                language: e.target.value,
                                selectedProfileId: null,
                              },
                            })
                          }
                        >
                          {[
                            ["auto", "Détection automatique"],
                            ["fr", "Français"],
                            ["en", "Anglais — US, UK et autres accents"],
                            ["es", "Espagnol"],
                            ["de", "Allemand"],
                            ["it", "Italien"],
                            ["pt", "Portugais"],
                            ...(data.settings.engine !== "ultra"
                              ? [["ar", "Arabe"]]
                              : []),
                          ].map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <label>
                        Profil de vocabulaire
                        <Select
                          aria-label="Profil de vocabulaire"
                          value={data.settings.selectedProfileId ?? ""}
                          disabled={data.busy || working}
                          onChange={(e) => {
                            const profile = data.profiles?.find(
                              (p) => p.id === e.target.value,
                            );
                            run("save_settings", {
                              settings: {
                                ...data.settings,
                                selectedProfileId: profile?.id ?? null,
                                language:
                                  profile?.language ?? data.settings.language,
                              },
                            });
                          }}
                        >
                          <option value="">Aucun profil</option>
                          {data.profiles?.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <Button
                        onClick={() => {
                          void navigate(6);
                        }}
                      >
                        Modifier le profil…
                      </Button>
                    </section>
                  }
                />
              )}
              {page === 4 && (
                <Models
                  data={data}
                  operation={operation}
                  disabled={!desktop || data.busy || working}
                  action={action}
                  onError={setError}
                />
              )}
              {page === 3 && (
                <>
                  <VerificationPanel
                    initialSourceId={verificationSource}
                    data={data}
                    disabled={!desktop || working || data.busy}
                    run={run}
                    open={(job) => setSelected(job)}
                  />
                </>
              )}
              {page === 6 && (
                <Vocabulary
                  initialProfileId={data.settings.selectedProfileId}
                  installed={data.installedModels.includes("whisper-turbo")}
                  busy={data.busy}
                  profiles={data.profiles ?? []}
                  action={action}
                  guard={profileGuard}
                />
              )}
              {page === 5 && (
                <>
                  <Preferences
                    settings={data.settings}
                    save={async (settings) => {
                      await action("save_settings", { settings });
                      setNotice("Préférences enregistrées sur ce Mac.");
                    }}
                  />
                  <section className="panel info-panel">
                    <h3>Application</h3>
                    <p>ELPOTRANSCRIBE 1.2.0 · {data.platform}</p>
                  </section>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
function VerificationPanel({
  data,
  disabled,
  run,
  open,
  initialSourceId,
}: {
  initialSourceId?: string;
  data: Snapshot;
  disabled: boolean;
  run: (command: string, args?: Record<string, unknown>) => void;
  open: (job: Job) => void;
}) {
  const [source, setSource] = useState(initialSourceId ?? "");
  const [primary, setPrimary] = useState("ultra");
  const [secondary, setSecondary] = useState("whisper-turbo");
  const preferredSource = data.jobs.find((job) => job.id === initialSourceId);
  const orderedSources = preferredSource
    ? [
        preferredSource,
        ...data.jobs.filter((job) => job.id !== preferredSource.id),
      ]
    : data.jobs;
  const sources = orderedSources.filter(
    (job, index, jobs) =>
      jobs.findIndex((other) => other.source === job.source) === index,
  );
  const selectedSource = source || sources[0]?.id || "";
  const missing = [...new Set([primary, secondary])].filter(
    (engine) => !data.installedModels.includes(engine),
  );
  const reports = data.jobs
    .filter((job) => job.verificationStatus)
    .slice()
    .reverse();
  const active = reports.find((job) => job.verificationStatus === "processing");
  return (
    <>
      <section className="panel preferences">
        <h2>Comparer deux moteurs</h2>
        <p>
          Les deux modèles analysent le même audio l’un après l’autre. Le moteur
          principal fournit le texte et les horodatages de référence. Un nouveau
          résultat est créé ; votre transcription précédente reste dans
          l’historique.
        </p>
        <label>
          Audio à vérifier
          <Select
            aria-label="Audio à vérifier"
            value={selectedSource}
            disabled={disabled}
            onChange={(event) => setSource(event.target.value)}
          >
            <option value="" disabled>
              Importez un audio pour commencer
            </option>
            {sources.map((job) => (
              <option value={job.id} key={job.id}>
                {job.name}
              </option>
            ))}
          </Select>
        </label>
        <div className="form-grid">
          <label>
            Moteur principal
            <Select
              aria-label="Moteur principal"
              value={primary}
              disabled={disabled}
              onChange={(event) => setPrimary(event.target.value)}
            >
              {localEngines.map((engine) => (
                <option
                  key={engine.id}
                  value={engine.id}
                  disabled={engine.disabled}
                >
                  {engine.name}
                </option>
              ))}
            </Select>
          </label>
          <label>
            Second avis
            <Select
              aria-label="Second avis"
              value={secondary}
              disabled={disabled}
              onChange={(event) => setSecondary(event.target.value)}
            >
              {localEngines.map((engine) => (
                <option
                  key={engine.id}
                  value={engine.id}
                  disabled={engine.disabled}
                >
                  {engine.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
        <div className="button-row">
          <Button
            disabled={disabled}
            onClick={() => {
              setPrimary(secondary);
              setSecondary(primary);
            }}
          >
            <RotateCcw size={16} />
            Inverser les moteurs
          </Button>
          <Button
            className="primary"
            disabled={
              disabled ||
              !selectedSource ||
              primary === secondary ||
              missing.length > 0
            }
            onClick={() =>
              run("start_verification", {
                id: selectedSource,
                primary,
                secondary,
              })
            }
          >
            <ScanText size={16} />
            Transcrire et comparer
          </Button>
        </div>
        {primary === secondary && <p>Choisissez deux moteurs différents.</p>}
        {missing.length > 0 && (
          <div className="model-details">
            <span>Modèles à télécharger sur ce Mac :</span>
            {missing.map((engine) => (
              <Button
                key={engine}
                disabled={disabled}
                onClick={() => run("install_model", { engine })}
              >
                <Download size={16} />
                Télécharger {engineName(engine)}
              </Button>
            ))}
          </div>
        )}
        <p>
          La comparaison ignore la casse et la ponctuation. Les divergences
          invitent à la relecture ; l’accord entre modèles ne garantit pas
          l’absence d’erreur.
        </p>
        {active && (
          <p role="status">
            Analyse locale en cours : {active.name}{" "}
            <Button onClick={() => run("cancel_job", { id: active.id })}>
              Annuler la vérification
            </Button>
          </p>
        )}
      </section>
      {reports.map((job) => (
        <section className="panel info-panel" key={job.id}>
          <h3>{job.name}</h3>
          <p>
            {engineName(job.engine)} ·{" "}
            {job.verification
              ? engineName(job.verification.secondaryEngine)
              : "Double vérification"}
          </p>
          <p>
            {job.verificationStatus === "processing"
              ? "Analyse séquentielle en cours…"
              : job.verificationStatus === "cancelled"
                ? "Vérification annulée"
                : job.verificationStatus === "failed"
                  ? "Vérification incomplète"
                  : `${number(job.verification?.review.differences.length ?? 0)} passage(s) à relire`}
          </p>
          {job.verificationError && <p>{job.verificationError}</p>}
          {job.verification?.review.approximate && (
            <p>
              Comparaison approximative sur un texte volumineux : vérifiez les
              passages signalés.
            </p>
          )}
          {job.status === "completed" && job.cues.length > 0 && (
            <Button onClick={() => open(job)}>
              Ouvrir la relecture
              <ArrowUpRight size={16} />
            </Button>
          )}
        </section>
      ))}
    </>
  );
}
function Preferences({
  settings,
  save,
}: {
  settings: Settings;
  save: (s: Settings) => Promise<void>;
}) {
  const [s, setS] = useState(settings);
  return (
    <section className="panel preferences">
      <h2>Sous-titres</h2>
      <label className="check-label">
        <TextField
          type="checkbox"
          checked={s.autoModelUpdates}
          onChange={(event) =>
            setS({ ...s, autoModelUpdates: event.target.checked })
          }
        />
        Rechercher automatiquement les mises à jour des modèles (aucun audio
        envoyé)
      </label>
      <div className="form-grid">
        <label>
          Préréglage
          <Select
            onChange={(e) => {
              const short = e.target.value === "short";
              setS({
                ...s,
                subtitles: {
                  lineLength: short ? 24 : 42,
                  maxLines: 2,
                  maxDurationMs: short ? 3000 : 5000,
                },
              });
            }}
          >
            <option value="standard">Standard / YouTube</option>
            <option value="short">TikTok / Reels / Sous-titres courts</option>
          </Select>
        </label>
        <label>
          Caractères par ligne
          <NumberStepper
            aria-label="Caractères par ligne"
            min={12}
            max={80}
            value={s.subtitles.lineLength}
            onValueChange={(value) =>
              setS({
                ...s,
                subtitles: { ...s.subtitles, lineLength: value },
              })
            }
          />
        </label>
        <label>
          Nombre de lignes
          <Select
            value={s.subtitles.maxLines}
            onChange={(e) =>
              setS({
                ...s,
                subtitles: { ...s.subtitles, maxLines: +e.target.value },
              })
            }
          >
            <option value="1">1</option>
            <option value="2">2</option>
          </Select>
        </label>
        <label>
          Durée cible maximum (secondes)
          <NumberStepper
            aria-label="Durée cible maximum (secondes)"
            min={1}
            max={10}
            value={s.subtitles.maxDurationMs / 1000}
            onValueChange={(value) =>
              setS({
                ...s,
                subtitles: {
                  ...s.subtitles,
                  maxDurationMs: value * 1000,
                },
              })
            }
          />
        </label>
      </div>
      <p>
        Les frontières utilisent les horodatages reconnus. Un mot long peut
        demander un réglage plus large.
      </p>
      <Button
        className="primary"
        onClick={() => {
          void save(s).catch(() => {});
        }}
      >
        <Save size={16} />
        Enregistrer les préférences
      </Button>
    </section>
  );
}
function Editor({
  profile,
  job,
  action,
  close,
  guard,
  onMenuContext,
}: {
  guard: React.MutableRefObject<(() => Promise<boolean>) | null>;
  onMenuContext: (context: EditorMenuContext) => void;
  job: Job;
  profile: VocabularyProfile | null;
  action: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  close: () => void;
}) {
  const [state, setState] = useState<EditState>({
      past: [],
      present: job.cues,
      future: [],
      reviewState: job.reviewState ?? null,
    }),
    [saved, setSaved] = useState(JSON.stringify(job.cues)),
    [position, setPosition] = useState(0),
    [error, setError] = useState(""),
    [selectedCue, setSelectedCue] = useState(0),
    [missing, setMissing] = useState(false);
  const audio = useRef<HTMLAudioElement>(null),
    textarea = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const [reviewMode, setReviewMode] = useState(false);
  const [activeDifference, setActiveDifference] = useState<string | null>(null);
  const [modifyingReview, setModifyingReview] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(!!job.reviewState);
  const [reviewAnchor, setReviewAnchor] = useState<HTMLButtonElement | null>(
    null,
  );
  const reviewButtons = useRef(new Map<string, HTMLButtonElement>());
  const reviewWorkspace = useRef<HTMLDivElement>(null);
  const revision = useRef(job.editRevision ?? 0);
  const editing = useRef(state);
  editing.current = state;
  const busyReview = useRef(!!job.reviewState);
  useEffect(() => {
    if (!job.reviewState) return;
    let mounted = true;
    void listReview(job.id)
      .then((document) => {
        if (!mounted) return;
        revision.current = document.revision;
        setState({
          past: [],
          present: document.cues,
          future: [],
          reviewState: document.reviewState,
        });
        setSaved(JSON.stringify(document.cues));
      })
      .catch((error) => {
        if (mounted) setError(String(error));
      })
      .finally(() => {
        if (mounted) {
          busyReview.current = false;
          setReviewBusy(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [job.id]);
  const differences = state.reviewState?.differences ?? [];
  const pendingReviews = differences.filter(isPendingReview).length;
  const activeReview =
    differences.find((d) => d.id === activeDifference) ?? null;
  const selectReview = (id: string) => {
    setReviewMode(true);
    setSearchOpen(false);
    setActiveDifference(id);
    setModifyingReview(false);
  };
  useEffect(() => {
    if (!reviewMode || !activeDifference) {
      setReviewAnchor(null);
      return;
    }
    if (reviewBusy) return;
    const anchor = reviewButtons.current.get(activeDifference) ?? null;
    setReviewAnchor(anchor);
    anchor?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
    anchor?.focus({ preventScroll: true });
  }, [reviewMode, activeDifference, reviewBusy]);
  const [selectedWord, setSelectedWord] = useState("");
  const profileKey = JSON.stringify(profile);
  const vocabularyMatches = useMemo(
    () => state.present.map((c) => nearMisses(c.text, profile)),
    [state.present, profileKey],
  );
  const [exportSaved, setExportSaved] = useState<string | null>(
    job.dirty ? null : JSON.stringify(job.cues),
  );
  const dirty = saved !== JSON.stringify(state.present);
  const needsExport = exportSaved !== JSON.stringify(state.present);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [matchIndex, setMatchIndex] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const matches = findMatches(state.present, query, {
    caseSensitive,
    wholeWord,
  });
  const currentMatchIndex = Math.min(
    matchIndex,
    Math.max(0, matches.length - 1),
  );
  const selectMatch = (index: number) => {
    const match = matches[index];
    if (!match) return;
    setMatchIndex(index);
    setSelectedCue(match.cue);
    const field = textarea.current.get(match.cue);
    field?.focus({ preventScroll: true });
    field?.setSelectionRange(match.start, match.end);
    field?.scrollIntoView({
      block: "center",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  const update = (cues: Cue[]) => {
    if (!busyReview.current) setState((s) => change(s, cues));
  };
  const attempt = (fn: () => void) => {
    try {
      fn();
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  const persistReviewFrame = async (frame: EditState) => {
    const document = await restoreReview(
      job.id,
      frame.present,
      frame.reviewState ?? null,
      revision.current,
    );
    revision.current = document.revision;
    setSaved(JSON.stringify(document.cues));
    return document;
  };
  const reviewOperation = async (operation: () => Promise<void>) => {
    if (busyReview.current) return;
    busyReview.current = true;
    setReviewBusy(true);
    setError("");
    try {
      await operation();
    } catch (error) {
      setError(String(error));
    } finally {
      busyReview.current = false;
      setReviewBusy(false);
    }
  };
  const historyEdit = (direction: "undo" | "redo") => {
    if (busyReview.current) return;
    const base = editing.current;
    const frame = direction === "undo" ? undo(base) : redo(base);
    if (frame === base) return;
    if (!base.reviewState) {
      setState(frame);
      return;
    }
    void reviewOperation(async () => {
      await persistReviewFrame(frame);
      setState(frame);
      setModifyingReview(false);
    });
  };
  const decideReview = (decision: ReviewDecision) => {
    if (!activeDifference) return;
    const id = activeDifference;
    void reviewOperation(async () => {
      const base = editing.current;
      // Flush manual edits first. A stale range must be rejected by Rust, never guessed.
      await persistReviewFrame(base);
      const document = await resolveReview(
        job.id,
        id,
        decision,
        revision.current,
      );
      revision.current = document.revision;
      setState(changeReviewed(base, document.cues, document.reviewState));
      setSaved(JSON.stringify(document.cues));
      setModifyingReview(false);
      const next = nextPendingReview(
        document.reviewState?.differences ?? [],
        id,
      );
      setActiveDifference(next ?? id);
    });
  };
  const listenReview = () => {
    const cue = activeReview && state.present[activeReview.cueIndex];
    if (audio.current && cue) {
      audio.current.currentTime = Math.max(0, cue.startMs - 1000) / 1000;
      void audio.current.play().catch((error) => setError(String(error)));
    }
  };
  const save = async () => {
    if (busyReview.current)
      throw new Error("Attendez la fin de l’enregistrement.");
    const frame = editing.current;
    validate(frame.present);
    busyReview.current = true;
    setReviewBusy(true);
    try {
      if (frame.reviewState) await persistReviewFrame(frame);
      else {
        await action("save_edit", { id: job.id, cues: frame.present });
        setSaved(JSON.stringify(frame.present));
      }
    } finally {
      busyReview.current = false;
      setReviewBusy(false);
    }
  };
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      // Text still being entered in the proposal has its own native undo history.
      if (
        modifyingReview &&
        (event.target as Element).closest(
          ".review-popover input, .review-popover textarea, .review-popover select",
        ) &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setReviewMode(false);
        setActiveDifference(null);
        setSearchOpen(true);
        searchInput.current?.focus();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        historyEdit(event.shiftKey ? "redo" : "undo");
      } else if (
        reviewMode &&
        activeReview &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        const target = event.target as HTMLElement;
        if (
          !target.closest(".review-workspace, .review-popover, .review-toolbar")
        )
          return;
        if (target.closest("input, textarea, select, [contenteditable=true]"))
          return;
        if (busyReview.current) {
          event.preventDefault();
          return;
        }
        if (
          (event.key === "Enter" || event.key === " ") &&
          target.closest(".review-popover button")
        )
          return;
        if (modifyingReview) {
          if (event.key === "Escape") {
            event.preventDefault();
            setModifyingReview(false);
            reviewAnchor?.focus();
          }
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          const next = adjacentReview(
            differences,
            activeDifference,
            event.shiftKey ? -1 : 1,
          );
          if (next) selectReview(next);
        } else if (event.key === "Enter") {
          event.preventDefault();
          if (activeReview.range && activeReview.source.secondaryText !== null)
            decideReview({ kind: "accept" });
        } else if (event.key === "Escape") {
          event.preventDefault();
          if (activeReview.range) decideReview({ kind: "keep" });
          else {
            setActiveDifference(null);
            reviewAnchor?.focus();
          }
        } else if (event.key.toLowerCase() === "m") {
          event.preventDefault();
          setModifyingReview(true);
        } else if (event.key === " ") {
          event.preventDefault();
          listenReview();
        }
      } else if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });
  const exportFile = async (format: string, original: boolean) => {
    try {
      await save();
      const result = await action("export_job", {
        id: job.id,
        format,
        original,
      });
      if (format === "srt" && typeof result === "string")
        setExportSaved(JSON.stringify(state.present));
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    const mayLeave = async () =>
      !busyReview.current &&
      (!dirty ||
        (await action("confirm_action", {
          message: "Quitter sans enregistrer vos modifications ?",
        })) === true);
    guard.current = mayLeave;
    return () => {
      if (guard.current === mayLeave) guard.current = null;
    };
  }, [dirty, action, guard]);
  const leave = () => {
    void (async () => {
      if ((await guard.current?.()) !== false) close();
    })().catch((e) => setError(String(e)));
  };
  let exportable = true;
  try {
    validate(state.present);
  } catch {
    exportable = false;
  }
  useEffect(() => {
    onMenuContext({
      canUndo: !reviewBusy && !!state.past.length,
      canRedo: !reviewBusy && !!state.future.length,
      canExport: !reviewBusy && exportable,
    });
  }, [
    state.past.length,
    state.future.length,
    exportable,
    reviewBusy,
    onMenuContext,
  ]);
  useEffect(() => {
    const handler = (event: Event) => {
      const command = (event as CustomEvent<MenuAction>).detail;
      if (
        (command === "undo" || command === "redo") &&
        modifyingReview &&
        document.activeElement?.closest(
          ".review-popover input, .review-popover textarea, .review-popover select",
        )
      )
        return;
      if (command === "undo") historyEdit("undo");
      if (command === "redo") historyEdit("redo");
      if (command === "find") {
        setReviewMode(false);
        setActiveDifference(null);
        setSearchOpen(true);
        searchInput.current?.focus();
      }
      if (command === "export" && exportable) void exportFile("srt", false);
    };
    window.addEventListener(editorMenuEvent, handler);
    return () => window.removeEventListener(editorMenuEvent, handler);
  });
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty || busyReview.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  const active = state.present.findIndex(
    (c) => c.startMs <= position && c.endMs > position,
  );
  return (
    <fieldset
      className="editor-scope"
      disabled={reviewBusy}
      aria-busy={reviewBusy}
    >
      <div className="editor-heading">
        <div>
          <Button className="text-button" onClick={leave}>
            ← Retour à la file
          </Button>

          <p>
            {job.engine} ·{" "}
            {job.modelVersion && (
              <span title={job.modelVersion}>
                version {job.modelVersion.slice(0, 12)} ·{" "}
              </span>
            )}
            {dirty ? "Modifications non enregistrées" : "Historique enregistré"}
            {needsExport ? " · Export SRT à mettre à jour" : ""}
          </p>
        </div>
        <Button
          className="primary"
          onClick={() => {
            void save().catch((e) => setError(String(e)));
          }}
        >
          <Save size={16} />
          Enregistrer les modifications
        </Button>
      </div>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      {job.timingNote && (
        <div className="panel info-panel" role="status">
          {job.timingNote}
        </div>
      )}
      {job.verification?.secondaryTimingNote && (
        <div className="panel info-panel" role="status">
          Second avis : {job.verification.secondaryTimingNote}
        </div>
      )}
      <section className="panel player">
        <div className="subtitle-preview" dir="auto">
          {state.present[active]?.text || "Aucun sous-titre à cet instant."}
        </div>
        <audio
          ref={audio}
          controls
          src={convertFileSrc(job.source)}
          onTimeUpdate={(e) =>
            setPosition(Math.round(e.currentTarget.currentTime * 1000))
          }
          onError={() => setMissing(true)}
        />
        <span className="mono">{time(position)}</span>
        {missing && (
          <p>
            Audio déplacé, supprimé ou non lisible par le lecteur.{" "}
            <Button
              onClick={() => {
                void action("relink", { id: job.id })
                  .then(close)
                  .catch(() => {});
              }}
            >
              <Link size={14} />
              Relier l’audio
            </Button>
          </p>
        )}
      </section>
      {profile && (
        <section className="panel info-panel">
          <strong>Profil de relecture : {profile.name}</strong>
          <p>
            Les propositions restent à valider à l’écoute ; elles ne remplacent
            rien automatiquement.
          </p>
          <Button
            disabled={!selectedWord}
            onClick={() => {
              void action("add_profile_term", {
                id: profile.id,
                term: selectedWord,
                jobId: job.id,
              })
                .then(() => setSelectedWord(""))
                .catch((e) => setError(String(e)));
            }}
          >
            Ajouter au profil
          </Button>
          {selectedWord && <span> « {selectedWord} »</span>}
        </section>
      )}
      <div className="editor-toolbar">
        <div className="button-row">
          <Button
            disabled={!state.past.length}
            onClick={() => historyEdit("undo")}
          >
            <Undo2 size={15} />
            Annuler
          </Button>
          <Button
            disabled={!state.future.length}
            onClick={() => historyEdit("redo")}
          >
            <Redo2 size={15} />
            Rétablir
          </Button>
          <Button
            onClick={() =>
              attempt(() =>
                update(
                  split(
                    state.present,
                    selectedCue,
                    position,
                    textarea.current.get(selectedCue)?.selectionStart ?? 0,
                  ),
                ),
              )
            }
          >
            <Scissors size={15} />
            Scinder au curseur
          </Button>
          <Button
            onClick={() =>
              attempt(() => update(merge(state.present, selectedCue)))
            }
          >
            <Combine size={15} />
            Fusionner
          </Button>
          {!!differences.length && (
            <Button
              aria-pressed={reviewMode}
              onClick={() => {
                if (reviewMode) {
                  setReviewMode(false);
                  setActiveDifference(null);
                } else
                  selectReview(
                    differences.find(isPendingReview)?.id ?? differences[0].id,
                  );
              }}
            >
              <ScanText size={15} />
              Relecture
            </Button>
          )}
          {!!differences.length && !reviewMode && (
            <span className="review-button-count">
              {number(differences.length)} divergences ·{" "}
              {number(differences.length - pendingReviews)} traitées
            </span>
          )}
          <Button
            aria-expanded={searchOpen}
            onClick={() => {
              setReviewMode(false);
              setActiveDifference(null);
              setSearchOpen(!searchOpen);
            }}
          >
            Rechercher / Remplacer
          </Button>
          <Button
            onClick={() => {
              const last = state.present.at(-1)?.endMs ?? 0;
              update([
                ...state.present,
                {
                  startMs: last + 1,
                  endMs: last + 2001,
                  text: "Nouveau sous-titre",
                },
              ]);
            }}
          >
            <Plus size={15} />
            Ajouter
          </Button>
        </div>
      </div>
      {searchOpen && (
        <section
          className="panel search-panel"
          aria-label="Rechercher et remplacer"
        >
          <div className="button-row">
            <label>
              Rechercher
              <TextField
                ref={searchInput}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setMatchIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches.length) {
                    e.preventDefault();
                    selectMatch(
                      e.shiftKey
                        ? (currentMatchIndex - 1 + matches.length) %
                            matches.length
                        : currentMatchIndex,
                    );
                  }
                }}
              />
            </label>
            <label>
              Remplacer par
              <TextField
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              />
            </label>
            <Button
              disabled={!matches.length}
              onClick={() =>
                selectMatch(
                  (currentMatchIndex - 1 + matches.length) % matches.length,
                )
              }
            >
              Précédent
            </Button>
            <Button
              disabled={!matches.length}
              onClick={() =>
                selectMatch((currentMatchIndex + 1) % matches.length)
              }
            >
              Suivant
            </Button>
            <Button
              disabled={!matches.length}
              onClick={() =>
                update(
                  replaceMatches(
                    state.present,
                    [matches[currentMatchIndex]],
                    replacement,
                  ),
                )
              }
            >
              Remplacer
            </Button>
            <Button
              disabled={!matches.length}
              onClick={() => {
                update(replaceMatches(state.present, matches, replacement));
                setMatchIndex(0);
              }}
            >
              Remplacer tout
            </Button>
            <Button
              aria-label="Fermer la recherche"
              onClick={() => setSearchOpen(false)}
            >
              <X size={16} />
            </Button>
          </div>
          <div className="button-row search-options">
            <label>
              <TextField
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => {
                  setCaseSensitive(e.target.checked);
                  setMatchIndex(0);
                }}
              />{" "}
              Respecter la casse
            </label>
            <label>
              <TextField
                type="checkbox"
                checked={wholeWord}
                onChange={(e) => {
                  setWholeWord(e.target.checked);
                  setMatchIndex(0);
                }}
              />{" "}
              Mot entier
            </label>
            <span role="status">
              {matches.length
                ? `${number(currentMatchIndex + 1)} / ${number(matches.length)} occurrences`
                : query
                  ? "Aucune occurrence"
                  : "Saisissez un texte à rechercher"}
            </span>
          </div>
          <small>
            Recherche dans toute la transcription · ⌘F / Ctrl+F · Les
            remplacements sont annulables. Les horodatages sont conservés.
          </small>
        </section>
      )}
      {reviewMode && (
        <div className="review-toolbar">
          <span>
            {number(differences.length)} divergences ·{" "}
            {number(differences.length - pendingReviews)} traitées
          </span>
          {pendingReviews === 0 && (
            <span className="review-complete" role="status">
              Relecture terminée{" "}
              <Button
                disabled={!exportable}
                onClick={() => void exportFile("srt", false)}
              >
                Exporter
              </Button>
            </span>
          )}
          <small>
            L’accord entre moteurs ne garantit pas l’absence d’erreur.
          </small>
          {job.verification?.review.approximate && (
            <small>Comparaison approximative : vérifiez à l’écoute.</small>
          )}
        </div>
      )}
      <div
        className={`review-workspace ${reviewMode ? "is-reviewing" : ""}`}
        ref={reviewWorkspace}
      >
        {reviewMode &&
          differences
            .filter((d) => d.cueIndex >= state.present.length)
            .map((d) => (
              <Button
                key={d.id}
                ref={(el) => {
                  if (el) reviewButtons.current.set(d.id, el);
                  else reviewButtons.current.delete(d.id);
                }}
                className="review-orphan"
                onClick={() => selectReview(d.id)}
              >
                Divergence à replacer dans un segment
              </Button>
            ))}
        <div className="cue-list">
          {state.present.map((cue, i) => (
            <section
              key={i}
              className={`cue panel ${active === i ? "playing" : ""} ${selectedCue === i ? "selected" : ""}`}
              onFocus={() => setSelectedCue(i)}
            >
              <Button
                className="cue-number"
                title="Écouter ce passage"
                onClick={() => {
                  if (audio.current) {
                    audio.current.currentTime = cue.startMs / 1000;
                    void audio.current.play().catch((e) => setError(String(e)));
                  }
                  setSelectedCue(i);
                }}
              >
                {String(i + 1).padStart(2, "0")}
                <Play size={12} />
              </Button>
              <div className="cue-timing">
                <TimeInput
                  label={`Début ${i + 1}`}
                  value={cue.startMs}
                  onChange={(value) =>
                    update(
                      state.present.map((c, n) =>
                        n === i ? { ...c, startMs: value } : c,
                      ),
                    )
                  }
                />
                <TimeInput
                  label={`Fin ${i + 1}`}
                  value={cue.endMs}
                  onChange={(value) =>
                    update(
                      state.present.map((c, n) =>
                        n === i ? { ...c, endMs: value } : c,
                      ),
                    )
                  }
                />
              </div>
              {reviewMode ? (
                <ReviewText
                  text={cue.text}
                  differences={differences.filter((d) => d.cueIndex === i)}
                  activeId={activeDifference}
                  register={(id, el) => {
                    if (el) reviewButtons.current.set(id, el);
                    else reviewButtons.current.delete(id);
                  }}
                  select={selectReview}
                />
              ) : (
                <>
                  <TextArea
                    ref={(el) => {
                      if (el) textarea.current.set(i, el);
                      else textarea.current.delete(i);
                    }}
                    aria-label={`Sous-titre ${i + 1}`}
                    dir="auto"
                    onSelect={(e) =>
                      setSelectedWord(
                        e.currentTarget.value
                          .slice(
                            e.currentTarget.selectionStart,
                            e.currentTarget.selectionEnd,
                          )
                          .trim(),
                      )
                    }
                    value={cue.text}
                    onChange={(e) =>
                      update(
                        state.present.map((c, n) =>
                          n === i ? { ...c, text: e.target.value } : c,
                        ),
                      )
                    }
                  />
                </>
              )}
              {!!vocabularyMatches[i]?.length && (
                <div className="profile-near-misses">
                  <strong>Vocabulaire · à relire</strong>
                  {vocabularyMatches[i].map((match) => (
                    <div key={`${match.start}-${match.term}`}>
                      <mark>{match.original}</mark> →{" "}
                      <Button
                        onClick={() =>
                          update(
                            state.present.map((c, n) =>
                              n === i
                                ? {
                                    ...c,
                                    text:
                                      c.text.slice(0, match.start) +
                                      match.term +
                                      c.text.slice(match.end),
                                  }
                                : c,
                            ),
                          )
                        }
                      >
                        Remplacer par {match.term}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                aria-label={`Supprimer le sous-titre ${i + 1}`}
                onClick={() => update(state.present.filter((_, n) => n !== i))}
              >
                <Trash2 size={15} />
              </Button>
            </section>
          ))}
        </div>
        {reviewMode && (
          <ReviewGutter
            differences={differences}
            buttons={reviewButtons}
            workspace={reviewWorkspace}
            select={selectReview}
          />
        )}
      </div>
      {reviewMode && activeReview && (
        <ReviewPopover
          key={activeReview.id}
          difference={activeReview}
          index={differences.findIndex((d) => d.id === activeReview.id)}
          total={differences.length}
          cues={state.present}
          anchor={reviewAnchor}
          busy={reviewBusy}
          modifying={modifyingReview}
          setModifying={setModifyingReview}
          close={() => {
            setActiveDifference(null);
            setModifyingReview(false);
          }}
          resolve={decideReview}
          listen={listenReview}
          engineName={engineName}
        />
      )}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {reviewMode && activeReview
          ? `Divergence ${number(differences.findIndex((d) => d.id === activeReview.id) + 1)} sur ${number(differences.length)} · ${isPendingReview(activeReview) ? "à traiter" : "traitée"}`
          : ""}
      </span>
      <section className="panel export-bar">
        <div>
          <strong>Exporter</strong>
          <p>Chaque export conserve le nom de l’audio original.</p>
        </div>
        <div className="button-row">
          <Button
            onClick={() => {
              void exportFile("txt", false);
            }}
          >
            TXT
          </Button>
          <Button
            onClick={() => {
              void exportFile("vtt", false);
            }}
          >
            VTT
          </Button>
          <Button
            onClick={() => {
              void exportFile("srt", false);
            }}
          >
            Exporter vers…
          </Button>
          <Button
            className="primary"
            onClick={() => {
              void exportFile("srt", true);
            }}
          >
            <Save size={16} />
            SRT à côté de l’audio
          </Button>
          <Button
            title="Afficher le dernier SRT dans le Finder"
            onClick={() => {
              void action("reveal", { id: job.id }).catch(() => {});
            }}
          >
            <FolderOpen size={16} />
          </Button>
        </div>
      </section>
    </fieldset>
  );
}
function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(time(value));
  useEffect(() => setText(time(value)), [value]);
  const parsed = parseTime(text);
  return (
    <TextField
      aria-label={label}
      aria-invalid={parsed === null}
      className="mono"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (parsed !== null && parsed !== value) onChange(parsed);
      }}
    />
  );
}
