import { test, expect } from "@playwright/test";
import { reviewFixture } from "./reviewFixture";
const openReview = async (page: import("@playwright/test").Page) => {
  await reviewFixture(page);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await page.getByRole("button", { name: "Relecture", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Choisir une lecture" }),
  ).toBeVisible();
};

test("relecture : Tab, Entrée, Échap, Modifier, annulation, rétablissement et reprise", async ({
  page,
}) => {
  await openReview(page);
  await expect(
    page.getByText("3 divergences · 0 traitées", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("dialog")).toContainText("Divergence 2 sur 3");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("dialog")).toContainText("Divergence 1 sur 3");
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("3 divergences · 1 traitées", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Divergence 2 sur 3");
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("3 divergences · 2 traitées", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("Divergence 3 sur 3");
  await page.keyboard.press("m");
  await expect(page.getByLabel("Votre lecture", { exact: true })).toBeFocused();
  await page.getByLabel("Votre lecture", { exact: true }).fill("après-demain.");
  await page
    .getByRole("button", { name: "Valider la modification", exact: true })
    .click();
  await expect(
    page.getByText("3 divergences · 3 traitées", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Relecture terminée", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".review-text")).toHaveText([
    "Je sors ce soir.",
    "Nous sommes à pari.",
    "Il revient après-demain.",
  ]);
  await expect(
    page
      .getByRole("complementary", { name: "Divergences à traiter" })
      .getByRole("button"),
  ).toHaveCount(0);
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fixture-review-phase7")!),
  );
  expect(
    stored.jobs[0].cues.map((c: { startMs: number; endMs: number }) => [
      c.startMs,
      c.endMs,
    ]),
  ).toEqual([
    [100, 2500],
    [2800, 5000],
    [5300, 7900],
  ]);
  expect(
    stored.jobs[0].reviewState.differences.map(
      (d: { status: string }) => d.status,
    ),
  ).toEqual(["accepted", "kept", "modified"]);
  await page.keyboard.press("Meta+z");
  await expect(
    page.getByText("3 divergences · 2 traitées", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".review-text").nth(2)).toHaveText(
    "Il revient demain.",
  );
  await page.keyboard.press("Meta+Shift+z");
  await expect(
    page.getByText("3 divergences · 3 traitées", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await page.getByRole("button", { name: "Relecture", exact: true }).click();
  await expect(
    page.getByText("3 divergences · 3 traitées", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".review-text").nth(2)).toHaveText(
    "Il revient après-demain.",
  );
  await expect(
    page.getByText(
      "L’accord entre moteurs ne garantit pas l’absence d’erreur.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("relecture : édition manuelle impose une nouvelle sélection et garde une annulation commune", async ({
  page,
}) => {
  await reviewFixture(page);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await page
    .getByLabel("Sous-titre 1", { exact: true })
    .fill("Ce texte a changé.");
  await page.getByRole("button", { name: "Relecture", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Accepter la lecture du second avis (Entrée)",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Garder la lecture du moteur principal (Échap)",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Modifier la lecture (M)", exact: true })
    .click();
  await page.getByLabel("Votre lecture", { exact: true }).fill("Le");
  await expect(
    page.getByRole("button", { name: "Valider la modification", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Passage actuel à sélectionner", { exact: true })
    .focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page
    .getByRole("button", { name: "Valider la modification", exact: true })
    .click();
  await expect(page.locator(".review-text").first()).toHaveText(
    "Le texte a changé.",
  );
  await page.keyboard.press("Meta+z");
  await expect(page.locator(".review-text").first()).toHaveText(
    "À revoirCe texte a changé.",
  );
  await page.keyboard.press("Meta+z");
  await expect(page.locator(".review-text").first()).toHaveText(
    "Je sors ce foir.",
  );
  await expect(
    page.getByText("3 divergences · 0 traitées", { exact: true }),
  ).toBeVisible();
});

test("relecture : erreur de persistance visible, décision inchangée et nouvelle tentative", async ({
  page,
}) => {
  await openReview(page);
  await page.evaluate(() =>
    Object.assign(window, { __TEST_REVIEW_FAIL__: true }),
  );
  await page
    .getByRole("button", {
      name: "Accepter la lecture du second avis (Entrée)",
      exact: true,
    })
    .click();
  await expect(page.getByRole("alert")).toContainText("Écriture impossible");
  await expect(
    page.getByText("3 divergences · 0 traitées", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".review-text").first()).toHaveText(
    "Je sors ce foir.",
  );
  await page.evaluate(() =>
    Object.assign(window, { __TEST_REVIEW_FAIL__: false }),
  );
  await page
    .getByRole("button", {
      name: "Garder la lecture du moteur principal (Échap)",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("3 divergences · 1 traitées", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".review-text").first()).toHaveText(
    "Je sors ce foir.",
  );
  await page.evaluate(() =>
    Object.assign(window, { __TEST_REVIEW_FAIL__: true }),
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Écriture impossible");
  await expect(
    page.getByText("3 divergences · 1 traitées", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.assign(window, { __TEST_REVIEW_FAIL__: false }),
  );
  await page.keyboard.press("Meta+z");
  await expect(
    page.getByText("3 divergences · 0 traitées", { exact: true }),
  ).toBeVisible();
});

test("relecture : gouttière alignée, écoute sur temps réels et raccourcis suspendus pendant la saisie", async ({
  page,
}) => {
  await openReview(page);
  const gutter = page.getByRole("button", {
    name: "Aller à la divergence 2",
    exact: true,
  });
  await gutter.click();
  await expect(page.getByRole("dialog")).toContainText("Divergence 2 sur 3");
  const a = await gutter.boundingBox(),
    b = await page.locator('[data-difference-id="review-ui:1"]').boundingBox();
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(2);
  await page
    .getByRole("button", {
      name: "Écouter à partir d’une seconde avant le segment",
      exact: true,
    })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __TEST_AUDIO_STARTED_AT__: number })
            .__TEST_AUDIO_STARTED_AT__,
      ),
    )
    .toBeCloseTo(1.8);
  await page.locator(".review-word").first().click();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("3 divergences · 1 traitées", { exact: true }),
  ).toBeVisible();
  const restoresBefore = await page.evaluate(
    () =>
      (
        window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
      ).__TEST_CALLS__.filter((c) => c.command === "restore_review").length,
  );
  await page.keyboard.press("m");
  await page.getByLabel("Votre lecture", { exact: true }).fill("Ma lecture");
  await page.keyboard.press("Enter");
  await page.keyboard.type("m");
  await page.keyboard.press("Meta+z");
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("elpo-editor-action", { detail: "undo" }),
    ),
  );
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
        ).__TEST_CALLS__.filter((c) => c.command === "restore_review").length,
    ),
  ).toBe(restoresBefore);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("dialog")).toContainText("Divergence 2 sur 3");
  await expect(
    page.getByText("3 divergences · 1 traitées", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
        ).__TEST_CALLS__.filter((c) => c.command === "resolve_review").length,
    ),
  ).toBe(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".review-word")
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
});

test("relecture : rouvrir charge la révision persistée même si la bibliothèque est en retard", async ({
  page,
}) => {
  await openReview(page);
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("3 divergences · 1 traitées", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.assign(window, { __TEST_REVIEW_STALE_SNAPSHOT__: true }),
  );
  await page.getByRole("button", { name: "Bibliothèque", exact: true }).click();
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await page.getByRole("button", { name: "Relecture", exact: true }).click();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("3 divergences · 2 traitées", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
