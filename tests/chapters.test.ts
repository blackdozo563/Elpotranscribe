import { expect, it } from "vitest";
import { proposeChapters, chaptersText, chapterTime } from "../src/chapters";
import { downloadFraction } from "../src/downloadProgress";
const cues = [
  {
    startMs: 500,
    endMs: 7000,
    text: "Bonjour à tous et bienvenue dans cette conférence.",
  },
  { startMs: 12050, endMs: 17000, text: "Premier sujet de notre conférence." },
  { startMs: 25500, endMs: 28000, text: "Second sujet pour terminer." },
];
it("propose depuis les pauses réelles et laisse les sous-titres intacts", () => {
  const original = structuredClone(cues),
    chapters = proposeChapters(cues, 40000);
  expect(chapters.map((c) => c.startMs)).toEqual([0, 12000, 25000]);
  expect(chapters[0].title).toBe(
    "Bonjour à tous et bienvenue dans cette conférence.",
  );
  chapters[1].title = "Titre modifié";
  expect(chaptersText(chapters, 40000)).toContain("00:12 Titre modifié");
  expect(cues).toEqual(original);
  expect(chapterTime(3723000)).toBe("1:02:03");
});
it("ne fabrique pas de pauses et vérifie chaque durée après arrondi", () => {
  expect(proposeChapters(cues, 30000)).toEqual([]);
  expect(proposeChapters(cues, 0)).toEqual([]);
  expect(
    proposeChapters(
      [{ startMs: 0, endMs: 40000, text: "Une seule phrase." }],
      40000,
    ),
  ).toEqual([]);
  expect(
    proposeChapters(
      [
        { startMs: 0, endMs: 12000, text: "A" },
        { startMs: 11000, endMs: 13000, text: "B" },
      ],
      40000,
    ),
  ).toEqual([]);
  expect(() =>
    chaptersText(
      [
        { startMs: 0, title: "A" },
        { startMs: 9000, title: "B" },
        { startMs: 20000, title: "C" },
      ],
      40000,
    ),
  ).toThrow();
  expect(() =>
    chaptersText(
      [
        { startMs: 0, title: "A" },
        { startMs: 10000, title: "" },
        { startMs: 20000, title: "C" },
      ],
      40000,
    ),
  ).toThrow();
  expect(() =>
    chaptersText(
      [
        { startMs: 0, title: "A" },
        { startMs: 10000, title: "B" },
      ],
      40000,
    ),
  ).toThrow();
});
it("l’anneau calcule seulement un rapport d’octets valides", () => {
  const progress = {
    engine: "ultra",
    receivedBytes: 25,
    totalBytes: 100,
    fileName: "weights",
    phase: "downloading" as const,
  };
  expect(downloadFraction(progress)).toBe(0.25);
  expect(downloadFraction({ ...progress, totalBytes: null })).toBeNull();
  expect(downloadFraction({ ...progress, receivedBytes: 101 })).toBeNull();
  expect(downloadFraction({ ...progress, phase: "validating" })).toBeNull();
  expect(downloadFraction({ ...progress, totalBytes: 0 })).toBeNull();
});
