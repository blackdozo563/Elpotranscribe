import type { Cue } from "./domain";
export interface Chapter {
  startMs: number;
  title: string;
}
export const chapterPauseMs = 3000;
const titleOf = (text: string) =>
  text.trim().split(/\s+/u).slice(0, 8).join(" ");
/** Whole-second YouTube labels must still leave at least ten seconds per chapter. */
export function proposeChapters(cues: Cue[], durationMs: number): Chapter[] {
  if (!Number.isSafeInteger(durationMs) || durationMs < 30000 || !cues.length)
    return [];
  let end = 0;
  for (const cue of cues) {
    if (
      !Number.isSafeInteger(cue.startMs) ||
      !Number.isSafeInteger(cue.endMs) ||
      cue.startMs < end ||
      cue.endMs <= cue.startMs ||
      cue.endMs > durationMs ||
      !cue.text.trim()
    )
      return [];
    end = cue.endMs;
  }
  const result: Chapter[] = [{ startMs: 0, title: titleOf(cues[0].text) }];
  for (let i = 1; i < cues.length; i++) {
    const cue = cues[i],
      startMs = Math.floor(cue.startMs / 1000) * 1000;
    if (
      cue.startMs - cues[i - 1].endMs >= chapterPauseMs &&
      startMs - result.at(-1)!.startMs >= 10000 &&
      durationMs - startMs >= 10000
    )
      result.push({ startMs, title: titleOf(cue.text) });
  }
  return result.length >= 3 ? result : [];
}
export function chapterTime(ms: number) {
  const seconds = Math.floor(ms / 1000),
    minutes = Math.floor(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
export function chaptersText(chapters: Chapter[], durationMs: number) {
  if (!Number.isSafeInteger(durationMs) || durationMs < 30000)
    throw new Error("Durée audio indisponible ou trop courte.");
  if (chapters.length < 3 || chapters[0].startMs !== 0)
    throw new Error(
      "YouTube exige au moins trois chapitres, dont le premier à 00:00.",
    );
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i],
      end = chapters[i + 1]?.startMs ?? durationMs;
    if (
      !Number.isSafeInteger(chapter.startMs) ||
      chapter.startMs < 0 ||
      chapter.startMs % 1000 ||
      end - chapter.startMs < 10000 ||
      !chapter.title.trim() ||
      /[\r\n]/u.test(chapter.title)
    )
      throw new Error(
        "Chaque chapitre doit durer au moins dix secondes et avoir un titre sur une ligne.",
      );
  }
  return chapters
    .map((chapter) => `${chapterTime(chapter.startMs)} ${chapter.title.trim()}`)
    .join("\n");
}
