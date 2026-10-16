import { test, expect } from "@playwright/test";
import { reviewFixture, opinionFixtureStage } from "./reviewFixture";
const requestFromEditor = async (page: import("@playwright/test").Page) => {
  await reviewFixture(page);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await page
    .getByRole("button", { name: "Demander un second avis", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Demander un second avis", exact: true }),
  ).toBeVisible();
};
test("second avis : feuille inversable, étapes observées et ouverture automatique de la relecture", async ({
  page,
}) => {
  await requestFromEditor(page);
  const sheet = await page
    .getByRole("dialog", { name: "Demander un second avis", exact: true })
    .boundingBox();
  expect(
    Math.abs(sheet!.x + sheet!.width / 2 - page.viewportSize()!.width / 2),
  ).toBeLessThan(2);
  await expect(
    page.getByText(
      "Les deux moteurs vont analyser l’audio l’un après l’autre.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(
    page.getByLabel("Moteur principal", { exact: true }),
  ).toHaveValue("ultra");
  await page
    .getByRole("button", { name: "Inverser les moteurs", exact: true })
    .click();
  await expect(
    page.getByLabel("Moteur principal", { exact: true }),
  ).toHaveValue("whisper-turbo");
  await expect(page.getByLabel("Second avis", { exact: true })).toHaveValue(
    "ultra",
  );
  await page
    .getByRole("button", { name: "Transcrire et comparer", exact: true })
    .click();
  await expect(
    page.getByText("En attente du moteur principal", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Temps écoulé :", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await opinionFixtureStage(page, "primary");
  await expect(
    page.getByText("Moteur principal · Whisper large-v3-turbo Q5_0", {
      exact: true,
    }),
  ).toBeVisible();
  await opinionFixtureStage(page, "secondary");
  await expect(
    page.getByText("Second avis · Parakeet Ultra", { exact: true }),
  ).toBeVisible();
  await opinionFixtureStage(page, "comparison");
  await expect(
    page.getByText("Comparaison des transcriptions", { exact: true }),
  ).toBeVisible();
  await opinionFixtureStage(page, "completed");
  await expect(
    page.getByRole("dialog", { name: "Choisir une lecture", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Relecture", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_CALLS__: Array<{ command: string; args: unknown }>;
          }
        ).__TEST_CALLS__.find((c) => c.command === "start_verification")?.args,
    ),
  ).toEqual({ id: "review-ui", primary: "whisper-turbo", secondary: "ultra" });
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_REVIEW_STATE__: {
              jobs: Array<{ id: string; cues: Array<{ text: string }> }>;
            };
          }
        ).__TEST_REVIEW_STATE__.jobs.find((j) => j.id === "review-ui")!.cues[0]
          .text,
    ),
  ).toBe("Je sors ce foir.");
});
test("À relire : compte les divergences persistées et ouvre un résultat archivé en relecture", async ({
  page,
}) => {
  await reviewFixture(page);
  const nav = page.getByRole("button", { name: "À relire", exact: true });
  await expect(nav).toHaveText("À relire3");
  await nav.click();
  await page.getByRole("button", { name: "Voix.wav", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Choisir une lecture", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(nav).toHaveText("À relire2");
  await page.getByRole("button", { name: "Bibliothèque", exact: true }).click();
  await page.evaluate(() => {
    const state = (
      window as unknown as {
        __TEST_REVIEW_STATE__: { jobs: Array<{ archived: boolean }> };
      }
    ).__TEST_REVIEW_STATE__;
    state.jobs[0].archived = true;
  });
  await nav.click();
  await page.getByRole("button", { name: "Voix.wav", exact: true }).click();
  await expect(
    page.getByText("3 divergences · 1 traitées", { exact: true }),
  ).toBeVisible();
});
test("second avis : ne propose que les moteurs installés et protège les modifications non enregistrées", async ({
  page,
}) => {
  await reviewFixture(page);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await page
    .getByLabel("Sous-titre 1", { exact: true })
    .fill("Texte personnel non enregistré.");
  await page.evaluate(() => Object.assign(window, { __TEST_CONFIRM__: false }));
  await page
    .getByRole("button", { name: "Demander un second avis", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Demander un second avis", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Sous-titre 1", { exact: true })).toHaveValue(
    "Texte personnel non enregistré.",
  );
  await page.evaluate(() => {
    Object.assign(window, { __TEST_CONFIRM__: true });
    (
      window as unknown as {
        __TEST_REVIEW_STATE__: { installedModels: string[] };
      }
    ).__TEST_REVIEW_STATE__.installedModels = ["ultra"];
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __TEST_REVIEW_STATE__: { installedModels: string[] };
            }
          ).__TEST_REVIEW_STATE__.installedModels.length,
      ),
    )
    .toBe(1);
  await page
    .getByRole("button", { name: "Demander un second avis", exact: true })
    .click();
  await expect(
    page.getByLabel("Moteur principal", { exact: true }).locator("option"),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Transcrire et comparer", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("Second avis", { exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Sous-titre 1", { exact: true })).toHaveValue(
    "Texte personnel non enregistré.",
  );
});
test("second avis : annulation conserve le résultat principal sans ouverture automatique", async ({
  page,
}) => {
  await requestFromEditor(page);
  await page
    .getByRole("button", { name: "Transcrire et comparer", exact: true })
    .click();
  await opinionFixtureStage(page, "secondary");
  await expect(
    page.getByText("Second avis · Whisper large-v3-turbo Q5_0", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Annuler la vérification", exact: true })
    .click();
  await expect(
    page.getByText("Vérification annulée", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Choisir une lecture", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Ouvrir la transcription principale",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Sous-titre 1", { exact: true })).toHaveValue(
    "Je sors ce foir.",
  );
});
test("second avis : absence de divergences ouvre un état terminé explicite", async ({
  page,
}) => {
  await requestFromEditor(page);
  await page
    .getByRole("button", { name: "Transcrire et comparer", exact: true })
    .click();
  await opinionFixtureStage(page, "noDifferences");
  await expect(
    page.getByText("Relecture terminée", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("0 divergences · 0 traitées", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Choisir une lecture", exact: true }),
  ).toHaveCount(0);
});
test("À relire : état vide sans ancien formulaire et feuille sans source", async ({
  page,
}) => {
  await reviewFixture(page);
  await page.evaluate(() => {
    (
      window as unknown as { __TEST_REVIEW_STATE__: { jobs: unknown[] } }
    ).__TEST_REVIEW_STATE__.jobs = [];
  });
  await page.getByRole("button", { name: "À relire", exact: true }).click();
  await expect(
    page.getByText("Aucune divergence à traiter", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Moteur principal", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Demander un second avis", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Transcrire et comparer", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Importez un audio dans la bibliothèque pour commencer.", {
      exact: true,
    }),
  ).toBeVisible();
});
test("second avis : une fin de traitement ne remplace pas une saisie sur un autre écran", async ({
  page,
}) => {
  await requestFromEditor(page);
  await page
    .getByRole("button", { name: "Transcrire et comparer", exact: true })
    .click();
  await page.getByRole("button", { name: "Bibliothèque", exact: true }).click();
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await page
    .getByLabel("Sous-titre 1", { exact: true })
    .fill("Texte en cours : ne pas interrompre.");
  await opinionFixtureStage(page, "completed");
  await expect(
    page.getByText(
      "Second avis terminé. La relecture est disponible dans À relire ou dans la bibliothèque.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Choisir une lecture", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Sous-titre 1", { exact: true })).toHaveValue(
    "Texte en cours : ne pas interrompre.",
  );
});

test("second avis : un échec conserve un accès explicite au texte principal", async ({
  page,
}) => {
  await requestFromEditor(page);
  await page
    .getByRole("button", { name: "Transcrire et comparer", exact: true })
    .click();
  await opinionFixtureStage(page, "failed");
  await expect(
    page.getByText("Vérification incomplète", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Second moteur interrompu (simulation).", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Choisir une lecture", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", {
      name: "Ouvrir la transcription principale",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Sous-titre 1", { exact: true })).toHaveValue(
    "Je sors ce foir.",
  );
});
