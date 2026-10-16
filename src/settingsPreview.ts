import type { Cue, Job, Settings } from "./domain";
export const standardSubtitles = {
  lineLength: 42,
  maxLines: 2,
  maxDurationMs: 5000,
};
export const verticalSubtitles = {
  lineLength: 24,
  maxLines: 1,
  maxDurationMs: 3000,
};
export function subtitlePreset(settings: Settings["subtitles"]) {
  if (
    Object.entries(standardSubtitles).every(
      ([key, value]) => settings[key as keyof typeof settings] === value,
    )
  )
    return "standard";
  if (
    Object.entries(verticalSubtitles).every(
      ([key, value]) => settings[key as keyof typeof settings] === value,
    )
  )
    return "vertical";
  return "custom";
}
export function latestPreview(jobs: Job[]) {
  const job = jobs
    .filter(
      (j) => j.status === "completed" && j.cues.some((c) => c.text.trim()),
    )
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!job) return null;
  const index = job.cues.findIndex((c) => c.text.trim());
  return { name: job.name, index, cue: job.cues[index] };
}
/** Text layout only. Every group keeps the single original cue's boundaries. */
export function previewSubtitle(cue: Cue, settings: Settings["subtitles"]) {
  const lines: string[] = [];
  let line = "";
  for (const word of cue.text.trim().split(/\s+/u)) {
    if (line && Array.from(`${line} ${word}`).length > settings.lineLength) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  const groups: string[] = [];
  for (let i = 0; i < lines.length; i += settings.maxLines)
    groups.push(lines.slice(i, i + settings.maxLines).join("\n"));
  const durationMs = cue.endMs - cue.startMs;
  const cps =
    Number.isFinite(durationMs) && durationMs > 0
      ? Array.from(cue.text.replace(/\n/g, " ")).length / (durationMs / 1000)
      : null;
  return {
    groups,
    durationMs,
    cps,
    tooLong: lines.some((l) => Array.from(l).length > settings.lineLength),
    overDuration: durationMs > settings.maxDurationMs,
  };
}
