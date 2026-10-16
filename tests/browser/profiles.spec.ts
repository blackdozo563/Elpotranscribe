import { test, expect, type Page } from "@playwright/test";
export async function fixture(page: Page) {
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
    const calls: { command: string; args: unknown }[] = [];
    Object.assign(window, {
      __TEST_PROFILE_CALLS__: calls,
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
            patch?: Partial<typeof state.settings> & {
              profileId?: string;
              clearProfile?: boolean;
            };
            term?: string;
            jobId?: string;
          },
        ) => {
          calls.push({ command, args });
          if (command === "prepare_vocabulary_review") {
            const job = state.jobs.find(
              (j: { id: string }) => j.id === args.id,
            ) as unknown as { cues: unknown[] };
            return {
              cues: structuredClone(job.cues),
              reviewState: null,
              revision: 0,
            };
          }
          if (command === "plugin:menu|new") return [88, "profile-menu"];
          if (command === "snapshot") return structuredClone(state);
          if (command === "confirm_action")
            return (
              (window as unknown as { __TEST_CONFIRM__?: boolean })
                .__TEST_CONFIRM__ !== false
            );
          if (command === "update_settings") {
            const { profileId, clearProfile, ...fields } = args.patch!;
            Object.assign(state.settings, fields);
            if (profileId)
              Object.assign(state.settings, {
                selectedProfileId: profileId,
                language: state.profiles.find(
                  (p: { id: string }) => p.id === profileId,
                ).language,
              });
            if (clearProfile)
              Object.assign(state.settings, { selectedProfileId: null });
            return { settings: structuredClone(state.settings), revision: 1 };
          }
          if (command === "save_settings") {
            state.settings = args.settings!;
            return;
          }
          if (command === "prompt_info")
            return { count: 20, used: 20, limit: 224 };
          if (command === "add_profile_term") {
            const profile = state.profiles.find(
              (p: { id: string }) => p.id === args.id,
            );
            profile.terms = [...new Set([...profile.terms, args.term!])];
            localStorage.setItem(
              "fixture-profiles",
              JSON.stringify(state.profiles),
            );
            return profile;
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
export async function pasteTerms(page: Page, text: string) {
  await page
    .getByLabel("Ajouter un terme", { exact: true })
    .evaluate((field, text) => {
      const clipboardData = new DataTransfer();
      clipboardData.setData("text/plain", text);
      field.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData, bubbles: true }),
      );
    }, text);
}
export async function profileMenu(page: Page, id: string) {
  await page
    .getByRole("button", { name: "Options du profil", exact: true })
    .click();
  await page.evaluate((id) => {
    const calls = (
      window as unknown as {
        __TEST_PROFILE_CALLS__: {
          command: string;
          args: {
            options?: {
              items: {
                id?: string;
                handler?: { onmessage: (id: string) => void };
              }[];
            };
          };
        }[];
      }
    ).__TEST_PROFILE_CALLS__;
    const item = calls
      .filter((c) => c.command === "plugin:menu|new")
      .at(-1)
      ?.args.options?.items.find((i) => i.id === id);
    item?.handler?.onmessage(id);
  }, id);
}
test("profils : créer, coller, ajouter par Entrée, enregistrer et retrouver après redémarrage", async ({
  page,
}) => {
  await fixture(page);
  await page
    .getByRole("button", { name: "Nouveau profil", exact: true })
    .click();
  await page.getByLabel("Nom du profil", { exact: true }).fill("Mes prières");
  await pasteTerms(page, " Évangile \nÉVANGILE\n\n Kyrie ");
  await page.getByLabel("Ajouter un terme", { exact: true }).fill("Magnificat");
  await page.getByLabel("Ajouter un terme", { exact: true }).press("Enter");
  await expect(
    page.getByRole("list", { name: "Termes enregistrés dans le profil" }),
  ).toHaveText(/ÉvangileKyrieMagnificat/);
  await page
    .getByLabel("Phrase de contexte", { exact: true })
    .fill("Nous chantons le Magnificat.");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("Profil enregistré", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Vocabulaire", exact: true }).click();
  await page.getByRole("button", { name: /Mes prières.*3 termes/ }).click();
  await expect(
    page.getByRole("list", { name: "Termes enregistrés dans le profil" }),
  ).toHaveText(/ÉvangileKyrieMagnificat/);
  await expect(
    page.getByLabel("Phrase de contexte", { exact: true }),
  ).toHaveValue("Nous chantons le Magnificat.");
});
test("profils fournis : suppression interdite, édition et réinitialisation ; garde des modifications", async ({
  page,
}) => {
  await fixture(page);
  await expect(
    page.getByRole("button", { name: "Supprimer le profil", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Ajouter un terme", { exact: true })
    .fill("Terme changé");
  await page.getByLabel("Ajouter un terme", { exact: true }).press("Enter");
  await page.evaluate(() => Object.assign(window, { __TEST_CONFIRM__: false }));
  await page.getByRole("button", { name: "Modèles IA", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Vocabulaire", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await page.evaluate(() => Object.assign(window, { __TEST_CONFIRM__: true }));
  await profileMenu(page, "reset");
  await expect(
    page.getByRole("list", { name: "Termes enregistrés dans le profil" }),
  ).toHaveText("ÉvangilePsaume");
  await expect(
    page.getByLabel("Phrase de contexte", { exact: true }),
  ).toHaveValue("L’Évangile et le Psaume.");
});

test("sélection du profil : langue automatique et lien vers le bon profil", async ({
  page,
}) => {
  await fixture(page);
  await page.getByRole("button", { name: "Bibliothèque", exact: true }).click();
  await page
    .getByRole("button", { name: /Réglages de transcription :/ })
    .click();
  await page
    .getByLabel("Profil de vocabulaire", { exact: true })
    .selectOption("psychology-en-us");
  await expect(page.getByLabel("Langue", { exact: true })).toHaveValue("en");
  await page
    .getByRole("button", { name: "Modifier le profil…", exact: true })
    .click();
  await expect(page.getByLabel("Nom du profil", { exact: true })).toHaveValue(
    "Psychologie EN-US",
  );
});
test("éditeur : terme proche, remplacement annulable et ajout au profil persistant", async ({
  page,
}) => {
  await fixture(page);
  await page.evaluate(() => {
    const state = (
      window as unknown as {
        __TEST_PROFILE_STATE__: {
          jobs: unknown[];
          profiles: unknown[];
          settings: { selectedProfileId?: string };
        };
      }
    ).__TEST_PROFILE_STATE__;
    state.settings.selectedProfileId = "liturgy-fr";
    state.jobs = [
      {
        id: "profile-job",
        source: "/fixture/prière.wav",
        name: "prière.wav",
        size: 123,
        durationMs: 5000,
        status: "completed",
        cues: [{ startMs: 100, endMs: 4900, text: "Evengile et Freud." }],
        error: null,
        exportPath: null,
        dirty: false,
        createdAt: 0,
        language: "fr",
        engine: "ultra",
        profileSnapshot: state.profiles[0],
      },
    ];
  });
  await page.getByRole("button", { name: "Bibliothèque", exact: true }).click();
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  const cue = page.getByRole("textbox", { name: "Sous-titre 1", exact: true });
  await expect(
    page.locator("mark").filter({ hasText: "Evengile" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remplacer par Évangile", exact: true })
    .click();
  await expect(cue).toHaveValue("Évangile et Freud.");
  await expect(page.getByLabel("Début 1", { exact: true })).toHaveValue(
    "00:00:00,100",
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(cue).toHaveValue("Evengile et Freud.");
  await cue.focus();
  await cue.evaluate((field: HTMLTextAreaElement) => {
    const at = field.value.indexOf("Freud");
    field.setSelectionRange(at, at + 5);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect(
    page.getByRole("button", { name: "Ajouter au profil", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Ajouter au profil", exact: true })
    .click();
  await page
    .getByRole("button", { name: "← Retour à la file", exact: true })
    .click();
  await page.getByRole("button", { name: "Vocabulaire", exact: true }).click();
  await expect(
    page.getByLabel("Termes du profil", { exact: true }),
  ).toContainText("Freud");
  await page.reload();
  await page.getByRole("button", { name: "Vocabulaire", exact: true }).click();
  await expect(
    page.getByLabel("Termes du profil", { exact: true }),
  ).toContainText("Freud");
});

test("termes : doublons signalés, filtre au-delà de vingt, retrait et sauvegarde", async ({
  page,
}) => {
  await fixture(page);
  await expect(
    page.getByLabel("Filtrer les termes", { exact: true }),
  ).toHaveCount(0);
  await pasteTerms(page, "ÉVANGILE\nÉpître\nÉpître");
  await expect(
    page.getByRole("status").filter({ hasText: "Déjà présents" }),
  ).toContainText("ÉVANGILE, Épître");
  await expect(
    page.getByRole("button", { name: "Retirer Épître", exact: true }),
  ).toHaveCount(1);
  await pasteTerms(
    page,
    Array.from({ length: 19 }, (_, i) => `Terme ${i + 1}`).join("\n"),
  );
  await page.getByLabel("Filtrer les termes", { exact: true }).fill("TERME 19");
  const list = page.getByRole("list", {
    name: "Termes enregistrés dans le profil",
  });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Retirer Terme 19", exact: true })
    .click();
  await expect(
    page.getByText("Aucun terme ne correspond.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Filtrer les termes", { exact: true }).fill("");
  await page
    .getByRole("button", { name: "Retirer Terme 18", exact: true })
    .click();
  await expect(
    page.getByLabel("Filtrer les termes", { exact: true }),
  ).toHaveCount(0);
  await expect(list.getByRole("listitem")).toHaveCount(20);
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByText("Profil enregistré", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Phrase de contexte", { exact: true }),
  ).toHaveValue("L’Évangile et le Psaume.");
  await expect(
    page.getByRole("region", { name: "Éditer le profil" }),
  ).toContainText("Whisper large-v3-turbo");
});

test("profils : menu natif, duplication et suppression confirmée", async ({
  page,
}) => {
  await fixture(page);
  await profileMenu(page, "duplicate");
  await expect(page.getByLabel("Nom du profil", { exact: true })).toHaveValue(
    "Liturgie FR — copie",
  );
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Supprimer le profil", exact: true }),
  ).toBeEnabled();
  await page.evaluate(() => Object.assign(window, { __TEST_CONFIRM__: false }));
  await page
    .getByRole("button", { name: "Supprimer le profil", exact: true })
    .click();
  await expect(page.getByLabel("Nom du profil", { exact: true })).toHaveValue(
    "Liturgie FR — copie",
  );
  await page.evaluate(() => Object.assign(window, { __TEST_CONFIRM__: true }));
  await page
    .getByRole("button", { name: "Supprimer le profil", exact: true })
    .click();
  await expect(page.getByLabel("Nom du profil", { exact: true })).toHaveValue(
    "Liturgie FR",
  );
});

test("profil : les actions JSON du menu conservent les commandes et l’identifiant existants", async ({
  page,
}) => {
  await fixture(page);
  await profileMenu(page, "export");
  await profileMenu(page, "import");
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          __TEST_PROFILE_CALLS__: {
            command: string;
            args: {
              id?: string;
              options?: { items: { text: string; enabled?: boolean }[] };
            };
          }[];
        }
      ).__TEST_PROFILE_CALLS__,
  );
  expect(calls.find((call) => call.command === "export_profile")?.args).toEqual(
    { id: "liturgy-fr" },
  );
  expect(calls.some((call) => call.command === "import_profile")).toBe(true);
  expect(
    calls
      .filter((call) => call.command === "plugin:menu|new")
      .at(-1)
      ?.args.options?.items.map((item) => item.text),
  ).toEqual(["Dupliquer", "Réinitialiser", "Importer .json", "Exporter .json"]);
  const profile = page.getByRole("button", { name: /Psychologie EN-US/ });
  expect(
    await profile.evaluate((el) => getComputedStyle(el).flexDirection),
  ).toBe("column");
});
