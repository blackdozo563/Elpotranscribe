import { test, expect, type Page } from "@playwright/test";
import { reviewFixture } from "./reviewFixture";
import { settingsFixture } from "./settingsFixture";
async function chapterFixture(page: Page, pauses = true) {
  await reviewFixture(page);
  await page.evaluate((pauses) => {
    const state = (
      window as unknown as {
        __TEST_REVIEW_STATE__: { jobs: Record<string, unknown>[] };
      }
    ).__TEST_REVIEW_STATE__;
    Object.assign(state.jobs[0], {
      durationMs: 40000,
      reviewState: null,
      verification: null,
      editRevision: 0,
      cues: pauses
        ? [
            {
              startMs: 500,
              endMs: 7000,
              text: "Bienvenue dans cette conférence.",
            },
            { startMs: 12050, endMs: 17000, text: "Notre premier sujet." },
            { startMs: 25500, endMs: 28000, text: "Notre dernier sujet." },
          ]
        : [{ startMs: 0, endMs: 40000, text: "Une phrase continue." }],
    });
  }, pauses);
  await expect(
    page.getByRole("cell", { name: "00:00:40", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
}
test("chapitres : pauses réelles, titres modifiables, copie et sous-titres conservés", async ({
  page,
}) => {
  await chapterFixture(page);
  await page
    .getByRole("button", { name: "Copier les chapitres YouTube", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Chapitres YouTube" });
  await expect(dialog).toContainText("00:00");
  await expect(dialog).toContainText("00:12");
  await expect(dialog).toContainText("00:25");
  await page
    .getByLabel("Titre du chapitre 2", { exact: true })
    .fill("Introduction au sujet");
  await dialog
    .getByRole("button", { name: "Copier les chapitres", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toHaveText("Chapitres copiés");
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          __TEST_CALLS__: { command: string; args: { text?: string } }[];
        }
      ).__TEST_CALLS__,
  );
  expect(calls.find((c) => c.command === "copy_chapters")?.args).toEqual({
    text: "00:00 Bienvenue dans cette conférence.\n00:12 Introduction au sujet\n00:25 Notre dernier sujet.",
  });
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Sous-titre 2", { exact: true })).toHaveValue(
    "Notre premier sujet.",
  );
  await expect(page.getByLabel("Début 2", { exact: true })).toHaveValue(
    "00:00:12,050",
  );
});
test("chapitres : absence de pauses annoncée sans repères fabriqués", async ({
  page,
}) => {
  await chapterFixture(page, false);
  await page
    .getByRole("button", { name: "Copier les chapitres YouTube", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Aucun repère supplémentaire n’a été créé",
  );
  await expect(
    page.getByRole("button", { name: "Copier les chapitres", exact: true }),
  ).toBeDisabled();
});
test("finition : thème système, logo unique, sélection mobile et mouvement réduit", async ({
  page,
}) => {
  await reviewFixture(page);
  await expect(page.locator("img.app-logo")).toHaveCount(1);
  const indicator = page.locator(".nav-selection");
  const initial = await indicator.evaluate(
    (el) => getComputedStyle(el).transform,
  );
  await page.getByRole("button", { name: "Modèles IA", exact: true }).click();
  await expect
    .poll(() => indicator.evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(initial);
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  expect(
    await page
      .locator("main")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(246, 246, 247)");
  expect(
    await indicator.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await page.emulateMedia({ colorScheme: "dark" });
  expect(
    await page
      .locator("main")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(17, 17, 20)");
});
test("modèles : anneau à partir des octets, sans progression si total inconnu", async ({
  page,
}) => {
  await reviewFixture(page);
  await page.evaluate(() =>
    Object.assign(
      (window as unknown as { __TEST_REVIEW_STATE__: object })
        .__TEST_REVIEW_STATE__,
      {
        downloadProgress: {
          engine: "whisper-turbo",
          receivedBytes: 25,
          totalBytes: 100,
          fileName: "fixture.bin",
          phase: "downloading",
        },
      },
    ),
  );
  await page.getByRole("button", { name: "Modèles IA", exact: true }).click();
  const progress = page.getByRole("progressbar");
  await expect(progress).toHaveAttribute("aria-valuenow", "25");
  await expect(progress).toContainText("fixture.bin");
  await page.evaluate(() =>
    Object.assign(
      (
        window as unknown as {
          __TEST_REVIEW_STATE__: { downloadProgress: object };
        }
      ).__TEST_REVIEW_STATE__.downloadProgress,
      { totalBytes: null },
    ),
  );
  await expect(progress).not.toHaveAttribute("aria-valuenow");
  await expect(progress).toContainText("taille totale inconnue");
});
test("export : coche seulement après un fichier effectivement retourné", async ({
  page,
}) => {
  await reviewFixture(page);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await page
    .getByRole("button", { name: "SRT à côté de l’audio", exact: true })
    .click();
  await expect(
    page.getByText("Export enregistré", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (command: string, args: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__,
      original = internals.invoke;
    internals.invoke = (command, args) =>
      command === "export_job"
        ? Promise.resolve(null)
        : original(command, args);
  });
  await page
    .getByRole("button", { name: "SRT à côté de l’audio", exact: true })
    .click();
  await expect(
    page.getByText("Export enregistré", { exact: true }),
  ).toHaveCount(0);
});
test("réglages : suit aussi l’apparence claire dans la seconde fenêtre", async ({
  page,
  context,
}) => {
  await settingsFixture(context);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/?window=settings");
  await expect(
    page.getByRole("heading", { name: "Réglages", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("main")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(246, 246, 247)");
});

test("chapitres : échec de copie visible et saisie conservée", async ({
  page,
}) => {
  await chapterFixture(page);
  await page.evaluate(() => {
    const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (command: string, args: unknown) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__,
      original = internals.invoke;
    internals.invoke = (command, args) =>
      command === "copy_chapters"
        ? Promise.reject(new Error("Presse-papiers indisponible (fixture)"))
        : original(command, args);
  });
  await page
    .getByRole("button", { name: "Copier les chapitres YouTube", exact: true })
    .click();
  await page
    .getByLabel("Titre du chapitre 2", { exact: true })
    .fill("Titre conservé");
  await page
    .getByRole("button", { name: "Copier les chapitres", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Presse-papiers indisponible",
  );
  await expect(
    page.getByLabel("Titre du chapitre 2", { exact: true }),
  ).toHaveValue("Titre conservé");
  await expect(page.getByText("Chapitres copiés", { exact: true })).toHaveCount(
    0,
  );
});
