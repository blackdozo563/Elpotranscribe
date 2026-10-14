import type { VocabularyProfile } from "./domain";
export const foldTerm = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
export function distanceWithinTwo(a: string, b: string): number {
  const left = Array.from(foldTerm(a)),
    right = Array.from(foldTerm(b));
  if (Math.abs(left.length - right.length) > 2) return 3;
  let row = right.map((_, i) => i + 1);
  row.unshift(0);
  for (let i = 1; i <= left.length; i++) {
    const next = [i];
    for (let j = 1; j <= right.length; j++)
      next[j] = Math.min(
        next[j - 1] + 1,
        row[j] + 1,
        row[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    if (Math.min(...next) > 2) return 3;
    row = next;
  }
  return row[right.length];
}
export interface NearMiss {
  start: number;
  end: number;
  original: string;
  term: string;
}
const tokens = (s: string) => [
  ...s.matchAll(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu),
];
export function nearMisses(
  text: string,
  profile: VocabularyProfile | null,
): NearMiss[] {
  if (!profile) return [];
  const words = tokens(text);
  const result: NearMiss[] = [];
  for (let i = 0; i < words.length; i++) {
    let best: NearMiss | null = null;
    let closest = 3;
    for (const term of profile.terms) {
      const count = tokens(term).length;
      if (!count || i + count > words.length) continue;
      const start = words[i].index,
        last = words[i + count - 1],
        end = last.index + last[0].length;
      const original = text.slice(start, end);
      if (original === term) continue;
      const distance = distanceWithinTwo(original, term);
      if (distance < closest) {
        closest = distance;
        best = { start, end, original, term };
      }
    }
    if (best && closest <= 2) {
      result.push(best);
      while (i + 1 < words.length && words[i + 1].index < best.end) i++;
    }
  }
  return result;
}
