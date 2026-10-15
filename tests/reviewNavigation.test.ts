import { expect, it } from "vitest";
import {
  adjacentReview,
  nextPendingReview,
  reviewPieces,
  moveReviewSelection,
} from "../src/reviewNavigation";
import type { ReviewDifference } from "../src/review";
const d = (
  id: string,
  status: ReviewDifference["status"] = "pending",
  start = 0,
  end = 1,
): ReviewDifference => ({
  id,
  status,
  cueIndex: 0,
  range: { start, end },
  currentText: "x",
  source: {
    cueIndex: 0,
    range: { start, end },
    primaryText: "x",
    secondaryText: "y",
    alternativeText: "y",
    primaryEngine: "ultra",
    secondaryEngine: "whisper-turbo",
    profileTerm: false,
  },
});
it("navigates both ways, wraps, and handles missing/empty selections", () => {
  const list = [d("a"), d("b", "kept"), d("c", "needsReview")];
  expect(adjacentReview(list, "a", 1)).toBe("b");
  expect(adjacentReview(list, "a", -1)).toBe("c");
  expect(adjacentReview(list, "c", 1)).toBe("a");
  expect(adjacentReview(list, null, 1)).toBe("a");
  expect(adjacentReview(list, "missing", -1)).toBe("c");
  expect(adjacentReview([], null, 1)).toBeNull();
  expect(adjacentReview([d("a")], "a", -1)).toBe("a");
});
it("advances only to unresolved items after a decision without claiming agreement is truth", () => {
  expect(
    nextPendingReview(
      [d("a", "accepted"), d("b", "kept"), d("c", "needsReview")],
      "a",
    ),
  ).toBe("c");
  expect(
    nextPendingReview([d("a", "accepted"), d("b", "kept")], "b"),
  ).toBeNull();
  expect(nextPendingReview([], "missing")).toBeNull();
  expect(nextPendingReview([d("a")], "a")).toBe("a");
});
it("renders exact Unicode ranges and adjacent marks, ignoring any stale or overlapping range", () => {
  const first = { ...d("a", "pending", 3, 4), currentText: "x" },
    second = { ...d("b", "kept", 4, 5), currentText: "y" };
  const pieces = reviewPieces("😀 xy fin", [second, first]);
  expect(pieces.map((p) => p.text).join("")).toBe("😀 xy fin");
  expect(
    pieces.filter((p) => p.difference).map((p) => p.difference?.id),
  ).toEqual(["a", "b"]);
  expect(reviewPieces("Autre texte", [first]).some((p) => p.difference)).toBe(
    false,
  );
  expect(
    reviewPieces("😀 xy fin", [first, { ...first, id: "overlap" }]).filter(
      (p) => p.difference,
    ),
  ).toHaveLength(1);
  expect(
    reviewPieces("abc", [{ ...d("insert", "pending", 1, 1), currentText: "" }])
      .map((p) => p.text)
      .join(""),
  ).toBe("abc");
});

it("selects a stale range with the keyboard without splitting emoji or accents", () => {
  expect(
    moveReviewSelection("Ce texte", 0, 0, "none", "ArrowRight", true),
  ).toMatchObject({ start: 0, end: 1 });
  expect(
    moveReviewSelection("Ce texte", 0, 1, "forward", "ArrowRight", true),
  ).toMatchObject({ start: 0, end: 2 });
  expect(
    moveReviewSelection("😀 été", 0, 0, "none", "ArrowRight", true),
  ).toMatchObject({ start: 0, end: 2 });
  expect(
    moveReviewSelection("e\u0301té", 0, 0, "none", "ArrowRight", true),
  ).toMatchObject({ start: 0, end: 2 });
  expect(
    moveReviewSelection("abc", 1, 3, "backward", "ArrowLeft", true),
  ).toEqual({ start: 0, end: 3, direction: "backward" });
  expect(
    moveReviewSelection("abc", 0, 2, "forward", "ArrowRight", false),
  ).toMatchObject({ start: 2, end: 2 });
  expect(
    moveReviewSelection("abc\ndef", 5, 5, "none", "Home", false),
  ).toMatchObject({ start: 4, end: 4 });
  expect(
    moveReviewSelection("abc\ndef", 1, 1, "none", "End", true),
  ).toMatchObject({ start: 1, end: 3 });
});
