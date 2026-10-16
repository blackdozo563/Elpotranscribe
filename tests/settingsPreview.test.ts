import { describe, it, expect } from "vitest";
import {
  latestPreview,
  previewSubtitle,
  standardSubtitles,
  verticalSubtitles,
  subtitlePreset,
} from "../src/settingsPreview";
import {
  mergeSettings,
  mergeSnapshot,
  draftSettings,
} from "../src/settingsClient";
import type { Job, Snapshot } from "../src/domain";
const cue = {
  startMs: 1200,
  endMs: 7200,
  text: "Une vraie phrase française pour vérifier le découpage du sous-titre.",
};
const job = (createdAt: number, status = "completed"): Job => ({
  id: String(createdAt),
  source: "/fixture/test.mp3",
  name: "test.mp3",
  size: 1,
  durationMs: 20000,
  createdAt,
  status,
  cues: [cue],
  engine: "ultra",
  language: "fr",
  error: null,
  exportPath: null,
  dirty: false,
});
describe("aperçu sans temps inventés", () => {
  it("sélectionne un vrai segment de la dernière transcription terminée", () => {
    expect(latestPreview([])).toBeNull();
    expect(latestPreview([{ ...job(4), cues: [] }])).toBeNull();
    expect(latestPreview([job(1), job(2), job(3, "processing")])).toEqual({
      name: "test.mp3",
      index: 0,
      cue,
    });
  });
  it("découpe uniquement le texte, mesure les CPS sur toute la durée réelle", () => {
    const copy = structuredClone(cue);
    const result = previewSubtitle(cue, verticalSubtitles);
    expect(result.groups.length).toBeGreaterThan(1);
    expect(
      result.groups.every(
        (group) => Array.from(group).length <= 24 && !group.includes("\n"),
      ),
    ).toBe(true);
    expect(result.cps).toBe(Array.from(cue.text).length / 6);
    expect(result.durationMs).toBe(6000);
    expect(result.overDuration).toBe(true);
    expect(cue).toEqual(copy);
  });
  it("préserve un mot long et les caractères Unicode, sans vitesse fictive", () => {
    const result = previewSubtitle(
      { ...cue, text: "é😀 anticonstitutionnellement", endMs: cue.startMs },
      { ...standardSubtitles, lineLength: 12 },
    );
    expect(result.groups.join(" ")).toContain("anticonstitutionnellement");
    expect(result.tooLong).toBe(true);
    expect(result.cps).toBeNull();
    expect(
      previewSubtitle({ ...cue, endMs: 0 }, standardSubtitles).cps,
    ).toBeNull();
    expect(
      previewSubtitle({ ...cue, text: "😀😀", endMs: 2200 }, standardSubtitles)
        .cps,
    ).toBe(2);
  });
  it("reconnaît exactement les préréglages et les valeurs personnalisées", () => {
    expect(subtitlePreset(standardSubtitles)).toBe("standard");
    expect(subtitlePreset(verticalSubtitles)).toBe("vertical");
    expect(subtitlePreset({ ...verticalSubtitles, maxLines: 2 })).toBe(
      "custom",
    );
  });
});
it("synchronisation : ignore les réponses anciennes et conserve les autres données fraîches", () => {
  const snapshot: Snapshot = {
    jobs: [],
    busy: false,
    modelInstalled: true,
    installedModels: [],
    modelUpdates: [],
    platform: "test",
    settingsRevision: 2,
    settings: {
      engine: "ultra",
      language: "fr",
      autoSave: false,
      autoModelUpdates: false,
      vocabulary: [],
      subtitles: standardSubtitles,
    },
  };
  const settings = draftSettings(snapshot.settings, {
    autoSave: true,
    lineLength: 24,
  });
  const merged = mergeSettings(snapshot, { settings, revision: 3 });
  expect(
    mergeSettings(merged, { settings: snapshot.settings, revision: 2 }),
  ).toBe(merged);
  expect(mergeSnapshot(merged, { ...snapshot, busy: true })).toEqual({
    ...merged,
    busy: true,
  });
  expect(mergeSnapshot(null, snapshot)).toBe(snapshot);
  expect(merged.settings.engine).toBe("ultra");
  expect(merged.settings.subtitles).toEqual({
    ...standardSubtitles,
    lineLength: 24,
  });
});
