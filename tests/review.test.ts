import { beforeEach, expect, it, vi } from "vitest";
import {
  change,
  changeReviewed,
  redo,
  undo,
  type EditState,
} from "../src/domain";
import type { ReviewDocument, ReviewSession } from "../src/review";
import {
  listReview,
  resolveReview,
  restoreReview,
  reviewPendingTotal,
  saveReviewedEdit,
} from "../src/reviewClient";
import { invoke } from "@tauri-apps/api/core";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const cues = [
  { startMs: 190, endMs: 4720, text: "Ce foir." },
  { startMs: 5000, endMs: 6000, text: "Été." },
];
const review: ReviewSession = {
  version: 1,
  anchors: cues,
  differences: [
    {
      id: "job:review:0:0",
      cueIndex: 0,
      range: { start: 3, end: 8 },
      currentText: "foir.",
      status: "pending",
      source: {
        cueIndex: 0,
        range: { start: 3, end: 8 },
        primaryText: "foir.",
        secondaryText: "soir.",
        alternativeText: "Ce soir.",
        primaryEngine: "ultra",
        secondaryEngine: "whisper-turbo",
        profileTerm: false,
      },
    },
  ],
};
beforeEach(() => vi.resetAllMocks());
it("uses the existing editor stack to undo and redo both decisions and text", () => {
  const initial: EditState = {
    past: [],
    present: cues,
    future: [],
    reviewState: review,
  };
  const corrected = [{ ...cues[0], text: "Ce soir." }, cues[1]];
  const accepted: ReviewSession = {
    ...review,
    anchors: corrected,
    differences: [
      { ...review.differences[0], status: "accepted", currentText: "soir." },
    ],
  };
  const edited = changeReviewed(initial, corrected, accepted);
  const undone = undo(edited);
  expect(undone.present).toEqual(cues);
  expect(undone.reviewState).toEqual(review);
  expect(redo(undone)).toEqual(edited);
  expect(edited.present.map((c) => [c.startMs, c.endMs])).toEqual(
    cues.map((c) => [c.startMs, c.endMs]),
  );
  expect(change(undone, cues).future).toEqual([]);
  expect(change(undone, cues).futureReviews).toEqual([]);
});
it("invalidates a manually changed cue and structural edits without reusing stale ranges", () => {
  const initial: EditState = {
    past: [],
    present: cues,
    future: [],
    reviewState: review,
  };
  const manual = change(initial, [
    { ...cues[0], text: "Un autre texte." },
    cues[1],
  ]);
  expect(manual.reviewState?.differences[0]).toMatchObject({
    status: "needsReview",
    range: null,
    currentText: null,
  });
  expect(undo(manual).reviewState).toEqual(review);
  expect(
    change(initial, [cues[0], { ...cues[1], text: "Autre." }]).reviewState
      ?.differences[0].status,
  ).toBe("pending");
  expect(
    change(initial, [{ ...cues[0], endMs: 4500 }, cues[1]]).reviewState
      ?.differences[0].status,
  ).toBe("needsReview");
  expect(
    change({ past: [], present: cues, future: [] }, cues).reviewState,
  ).toBeNull();
});
it("sends typed IPC payloads and returns the authoritative persisted document", async () => {
  const doc: ReviewDocument = { cues, reviewState: review, revision: 7 };
  vi.mocked(invoke).mockResolvedValue(doc);
  expect(await listReview("job")).toBe(doc);
  expect(invoke).toHaveBeenLastCalledWith("list_review", { id: "job" });
  expect(
    await resolveReview("job", "job:review:0:0", { kind: "accept" }, 7),
  ).toBe(doc);
  expect(invoke).toHaveBeenLastCalledWith("resolve_review", {
    id: "job",
    differenceId: "job:review:0:0",
    decision: { kind: "accept" },
    expectedRevision: 7,
  });
  const decision = {
    kind: "modify" as const,
    text: "soir.",
    selection: { cueIndex: 0, range: { start: 3, end: 8 } },
  };
  await resolveReview("job", "job:review:0:0", decision, 7);
  expect(invoke).toHaveBeenLastCalledWith("resolve_review", {
    id: "job",
    differenceId: "job:review:0:0",
    decision,
    expectedRevision: 7,
  });
  await restoreReview("job", cues, review, 8);
  expect(invoke).toHaveBeenLastCalledWith("restore_review", {
    id: "job",
    cues,
    reviewState: review,
    expectedRevision: 8,
  });
  await saveReviewedEdit("job", cues, 9);
  expect(invoke).toHaveBeenLastCalledWith("save_edit", {
    id: "job",
    cues,
    expectedRevision: 9,
  });
  vi.mocked(invoke).mockResolvedValue(1);
  expect(await reviewPendingTotal()).toBe(1);
  expect(invoke).toHaveBeenLastCalledWith("review_pending_total");
});
it("propagates stale-revision errors without changing local editor frames", async () => {
  const before = structuredClone(review);
  vi.mocked(invoke).mockRejectedValue(new Error("La transcription a changé."));
  await expect(restoreReview("job", cues, review, 0)).rejects.toThrow(
    "La transcription a changé",
  );
  expect(review).toEqual(before);
});
