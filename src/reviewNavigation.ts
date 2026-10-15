import type { ReviewDifference } from "./review";
export const isPendingReview = (d: ReviewDifference) =>
  d.status === "pending" || d.status === "needsReview";
export function adjacentReview(
  differences: ReviewDifference[],
  activeId: string | null,
  direction: 1 | -1,
): string | null {
  if (!differences.length) return null;
  const current = differences.findIndex((d) => d.id === activeId);
  if (current < 0)
    return differences[direction === 1 ? 0 : differences.length - 1].id;
  return differences[
    (current + direction + differences.length) % differences.length
  ].id;
}
export function nextPendingReview(
  differences: ReviewDifference[],
  activeId: string,
): string | null {
  const start = Math.max(
    0,
    differences.findIndex((d) => d.id === activeId),
  );
  for (let step = 1; step <= differences.length; step++) {
    const d = differences[(start + step) % differences.length];
    if (isPendingReview(d)) return d.id;
  }
  return null;
}
/** Split at the persisted UTF-16 ranges; never search for a similar word to guess a range. */
export function reviewPieces(text: string, differences: ReviewDifference[]) {
  const sorted = differences
    .filter((d) => d.range)
    .sort(
      (a, b) => a.range!.start - b.range!.start || a.range!.end - b.range!.end,
    );
  const pieces: Array<{ text: string; difference?: ReviewDifference }> = [];
  let offset = 0;
  for (const d of sorted) {
    const r = d.range!;
    if (
      r.start < offset ||
      r.start < 0 ||
      r.end < r.start ||
      r.end > text.length ||
      text.slice(r.start, r.end) !== d.currentText
    )
      continue;
    if (r.start > offset) pieces.push({ text: text.slice(offset, r.start) });
    pieces.push({ text: text.slice(r.start, r.end), difference: d });
    offset = r.end;
  }
  if (offset < text.length) pieces.push({ text: text.slice(offset) });
  return pieces;
}

/** Read-only textareas do not move their caret with arrows in Chromium.
 * Keep explicit range selection usable with a keyboard, on whole graphemes. */
export function moveReviewSelection(
  text: string,
  start: number,
  end: number,
  direction: "forward" | "backward" | "none",
  key: "ArrowLeft" | "ArrowRight" | "Home" | "End",
  extend: boolean,
) {
  const anchor = direction === "backward" ? end : start;
  const focus = direction === "backward" ? start : end;
  const boundaries = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
  ].map((s) => s.index);
  boundaries.push(text.length);
  let next = focus;
  if (key === "Home") next = text.lastIndexOf("\n", Math.max(0, focus - 1)) + 1;
  else if (key === "End") {
    const lineEnd = text.indexOf("\n", focus);
    next = lineEnd < 0 ? text.length : lineEnd;
  } else if (!extend && start !== end) next = key === "ArrowLeft" ? start : end;
  else if (key === "ArrowLeft")
    next = boundaries.filter((i) => i < focus).at(-1) ?? 0;
  else next = boundaries.find((i) => i > focus) ?? text.length;
  return extend
    ? {
        start: Math.min(anchor, next),
        end: Math.max(anchor, next),
        direction: next < anchor ? ("backward" as const) : ("forward" as const),
      }
    : { start: next, end: next, direction: "none" as const };
}
