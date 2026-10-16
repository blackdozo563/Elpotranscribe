import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Select, TextArea } from "./components/ui";
import type { Cue } from "./domain";
import type { ReviewDecision, ReviewDifference, ReviewRange } from "./review";
import {
  isPendingReview,
  reviewPieces,
  moveReviewSelection,
} from "./reviewNavigation";
import { number } from "./format";
import { Play, X } from "lucide-react";

export function ReviewText({
  text,
  differences,
  activeId,
  register,
  select,
}: {
  text: string;
  differences: ReviewDifference[];
  activeId: string | null;
  register: (id: string, element: HTMLButtonElement | null) => void;
  select: (id: string) => void;
}) {
  const word = (d: ReviewDifference, content: string) => (
    <button
      key={d.id}
      type="button"
      ref={(el) => register(d.id, el)}
      data-difference-id={d.id}
      className={`review-word ${isPendingReview(d) ? "is-pending" : "is-resolved"} ${activeId === d.id ? "is-active" : ""} ${!d.range ? "is-unplaced" : ""}`}
      aria-label={`Divergence : ${content || "ajout ou suppression"} · ${d.status === "needsReview" ? "à revoir" : isPendingReview(d) ? "à traiter" : "traitée"}`}
      aria-haspopup="dialog"
      aria-expanded={activeId === d.id}
      onClick={() => select(d.id)}
    >
      {content || "∅"}
    </button>
  );
  return (
    <div className="review-text" dir="auto">
      {differences.filter((d) => !d.range).map((d) => word(d, "À revoir"))}
      {reviewPieces(text, differences).map((piece, i) =>
        piece.difference ? (
          word(piece.difference, piece.text)
        ) : (
          <span key={`text-${i}`}>{piece.text}</span>
        ),
      )}
    </div>
  );
}

export function ReviewPopover({
  difference,
  index,
  total,
  cues,
  anchor,
  busy,
  modifying,
  setModifying,
  close,
  resolve,
  listen,
  engineName,
}: {
  difference: ReviewDifference;
  index: number;
  total: number;
  cues: Cue[];
  anchor: HTMLButtonElement | null;
  busy: boolean;
  modifying: boolean;
  setModifying: (value: boolean) => void;
  close: () => void;
  resolve: (decision: ReviewDecision) => void;
  listen: () => void;
  engineName: (id: string) => string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [replacement, setReplacement] = useState(
    difference.currentText ?? difference.source.primaryText,
  );
  const [selection, setSelection] = useState<{
    cueIndex: number;
    range: ReviewRange;
  } | null>(null);
  const [cueIndex, setCueIndex] = useState(
    Math.min(difference.cueIndex, Math.max(0, cues.length - 1)),
  );
  const [placement, setPlacement] = useState({ left: 16, top: 16 });
  useEffect(() => {
    setReplacement(difference.currentText ?? difference.source.primaryText);
    setSelection(null);
    setCueIndex(Math.min(difference.cueIndex, Math.max(0, cues.length - 1)));
    panel.current?.focus({ preventScroll: true });
  }, [difference.id, difference.currentText]);
  useEffect(() => {
    if (modifying) input.current?.focus();
  }, [modifying]);
  useLayoutEffect(() => {
    const reposition = () => {
      if (!anchor || !panel.current) return;
      const rect = anchor.getBoundingClientRect(),
        size = panel.current.getBoundingClientRect();
      const gap = 12;
      const fitsRight =
        rect.right + gap + size.width <= window.innerWidth - gap;
      const fitsLeft = rect.left - gap - size.width >= gap;
      const side = fitsRight || fitsLeft;
      const left = fitsRight
        ? rect.right + gap
        : fitsLeft
          ? rect.left - gap - size.width
          : rect.left;
      const below = rect.bottom + 8;
      const top = side
        ? rect.top
        : below + size.height <= window.innerHeight - gap
          ? below
          : rect.top - size.height - 8;
      setPlacement({
        left: Math.max(
          gap,
          Math.min(left, window.innerWidth - size.width - gap),
        ),
        top: Math.max(
          gap,
          Math.min(top, window.innerHeight - size.height - gap),
        ),
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchor, modifying, difference.id, cueIndex]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (
        !busy &&
        !panel.current?.contains(target) &&
        !anchor?.contains(target) &&
        !target.closest(".review-word, .review-gutter button")
      )
        close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [anchor, busy, close]);
  const recordSelection = (field: HTMLTextAreaElement) => {
    setSelection(
      field.selectionStart !== field.selectionEnd
        ? {
            cueIndex,
            range: { start: field.selectionStart, end: field.selectionEnd },
          }
        : null,
    );
  };
  const fresh = difference.range !== null;
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label="Choisir une lecture"
      aria-describedby="review-shortcuts"
      tabIndex={-1}
      className="review-popover"
      style={placement}
    >
      <div className="review-popover-heading">
        <strong>
          Divergence {number(index + 1)} sur {number(total)}
        </strong>
        <Button
          aria-label="Fermer la proposition"
          className="icon-button"
          disabled={busy}
          onClick={() => {
            close();
            anchor?.focus();
          }}
        >
          <X size={14} />
        </Button>
      </div>
      <dl>
        <dt>{engineName(difference.source.primaryEngine)}</dt>
        <dd dir="auto">{difference.source.primaryText || "Aucun mot"}</dd>
        <dt>
          {difference.source.vocabulary
            ? "Suggestion de vocabulaire"
            : engineName(difference.source.secondaryEngine)}
        </dt>
        <dd dir="auto">
          {difference.source.secondaryText ??
            difference.source.alternativeText ??
            "Aucune proposition"}
        </dd>
      </dl>
      {difference.source.vocabulary && (
        <p className="review-warning">
          Proximité orthographique avec un terme du profil. À valider à l’écoute
          ; aucune correction automatique.
        </p>
      )}
      {!fresh && (
        <p className="review-warning">
          Le segment a été modifié. Sélectionnez explicitement le passage à
          corriger.
        </p>
      )}
      {difference.source.secondaryText === null && (
        <p className="review-warning">
          La divergence traverse plusieurs segments. Le contexte ne peut pas
          être appliqué automatiquement.
        </p>
      )}
      {modifying ? (
        <div className="review-modify">
          {!fresh && (
            <>
              <label>
                Segment à corriger
                <Select
                  disabled={busy}
                  aria-label="Segment à corriger"
                  value={cueIndex}
                  onChange={(event) => {
                    setCueIndex(+event.target.value);
                    setSelection(null);
                  }}
                >
                  {cues.map((_, i) => (
                    <option key={i} value={i}>
                      Sous-titre {number(i + 1)}
                    </option>
                  ))}
                </Select>
              </label>
              <label>
                Sélectionnez le passage dans le texte actuel
                <TextArea
                  readOnly
                  disabled={busy}
                  aria-label="Passage actuel à sélectionner"
                  value={cues[cueIndex]?.text ?? ""}
                  onKeyDown={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.altKey ||
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const field = event.currentTarget;
                    const next = moveReviewSelection(
                      field.value,
                      field.selectionStart,
                      field.selectionEnd,
                      field.selectionDirection,
                      event.key as "ArrowLeft" | "ArrowRight" | "Home" | "End",
                      event.shiftKey,
                    );
                    field.setSelectionRange(
                      next.start,
                      next.end,
                      next.direction,
                    );
                    recordSelection(field);
                  }}
                  onSelect={(event) => recordSelection(event.currentTarget)}
                  onKeyUp={(event) => recordSelection(event.currentTarget)}
                  onPointerUp={(event) => recordSelection(event.currentTarget)}
                />
              </label>
              <small>
                {selection
                  ? `Passage choisi : « ${cues[cueIndex].text.slice(selection.range.start, selection.range.end)} »`
                  : "Aucun passage sélectionné"}
              </small>
            </>
          )}
          <label>
            Votre lecture
            <TextArea
              ref={input}
              disabled={busy}
              aria-label="Votre lecture"
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
            />
          </label>
          <div className="button-row">
            <Button
              disabled={busy}
              onClick={() => {
                setModifying(false);
                anchor?.focus();
              }}
            >
              Annuler la modification
            </Button>
            <Button
              className="primary"
              disabled={busy || (!fresh && !selection)}
              onClick={() =>
                resolve({
                  kind: "modify",
                  text: replacement,
                  selection: fresh ? null : selection,
                })
              }
            >
              Valider la modification
            </Button>
          </div>
        </div>
      ) : (
        <div className="button-row review-decisions">
          <Button
            aria-label="Garder la lecture du moteur principal (Échap)"
            disabled={busy || !fresh}
            onClick={() => resolve({ kind: "keep" })}
          >
            Garder <kbd>Échap</kbd>
          </Button>
          <Button
            className="primary"
            aria-label="Accepter la lecture du second avis (Entrée)"
            disabled={
              busy || !fresh || difference.source.secondaryText === null
            }
            onClick={() => resolve({ kind: "accept" })}
          >
            Accepter <kbd>↵</kbd>
          </Button>
          <Button
            aria-label="Modifier la lecture (M)"
            disabled={busy}
            onClick={() => setModifying(true)}
          >
            Modifier… <kbd>M</kbd>
          </Button>
        </div>
      )}
      <Button
        aria-label="Écouter à partir d’une seconde avant le segment"
        disabled={!cues[difference.cueIndex]}
        onClick={listen}
      >
        <Play size={14} />
        Écouter
      </Button>
      <small id="review-shortcuts">
        Tab / ⇧Tab : naviguer · Entrée : accepter · Échap : garder · M :
        modifier · Espace : écouter
      </small>
    </div>,
    document.body,
  );
}

export function ReviewGutter({
  differences,
  buttons,
  workspace,
  select,
}: {
  differences: ReviewDifference[];
  buttons: React.RefObject<Map<string, HTMLButtonElement>>;
  workspace: React.RefObject<HTMLDivElement | null>;
  select: (id: string) => void;
}) {
  const [positions, setPositions] = useState<
    Array<{ id: string; top: number; index: number }>
  >([]);
  useLayoutEffect(() => {
    const root = workspace.current;
    if (!root) return;
    const measure = () => {
      const top = root.getBoundingClientRect().top;
      setPositions(
        differences.flatMap((d, index) => {
          const element = buttons.current.get(d.id);
          return isPendingReview(d) && element
            ? [
                {
                  id: d.id,
                  index,
                  top: element.getBoundingClientRect().top - top,
                },
              ]
            : [];
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [differences, buttons, workspace]);
  return (
    <aside className="review-gutter" aria-label="Divergences à traiter">
      {positions.map((p) => (
        <button
          type="button"
          key={p.id}
          style={{ top: p.top }}
          aria-label={`Aller à la divergence ${number(p.index + 1)}`}
          onClick={() => select(p.id)}
        />
      ))}
    </aside>
  );
}
