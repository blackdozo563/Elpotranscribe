import type { Cue } from "./domain";

export interface SearchOptions {
  caseSensitive: boolean;
  wholeWord: boolean;
}
export interface Match {
  cue: number;
  start: number;
  end: number;
}
const word = /[\p{L}\p{M}\p{N}_]/u;

export function findMatches(
  cues: Cue[],
  query: string,
  options: SearchOptions,
): Match[] {
  if (!query) return [];
  const pattern = new RegExp(
    query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    options.caseSensitive ? "gu" : "giu",
  );
  return cues.flatMap((cue, index) => {
    const matches: Match[] = [];
    for (const match of cue.text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      const before = Array.from(cue.text.slice(0, start)).at(-1) ?? "";
      const after = Array.from(cue.text.slice(end))[0] ?? "";
      if (!options.wholeWord || (!word.test(before) && !word.test(after)))
        matches.push({ cue: index, start, end });
    }
    return matches;
  });
}

// Replace from the end so offsets remain those of the original text. The
// replacement is literal, including "$&"; cue timing is never touched.
export function replaceMatches(
  cues: Cue[],
  matches: Match[],
  replacement: string,
): Cue[] {
  const result = cues.map((cue) => ({ ...cue }));
  for (const match of [...matches].sort(
    (a, b) => b.cue - a.cue || b.start - a.start,
  )) {
    const cue = result[match.cue];
    cue.text =
      cue.text.slice(0, match.start) + replacement + cue.text.slice(match.end);
  }
  return result;
}
