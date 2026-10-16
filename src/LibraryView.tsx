import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  FileAudio,
  FolderOpen,
  Info,
  MoreHorizontal,
  Plus,
  Play,
  ArrowDown,
  ArrowUp,
} from "lucide-react";
import type { Job, Snapshot } from "./domain";
import {
  Button,
  Popover,
  StatusPill,
  TextField,
  showNativeMenu,
} from "./components/ui";
import { number, bytes, exactDate } from "./format";
import {
  statusLabels,
  libraryJobs,
  oversizedCues,
  type LibrarySort,
} from "./library";
const engineName = (id: string) =>
  id === "ultra"
    ? "Parakeet Ultra"
    : id === "whisper-turbo"
      ? "Whisper Turbo"
      : id;
const digits = new Intl.NumberFormat("fr-FR", {
  minimumIntegerDigits: 2,
  useGrouping: false,
});
const duration = (ms: number) =>
  [
    Math.floor(ms / 3600000),
    Math.floor(ms / 60000) % 60,
    Math.floor(ms / 1000) % 60,
  ]
    .map((n) => digits.format(n))
    .join(":");
export default function Library({
  data,
  disabled,
  desktop,
  settingsPanel,
  action,
  onOpen,
  onSecondOpinion,
  onError,
}: {
  data: Snapshot;
  disabled: boolean;
  desktop: boolean;
  settingsPanel: ReactNode;
  action: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
  onOpen: (job: Job) => void;
  onSecondOpinion: (job: Job) => void;
  onError: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LibrarySort>("date");
  const [descending, setDescending] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const jobs = libraryJobs(data.jobs, query, sort, descending),
    batch = data.jobs.filter((job) => !job.archived),
    pending = batch.filter((job) => job.status === "pending").length;
  const run = (command: string, args?: Record<string, unknown>) => {
    void action(command, args).catch((error) => onError(String(error)));
  };
  const remove = (job: Job) => {
    void action("confirm_action", {
      message:
        "Supprimer cette transcription du lot et de l’historique ? Votre audio d’origine et les exports seront conservés.",
    })
      .then((answer) => {
        if (answer === true) run("remove_job", { id: job.id });
      })
      .catch((error) => onError(String(error)));
  };
  const options = (job: Job) => {
    void showNativeMenu([
      {
        text: "Ouvrir",
        enabled: job.status === "completed",
        action: () => onOpen(job),
      },
      {
        text: "Demander un second avis",
        enabled: !disabled && job.status !== "transcribing",
        action: () => onSecondOpinion(job),
      },
      {
        text: "Exporter",
        enabled: !disabled && job.status === "completed",
        action: () =>
          run("export_job", { id: job.id, format: "srt", original: false }),
      },
      { item: "Separator" },
      {
        text: "Supprimer de l’historique",
        enabled: !disabled && !["transcribing"].includes(job.status),
        action: () => remove(job),
      },
    ]).catch((error) => onError(String(error)));
  };
  const finished = batch.filter((j) => j.status === "completed").length;
  const active = batch.find((j) => j.status === "transcribing");
  const profile =
    data.profiles?.find((p) => p.id === data.settings.selectedProfileId)
      ?.name ?? "Aucun profil";
  const languages: Record<string, string> = {
    auto: "Automatique",
    fr: "Français",
    en: "Anglais",
    es: "Espagnol",
    de: "Allemand",
    it: "Italien",
    pt: "Portugais",
    ar: "Arabe",
  };
  const summary = `${engineName(data.settings.engine)} · ${languages[data.settings.language] ?? data.settings.language} · ${profile}`;
  return (
    <section className="library" aria-label="Bibliothèque">
      <div className="library-toolbar">
        <Button
          variant="primary"
          disabled={disabled || batch.length >= 10}
          aria-label="Nouvelle transcription"
          aria-keyshortcuts="Meta+N"
          title="Nouvelle transcription (⌘N)"
          onClick={() => run("import_files", { folder: false })}
        >
          <Plus size={15} />
          Nouvelle transcription <kbd>⌘N</kbd>
        </Button>
        <TextField
          type="search"
          aria-label="Rechercher dans la bibliothèque"
          placeholder="Rechercher titres et texte"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="library-settings">
          <Button
            ref={anchor}
            className="library-summary"
            aria-label={`Réglages de transcription : ${summary}`}
            title={summary}
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <span>Réglages : {summary}</span>
          </Button>
          <Popover
            open={settingsOpen}
            onClose={closeSettings}
            anchorRef={anchor}
            label="Réglages de transcription"
          >
            {settingsPanel}
          </Popover>
        </div>
      </div>
      <div className="batch-summary" aria-label="Résumé du lot">
        <span>{number(batch.length)} / 10 fichiers dans le lot</span>
        <span>{number(finished)} terminé(s)</span>
        <span>{number(pending)} en attente</span>
      </div>
      {batch.length >= 8 && (
        <p className="batch-limit">
          {number(batch.length)} / {number(10)} fichiers dans le lot. Limite de
          dix fichiers ; Nouveau lot archive les résultats terminés pour libérer
          des places.
        </p>
      )}
      {active && <section className="transcription-progress" aria-label="Progression de la transcription">
        <strong>En cours : {active.name}</strong>
        <span role="status">{data.inferenceProgress?.jobId === active.id
          ? data.inferenceProgress.phase === "loading" ? "Chargement du modèle…"
            : data.inferenceProgress.phase === "preparing" ? "Préparation de l’audio…"
            : data.inferenceProgress.percent != null ? data.inferenceProgress.percent === 100 ? "Audio traité : 100 % — finalisation…" : `Transcription : ${data.inferenceProgress.percent} %` : "Transcription en cours…"
          : "Préparation du moteur…"}</span>
        {data.inferenceProgress?.jobId === active.id && data.inferenceProgress.percent != null
          ? <progress aria-label="Audio traité par le moteur" max={100} value={data.inferenceProgress.percent} />
          : <progress aria-label="Traitement en cours, pourcentage indisponible" />}
        <Button onClick={() => run("cancel_job", { id: active.id })}>Arrêter la transcription</Button>
      </section>}
      {(pending > 0 || data.busy) && (
        <div className="button-row library-run">
          <Button
            variant="primary"
            disabled={disabled || !desktop || !data.modelInstalled}
            onClick={() => run("start_batch")}
          >
            <Play size={14} />
            {data.busy ? "Traitement en cours…" : "Tout transcrire"}
          </Button>
        </div>
      )}
      {!data.jobs.length ? (
        <div className="library-empty import-card">
          <FileAudio size={32} />
          <h2>Aucune transcription</h2>
          <p>Glissez des fichiers audio dans la fenêtre.</p>
          <div className="button-row">
            <Button
              disabled={disabled}
              onClick={() => run("import_files", { folder: false })}
            >
              Importer des fichiers audio
            </Button>
            <Button
              disabled={disabled}
              onClick={() => run("import_files", { folder: true })}
            >
              <FolderOpen size={14} />
              Choisir un dossier
            </Button>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="library-table">
            <thead>
              <tr>
                {(
                  [
                    ["name", "Nom"],
                    ["duration", "Durée"],
                    ["engine", "Moteur"],
                    ["date", "Date"],
                    ["status", "Statut"],
                  ] as const
                ).map(([key, label]) => (
                  <th
                    key={key}
                    aria-sort={
                      sort === key
                        ? descending
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                  >
                    <Button
                      variant="quiet"
                      onClick={() => {
                        if (sort === key) setDescending((value) => !value);
                        else {
                          setSort(key);
                          setDescending(false);
                        }
                      }}
                    >
                      {label}
                      {sort === key &&
                        (descending ? (
                          <ArrowDown size={11} />
                        ) : (
                          <ArrowUp size={11} />
                        ))}
                    </Button>
                  </th>
                ))}
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const excess = oversizedCues(job, data.settings.subtitles);
                const info = excess
                  ? `${number(excess)} sous-titres dépassent la longueur ou la durée des réglages actuels.`
                  : job.timingNote;
                return (
                  <tr
                    key={job.id}
                    onDoubleClick={() => {
                      if (job.status === "completed") onOpen(job);
                    }}
                  >
                    <td>
                      <div className="library-file">
                        <strong title={job.name}>{job.name}</strong>
                        <small>
                          {bytes(job.size)} · {engineName(job.engine)}
                          {job.dirty && job.status === "completed"
                            ? " · SRT à enregistrer"
                            : ""}
                        </small>
                        {job.error && (
                          <details className={job.status === "completed" ? "export-warning" : "job-error"}>
                            <summary>{job.status === "completed" ? "SRT à enregistrer — voir le détail" : "Voir l’erreur"}</summary>
                            <small>{job.error}</small>
                          </details>
                        )}
                      </div>
                    </td>
                    <td className="mono">
                      {job.durationMs > 0 ? duration(job.durationMs) : "—"}
                    </td>
                    <td>{engineName(job.engine)}</td>
                    <td
                      title={
                        job.createdAt > 0
                          ? exactDate(job.createdAt * 1000)
                          : undefined
                      }
                    >
                      {job.createdAt > 0
                        ? new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(job.createdAt * 1000)
                        : "—"}
                    </td>
                    <td>
                      <StatusPill status={job.status}>
                        {statusLabels[job.status] ?? job.status}
                      </StatusPill>
                      {info && (
                        <span
                          role="img"
                          aria-label={info}
                          title={info}
                          className="library-info"
                        >
                          <Info size={13} />
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {job.status === "completed" && (
                          <Button onClick={() => onOpen(job)}>Ouvrir</Button>
                        )}
                        {["transcribing", "pending"].includes(job.status) && (
                          <Button
                            onClick={() => run("cancel_job", { id: job.id })}
                          >
                            Annuler
                          </Button>
                        )}
                        {["failed", "cancelled"].includes(job.status) && (
                          <Button
                            onClick={() => run("retry_job", { id: job.id })}
                          >
                            Réessayer
                          </Button>
                        )}
                        <Button
                          aria-label={`Options ${job.name}`}
                          onClick={() => options(job)}
                        >
                          <MoreHorizontal size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!jobs.length && (
            <p className="library-no-results" role="status">
              Aucune transcription ne correspond à la recherche.
            </p>
          )}
        </div>
      )}
      {!!data.jobs.length && (
        <footer className="queue-footer">
          <Button
            disabled={
              disabled ||
              !batch.some((job) =>
                ["completed", "failed", "cancelled"].includes(job.status),
              )
            }
            onClick={() => run("archive_completed")}
          >
            Nouveau lot
          </Button>
          <span>Les résultats archivés restent dans la bibliothèque.</span>
          <label className="check-label">
            <TextField
              type="checkbox"
              checked={data.settings.autoSave}
              disabled={disabled}
              onChange={(e) =>
                run("update_settings", {
                  patch: { autoSave: e.target.checked },
                })
              }
            />
            Enregistrer les SRT dans les dossiers d’origine
          </label>
          <Button
            disabled={
              disabled || !batch.some((job) => job.status === "completed")
            }
            onClick={() => run("export_zip")}
          >
            Tous les SRT du lot en ZIP
          </Button>
        </footer>
      )}
    </section>
  );
}
