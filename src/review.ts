import type { Cue } from "./domain";

/** UTF-16 code units, matching textarea/DOM selectionStart and selectionEnd. */
export interface ReviewRange {
  start: number;
  end: number;
}
export type ReviewStatus =
  | "pending"
  | "accepted"
  | "kept"
  | "modified"
  | "needsReview";
export interface ReviewSource {
  cueIndex: number;
  range: ReviewRange;
  primaryText: string;
  secondaryText: string | null;
  alternativeText: string;
  primaryEngine: string;
  secondaryEngine: string;
  profileTerm: boolean;
}
export interface ReviewDifference {
  id: string;
  source: ReviewSource;
  cueIndex: number;
  range: ReviewRange | null;
  currentText: string | null;
  status: ReviewStatus;
}
export interface ReviewSession {
  version: 1;
  differences: ReviewDifference[];
  anchors: Cue[];
}
export interface ReviewDocument {
  cues: Cue[];
  reviewState: ReviewSession | null;
  revision: number;
}
export type ReviewDecision =
  | { kind: "accept" }
  | { kind: "keep" }
  | {
      kind: "modify";
      text: string;
      selection: { cueIndex: number; range: ReviewRange } | null;
    };

/** Conservative local invalidation; Rust validates every persisted operation again. */
export function reconcileReview(
  session: ReviewSession | null,
  cues: Cue[],
): ReviewSession | null {
  if (!session) return null;
  const structural =
    session.anchors.length !== cues.length ||
    cues.some(
      (c, i) =>
        c.startMs !== session.anchors[i]?.startMs ||
        c.endMs !== session.anchors[i]?.endMs,
    );
  return {
    ...session,
    anchors: cues.map((c) => ({ ...c })),
    differences: session.differences.map((d) =>
      structural || cues[d.cueIndex]?.text !== session.anchors[d.cueIndex]?.text
        ? { ...d, range: null, currentText: null, status: "needsReview" }
        : d,
    ),
  };
}
