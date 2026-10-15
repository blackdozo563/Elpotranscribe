import type { Job } from "./domain";
export const opinionEngines = [
  { id: "ultra", name: "Parakeet Ultra" },
  { id: "whisper-turbo", name: "Whisper large-v3-turbo Q5_0" },
];
export const opinionEngineName = (id: string) =>
  opinionEngines.find((e) => e.id === id)?.name ?? id;
export const pendingInJob = (job: Job) =>
  job.reviewState?.differences.filter(
    (d) => d.status === "pending" || d.status === "needsReview",
  ).length ?? 0;
export const reviewJobs = (jobs: Job[]) =>
  jobs
    .filter((j) => j.status === "completed" && pendingInJob(j) > 0)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
export function opinionPair(installed: string[], preferred: string) {
  const available = opinionEngines.filter((e) => installed.includes(e.id));
  const primary =
    available.find((e) => e.id === preferred)?.id ?? available[0]?.id ?? "";
  return {
    primary,
    secondary: available.find((e) => e.id !== primary)?.id ?? "",
  };
}
export function opinionStage(job: Job) {
  switch (job.verificationProgress?.stage) {
    case "queued":
      return "En attente du moteur principal";
    case "primary":
      return `Moteur principal · ${opinionEngineName(job.engine)}`;
    case "secondary":
      return `Second avis · ${opinionEngineName(job.verificationProgress.secondaryEngine)}`;
    case "comparison":
      return "Comparaison des transcriptions";
    default:
      return "Analyse séquentielle en cours";
  }
}
export function opinionElapsed(startedAt: number | undefined, now: number) {
  if (
    !startedAt ||
    !Number.isFinite(startedAt) ||
    startedAt > now ||
    startedAt < 0
  )
    return null;
  const seconds = Math.floor(now - startedAt),
    digits = new Intl.NumberFormat("fr-FR", {
      minimumIntegerDigits: 2,
      useGrouping: false,
    });
  return `${digits.format(Math.floor(seconds / 60))}:${digits.format(seconds % 60)}`;
}
