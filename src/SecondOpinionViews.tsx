import { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, ScanText, X } from "lucide-react";
import { Button, Select } from "./components/ui";
import type { Job, Snapshot } from "./domain";
import { exactDate, number } from "./format";
import {
  opinionEngines,
  opinionEngineName,
  opinionPair,
  pendingInJob,
  reviewJobs,
  opinionStage,
  opinionElapsed,
} from "./secondOpinion";

export function SecondOpinionSheet({
  data,
  sourceId,
  disabled,
  close,
  models,
  start,
}: {
  data: Snapshot;
  sourceId: string;
  disabled: boolean;
  close: () => void;
  models: () => void;
  start: (id: string, primary: string, secondary: string) => Promise<void>;
}) {
  const sources = data.jobs.filter(
    (j) => ["pending", "completed", "failed", "cancelled"].includes(j.status),
  );
  const [source, setSource] = useState(sourceId || sources[0]?.id || "");
  const [pair, setPair] = useState(() =>
    opinionPair(
      data.installedModels,
      data.jobs.find((j) => j.id === sourceId)?.engine ?? data.settings.engine,
    ),
  );
  const [submitting, setSubmitting] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  const available = opinionEngines.filter((e) =>
    data.installedModels.includes(e.id),
  );
  const valid =
    sources.some((j) => j.id === source) &&
    available.some((e) => e.id === pair.primary) &&
    available.some((e) => e.id === pair.secondary) &&
    pair.primary !== pair.secondary;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="second-opinion-title"
      className="second-opinion-sheet"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) close();
      }}
    >
      <div className="sheet-heading">
        <h2 id="second-opinion-title">Demander un second avis</h2>
        <Button
          aria-label="Fermer le second avis"
          disabled={submitting}
          onClick={close}
        >
          <X size={15} />
        </Button>
      </div>
      <p>
        Les deux moteurs vont analyser l’audio l’un après l’autre. Le principal
        fournira le texte et les horodatages. Un nouveau résultat sera créé ; la
        transcription précédente restera dans la bibliothèque.
      </p>
      <label>
        Audio à vérifier
        <Select
          aria-label="Audio à vérifier"
          disabled={submitting || !sources.length}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          {!sources.length && (
            <option value="">Aucun audio importé</option>
          )}
          {sources.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name} · {opinionEngineName(j.engine)}
            </option>
          ))}
        </Select>
      </label>
      <div className="opinion-engine-pair">
        <label>
          Moteur principal
          <Select
            aria-label="Moteur principal"
            disabled={submitting || !available.length}
            value={pair.primary}
            onChange={(event) =>
              setPair(opinionPair(data.installedModels, event.target.value))
            }
          >
            {!available.length && (
              <option value="">Aucun moteur installé</option>
            )}
            {available.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </label>
        <Button
          aria-label="Inverser les moteurs"
          disabled={submitting || available.length < 2}
          onClick={() =>
            setPair({ primary: pair.secondary, secondary: pair.primary })
          }
        >
          <ArrowLeftRight size={17} />
        </Button>
        <label>
          Second avis
          <Select
            aria-label="Second avis"
            disabled={submitting || available.length < 2}
            value={pair.secondary}
            onChange={(event) => {
              const secondary = event.target.value;
              setPair({
                secondary,
                primary: available.find((e) => e.id !== secondary)?.id ?? "",
              });
            }}
          >
            {!pair.secondary && (
              <option value="">Un second moteur est nécessaire</option>
            )}
            {available
              .filter((e) => e.id !== pair.primary)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </Select>
        </label>
      </div>
      {!sources.length && (
        <p>Importez un audio dans la bibliothèque pour commencer.</p>
      )}
      {available.length < 2 && (
        <p>
          Installez deux moteurs différents avant de demander un second avis.{" "}
          <Button disabled={submitting} onClick={models}>
            Voir les modèles
          </Button>
        </p>
      )}
      {error && (
        <p role="alert" className="sheet-error">
          {error}
        </p>
      )}
      <div className="sheet-actions">
        <Button disabled={submitting} onClick={close}>
          Annuler
        </Button>
        <Button
          className="primary"
          disabled={disabled || submitting || !valid}
          onClick={() => {
            setSubmitting(true);
            setError("");
            void start(source, pair.primary, pair.secondary)
              .catch((error) => setError(String(error)))
              .finally(() => setSubmitting(false));
          }}
        >
          <ScanText size={15} />
          {submitting ? "Démarrage…" : "Transcrire et comparer"}
        </Button>
      </div>
    </dialog>
  );
}

export function ReviewInbox({
  data,
  disabled,
  request,
  open,
  cancel,
}: {
  data: Snapshot;
  disabled: boolean;
  request: () => void;
  open: (job: Job, review: boolean) => void;
  cancel: (id: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  const active = data.jobs.filter((j) => j.verificationStatus === "processing");
  const interrupted = data.jobs
    .filter((j) => ["failed", "cancelled"].includes(j.verificationStatus ?? ""))
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  const pending = reviewJobs(data.jobs);
  useEffect(() => {
    if (!active.length) return;
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, [active.length]);
  return (
    <section className="review-inbox" aria-label="Transcriptions à relire">
      <div className="inbox-heading">
        <span>{number(pending.length)} transcription(s) à relire</span>
        <Button disabled={disabled} onClick={request}>
          <ScanText size={15} />
          Demander un second avis
        </Button>
      </div>
      {active.map((job) => {
        const elapsed = opinionElapsed(
          job.verificationProgress?.startedAt,
          now,
        );
        return (
          <div className="opinion-progress" key={job.id}>
            <strong>{job.name}</strong>
            <span role="status">{opinionStage(job)}</span>
            {data.inferenceProgress?.jobId === job.id && data.inferenceProgress.percent != null && (
              <div className="transcription-progress">
                <span>{opinionEngineName(data.inferenceProgress.engine)} : {data.inferenceProgress.percent} %</span>
                <progress aria-label="Audio traité par le moteur de vérification" max={100} value={data.inferenceProgress.percent} />
              </div>
            )}
            <span className="mono">
              {elapsed
                ? `Temps écoulé : ${elapsed}`
                : "Temps écoulé indisponible"}
            </span>
            <Button onClick={() => cancel(job.id)}>
              Annuler la vérification
            </Button>
          </div>
        );
      })}
      {!pending.length && !active.length && (
        <div className="inbox-empty">
          <h2>Aucune divergence à traiter</h2>
          <p>
            Demandez un second avis pour comparer deux transcriptions du même
            audio, puis choisissez les lectures à conserver.
          </p>
        </div>
      )}
      {pending.length > 0 && (
        <table className="review-inbox-table">
          <thead>
            <tr>
              <th>Transcription</th>
              <th>À traiter</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((job) => (
              <tr key={job.id}>
                <td>
                  <Button
                    className="text-button"
                    onClick={() => open(job, true)}
                  >
                    {job.name}
                  </Button>
                </td>
                <td>{number(pendingInJob(job))}</td>
                <td>{exactDate(job.createdAt * 1000)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {interrupted.map((job) => (
        <div className="opinion-interrupted" key={job.id}>
          <strong>{job.name}</strong>
          <span>
            {job.verificationStatus === "cancelled"
              ? "Vérification annulée"
              : "Vérification incomplète"}
          </span>
          {job.verificationError && <p>{job.verificationError}</p>}
          {job.status === "completed" && job.cues.length > 0 && (
            <Button onClick={() => open(job, false)}>
              Ouvrir la transcription principale
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
