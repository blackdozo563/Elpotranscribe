import { invoke } from "@tauri-apps/api/core";
import type { Cue } from "./domain";
import type { ReviewDecision, ReviewDocument, ReviewSession } from "./review";

export const listReview = (id: string) =>
  invoke<ReviewDocument>("list_review", { id });
export const resolveReview = (
  id: string,
  differenceId: string,
  decision: ReviewDecision,
  expectedRevision: number,
) =>
  invoke<ReviewDocument>("resolve_review", {
    id,
    differenceId,
    decision,
    expectedRevision,
  });
/** Undo and redo both restore a frame from the editor's existing history stack. */
export const restoreReview = (
  id: string,
  cues: Cue[],
  reviewState: ReviewSession | null,
  expectedRevision: number,
) =>
  invoke<ReviewDocument>("restore_review", {
    id,
    cues,
    reviewState,
    expectedRevision,
  });
export const saveReviewedEdit = (
  id: string,
  cues: Cue[],
  expectedRevision: number,
) => invoke<ReviewDocument>("save_edit", { id, cues, expectedRevision });
export const reviewPendingTotal = () => invoke<number>("review_pending_total");
