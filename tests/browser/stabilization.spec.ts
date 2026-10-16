import { test, expect } from "@playwright/test";
import type { Snapshot } from "../../src/domain";
import { reviewFixture } from "./reviewFixture";

test("navigation : commandes lisibles et réglages ancrés en bas", async ({ page }) => {
  await reviewFixture(page);
  const sidebar = page.locator(".sidebar");
  for (const name of ["Importer un nouvel audio", "Double vérification", "Réglages ⌘,"]) {
    await expect(sidebar.getByRole("button", { name, exact: true })).toBeVisible();
  }
  const bounds = await sidebar.boundingBox();
  const footer = await sidebar.locator(".sidebar-footer").boundingBox();
  expect(footer!.y).toBeGreaterThan(bounds!.height * 0.7);
  expect(await sidebar.getByRole("button", { name: "Vocabulaire", exact: true })
    .evaluate(el => el.getBoundingClientRect().height)).toBe(44);
  await sidebar.getByRole("button", { name: "Réglages ⌘,", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    __TEST_CALLS__: { command: string }[];
  }).__TEST_CALLS__.some(c => c.command === "open_settings"))).toBe(true);
  await page.screenshot({ path: ".ui-captures/correction-1.3.1/library.png", fullPage: true });
});

test("traitement : pourcentage observé, bleu distinct du vert, aucun pourcentage de chargement", async ({ page }) => {
  await reviewFixture(page);
  await page.evaluate(() => {
    const state = (window as unknown as { __TEST_REVIEW_STATE__: Snapshot }).__TEST_REVIEW_STATE__;
    state.jobs.push({ ...structuredClone(state.jobs[0]), id: "active", name: "Audio en cours.mp3", status: "transcribing", cues: [], verification: null, reviewState: null });
    state.busy = true;
    state.inferenceProgress = { jobId: "active", engine: "ultra", phase: "transcribing", percent: 42 };
  });
  const progress = page.getByRole("progressbar", { name: "Audio traité par le moteur" });
  await expect(progress).toHaveAttribute("value", "42");
  await expect(page.getByText("Transcription : 42 %", { exact: true })).toBeVisible();
  const colors = await page.evaluate(() => ["transcribing", "completed"].map(status =>
    getComputedStyle(document.querySelector(`.status.${status}`)!).color));
  expect(colors[0]).not.toBe(colors[1]);
  expect(await progress.evaluate(el => getComputedStyle(el).accentColor)).toBe(colors[0]);
  await page.emulateMedia({ colorScheme: "dark" });
  const dark = await page.evaluate(() => ["transcribing", "completed"].map(status =>
    getComputedStyle(document.querySelector(`.status.${status}`)!).color));
  expect(dark[0]).not.toBe(dark[1]);
  await expect(page.getByLabel("Résumé du lot")).toContainText("2 / 10 fichiers");
  await page.screenshot({ path: ".ui-captures/correction-1.3.1/progress.png", fullPage: true });
  await page.evaluate(() => {
    const state = (window as unknown as { __TEST_REVIEW_STATE__: Snapshot }).__TEST_REVIEW_STATE__;
    state.inferenceProgress = { jobId: "active", engine: "ultra", phase: "loading", percent: null };
  });
  await expect(page.getByText("Chargement du modèle…", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).not.toHaveAttribute("value");
  await page.evaluate(() => {
    (window as unknown as { __TEST_REVIEW_STATE__: Snapshot }).__TEST_REVIEW_STATE__.inferenceProgress =
      { jobId: "other-job", engine: "ultra", phase: "transcribing", percent: 90 };
  });
  await expect(page.getByText("Préparation du moteur…", { exact: true })).toBeVisible();
  await expect(page.getByRole("progressbar")).not.toHaveAttribute("value");
});

test("double vérification directement après import, sans première transcription", async ({ page }) => {
  await reviewFixture(page);
  await page.evaluate(() => {
    const state = (window as unknown as { __TEST_REVIEW_STATE__: Snapshot }).__TEST_REVIEW_STATE__;
    Object.assign(state.jobs[0], { status: "pending", cues: [], reviewState: null, verification: null, verificationStatus: null });
  });
  await page.getByRole("button", { name: "Double vérification", exact: true }).click();
  await expect(page.getByLabel("Audio à vérifier", { exact: true })).toHaveValue("review-ui");
  const start = page.getByRole("button", { name: "Transcrire et comparer", exact: true });
  await expect(start).toBeEnabled();
  await start.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    __TEST_CALLS__: { command: string; args?: { id?: string } }[];
  }).__TEST_CALLS__.some(c => c.command === "start_verification" && c.args?.id === "review-ui"))).toBe(true);
});

test("export existant : transcription terminée conservée et détail replié", async ({ page }) => {
  await reviewFixture(page);
  await page.evaluate(() => {
    const state = (window as unknown as { __TEST_REVIEW_STATE__: Snapshot }).__TEST_REVIEW_STATE__;
    state.jobs[0].error = "Le fichier existe déjà : /fixture/Voix.srt";
  });
  await expect(page.locator(".export-warning summary")).toHaveText("SRT à enregistrer — voir le détail");
  await expect(page.locator(".export-warning small")).toBeHidden();
  await expect(page.locator(".status.completed")).toHaveText("Terminé");
  await page.locator(".export-warning summary").click();
  await expect(page.locator(".export-warning small")).toContainText("Voix.srt");
});
