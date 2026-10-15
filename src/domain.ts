import { reconcileReview, type ReviewSession } from "./review";
export interface VocabularyProfile {
  id: string;
  name: string;
  language: "fr" | "en";
  terms: string[];
  whisper_prompt: string;
  builtin: boolean;
}
export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}
export interface Settings {
  engine: string;
  language: string;
  autoSave: boolean;
  autoModelUpdates: boolean;
  subtitles: { lineLength: number; maxLines: number; maxDurationMs: number };
  vocabulary: string[];
  selectedProfileId?: string | null;
}
export interface Job {
  verificationProgress?: {
    stage: "queued" | "primary" | "secondary" | "comparison";
    startedAt: number;
    secondaryEngine: string;
  } | null;
  reviewState?: ReviewSession | null;
  editRevision?: number;
  archived?: boolean;
  id: string;
  source: string;
  name: string;
  size: number;
  durationMs: number;
  status: string;
  cues: Cue[];
  error: string | null;
  exportPath: string | null;
  dirty: boolean;
  createdAt: number;
  engine: string;
  language: string;
  modelVersion?: string | null;
  timingNote?: string | null;
  profileSnapshot?: VocabularyProfile | null;
  verificationStatus?: string | null;
  verificationError?: string | null;
  verification?: {
    secondaryEngine: string;
    secondaryVersion: string;
    secondaryTimingNote?: string | null;
    referenceCues: Cue[];
    review: {
      approximate: boolean;
      differences: Array<{
        cueIndex: number;
        profileTerm?: boolean;
        primaryText: string;
        candidateText: string | null;
        alternativeText: string;
      }>;
    };
  } | null;
}
export interface ModelUpdate {
  engine: string;
  status: "current" | "available" | "unknown" | "error";
  installedRevision: string | null;
  latestRevision: string | null;
  checkedAt: number;
  error: string | null;
}
export interface Snapshot {
  reviewPendingTotal?: number;
  profiles?: VocabularyProfile[];
  jobs: Job[];
  settings: Settings;
  busy: boolean;
  modelInstalled: boolean;
  installedModels: string[];
  modelUpdates: ModelUpdate[];
  platform: string;
}
export function validate(cues: Cue[]) {
  if (!cues.length) throw new Error("Ajoutez au moins un sous-titre.");
  let end = 0;
  for (const c of cues) {
    if (
      ![c.startMs, c.endMs].every(Number.isSafeInteger) ||
      c.startMs < end ||
      c.endMs <= c.startMs ||
      c.endMs > 359999999 ||
      !c.text.trim() ||
      c.text.includes("-->") ||
      c.text.split("\n").length > 2 ||
      /[\r\0]/.test(c.text) ||
      c.text.split("\n").some((l) => !l.trim())
    )
      throw new Error("Vérifiez les textes, les durées et les chevauchements.");
    end = c.endMs;
  }
}
export function time(ms: number) {
  return `${Math.floor(ms / 3600000)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 60000) % 60)
    .toString()
    .padStart(2, "0")}:${Math.floor((ms / 1000) % 60)
    .toString()
    .padStart(2, "0")},${Math.floor(ms % 1000)
    .toString()
    .padStart(3, "0")}`;
}
export function parseTime(value: string) {
  const m = /^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(value);
  if (!m || +m[2] > 59 || +m[3] > 59) return null;
  return +m[1] * 3600000 + +m[2] * 60000 + +m[3] * 1000 + +m[4];
}
export interface EditState {
  past: Cue[][];
  present: Cue[];
  future: Cue[][];
  reviewState?: ReviewSession | null;
  pastReviews?: (ReviewSession | null)[];
  futureReviews?: (ReviewSession | null)[];
}
/** Push a backend-reviewed document on the same stack as text and timing edits. */
export function changeReviewed(
  state: EditState,
  cues: Cue[],
  reviewState: ReviewSession | null,
): EditState {
  return {
    past: [...state.past.slice(-99), state.present],
    present: cues,
    future: [],
    reviewState,
    pastReviews: [
      ...(state.pastReviews ?? state.past.map(() => null)).slice(-99),
      state.reviewState ?? null,
    ],
    futureReviews: [],
  };
}
export function change(state: EditState, cues: Cue[]): EditState {
  return changeReviewed(
    state,
    cues,
    reconcileReview(state.reviewState ?? null, cues),
  );
}
export function undo(state: EditState): EditState {
  if (!state.past.length) return state;
  const reviews = state.pastReviews ?? state.past.map(() => null);
  return {
    past: state.past.slice(0, -1),
    present: state.past.at(-1)!,
    future: [state.present, ...state.future],
    reviewState: reviews.at(-1) ?? null,
    pastReviews: reviews.slice(0, -1),
    futureReviews: [
      state.reviewState ?? null,
      ...(state.futureReviews ?? state.future.map(() => null)),
    ],
  };
}
export function redo(state: EditState): EditState {
  if (!state.future.length) return state;
  const reviews = state.futureReviews ?? state.future.map(() => null);
  return {
    past: [...state.past, state.present],
    present: state.future[0],
    future: state.future.slice(1),
    reviewState: reviews[0] ?? null,
    pastReviews: [
      ...(state.pastReviews ?? state.past.map(() => null)),
      state.reviewState ?? null,
    ],
    futureReviews: reviews.slice(1),
  };
}
// Splitting is an explicit editor operation at the user's playback position, never generated alignment.
export function split(
  cues: Cue[],
  index: number,
  atMs: number,
  offset: number,
): Cue[] {
  const c = cues[index];
  if (
    !c ||
    atMs <= c.startMs ||
    atMs >= c.endMs ||
    offset <= 0 ||
    offset >= c.text.length ||
    !c.text.slice(0, offset).trim() ||
    !c.text.slice(offset).trim()
  )
    throw new Error(
      "Placez le curseur dans le texte et la lecture dans ce sous-titre.",
    );
  return [
    ...cues.slice(0, index),
    { ...c, endMs: atMs, text: c.text.slice(0, offset).trim() },
    { ...c, startMs: atMs, text: c.text.slice(offset).trim() },
    ...cues.slice(index + 1),
  ];
}
export function merge(cues: Cue[], index: number): Cue[] {
  if (!cues[index + 1]) throw new Error("Aucun sous-titre suivant.");
  return [
    ...cues.slice(0, index),
    {
      startMs: cues[index].startMs,
      endMs: cues[index + 1].endMs,
      text: `${cues[index].text} ${cues[index + 1].text}`,
    },
    ...cues.slice(index + 2),
  ];
}
