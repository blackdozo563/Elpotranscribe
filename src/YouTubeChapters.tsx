import { useEffect, useRef, useState } from "react";
import { Button, TextField } from "./components/ui";
import type { Cue } from "./domain";
import { chapterTime, chaptersText, proposeChapters } from "./chapters";
import { number } from "./format";
export default function Chapters({
  cues,
  durationMs,
  close,
  copy,
}: {
  cues: Cue[];
  durationMs: number;
  close: () => void;
  copy: (text: string) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [chapters, setChapters] = useState(() =>
      proposeChapters(cues, durationMs),
    ),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      dialog.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="chapters-sheet"
      aria-labelledby="chapters-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <h2 id="chapters-title">Chapitres YouTube</h2>
      <p>
        Titres provisoires à relire. Les repères suivent les pauses d’au moins
        trois secondes entre les sous-titres et sont arrondis à la seconde pour
        YouTube.
      </p>
      {chapters.length === 0 ? (
        <p role="status">
          Les pauses disponibles ne permettent pas de proposer trois chapitres
          d’au moins dix secondes. Aucun repère supplémentaire n’a été créé.
        </p>
      ) : (
        <ol>
          {chapters.map((chapter, i) => (
            <li key={chapter.startMs}>
              <span className="mono">{chapterTime(chapter.startMs)}</span>
              <TextField
                aria-label={`Titre du chapitre ${number(i + 1)}`}
                value={chapter.title}
                maxLength={160}
                disabled={busy}
                onChange={(e) => {
                  setCopied(false);
                  setChapters(
                    chapters.map((c, n) =>
                      n === i ? { ...c, title: e.target.value } : c,
                    ),
                  );
                }}
              />
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="job-error">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite">
        {copied ? "Chapitres copiés" : ""}
      </p>
      <div className="button-row">
        <Button disabled={busy} onClick={close}>
          Fermer
        </Button>
        <Button
          variant="primary"
          disabled={
            !chapters.length || busy || chapters.some((c) => !c.title.trim())
          }
          onClick={() => {
            setBusy(true);
            setCopied(false);
            setError("");
            void (async () => {
              try {
                await copy(chaptersText(chapters, durationMs));
                setCopied(true);
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Copier les chapitres
        </Button>
      </div>
    </dialog>
  );
}
