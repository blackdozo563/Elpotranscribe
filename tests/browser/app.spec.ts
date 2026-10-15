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
test("seuls Ultra et Whisper Turbo sont proposés", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Modèles IA", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Parakeet Ultra", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Whisper large-v3-turbo Q5_0",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Installer Parakeet Ultra" }),
  ).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Installer / })).toHaveCount(
    2,
  );
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
      installedModels: ["ultra"],
      modelUpdates: [],
      platform: "Simulation UI",
      settings: {
        engine: "ultra",
        language: "fr",
        autoSave: false,
        autoModelUpdates: true,
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

// These fixtures exercise only renderer behavior; native inference has separate tests.
async function localReviewFixture(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const cues = [
      { startMs: 100, endMs: 2500, text: "Je vais sortir ce foir." },
    ];
    const job = {
      id: "review-fixture",
      source: "/fixture/Voix.wav",
      name: "Voix.wav",
      size: 100000,
      durationMs: 3000,
      status: "completed",
      cues,
      error: null,
      exportPath: null,
      dirty: false,
      createdAt: 0,
      engine: "whisper-turbo",
      language: "fr",
      archived: false,
      timingNote:
        "Horodatages par passages Whisper : les temps mot à mot sont incomplets.",
      verificationStatus: "completed",
      verification: {
        secondaryEngine: "whisper-turbo",
        secondaryVersion: "fixture-version",
        referenceCues: cues,
        review: {
          approximate: false,
          differences: [
            {
              cueIndex: 0,
              primaryText: cues[0].text,
              candidateText: "Je vais sortir ce soir.",
              alternativeText: "soir",
            },
          ],
        },
      },
    };
    const state = {
      jobs: [job],
      busy: false,
      modelInstalled: true,
      installedModels: ["ultra", "whisper-turbo"],
      platform: "Simulation UI",
      modelUpdates: [
        {
          engine: "whisper-turbo",
          status: "available",
          installedRevision: "previous",
          latestRevision: "latest",
          checkedAt: Date.now(),
          error: null,
        },
      ],
      settings: {
        engine: "ultra",
        language: "fr",
        autoSave: false,
        autoModelUpdates: false,
        vocabulary: [],
        subtitles: { lineLength: 42, maxLines: 2, maxDurationMs: 5000 },
      },
    };
    const calls: Array<{ command: string; args: unknown }> = [];
    Object.assign(window, {
      __TEST_CALLS__: calls,
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
          args: { cues?: typeof cues; id?: string },
        ) => {
          calls.push({ command, args });
          if (command === "snapshot") return state;
          if (command === "confirm_action")
            return (
              (window as unknown as { __TEST_CONFIRM__?: boolean })
                .__TEST_CONFIRM__ !== false
            );
          if (command === "remove_job")
            state.jobs = state.jobs.filter((j) => j.id !== args.id);
          if (command === "archive_completed") job.archived = true;
          if (command === "save_edit" && args.cues) job.cues = args.cues;
          return 1;
        },
      },
    });
  });
  await page.goto("/");
}

test("double vérification : inversion puis envoi des moteurs choisis", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page
    .getByRole("button", { name: "Double vérification", exact: true })
    .click();
  await expect(
    page.getByLabel("Moteur principal", { exact: true }),
  ).toHaveValue("ultra");
  await expect(page.getByLabel("Second avis", { exact: true })).toHaveValue(
    "whisper-turbo",
  );
  await page.getByRole("button", { name: "Inverser les moteurs" }).click();
  await expect(
    page.getByLabel("Moteur principal", { exact: true }),
  ).toHaveValue("whisper-turbo");
  await expect(page.getByLabel("Second avis", { exact: true })).toHaveValue(
    "ultra",
  );
  await page.getByRole("button", { name: "Transcrire et comparer" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __TEST_CALLS__: Array<{ command: string; args: unknown }>;
            }
          ).__TEST_CALLS__.find((c) => c.command === "start_verification")
            ?.args,
      ),
    )
    .toEqual({
      id: "review-fixture",
      primary: "whisper-turbo",
      secondary: "ultra",
    });
});

test("suggestion : validation explicite, mêmes temps et annulation", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  const text = page.getByRole("textbox", { name: "Sous-titre 1", exact: true });
  await expect(text).toHaveValue("Je vais sortir ce foir.");
  const start = await page.getByLabel("Début 1", { exact: true }).inputValue();
  const end = await page.getByLabel("Fin 1", { exact: true }).inputValue();
  await page
    .getByRole("button", { name: "Utiliser cette proposition" })
    .click();
  await expect(text).toHaveValue("Je vais sortir ce soir.");
  await expect(page.getByLabel("Début 1", { exact: true })).toHaveValue(start);
  await expect(page.getByLabel("Fin 1", { exact: true })).toHaveValue(end);
  await expect(
    page.getByRole("button", { name: "Utiliser cette proposition" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(text).toHaveValue("Je vais sortir ce foir.");
  await expect(
    page.getByRole("button", { name: "Utiliser cette proposition" }),
  ).toBeEnabled();
});

test("mise à jour : notification et téléchargement explicite du bon modèle", async ({
  page,
}) => {
  await localReviewFixture(page);
  await expect(
    page.getByText("Mise à jour de modèles disponible", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Voir les modèles" }).click();
  await page
    .getByRole("button", { name: "Télécharger la mise à jour", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __TEST_CALLS__: Array<{ command: string; args: unknown }>;
            }
          ).__TEST_CALLS__.find((c) => c.command === "install_model")?.args,
      ),
    )
    .toEqual({ engine: "whisper-turbo" });
});

test("suppression native : retire du lot et de l’historique sans window.confirm", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.evaluate(() => {
    window.confirm = () => {
      throw new Error("Unsupported WebKit confirm");
    };
  });
  await page
    .getByRole("button", { name: "Supprimer Voix.wav", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Supprimer Voix.wav", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Mes transcriptions", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Supprimer Voix.wav", exact: true }),
  ).toHaveCount(0);
  const commands = await page.evaluate(() =>
    (
      window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
    ).__TEST_CALLS__.map((c) => c.command),
  );
  expect(commands.indexOf("confirm_action")).toBeLessThan(
    commands.indexOf("remove_job"),
  );
});

test("annuler la confirmation conserve la transcription ; Nouveau lot archive seulement", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.evaluate(() => Object.assign(window, { __TEST_CONFIRM__: false }));
  await page
    .getByRole("button", { name: "Supprimer Voix.wav", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Supprimer Voix.wav", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
      ).__TEST_CALLS__.some((c) => c.command === "remove_job"),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Nouveau lot", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Supprimer Voix.wav", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Mes transcriptions", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Supprimer Voix.wav", exact: true }),
  ).toBeVisible();
});

test("l’éditeur signale les temps par passages et conserve l’export", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Horodatages par passages Whisper" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "SRT à côté de l’audio", exact: true }),
  ).toBeEnabled();
});

test("éditeur : rechercher, naviguer, remplacer tout et annuler sans changer les temps", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  const cue = page.getByRole("textbox", { name: "Sous-titre 1", exact: true });
  await cue.fill("Ce soir, CE SOIR et soirée.");
  await page.keyboard.press("Control+f");
  await page.getByLabel("Rechercher", { exact: true }).fill("soir");
  await expect(
    page.getByText("1 / 3 occurrences", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Mot entier", { exact: true }).check();
  await expect(
    page.getByText("1 / 2 occurrences", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Suivant", exact: true }).click();
  await expect(cue).toBeFocused();
  expect(
    await cue.evaluate((el: HTMLTextAreaElement) =>
      el.value.slice(el.selectionStart, el.selectionEnd),
    ),
  ).toBe("SOIR");
  await page.getByRole("button", { name: "Précédent", exact: true }).click();
  expect(
    await cue.evaluate((el: HTMLTextAreaElement) =>
      el.value.slice(el.selectionStart, el.selectionEnd),
    ),
  ).toBe("soir");
  await page.getByLabel("Remplacer par", { exact: true }).fill("demain");
  await page.getByRole("button", { name: "Remplacer", exact: true }).click();
  await expect(cue).toHaveValue("Ce demain, CE SOIR et soirée.");
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await page
    .getByRole("button", { name: "Remplacer tout", exact: true })
    .click();
  await expect(cue).toHaveValue("Ce demain, CE demain et soirée.");
  await expect(page.getByLabel("Début 1", { exact: true })).toHaveValue(
    "00:00:00,100",
  );
  await expect(page.getByLabel("Fin 1", { exact: true })).toHaveValue(
    "00:00:02,500",
  );
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(cue).toHaveValue("Ce soir, CE SOIR et soirée.");
  await page.getByLabel("Respecter la casse", { exact: true }).check();
  await expect(
    page.getByText("1 / 1 occurrences", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Rechercher", { exact: true }).fill("absent");
  await expect(
    page.getByRole("button", { name: "Remplacer tout", exact: true }),
  ).toBeDisabled();
});

test("un résultat terminé disparaît immédiatement du lot sans Nouveau lot", async ({
  page,
}) => {
  await localReviewFixture(page);
  const remove = page.getByRole("button", {
    name: "Supprimer Voix.wav",
    exact: true,
  });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);
  const commands = await page.evaluate(() =>
    (
      window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
    ).__TEST_CALLS__.map((c) => c.command),
  );
  expect(commands).toContain("remove_job");
  expect(commands).not.toContain("archive_completed");
});

// Custom menu dispatch is simulated here. These are not AppKit/menu accelerator tests.
async function menuAction(
  page: import("@playwright/test").Page,
  action: string,
) {
  await page.evaluate(
    (action) =>
      window.dispatchEvent(
        new CustomEvent("elpo-menu-action", { detail: action }),
      ),
    action,
  );
}
test("menus : réglages, import existant et repli de la barre latérale", async ({
  page,
}) => {
  await localReviewFixture(page);
  await menuAction(page, "sidebar");
  await expect(page.locator("aside.sidebar")).toBeHidden();
  await page
    .getByRole("button", { name: "Afficher la barre latérale", exact: true })
    .click();
  await expect(page.locator("aside.sidebar")).toBeVisible();
  await menuAction(page, "settings");
  await expect(
    page.getByRole("heading", { name: "Paramètres", exact: true }),
  ).toBeVisible();
  await menuAction(page, "import-folder");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __TEST_CALLS__: Array<{ command: string; args: unknown }>;
            }
          ).__TEST_CALLS__.find((c) => c.command === "import_files")?.args,
      ),
    )
    .toEqual({ folder: true });
});
test("menus : même pile d’annulation, recherche et export que l’éditeur", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  const cue = page.getByLabel("Sous-titre 1", { exact: true });
  await cue.fill("Nous sortons ce soir.");
  await menuAction(page, "undo");
  await expect(cue).toHaveValue("Je vais sortir ce foir.");
  await menuAction(page, "redo");
  await expect(cue).toHaveValue("Nous sortons ce soir.");
  await page.keyboard.press("Control+z");
  await expect(cue).toHaveValue("Je vais sortir ce foir.");
  await page.keyboard.press("Control+Shift+z");
  await expect(cue).toHaveValue("Nous sortons ce soir.");
  await menuAction(page, "find");
  await expect(page.getByLabel("Rechercher", { exact: true })).toBeFocused();
  await menuAction(page, "export");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __TEST_CALLS__: Array<{ command: string; args: unknown }>;
            }
          ).__TEST_CALLS__.find((c) => c.command === "export_job")?.args,
      ),
    )
    .toEqual({ id: "review-fixture", format: "srt", original: false });
  await expect(page.getByLabel("Début 1", { exact: true })).toHaveValue(
    "00:00:00,100",
  );
  await expect(page.getByLabel("Fin 1", { exact: true })).toHaveValue(
    "00:00:02,500",
  );
});
test("menu Fermer : refuser la perte d’édition conserve la fenêtre et le texte", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await page.getByLabel("Sous-titre 1", { exact: true }).fill("À conserver.");
  await page.evaluate(() => Object.assign(window, { __TEST_CONFIRM__: false }));
  await menuAction(page, "close");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
          ).__TEST_CALLS__.filter((c) => c.command === "confirm_action").length,
      ),
    )
    .toBe(1);
  const calls = await page.evaluate(
    () =>
      (window as unknown as { __TEST_CALLS__: Array<{ command: string }> })
        .__TEST_CALLS__,
  );
  expect(calls.some((c) => c.command === "finish_window_action")).toBe(false);
  await expect(page.getByLabel("Sous-titre 1", { exact: true })).toHaveValue(
    "À conserver.",
  );
});
test("menu Quitter : un traitement exige une confirmation explicite", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.evaluate(async () => {
    const native = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (command: string, args: object) => Promise<{ busy: boolean }>;
        };
      }
    ).__TAURI_INTERNALS__;
    (await native.invoke("snapshot", {})).busy = true;
    Object.assign(window, { __TEST_CONFIRM__: false });
  });
  await expect(
    page.getByRole("button", { name: "Traitement en cours…", exact: true }),
  ).toBeDisabled();
  await menuAction(page, "quit");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
          ).__TEST_CALLS__.filter((c) => c.command === "confirm_action").length,
      ),
    )
    .toBe(1);
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
      ).__TEST_CALLS__.some((c) => c.command === "finish_window_action"),
    ),
  ).toBe(false);
  await page.evaluate(() => Object.assign(window, { __TEST_CONFIRM__: true }));
  await menuAction(page, "quit");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __TEST_CALLS__: Array<{ command: string; args: unknown }>;
            }
          ).__TEST_CALLS__.find((c) => c.command === "finish_window_action")
            ?.args,
      ),
    )
    .toEqual({ quit: true });
});
