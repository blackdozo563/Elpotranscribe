import { describe, expect, it } from "vitest";
import { findMatches, replaceMatches } from "../src/search";
import { change, undo } from "../src/domain";
const options = { caseSensitive: false, wholeWord: false };
const cues = [
  { startMs: 100, endMs: 2000, text: "Ce soir, CE SOIR et soirée." },
  { startMs: 2100, endMs: 4000, text: "Été été. مرحبا مرحباك. [soir] $& 😀" },
];
describe("Recherche et remplacement local", () => {
  it("recherche littérale, casse et mots entiers dans plusieurs sous-titres", () => {
    expect(findMatches(cues, "soir", options)).toHaveLength(4);
    expect(
      findMatches(cues, "soir", { ...options, wholeWord: true }),
    ).toHaveLength(3);
    expect(
      findMatches(cues, "soir", { ...options, caseSensitive: true }),
    ).toHaveLength(3);
    expect(
      findMatches(cues, "été", { ...options, wholeWord: true }),
    ).toHaveLength(2);
    expect(
      findMatches(cues, "مرحبا", { ...options, wholeWord: true }),
    ).toHaveLength(1);
    expect(findMatches(cues, "[soir]", options)).toHaveLength(1);
    expect(findMatches(cues, "$&", options)).toHaveLength(1);
    expect(findMatches(cues, "", options)).toEqual([]);
  });
  it("remplace toutes les occurrences sans décaler les suivantes ni interpréter $&", () => {
    const matches = findMatches(cues, "soir", { ...options, wholeWord: true });
    const result = replaceMatches(cues, matches, "$&demain");
    expect(result[0].text).toBe("Ce $&demain, CE $&demain et soirée.");
    expect(result[1].text).toContain("[$&demain]");
    expect(result.map(({ startMs, endMs }) => [startMs, endMs])).toEqual([
      [100, 2000],
      [2100, 4000],
    ]);
    expect(
      undo(change({ past: [], present: cues, future: [] }, result)).present,
    ).toEqual(cues);
    expect(cues[0].text).toBe("Ce soir, CE SOIR et soirée.");
  });
  it("remplace une seule occurrence et accepte un remplacement vide", () => {
    const matches = findMatches(cues, "soir", options);
    const result = replaceMatches(cues, [matches[1]], "");
    expect(result[0].text).toBe("Ce soir, CE  et soirée.");
    expect(result[1]).toEqual(cues[1]);
  });
});
