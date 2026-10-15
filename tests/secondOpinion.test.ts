import { expect, it } from "vitest";
import {
  opinionPair,
  opinionElapsed,
  opinionStage,
  pendingInJob,
  reviewJobs,
} from "../src/secondOpinion";
import type { Job } from "../src/domain";
const job = (id: string, status = "completed", createdAt = 10): Job => ({
  id,
  status,
  createdAt,
  source: "/fixture/audio.mp3",
  name: id,
  size: 100,
  durationMs: 1000,
  cues: [],
  error: null,
  exportPath: null,
  dirty: false,
  engine: "ultra",
  language: "fr",
});
it("offers only installed supported engines and always chooses different engines", () => {
  expect(opinionPair(["ultra", "whisper-turbo"], "whisper-turbo")).toEqual({
    primary: "whisper-turbo",
    secondary: "ultra",
  });
  expect(opinionPair(["ultra"], "whisper-turbo")).toEqual({
    primary: "ultra",
    secondary: "",
  });
  expect(opinionPair(["unsupported"], "ultra")).toEqual({
    primary: "",
    secondary: "",
  });
});
it("uses the observed stage independently of time and leaves unknown elapsed time unknown", () => {
  const j = job("a");
  expect(opinionStage(j)).toBe("Analyse séquentielle en cours");
  j.verificationProgress = {
    stage: "secondary",
    startedAt: 100,
    secondaryEngine: "whisper-turbo",
  };
  expect(opinionStage(j)).toContain("Second avis");
  expect(opinionElapsed(100, 165.9)).toBe("01:05");
  expect(opinionStage(j)).toContain("Second avis");
  for (const invalid of [undefined, 0, NaN, Infinity, 200])
    expect(opinionElapsed(invalid, 165)).toBeNull();
});
it("counts unresolved statuses and includes archived results without reopening treated jobs", () => {
  const a = job("a"),
    b = job("b", "completed", 20),
    c = job("c", "failed", 30);
  for (const j of [a, b, c])
    j.reviewState = {
      version: 1,
      anchors: [],
      differences: (
        ["pending", "needsReview", "accepted", "kept", "modified"] as const
      ).map((status, i) => ({
        id: `${j.id}:${i}`,
        status,
        cueIndex: 0,
        range: { start: 0, end: 1 },
        currentText: "a",
        source: {
          cueIndex: 0,
          range: { start: 0, end: 1 },
          primaryText: "a",
          secondaryText: "b",
          alternativeText: "b",
          primaryEngine: "ultra",
          secondaryEngine: "whisper-turbo",
          profileTerm: false,
        },
      })),
    };
  b.archived = true;
  expect(pendingInJob(a)).toBe(2);
  expect(pendingInJob(job("plain"))).toBe(0);
  expect(reviewJobs([a, c, b]).map((j) => j.id)).toEqual(["b", "a"]);
  a.reviewState!.differences = [];
  expect(reviewJobs([a, b]).map((j) => j.id)).toEqual(["b"]);
});
