import { describe, it, expect } from "vitest";
import {
  validate,
  time,
  parseTime,
  undo,
  redo,
  change,
  split,
  merge,
  type Cue,
} from "../src/domain";
const cues: Cue[] = [
  { startMs: 123, endMs: 2000, text: "Bonjour le monde." },
  { startMs: 2300, endMs: 5000, text: "Été à Paris. مرحبا" },
];
describe("Éditeur et horodatages", () => {
  it("conserve la précision et valide les bornes", () => {
    expect(time(3723123)).toBe("01:02:03,123");
    expect(parseTime("01:02:03,123")).toBe(3723123);
    expect(parseTime("01:99:00,000")).toBeNull();
    expect(parseTime("abc")).toBeNull();
  });
  it("rejette chevauchements et valeurs invalides", () => {
    expect(() => validate(cues)).not.toThrow();
    for (const bad of [
      [],
      [{ ...cues[0], startMs: -1 }],
      [{ ...cues[0], endMs: 0 }],
      [{ ...cues[0], text: "a\n\nb" }],
      [{ ...cues[0], startMs: NaN }],
      [cues[0], { ...cues[1], startMs: 1999 }],
    ])
      expect(() => validate(bad)).toThrow();
  });
  it("annule et rétablit sans perdre le contenu Unicode", () => {
    const initial = { past: [], present: cues, future: [] };
    const edited = change(initial, [
      { ...cues[0], text: "Correction" },
      cues[1],
    ]);
    expect(undo(edited).present).toEqual(cues);
    expect(redo(undo(edited)).present).toEqual(edited.present);
    expect(change(undo(edited), cues).future).toEqual([]);
  });
  it("scinde uniquement à la position explicitement fournie", () => {
    const out = split(cues, 0, 1000, 8);
    expect(out[0].endMs).toBe(1000);
    expect(out[1].startMs).toBe(1000);
    expect(out[0].text).toBe("Bonjour");
    expect(() => split(cues, 0, 0, 8)).toThrow();
    expect(() => split(cues, 0, 1000, 0)).toThrow();
  });
  it("fusionne le texte sans changer les limites extérieures", () => {
    const result = merge(cues, 0);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      startMs: 123,
      endMs: 5000,
      text: "Bonjour le monde. Été à Paris. مرحبا",
    });
    expect(() => merge(cues, 1)).toThrow();
  });
});
