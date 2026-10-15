import type { Job, Settings } from "./domain";
export type LibrarySort = "name" | "duration" | "engine" | "date" | "status";
export const statusLabels: Record<string, string> = {
  pending: "En attente",
  transcribing: "Transcription",
  completed: "Terminé",
  failed: "Erreur",
  cancelled: "Annulé",
};
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
export function libraryJobs(
  jobs: Job[],
  query: string,
  sort: LibrarySort,
  descending: boolean,
) {
  const needle = fold(query.trim());
  const collator = new Intl.Collator("fr-FR", {
    numeric: true,
    sensitivity: "base",
  });
  return jobs
    .filter(
      (job) =>
        !needle ||
        fold(job.name).includes(needle) ||
        fold(job.cues.map((cue) => cue.text).join(" ")).includes(needle),
    )
    .slice()
    .sort((a, b) => {
      const order =
        sort === "duration"
          ? a.durationMs - b.durationMs
          : sort === "date"
            ? a.createdAt - b.createdAt
            : collator.compare(
                sort === "name"
                  ? a.name
                  : sort === "engine"
                    ? a.engine
                    : (statusLabels[a.status] ?? a.status),
                sort === "name"
                  ? b.name
                  : sort === "engine"
                    ? b.engine
                    : (statusLabels[b.status] ?? b.status),
              );
      return descending ? -order : order;
    });
}
export function oversizedCues(job: Job, settings: Settings["subtitles"]) {
  return job.cues.filter(
    (cue) =>
      cue.endMs - cue.startMs > settings.maxDurationMs ||
      cue.text.split("\n").length > settings.maxLines ||
      cue.text
        .split("\n")
        .some((line) => Array.from(line).length > settings.lineLength),
  ).length;
}
