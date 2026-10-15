import { test, expect } from "vitest";
import { libraryJobs, oversizedCues } from "../src/library";
import type { Job } from "../src/domain";
const job = (name: string, text: string, archived = false): Job => ({
  id: name,
  name,
  source: `/fixture/${name}`,
  size: 1,
  durationMs: 10000,
  status: "completed",
  cues: [{ text, startMs: 123, endMs: 9000 }],
  error: null,
  exportPath: null,
  dirty: false,
  createdAt: 10,
  engine: "ultra",
  language: "fr",
  archived,
});
test("recherche Unicode dans les titres et textes, archives comprises", () => {
  const jobs = [
    job("Audio10.mp3", "Bonjour"),
    job("Été2.mp3", "Eucharistie et Évangile", true),
  ];
  jobs[1].cues.push({ startMs: 9000, endMs: 10000, text: "demain" });
  const before = structuredClone(jobs);
  expect(
    libraryJobs(jobs, "evangile", "name", false).map((j) => j.name),
  ).toEqual(["Été2.mp3"]);
  expect(libraryJobs(jobs, "ETE2", "date", true)).toHaveLength(1);
  expect(libraryJobs(jobs, "absent", "date", true)).toHaveLength(0);
  expect(libraryJobs(jobs, "Évangile demain", "name", false)).toHaveLength(1);
  expect(jobs).toEqual(before);
});
test("tri naturel, numérique et dans les deux sens sans changer l’historique", () => {
  const first = job("audio10.mp3", "a"),
    second = { ...job("audio2.mp3", "b"), durationMs: 20000, createdAt: 20 };
  const jobs = [first, second];
  expect(libraryJobs(jobs, "", "name", false)[0].name).toBe("audio2.mp3");
  expect(libraryJobs(jobs, "", "duration", true)[0].name).toBe("audio2.mp3");
  expect(libraryJobs(jobs, "", "date", false)[0].name).toBe("audio10.mp3");
  first.status = "pending";
  expect(libraryJobs(jobs, "", "status", false)[0].status).toBe("pending");
  expect(jobs[0]).toBe(first);
});
test("dépassements calculés sur texte Unicode et bornes réelles, sans modifier les cues", () => {
  const source = job("a", "😀é");
  source.cues = [
    { startMs: 100, endMs: 2100, text: "😀é" },
    { startMs: 2200, endMs: 8000, text: "abc" },
    { startMs: 8000, endMs: 9000, text: "a\nb\nc" },
  ];
  const before = structuredClone(source.cues);
  expect(
    oversizedCues(source, { lineLength: 3, maxLines: 2, maxDurationMs: 5000 }),
  ).toBe(2);
  expect(source.cues).toEqual(before);
});
