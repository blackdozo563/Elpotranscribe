import { test, expect } from "@playwright/test";
import { settingsFixture } from "./settingsFixture";

test("réglages : fenêtre séparée, sauvegarde immédiate, aperçu réel et synchronisation", async ({
  page,
  context,
}) => {
  const { state } = await settingsFixture(context);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Paramètres", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  const cue = page.getByLabel("Sous-titre 1", { exact: true });
  await cue.fill("Texte en cours de modification.");
  const popup = context.waitForEvent("page");
  await page.keyboard.press("Control+,");
  const settings = await popup;
  await settings.setViewportSize({ width: 740, height: 620 });
  await expect(
    settings.getByRole("heading", { name: "Réglages", exact: true }),
  ).toBeVisible();
  await expect(cue).toHaveValue("Texte en cours de modification.");
  await expect(
    settings.getByRole("region", { name: "Aperçu du sous-titre" }),
  ).toContainText("Une vraie phrase");
  await expect(
    settings.getByRole("region", { name: "Aperçu du sous-titre" }),
  ).toContainText("00:00:01,200 → 00:00:07,200");
  await settings
    .getByLabel("Préréglage", { exact: true })
    .selectOption("vertical");
  await expect(settings.getByRole("status")).toHaveText("Enregistré");
  await expect(
    settings.getByRole("spinbutton", { name: "Nombre de lignes", exact: true }),
  ).toHaveValue("1");
  expect(state.settings.subtitles).toEqual({
    lineLength: 24,
    maxLines: 1,
    maxDurationMs: 3000,
  });
  await expect(
    settings.getByRole("region", { name: "Aperçu du sous-titre" }),
  ).toContainText("Ses temps restent inchangés.");
  await settings.getByRole("tab", { name: "Modèles et réseau" }).click();
  await settings
    .getByRole("checkbox", { name: /Rechercher automatiquement/ })
    .check();
  await expect(settings.getByRole("status")).toHaveText("Enregistré");
  await page.getByRole("button", { name: "Mode local", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Mode local" })).toContainText(
    "Vérification automatique des versions : activée",
  );
  await page.keyboard.press("Escape");
  await settings.getByRole("tab", { name: "Application", exact: true }).click();
  await expect(settings.getByRole("tabpanel")).toContainText("1.2.0-test");
  await expect(settings.getByRole("tabpanel")).toContainText(
    "Mac14,2 (fixture)",
  );
  await expect(settings.getByRole("tabpanel")).toContainText(
    "Aucune télémétrie",
  );
  await settings.getByRole("checkbox", { name: /Enregistrer les SRT/ }).check();
  await expect(settings.getByRole("status")).toHaveText("Enregistré");
  // Other direction: the main window updates the same preference while settings stays open.
  await page
    .getByRole("button", { name: "← Retour à la file", exact: true })
    .click();
  await page.getByRole("checkbox", { name: /Enregistrer les SRT/ }).uncheck();
  await expect(
    settings.getByRole("checkbox", { name: /Enregistrer les SRT/ }),
  ).not.toBeChecked();
  expect(state.settings.subtitles.lineLength).toBe(24);
});

test("réglages : stepper, navigation clavier et erreur de sauvegarde sans fausse confirmation", async ({
  page,
  context,
}) => {
  const { state, control } = await settingsFixture(context, true);
  await page.goto("/?window=settings");
  await expect(
    page.getByRole("region", { name: "Aperçu du sous-titre" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Augmenter Caractères par ligne",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toHaveText("Enregistré");
  expect(state.settings.subtitles.lineLength).toBe(43);
  await expect(page.getByLabel("Préréglage", { exact: true })).toHaveValue(
    "custom",
  );
  control.fail = true;
  await page
    .getByRole("button", { name: "Diminuer Caractères par ligne", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Écriture refusée");
  await expect(
    page.getByRole("spinbutton", { name: "Caractères par ligne", exact: true }),
  ).toHaveValue("43");
  await expect(page.getByRole("status")).not.toHaveText("Enregistré");
  await page.getByRole("tab", { name: "Sous-titres", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Modèles et réseau" }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Application", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: /Enregistrer les préférences/ }),
  ).toHaveCount(0);
});

test("réglages : réutilise la fenêtre et attend l’écriture avant de fermer", async ({
  page,
  context,
}) => {
  const { state, control, calls } = await settingsFixture(context, true);
  await page.goto("/");
  await expect
    .poll(() => calls.some((call) => call.command === "menu_ready"))
    .toBe(true);
  const popup = context.waitForEvent("page");
  await page.keyboard.press("Control+,");
  const settings = await popup;
  await expect(
    settings.getByRole("spinbutton", {
      name: "Caractères par ligne",
      exact: true,
    }),
  ).toHaveValue("42");
  await page.keyboard.press("Control+,");
  expect(context.pages()).toHaveLength(2);
  control.delay = 400;
  await settings
    .getByRole("button", {
      name: "Augmenter Caractères par ligne",
      exact: true,
    })
    .click();
  await expect(
    settings.getByRole("spinbutton", {
      name: "Caractères par ligne",
      exact: true,
    }),
  ).toBeDisabled();
  const closed = settings.waitForEvent("close");
  await settings.keyboard.press("Control+w");
  await closed;
  expect(state.settings.subtitles.lineLength).toBe(43);
});
