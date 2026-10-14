import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { findMatches, replaceMatches } from "./search";
import {
  AudioLines,
  LayoutDashboard,
  Plus,
  History,
  ScanText,
  Boxes,
  Settings2,
  ShieldCheck,
  ArrowUpRight,
  Upload,
  FolderOpen,
  Play,
  Download,
  X,
  RotateCcw,
  LoaderCircle,
  Check,
  FileAudio,
  ChevronRight,
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
  type EditState,
  type Job,
  type Settings,
  type Snapshot,
  type ModelUpdate,
  time,
  parseTime,
  change,
  undo,
  redo,
  split,
  merge,
  validate,
} from "./domain";
const navigation = [
  "Tableau de bord",
  "Nouvelle transcription",
  "Mes transcriptions",
  "Double vérification",
  "Modèles IA",
  "Paramètres",
];
const icons = [LayoutDashboard, Plus, History, ScanText, Boxes, Settings2];
const localEngines = [
  { id: "ultra", name: "Parakeet Ultra", disabled: false },
  { id: "whisper-turbo", name: "Whisper large-v3-turbo Q5_0", disabled: false },
  { id: "whisper-small", name: "Whisper Small", disabled: false },
  { id: "whisper-base", name: "Whisper Base", disabled: false },
  {
    id: "qwen-0.6b",
    name: "Qwen3-ASR 0.6B · validation en cours",
    disabled: true,
  },
  {
    id: "qwen-1.7b",
    name: "Qwen3-ASR 1.7B · validation en cours",
    disabled: true,
  },
];
const engineName = (id: string) =>
  localEngines.find((engine) => engine.id === id)?.name ?? id;
const labels: Record<string, string> = {
  pending: "En attente",
  transcribing: "Transcription",
  completed: "Terminé",
  failed: "Erreur",
  cancelled: "Annulé",
};
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
  const confirmAndRun = (
    message: string,
    command: string,
    args?: Record<string, unknown>,
  ) => {
    void action("confirm_action", { message })
      .then((confirmed) => {
        if (confirmed === true) run(command, args);
      })
      .catch(() => {});
  };
  useEffect(() => {
    if (!desktop) return;
    let dispose: (() => void) | undefined;
    let closed = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
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
  const visibleJobs = page === 2 ? data.jobs : batch;
  const completed = batch.filter((j) => j.status === "completed").length;
  const pending = batch.filter((j) => j.status === "pending").length;
  const failed = batch.filter((j) => j.status === "failed").length;
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandmark">
            <AudioLines size={24} />
          </span>
          <div>
            ELPO<span>TRANSCRIBE</span>
            <small>VOTRE VOIX, EN TOUTES LETTRES</small>
          </div>
        </div>
        <p className="nav-label">ESPACE DE TRAVAIL</p>
        <nav>
          {navigation.map((label, i) => {
            const Icon = icons[i];
            return (
              <button
                key={label}
                className={page === i ? "nav active" : "nav"}
                onClick={() => setPage(i)}
              >
                <Icon size={18} />
                {label}
                {i === 2 && data.jobs.length > 0 && (
                  <span className="count">{data.jobs.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="privacy">
          <ShieldCheck size={24} />
          <strong>Votre audio reste chez vous.</strong>
          <p>
            Traitement local. Sans compte.
            <br />
            Sans abonnement.
          </p>
          <span>
            <i /> CONFIDENTIALITÉ PAR DÉFAUT
          </span>
        </div>
        <div className="version">
          <span className="tiny-logo">
            <AudioLines size={16} />
          </span>
          <div>
            ELPOTRANSCRIBE<small>Version 1.2.0 · Préversion</small>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Espace de travail <ChevronRight size={14} />{" "}
            <strong>{navigation[page]}</strong>
          </span>
          <span className="local">
            <i /> Mode local <ShieldCheck size={14} />
          </span>
        </header>
        <div className="content">
          {error && (
            <div role="alert" className="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button
                aria-label="Fermer le message"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
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
              <button onClick={() => setPage(4)}>Voir les modèles</button>
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
              job={selected}
              action={action}
              close={() => {
                setSelected(null);
                void refresh();
              }}
            />
          ) : (
            <>
              {(page === 0 || page === 1 || page === 2) && (
                <>
                  <div className="heading">
                    <div>
                      <div className="eyebrow">LA CLARTÉ COMMENCE ICI</div>
                      <h1>
                        {page === 2
                          ? "Mes transcriptions"
                          : "De l’audio aux mots."}
                      </h1>
                      <p>
                        Transcription audio intelligente. Précise, privée, entre
                        vos mains.
                      </p>
                    </div>
                    <div className="pill">
                      <AudioLines size={16} /> 100 % local après installation
                    </div>
                  </div>
                  <div className="stats">
                    <div>
                      <span className="stat-icon violet">
                        <FileAudio />
                      </span>
                      <section>
                        <small>Fichiers du lot</small>
                        <strong>
                          {batch.length}
                          <em> / 10</em>
                        </strong>
                      </section>
                    </div>
                    <div>
                      <span className="stat-icon green">
                        <Check />
                      </span>
                      <section>
                        <small>Transcriptions terminées</small>
                        <strong>{completed}</strong>
                      </section>
                    </div>
                    <div>
                      <span className="stat-icon amber">
                        <Boxes />
                      </span>
                      <section>
                        <small>Moteur local</small>
                        <strong className="stat-text">
                          {engineName(data.settings.engine)}
                        </strong>
                        <small>
                          {data.modelInstalled
                            ? "Installé · local"
                            : "À installer dans Modèles IA"}
                        </small>
                      </section>
                    </div>
                  </div>
                  {page !== 2 && (
                    <section className="import-card">
                      <div className="upload-icon">
                        <Upload size={27} />
                      </div>
                      <h2>Votre prochain projet commence ici</h2>
                      <p>
                        Glissez vos fichiers audio dans la fenêtre, ou
                        importez-les depuis votre Mac.
                      </p>
                      <div className="button-row">
                        <button
                          className="primary"
                          disabled={data.busy || working || batch.length >= 10}
                          onClick={() => run("import_files", { folder: false })}
                        >
                          <Plus size={17} />
                          Importer des fichiers audio
                        </button>
                        <button
                          disabled={data.busy || working}
                          onClick={() => run("import_files", { folder: true })}
                        >
                          <FolderOpen size={17} />
                          Choisir un dossier
                        </button>
                      </div>
                      <small>
                        MP3, WAV, M4A, AAC, FLAC, AIFF · OGG et WebM selon les
                        codecs macOS · 10 fichiers maximum
                      </small>
                    </section>
                  )}
                  <section className="panel engine-panel">
                    <div>
                      <span className="section-icon">
                        <AudioLines size={20} />
                      </span>
                      <div>
                        <h3>Moteur de transcription</h3>
                        <p>Un seul modèle chargé. Un fichier à la fois.</p>
                      </div>
                    </div>
                    <label>
                      Mode
                      <select
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

                        <option value="whisper-base">
                          Secours léger — Whisper Base · Metal
                        </option>
                        <option value="whisper-small">
                          Multilingue — Whisper Small · Metal
                        </option>
                      </select>
                    </label>
                    <label>
                      Langue
                      <select
                        aria-label="Langue"
                        value={data.settings.language}
                        disabled={data.busy}
                        onChange={(e) =>
                          run("save_settings", {
                            settings: {
                              ...data.settings,
                              language: e.target.value,
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
                      </select>
                    </label>
                  </section>
                  <section className="panel queue">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          File de transcription{" "}
                          <span className="number">{batch.length} / 10</span>
                        </h2>
                        <p>
                          {completed} terminé{completed > 1 ? "s" : ""} ·{" "}
                          {failed} erreur{failed > 1 ? "s" : ""}
                          {data.busy ? " · Traitement en cours" : ""}
                        </p>
                      </div>
                      <button
                        className="primary"
                        disabled={
                          !desktop ||
                          !data.modelInstalled ||
                          !pending ||
                          data.busy ||
                          working
                        }
                        onClick={() => run("start_batch")}
                      >
                        {data.busy ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <Play size={16} />
                        )}
                        {data.busy ? "Traitement en cours…" : "Tout transcrire"}
                      </button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>FICHIER AUDIO</th>
                            <th>DURÉE</th>
                            <th>STATUT</th>
                            <th>ACTIONS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleJobs.map((j) => (
                            <tr key={j.id}>
                              <td>
                                <div className="file-name">
                                  <span className="file-icon">
                                    <FileAudio size={19} />
                                  </span>
                                  <div>
                                    <strong>{j.name}</strong>
                                    <small>
                                      {(j.size / 1048576).toFixed(1)} Mo ·{" "}
                                      {j.engine}
                                      {j.dirty && j.status === "completed"
                                        ? " · SRT à enregistrer"
                                        : ""}
                                    </small>
                                    {j.timingNote && (
                                      <small>{j.timingNote}</small>
                                    )}
                                    {j.error && (
                                      <small className="job-error">
                                        {j.error}
                                      </small>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="mono">
                                {time(j.durationMs).slice(0, 8)}
                              </td>
                              <td>
                                <span className={`status ${j.status}`}>
                                  {j.status === "transcribing" && (
                                    <LoaderCircle size={12} className="spin" />
                                  )}
                                  {labels[j.status] ?? j.status}
                                </span>
                              </td>
                              <td>
                                <div className="row-actions">
                                  {j.status === "completed" && (
                                    <button onClick={() => setSelected(j)}>
                                      Ouvrir
                                      <ArrowUpRight size={13} />
                                    </button>
                                  )}
                                  {["failed", "cancelled"].includes(
                                    j.status,
                                  ) && (
                                    <button
                                      title="Réessayer"
                                      onClick={() =>
                                        run("retry_job", { id: j.id })
                                      }
                                    >
                                      <RotateCcw size={15} />
                                    </button>
                                  )}
                                  {["pending", "transcribing"].includes(
                                    j.status,
                                  ) ? (
                                    <button
                                      title="Annuler"
                                      onClick={() =>
                                        run("cancel_job", { id: j.id })
                                      }
                                    >
                                      <X size={16} />
                                    </button>
                                  ) : (
                                    <button
                                      title="Supprimer la transcription"
                                      aria-label={`Supprimer ${j.name}`}
                                      disabled={working}
                                      onClick={() =>
                                        confirmAndRun(
                                          "Supprimer cette transcription du lot et de l’historique ? Votre audio d’origine et les exports seront conservés.",
                                          "remove_job",
                                          { id: j.id },
                                        )
                                      }
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!visibleJobs.length && (
                        <div className="empty">
                          <FileAudio size={30} />
                          <strong>Une place pour chaque voix.</strong>
                          <span>
                            Importez un audio pour commencer votre première
                            transcription.
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="queue-footer">
                      <button
                        disabled={
                          !batch.some((j) =>
                            ["completed", "failed", "cancelled"].includes(
                              j.status,
                            ),
                          )
                        }
                        onClick={() => run("archive_completed")}
                      >
                        Nouveau lot
                      </button>
                      <small>
                        Nouveau lot conserve les résultats dans « Mes
                        transcriptions ». La corbeille les supprime de
                        l’historique, sans effacer les audios.
                      </small>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={data.settings.autoSave}
                          onChange={(e) =>
                            run("save_settings", {
                              settings: {
                                ...data.settings,
                                autoSave: e.target.checked,
                              },
                            })
                          }
                        />
                        Enregistrer les SRT dans les dossiers d’origine
                      </label>
                      <button
                        disabled={!completed}
                        onClick={() => run("export_zip")}
                      >
                        <Download size={16} />
                        Tous les SRT en ZIP
                      </button>
                    </div>
                  </section>
                  <div className="footnote">
                    <ShieldCheck size={15} />
                    Votre audio ne quitte jamais votre Mac en mode local.
                    <span>UTF-8 · Horodatages réels · Aucun quota</span>
                  </div>
                </>
              )}
              {page === 4 && (
                <>
                  <PageTitle
                    eyebrow="VOTRE STUDIO, HORS LIGNE"
                    title="Modèles IA"
                    text="Installez uniquement ce dont vous avez besoin. Aucun téléchargement automatique."
                  />
                  <section className="panel info-panel">
                    <div className="panel-heading">
                      <div>
                        <h3>Versions des modèles</h3>
                        <p>
                          Vérification des versions au démarrage et toutes les
                          six heures si activée. Aucun audio envoyé. Les poids
                          sont téléchargés uniquement à votre demande.
                        </p>
                      </div>
                      <button
                        disabled={!desktop || data.busy || working}
                        onClick={() => run("check_model_updates")}
                      >
                        <RotateCcw size={16} />
                        Vérifier les mises à jour
                      </button>
                    </div>
                  </section>
                  <section className="panel model-card">
                    <div className="model-top">
                      <span className="stat-icon violet">
                        <AudioLines />
                      </span>
                      <span className="pill">
                        RECOMMANDÉ · LANGUES EUROPÉENNES
                      </span>
                    </div>
                    <h2>Parakeet Ultra</h2>
                    <p>FluidInference · Core ML · Apple Neural Engine</p>
                    <p>
                      Français, anglais, espagnol, allemand, italien et
                      portugais. Pas de prise en charge de l’arabe. Le choix de
                      langue est un indice de filtrage du SDK, sans garantie de
                      détection.
                    </p>
                    <div className="model-details">
                      <span>macOS 14+ · ARM64</span>
                      <span>
                        Taille et mémoire réelles à mesurer sur Mac 8 Go
                      </span>
                      <span>
                        {data.installedModels?.includes("ultra")
                          ? "Fichiers installés · intégrité revérifiée avant chaque transcription"
                          : "Téléchargement explicite via HTTPS depuis Hugging Face"}
                      </span>
                    </div>
                    <div className="button-row">
                      <button
                        className="primary"
                        disabled={data.busy || working}
                        onClick={() => run("install_model")}
                      >
                        {working || data.busy ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : (
                          <Download size={16} />
                        )}
                        {data.installedModels?.includes("ultra")
                          ? "Vérifier / réinstaller"
                          : "Installer Parakeet Ultra"}
                      </button>
                      {data.installedModels?.includes("ultra") && (
                        <button
                          disabled={data.busy || working}
                          onClick={() =>
                            confirmAndRun(
                              "Supprimer les fichiers du modèle local ?",
                              "remove_model",
                            )
                          }
                        >
                          <Trash2 size={16} />
                          Supprimer
                        </button>
                      )}
                    </div>
                    <ModelUpdateStatus
                      update={data.modelUpdates?.find(
                        (update) => update.engine === "ultra",
                      )}
                      disabled={data.busy || working}
                      install={() => run("install_model", { engine: "ultra" })}
                    />
                    {working && operation === "install_model" && (
                      <p role="status">
                        Téléchargement et initialisation en cours. La durée
                        dépend de votre connexion ; aucun pourcentage estimé.
                      </p>
                    )}
                  </section>
                  {[
                    {
                      id: "whisper-turbo",
                      name: "Whisper large-v3-turbo Q5_0",
                      size: "Taille indiquée par les fichiers téléchargés",
                      description:
                        "Option de qualité pour le français et l’anglais US/UK. Quantification Q5 pour limiter la mémoire. Performances M2 8 Go à mesurer.",
                    },
                    {
                      id: "whisper-base",
                      name: "Whisper Base",
                      size: "142 Mio",
                      description: "Modèle léger de secours.",
                    },
                    {
                      id: "whisper-small",
                      name: "Whisper Small",
                      size: "466 Mio",
                      description:
                        "Alternative multilingue plus volumineuse que Base.",
                    },
                  ].map((model) => (
                    <section className="panel model-card" key={model.id}>
                      <h2>{model.name}</h2>
                      <p>whisper.cpp 1.8.3 · Metal · {model.size}</p>
                      <p>
                        {model.description} Français, anglais et arabe.
                        Traitement local et horodatages calculés par
                        whisper.cpp.
                      </p>
                      <p>
                        {data.installedModels?.includes(model.id)
                          ? "Installé · intégrité revérifiée avant chaque transcription"
                          : "Téléchargement explicite depuis Hugging Face"}
                      </p>
                      <div className="button-row">
                        <button
                          className="primary"
                          disabled={data.busy || working}
                          onClick={() =>
                            run("install_model", { engine: model.id })
                          }
                        >
                          <Download size={16} />
                          {data.installedModels?.includes(model.id)
                            ? `Réinstaller ${model.name}`
                            : `Installer ${model.name}`}
                        </button>
                        {data.installedModels?.includes(model.id) && (
                          <button
                            disabled={data.busy || working}
                            onClick={() =>
                              confirmAndRun(
                                `Supprimer ${model.name} du Mac ?`,
                                "remove_model",
                                { engine: model.id },
                              )
                            }
                          >
                            <Trash2 size={16} />
                            Supprimer
                          </button>
                        )}
                      </div>
                      <ModelUpdateStatus
                        update={data.modelUpdates?.find(
                          (update) => update.engine === model.id,
                        )}
                        disabled={data.busy || working}
                        install={() =>
                          run("install_model", { engine: model.id })
                        }
                      />
                    </section>
                  ))}
                  <div className="panel info-panel">
                    <h3>Intégrations avancées en attente</h3>
                    <p>
                      Qwen3-ASR 0.6B / 1.7B ne sont pas encore activés dans
                      cette version de développement. Ils ne sont pas
                      sélectionnables. Les validations sur M1 et M2 8 Go restent
                      nécessaires.
                    </p>
                  </div>
                </>
              )}
              {page === 3 && (
                <>
                  <PageTitle
                    eyebrow="CHAQUE MOT COMPTE"
                    title="Double vérification"
                    text="Gardez toujours le dernier mot sur vos transcriptions."
                  />
                  <VerificationPanel
                    data={data}
                    disabled={!desktop || working || data.busy}
                    run={run}
                    open={(job) => setSelected(job)}
                  />
                </>
              )}
              {page === 5 && (
                <>
                  <PageTitle
                    eyebrow="À VOTRE FAÇON"
                    title="Paramètres"
                    text="Les préférences et l’historique restent sur ce Mac."
                  />
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
                    <p>
                      Aucune télémétrie. Transcription entièrement locale. Aucun
                      audio envoyé à un service cloud.
                    </p>
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
}: {
  data: Snapshot;
  disabled: boolean;
  run: (command: string, args?: Record<string, unknown>) => void;
  open: (job: Job) => void;
}) {
  const [source, setSource] = useState("");
  const [primary, setPrimary] = useState("ultra");
  const [secondary, setSecondary] = useState("whisper-turbo");
  const sources = data.jobs.filter(
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
        <h2>Deux avis, un résultat sous votre contrôle</h2>
        <p>
          Les deux modèles analysent le même audio l’un après l’autre. Le moteur
          principal fournit le texte et les horodatages de référence. Un nouveau
          résultat est créé ; votre transcription précédente reste dans
          l’historique.
        </p>
        <label>
          Audio à vérifier
          <select
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
          </select>
        </label>
        <div className="form-grid">
          <label>
            Moteur principal
            <select
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
            </select>
          </label>
          <label>
            Second avis
            <select
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
            </select>
          </label>
        </div>
        <div className="button-row">
          <button
            disabled={disabled}
            onClick={() => {
              setPrimary(secondary);
              setSecondary(primary);
            }}
          >
            <RotateCcw size={16} />
            Inverser les moteurs
          </button>
          <button
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
          </button>
        </div>
        {primary === secondary && <p>Choisissez deux moteurs différents.</p>}
        {missing.length > 0 && (
          <div className="model-details">
            <span>Modèles à télécharger sur ce Mac :</span>
            {missing.map((engine) => (
              <button
                key={engine}
                disabled={disabled}
                onClick={() => run("install_model", { engine })}
              >
                <Download size={16} />
                Télécharger {engineName(engine)}
              </button>
            ))}
          </div>
        )}
        {(primary === "qwen-1.7b" || secondary === "qwen-1.7b") && (
          <p>
            Le modèle Qwen 1.7B peut demander davantage de mémoire. La
            compatibilité complète M1/M2 8 Go reste à valider.
          </p>
        )}
        <p>
          La comparaison ignore la casse et la ponctuation. Les divergences
          invitent à la relecture ; l’accord entre modèles ne garantit pas
          l’absence d’erreur.
        </p>
        {active && (
          <p role="status">
            Analyse locale en cours : {active.name}{" "}
            <button onClick={() => run("cancel_job", { id: active.id })}>
              Annuler la vérification
            </button>
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
                  : `${job.verification?.review.differences.length ?? 0} passage(s) à relire`}
          </p>
          {job.verificationError && <p>{job.verificationError}</p>}
          {job.verification?.review.approximate && (
            <p>
              Comparaison approximative sur un texte volumineux : vérifiez les
              passages signalés.
            </p>
          )}
          {job.status === "completed" && job.cues.length > 0 && (
            <button onClick={() => open(job)}>
              Ouvrir la relecture
              <ArrowUpRight size={16} />
            </button>
          )}
        </section>
      ))}
    </>
  );
}
function PageTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div className="heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
function ModelUpdateStatus({
  update,
  disabled,
  install,
}: {
  update: ModelUpdate | undefined;
  disabled: boolean;
  install: () => void;
}) {
  if (!update) return null;
  return (
    <div className="model-details" aria-label="Version du modèle">
      <span>
        {update.status === "available"
          ? "Mise à jour disponible"
          : update.status === "current"
            ? "Modèle à jour"
            : update.status === "unknown"
              ? "Version installée non identifiée : actualisez le modèle pour activer son suivi."
              : "Vérification indisponible ; votre modèle local reste utilisable."}
      </span>
      {update.installedRevision && (
        <span title={update.installedRevision}>
          Version installée :{" "}
          {update.installedRevision
            .split(" / ")
            .map((revision) => revision.slice(0, 12))
            .join(" / ")}
        </span>
      )}
      <span>
        Vérifié le {new Date(update.checkedAt).toLocaleString("fr-FR")}
      </span>
      {update.error && <span>{update.error}</span>}
      {["available", "unknown"].includes(update.status) && (
        <button className="primary" disabled={disabled} onClick={install}>
          <Download size={16} />
          {update.status === "available"
            ? "Télécharger la mise à jour"
            : "Actualiser le modèle local"}
        </button>
      )}
    </div>
  );
}
function Preferences({
  settings,
  save,
}: {
  settings: Settings;
  save: (s: Settings) => Promise<void>;
}) {
  const [s, setS] = useState(settings),
    [vocab, setVocab] = useState(settings.vocabulary.join("\n"));
  return (
    <section className="panel preferences">
      <h2>Sous-titres</h2>
      <label className="check-label">
        <input
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
          <select
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
          </select>
        </label>
        <label>
          Caractères par ligne
          <input
            type="number"
            min="12"
            max="80"
            value={s.subtitles.lineLength}
            onChange={(e) =>
              setS({
                ...s,
                subtitles: { ...s.subtitles, lineLength: +e.target.value },
              })
            }
          />
        </label>
        <label>
          Nombre de lignes
          <select
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
          </select>
        </label>
        <label>
          Durée cible maximum (secondes)
          <input
            type="number"
            min="1"
            max="10"
            value={s.subtitles.maxDurationMs / 1000}
            onChange={(e) =>
              setS({
                ...s,
                subtitles: {
                  ...s.subtitles,
                  maxDurationMs: +e.target.value * 1000,
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
      <h3>Vocabulaire de référence</h3>
      <p>
        Une entrée par ligne. Liste conservée pour votre relecture ; elle ne
        modifie pas automatiquement les paroles reconnues.
      </p>
      <textarea
        rows={5}
        aria-label="Vocabulaire personnalisé"
        value={vocab}
        onChange={(e) => setVocab(e.target.value)}
      />
      <button
        className="primary"
        onClick={() => {
          void save({
            ...s,
            vocabulary: [
              ...new Set(
                vocab
                  .split("\n")
                  .map((v) => v.trim())
                  .filter(Boolean),
              ),
            ],
          }).catch(() => {});
        }}
      >
        <Save size={16} />
        Enregistrer les préférences
      </button>
    </section>
  );
}
function Editor({
  job,
  action,
  close,
}: {
  job: Job;
  action: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  close: () => void;
}) {
  const [state, setState] = useState<EditState>({
      past: [],
      present: job.cues,
      future: [],
    }),
    [saved, setSaved] = useState(JSON.stringify(job.cues)),
    [position, setPosition] = useState(0),
    [error, setError] = useState(""),
    [selectedCue, setSelectedCue] = useState(0),
    [missing, setMissing] = useState(false);
  const audio = useRef<HTMLAudioElement>(null),
    textarea = useRef<Map<number, HTMLTextAreaElement>>(new Map());
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
    field?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
        searchInput.current?.focus();
      } else if (event.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const update = (cues: Cue[]) => setState((s) => change(s, cues));
  const attempt = (fn: () => void) => {
    try {
      fn();
      setError("");
    } catch (e) {
      setError(String(e));
    }
  };
  const save = async () => {
    validate(state.present);
    await action("save_edit", { id: job.id, cues: state.present });
    setSaved(JSON.stringify(state.present));
  };
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
  const leave = () => {
    if (!dirty) {
      close();
      return;
    }
    void action("confirm_action", {
      message: "Quitter sans enregistrer vos modifications ?",
    })
      .then((confirmed) => {
        if (confirmed === true) close();
      })
      .catch((e) => setError(String(e)));
  };
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  useEffect(() => {
    if (!(isTauri() || "__TAURI_INTERNALS__" in window)) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (!dirty) return;
        event.preventDefault();
        try {
          if (await invoke<boolean>("confirm_discard"))
            await getCurrentWindow().destroy();
        } catch (error) {
          setError(String(error));
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((error) => setError(String(error)));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [dirty]);
  const active = state.present.findIndex(
    (c) => c.startMs <= position && c.endMs > position,
  );
  return (
    <>
      <div className="editor-heading">
        <div>
          <button className="text-button" onClick={leave}>
            ← Retour à la file
          </button>
          <h1>{job.name}</h1>
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
        <button
          className="primary"
          onClick={() => {
            void save().catch((e) => setError(String(e)));
          }}
        >
          <Save size={16} />
          Enregistrer les modifications
        </button>
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
      {job.verification && (
        <section className="panel info-panel">
          <h3>Double vérification locale</h3>
          <p>
            {engineName(job.engine)} ·{" "}
            {engineName(job.verification.secondaryEngine)} :{" "}
            {job.verification.review.differences.length} passage(s) signalé(s).
            Écoutez puis choisissez les corrections. Les temps du moteur
            principal sont conservés.
          </p>
          {job.verification.review.approximate && (
            <p>Comparaison approximative ; relisez les passages signalés.</p>
          )}
        </section>
      )}
      <section className="panel player">
        <div className="subtitle-preview" dir="auto">
          {state.present[active]?.text || "Écoutez, relisez, affinez."}
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
            <button
              onClick={() => {
                void action("relink", { id: job.id })
                  .then(close)
                  .catch(() => {});
              }}
            >
              <Link size={14} />
              Relier l’audio
            </button>
          </p>
        )}
      </section>
      <div className="editor-toolbar">
        <div className="button-row">
          <button
            disabled={!state.past.length}
            onClick={() => setState(undo(state))}
          >
            <Undo2 size={15} />
            Annuler
          </button>
          <button
            disabled={!state.future.length}
            onClick={() => setState(redo(state))}
          >
            <Redo2 size={15} />
            Rétablir
          </button>
          <button
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
          </button>
          <button
            onClick={() =>
              attempt(() => update(merge(state.present, selectedCue)))
            }
          >
            <Combine size={15} />
            Fusionner
          </button>
          <button
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen(!searchOpen)}
          >
            Rechercher / Remplacer
          </button>
          <button
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
          </button>
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
              <input
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
              <input
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              />
            </label>
            <button
              disabled={!matches.length}
              onClick={() =>
                selectMatch(
                  (currentMatchIndex - 1 + matches.length) % matches.length,
                )
              }
            >
              Précédent
            </button>
            <button
              disabled={!matches.length}
              onClick={() =>
                selectMatch((currentMatchIndex + 1) % matches.length)
              }
            >
              Suivant
            </button>
            <button
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
            </button>
            <button
              disabled={!matches.length}
              onClick={() => {
                update(replaceMatches(state.present, matches, replacement));
                setMatchIndex(0);
              }}
            >
              Remplacer tout
            </button>
            <button
              aria-label="Fermer la recherche"
              onClick={() => setSearchOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="button-row search-options">
            <label>
              <input
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
              <input
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
                ? `${currentMatchIndex + 1} / ${matches.length} occurrences`
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
      <div className="cue-list">
        {state.present.map((cue, i) => (
          <section
            key={i}
            className={`cue panel ${active === i ? "playing" : ""} ${selectedCue === i ? "selected" : ""}`}
            onFocus={() => setSelectedCue(i)}
          >
            <button
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
            </button>
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
            <textarea
              ref={(el) => {
                if (el) textarea.current.set(i, el);
                else textarea.current.delete(i);
              }}
              aria-label={`Sous-titre ${i + 1}`}
              data-review={
                job.verification?.review.differences.some(
                  (difference) =>
                    difference.cueIndex === i &&
                    difference.primaryText === cue.text,
                )
                  ? "difference"
                  : undefined
              }
              dir="auto"
              value={cue.text}
              onChange={(e) =>
                update(
                  state.present.map((c, n) =>
                    n === i ? { ...c, text: e.target.value } : c,
                  ),
                )
              }
            />
            {job.verification?.review.differences
              .filter((difference) => difference.cueIndex === i)
              .map((difference) => {
                const reference = job.verification!.referenceCues[i];
                const unchanged =
                  reference &&
                  cue.text === difference.primaryText &&
                  cue.startMs === reference.startMs &&
                  cue.endMs === reference.endMs;
                return (
                  <div className="review-difference" key={i}>
                    <strong>
                      {unchanged
                        ? "À relire · divergence entre modèles"
                        : "Passage corrigé ou modifié"}
                    </strong>
                    <p>
                      Second avis :{" "}
                      {difference.candidateText ??
                        difference.alternativeText ??
                        "Passage absent du second résultat"}
                    </p>
                    {difference.candidateText && (
                      <button
                        disabled={!unchanged}
                        onClick={() =>
                          update(
                            state.present.map((current, index) =>
                              index === i
                                ? {
                                    ...current,
                                    text: difference.candidateText!,
                                  }
                                : current,
                            ),
                          )
                        }
                      >
                        Utiliser cette proposition
                      </button>
                    )}
                    {!difference.candidateText && (
                      <p>
                        La divergence traverse plusieurs sous-titres : corrigez
                        avec l’écoute et le texte de contexte.
                      </p>
                    )}
                  </div>
                );
              })}
            <button
              aria-label={`Supprimer le sous-titre ${i + 1}`}
              onClick={() => update(state.present.filter((_, n) => n !== i))}
            >
              <Trash2 size={15} />
            </button>
          </section>
        ))}
      </div>
      <section className="panel export-bar">
        <div>
          <strong>Vos mots, prêts à partir.</strong>
          <p>Chaque export conserve le nom de l’audio original.</p>
        </div>
        <div className="button-row">
          <button
            onClick={() => {
              void exportFile("txt", false);
            }}
          >
            TXT
          </button>
          <button
            onClick={() => {
              void exportFile("vtt", false);
            }}
          >
            VTT
          </button>
          <button
            onClick={() => {
              void exportFile("srt", false);
            }}
          >
            Exporter vers…
          </button>
          <button
            className="primary"
            onClick={() => {
              void exportFile("srt", true);
            }}
          >
            <Save size={16} />
            SRT à côté de l’audio
          </button>
          <button
            title="Afficher le dernier SRT dans le Finder"
            onClick={() => {
              void action("reveal", { id: job.id }).catch(() => {});
            }}
          >
            <FolderOpen size={16} />
          </button>
        </div>
      </section>
    </>
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
    <input
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
