import { test, expect, type Page } from "@playwright/test";
async function fixture(page: Page) {
  await page.addInitScript(() => {
    const defaults = [
      {
        id: "liturgy-fr",
        name: "Liturgie FR",
        language: "fr",
        terms: ["Évangile", "Psaume"],
        whisper_prompt: "L’Évangile et le Psaume.",
        builtin: true,
      },
      {
        id: "psychology-fr",
        name: "Psychologie FR",
        language: "fr",
        terms: ["TCC", "Freud"],
        whisper_prompt: "Les TCC et Freud.",
        builtin: true,
      },
      {
        id: "psychology-en-us",
        name: "Psychologie EN-US",
        language: "en",
        terms: ["CBT", "Bowlby"],
        whisper_prompt: "CBT and Bowlby.",
        builtin: true,
      },
    ];
    const state = {
      jobs: [],
      profiles:
        JSON.parse(localStorage.getItem("fixture-profiles") ?? "null") ??
        structuredClone(defaults),
      busy: false,
      modelInstalled: true,
      installedModels: ["ultra", "whisper-turbo"],
      modelUpdates: [],
      platform: "Simulation IPC",
      settings: {
        engine: "ultra",
        language: "fr",
        autoSave: false,
        autoModelUpdates: false,
        vocabulary: [],
        subtitles: { lineLength: 42, maxLines: 2, maxDurationMs: 5000 },
      },
    };
    Object.assign(window, {
      __TEST_PROFILE_STATE__: state,
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main", windowLabel: "main" },
        },
        transformCallback: () => 1,
        unregisterCallback: () => {},
        convertFileSrc: () => "",
        invoke: async (
          command: string,
          args: {
            profile?: (typeof defaults)[number];
            id?: string;
            settings?: typeof state.settings;
          },
        ) => {
          if (command === "snapshot") return state;
          if (command === "confirm_action")
            return (
              (window as unknown as { __TEST_CONFIRM__?: boolean })
                .__TEST_CONFIRM__ !== false
            );
          if (command === "save_settings") {
            state.settings = args.settings!;
            return;
          }
          if (command === "save_profile") {
            const profile = {
              ...args.profile!,
              id: args.profile!.id || `custom-${Date.now()}`,
            };
            state.profiles = [
              ...state.profiles.filter(
                (p: { id: string }) => p.id !== profile.id,
              ),
              profile,
            ];
            localStorage.setItem(
              "fixture-profiles",
              JSON.stringify(state.profiles),
            );
            return profile;
          }
          if (command === "reset_profile") {
            const profile = structuredClone(
              defaults.find((p) => p.id === args.id)!,
            );
            state.profiles = state.profiles.map((p: { id: string }) =>
              p.id === profile.id ? profile : p,
            );
            localStorage.setItem(
              "fixture-profiles",
              JSON.stringify(state.profiles),
            );
            return profile;
          }
          if (command === "delete_profile") {
            state.profiles = state.profiles.filter(
              (p: { id: string }) => p.id !== args.id,
            );
            localStorage.setItem(
              "fixture-profiles",
              JSON.stringify(state.profiles),
            );
          }
          return null;
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Vocabulaire", exact: true }).click();
}
test("profils : créer, coller, ajouter par Entrée, enregistrer et retrouver après redémarrage", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Nouveau profil", exact: true })
    .click();
  await page.getByLabel("Nom du profil", { exact: true }).fill("Mes prières");
  await page
    .getByLabel("Termes du profil", { exact: true })
    .fill(" Évangile \nÉVANGILE\n\n Kyrie ");
  await page.getByLabel("Ajouter un terme", { exact: true }).fill("Magnificat");
  await page.getByLabel("Ajouter un terme", { exact: true }).press("Enter");
  await expect(
    page.getByLabel("Termes du profil", { exact: true }),
  ).toHaveValue("Évangile\nKyrie\nMagnificat");
  await page
    .getByLabel("Invite Whisper", { exact: true })
    .fill("Nous chantons le Magnificat.");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("Profil enregistré", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Vocabulaire", exact: true }).click();
  await page.getByRole("button", { name: /Mes prières.*3 termes/ }).click();
  await expect(
    page.getByLabel("Termes du profil", { exact: true }),
  ).toHaveValue("Évangile\nKyrie\nMagnificat");
  await expect(page.getByLabel("Invite Whisper", { exact: true })).toHaveValue(
    "Nous chantons le Magnificat.",
  );
});
test("profils fournis : suppression interdite, édition et réinitialisation ; garde des modifications", async ({
  page,
}) => {
  await fixture(page);
  await expect(
    page.getByRole("button", { name: "Supprimer", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Termes du profil", { exact: true })
    .fill("Terme changé");
  await page.evaluate(() => Object.assign(window, { __TEST_CONFIRM__: false }));
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Vocabulaire", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.evaluate(() => Object.assign(window, { __TEST_CONFIRM__: true }));
  await page
    .getByRole("button", { name: "Réinitialiser", exact: true })
    .click();
  await expect(
    page.getByLabel("Termes du profil", { exact: true }),
  ).toHaveValue("Évangile\nPsaume");
  await expect(page.getByLabel("Invite Whisper", { exact: true })).toHaveValue(
    "L’Évangile et le Psaume.",
  );
});
