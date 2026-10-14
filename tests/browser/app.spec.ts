import { test, expect } from "@playwright/test";
test("interface française vide et fonctions natives explicitement indiquées", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "De l’audio aux mots." }),
  ).toBeVisible();
  await expect(page.getByText("Une place pour chaque voix.")).toBeVisible();
  await page
    .getByRole("button", { name: "Importer des fichiers audio" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Mac Apple Silicon");
  expect(errors).toEqual([]);
});
test("modèles non intégrés jamais proposés comme disponibles", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Modèles IA", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Parakeet Ultra", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Qwen3-ASR 0.6B / 1.7B, whisper.cpp et Gemini", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Installer Parakeet Ultra" }),
  ).toBeEnabled();
});
test("éditeur : modification, annulation et export par le pont natif simulé", async ({
  page,
}) => {
  // IPC mock only: this test validates the UI, never inference or native filesystem access.
  await page.addInitScript(() => {
    const job = {
      id: "ui-fixture",
      source: "/fixture/Été.final.wav",
      name: "Été.final.wav",
      size: 100000,
      durationMs: 5000,
      status: "completed",
      cues: [
        { startMs: 100, endMs: 2000, text: "Bonjour Paris." },
        { startMs: 2500, endMs: 4900, text: "Été à Paris." },
      ],
      error: null,
      exportPath: null,
      dirty: true,
      createdAt: 0,
      engine: "Parakeet Ultra",
      language: "fr",
    };
    const state = {
      jobs: [job],
      busy: false,
      modelInstalled: true,
      platform: "Simulation UI",
      settings: {
        language: "fr",
        autoSave: false,
        subtitles: { lineLength: 42, maxLines: 2, maxDurationMs: 5000 },
        vocabulary: [],
      },
    };
    const calls: Array<{ command: string; args: unknown }> = [];
    Object.assign(window, {
      isTauri: true,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TEST_CALLS__: calls,
      __TAURI_INTERNALS__: {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main", windowLabel: "main" },
        },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        convertFileSrc: () => "",
        invoke: async (command: string, args: { cues?: typeof job.cues }) => {
          calls.push({ command, args });
          if (command === "snapshot") return state;
          if (command === "save_edit" && args.cues) job.cues = args.cues;
          if (command === "export_job") return "/fixture/Été.final.srt";
          return 1;
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Sous-titre 1", exact: true })
    .fill("Bonjour Lyon.");
  await expect(
    page.getByText("Modifications non enregistrées", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Sous-titre 1", exact: true }),
  ).toHaveValue("Bonjour Paris.");
  await page.getByRole("button", { name: "Rétablir", exact: true }).click();
  await page
    .getByRole("button", { name: "SRT à côté de l’audio", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
          ).__TEST_CALLS__.filter((c) => c.command === "export_job").length,
      ),
    )
    .toBe(1);
  await expect(
    page.getByRole("textbox", { name: "Sous-titre 1", exact: true }),
  ).toHaveValue("Bonjour Lyon.");
  await expect(
    page.getByText("Export SRT à mettre à jour", { exact: false }),
  ).toHaveCount(0);
});
