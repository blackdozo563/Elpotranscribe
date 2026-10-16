import { expect, it } from "vitest";
import { nearMisses, distanceWithinTwo } from "../src/profileReview";
import { profilePrompt, cleanTerms } from "../src/Vocabulary";
import { change, undo, type VocabularyProfile } from "../src/domain";
const profile: VocabularyProfile = {
  id: "fr",
  name: "Liturgie",
  language: "fr",
  terms: ["Évangile", "Notre Père"],
  whisper_prompt: "Lisons.",
  builtin: true,
};
it("normalise accents/casse et propose une correction sans modifier les temps", () => {
  expect(distanceWithinTwo("ÉVANGILE", "evangile")).toBe(0);
  expect(distanceWithinTwo("Evengile", "Évangile")).toBe(1);
  expect(distanceWithinTwo("inconnu", "Évangile")).toBeGreaterThan(2);
  const text = "Lisons Evengile et Notre Pere.";
  const matches = nearMisses(text, profile);
  expect(matches.map((m) => m.term)).toEqual(["Évangile", "Notre Père"]);
  const initial = {
    past: [],
    present: [{ startMs: 123, endMs: 5000, text }],
    future: [],
  };
  const m = matches[0];
  const result = change(initial, [
    {
      ...initial.present[0],
      text: text.slice(0, m.start) + m.term + text.slice(m.end),
    },
  ]);
  expect(result.present[0].startMs).toBe(123);
  expect(result.present[0].endMs).toBe(5000);
  expect(undo(result).present).toEqual(initial.present);
});
it("construit l’invite sans doublons ni lignes vides", () => {
  expect(cleanTerms(" Évangile\nÉVANGILE\n\nPsaume")).toEqual([
    "Évangile",
    "Psaume",
  ]);
  expect(profilePrompt({ ...profile, terms: [" Évangile ", "ÉVANGILE"] })).toBe(
    "Lisons.\nÉvangile",
  );
});

it("garde les élisions françaises lors de la proposition d’un terme", () => {
  const text = "L’Evengile et l’Évangile.";
  const matches = nearMisses(text, { ...profile, terms: ["Évangile"] });
  expect(matches).toHaveLength(1);
  expect(matches[0].original).toBe("Evengile");
  const m = matches[0];
  expect(text.slice(0, m.start) + m.term + text.slice(m.end)).toBe(
    "L’Évangile et l’Évangile.",
  );
});

it("ajoute un collage en préservant les accents et signale tous les doublons", async () => {
  const { appendTerms } = await import("../src/vocabularyTerms");
  expect(
    appendTerms(["Évangile"], " ÉVANGILE\r\n\n Kyrie \nKyrie\nNotre Père"),
  ).toEqual({
    terms: ["Évangile", "Kyrie", "Notre Père"],
    duplicates: ["ÉVANGILE", "Kyrie"],
  });
});
