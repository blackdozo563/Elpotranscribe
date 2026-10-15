import { reviewFixture } from "./reviewFixture";
import { test, expect } from "@playwright/test";
test("interface française vide et fonctions natives explicitement indiquées", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Bibliothèque" }),
  ).toBeVisible();
  await expect(page.getByText("Aucune transcription")).toBeVisible();
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
  ).toBeDisabled();
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
          args: {
            cues?: typeof cues;
            id?: string;
            settings?: typeof state.settings;
          },
        ) => {
          calls.push({ command, args });
          if (command === "snapshot") return structuredClone(state);
          if (command === "fixture_state") return state;
          if (command === "model_disk_usage")
            return {
              allocatedBytes: 19300000,
              logicalBytes: 20000000,
              files: 2,
            };
          if (command === "plugin:menu|new")
            return [99, "fixture-context-menu"];
          if (command === "save_settings" && args.settings)
            state.settings = args.settings;
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
  await page.getByRole("button", { name: "À relire", exact: true }).click();
  await page
    .getByRole("button", { name: "Demander un second avis", exact: true })
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

test("relecture : acceptation explicite et annulation conservent les temps", async ({
  page,
}) => {
  await reviewFixture(page);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  const before = await page.getByLabel("Début 1", { exact: true }).inputValue();
  const end = await page.getByLabel("Fin 1", { exact: true }).inputValue();
  await page.getByRole("button", { name: "Relecture", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Accepter la lecture du second avis (Entrée)",
      exact: true,
    })
    .click();
  await expect(page.locator(".review-text").first()).toHaveText(
    "Je sors ce soir.",
  );
  await expect(page.getByLabel("Début 1", { exact: true })).toHaveValue(before);
  await expect(page.getByLabel("Fin 1", { exact: true })).toHaveValue(end);
  await page.getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(page.locator(".review-text").first()).toHaveText(
    "Je sors ce foir.",
  );
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
  await requestRemoval(page, "Voix.wav");
  await expect(
    page.getByRole("button", { name: "Options Voix.wav", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Bibliothèque", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Options Voix.wav", exact: true }),
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
  await requestRemoval(page, "Voix.wav");
  await expect(
    page.getByRole("button", { name: "Options Voix.wav", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (
        window as unknown as { __TEST_CALLS__: Array<{ command: string }> }
      ).__TEST_CALLS__.some((c) => c.command === "remove_job"),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Nouveau lot", exact: true }).click();
  expect(
    await page.evaluate(async () => {
      const native = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (
              command: string,
            ) => Promise<{ jobs: Array<{ archived?: boolean }> }>;
          };
        }
      ).__TAURI_INTERNALS__;
      return (await native.invoke("fixture_state")).jobs[0].archived;
    }),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Options Voix.wav", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bibliothèque", exact: false })
    .click();
  await expect(
    page.getByRole("button", { name: "Options Voix.wav", exact: true }),
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
    name: "Options Voix.wav",
    exact: true,
  });
  await expect(remove).toBeVisible();
  await requestRemoval(page, "Voix.wav");
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
    (await native.invoke("fixture_state", {})).busy = true;
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

test("contrôles compacts : sélecteur natif, stepper et sauvegarde des valeurs", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page
    .getByRole("button", { name: /Réglages de transcription :/ })
    .click();
  const selector = page.getByLabel("Moteur de transcription", { exact: true });
  await expect(selector).toHaveAttribute("title", "Rapide — Parakeet Ultra");
  expect(
    await selector.evaluate((element) => getComputedStyle(element).appearance),
  ).toBe("none");
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  const characters = page.getByRole("spinbutton", {
    name: "Caractères par ligne",
    exact: true,
  });
  await expect(characters).toHaveValue("42");
  await page
    .getByRole("button", {
      name: "Augmenter Caractères par ligne",
      exact: true,
    })
    .click();
  await expect(characters).toHaveValue("43");
  await page
    .getByRole("button", {
      name: "Diminuer Durée cible maximum (secondes)",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Enregistrer les préférences", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __TEST_CALLS__: Array<{
                command: string;
                args: { settings?: { subtitles: unknown } };
              }>;
            }
          ).__TEST_CALLS__.find((call) => call.command === "save_settings")
            ?.args.settings?.subtitles,
      ),
    )
    .toEqual({ lineLength: 43, maxLines: 2, maxDurationMs: 4000 });
});

test("échelle à 1280 × 800 : boutons sur une ligne et barre d’outils de 52 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await localReviewFixture(page);
  for (const name of [
    "Bibliothèque",
    "À relire",
    "Modèles IA",
    "Paramètres",
    "Vocabulaire",
  ]) {
    await page
      .getByRole("button", {
        name: name === "Bibliothèque" ? /Bibliothèque/ : name,
        exact: name !== "Bibliothèque",
      })
      .click();
    const wrapped = await page
      .locator("button:visible")
      .evaluateAll((buttons) =>
        buttons.flatMap((button) => {
          const walker = document.createTreeWalker(
            button,
            NodeFilter.SHOW_TEXT,
          );
          const errors: string[] = [];
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            const lines = new Set(
              Array.from(range.getClientRects()).map((rect) =>
                Math.round(rect.top),
              ),
            );
            if (lines.size > 1) errors.push(node.textContent.trim());
          }
          return errors;
        }),
      );
    expect(wrapped, `Libellés trop longs dans ${name}`).toEqual([]);
    expect(
      await page
        .locator(".topbar")
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBe(52);
    expect(
      await page
        .getByRole("button", { name: "Paramètres", exact: true })
        .evaluate((element) => element.getBoundingClientRect().height),
    ).toBe(28);
  }
});

test("nettoyage global : aucun texte interne, un titre et une mention de confidentialité", async ({
  page,
}) => {
  await localReviewFixture(page);
  for (const name of [
    "Bibliothèque",
    "À relire",
    "Modèles IA",
    "Paramètres",
    "Vocabulaire",
  ]) {
    await page
      .getByRole("button", {
        name: name === "Bibliothèque" ? /Bibliothèque/ : name,
        exact: name !== "Bibliothèque",
      })
      .click();
    await expect(page.locator("body")).not.toContainText(
      /à mesurer|TODO|LA CLARTÉ COMMENCE|100 % local|Votre audio reste chez vous|Espace de travail/iu,
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: "Mode local", exact: true }),
    ).toHaveCount(1);
  }
  await page.getByRole("button", { name: "Mode local", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Mode local", exact: true }),
  ).toContainText("Vérification automatique des versions : désactivée");
  await expect(
    page.getByRole("dialog", { name: "Mode local", exact: true }),
  ).toContainText("Aucune télémétrie");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Mode local", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mode local", exact: true }),
  ).toBeFocused();
});
test("modèles : taille mesurée, choix par défaut et actions natives séparées", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.getByRole("button", { name: "Modèles IA", exact: true }).click();
  const turbo = page.getByRole("region", {
    name: "Whisper large-v3-turbo Q5_0",
    exact: true,
  });
  await expect(turbo.getByText(/19,3\sMo sur disque/)).toBeVisible();
  await expect(turbo).not.toContainText(/mémoire|Go à mesurer/iu);
  await turbo
    .getByRole("button", { name: "Utiliser par défaut", exact: true })
    .click();
  await expect(
    turbo.getByText("Moteur par défaut", { exact: true }),
  ).toBeVisible();
  await turbo
    .getByRole("button", {
      name: "Options Whisper large-v3-turbo Q5_0",
      exact: true,
    })
    .click();
  const options = await page.evaluate(() => {
    const calls = (
      window as unknown as {
        __TEST_CALLS__: Array<{
          command: string;
          args: { options?: { items: Array<{ text?: string }> } };
        }>;
      }
    ).__TEST_CALLS__;
    return calls
      .find((call) => call.command === "plugin:menu|new")
      ?.args.options?.items.map((item) => item.text)
      .filter(Boolean);
  });
  expect(options).toEqual(["Vérifier l’intégrité", "Réinstaller", "Supprimer"]);
  await page.evaluate(() => {
    const calls = (
      window as unknown as {
        __TEST_CALLS__: Array<{
          command: string;
          args: {
            options?: {
              items: Array<{
                id?: string;
                handler?: { onmessage: (id: string) => void };
              }>;
            };
          };
        }>;
      }
    ).__TEST_CALLS__;
    const item = calls
      .find((call) => call.command === "plugin:menu|new")
      ?.args.options?.items.find((item) => item.id === "verify");
    item?.handler?.onmessage("verify");
  });
  await expect(turbo.getByRole("status")).toHaveText("Intégrité vérifiée.");
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __TEST_CALLS__: Array<{ command: string; args: unknown }>;
          }
        ).__TEST_CALLS__.find((call) => call.command === "verify_model")?.args,
    ),
  ).toEqual({ engine: "whisper-turbo" });
  await turbo
    .getByRole("button", {
      name: "Options Whisper large-v3-turbo Q5_0",
      exact: true,
    })
    .click();
  await chooseNativeMenu(page, "Réinstaller");
  await expect(turbo.getByRole("status")).toHaveCount(0);
  await turbo.getByText("Détails techniques", { exact: true }).click();
  await expect(
    turbo.getByText("Révision installée : previous", { exact: false }),
  ).toBeVisible();
});

async function chooseNativeMenu(
  page: import("@playwright/test").Page,
  text: string,
) {
  await expect
    .poll(() =>
      page.evaluate((text) => {
        const calls = (
          window as unknown as {
            __TEST_CALLS__: Array<{
              command: string;
              args: { options?: { items: Array<{ text?: string }> } };
            }>;
          }
        ).__TEST_CALLS__;
        return calls
          .filter((call) => call.command === "plugin:menu|new")
          .at(-1)
          ?.args.options?.items.some((item) => item.text === text);
      }, text),
    )
    .toBe(true);
  await page.evaluate((text) => {
    const calls = (
      window as unknown as {
        __TEST_CALLS__: Array<{
          command: string;
          args: {
            options?: {
              items: Array<{
                text?: string;
                handler?: { onmessage: (id: string) => void };
              }>;
            };
          };
        }>;
      }
    ).__TEST_CALLS__;
    calls
      .filter((call) => call.command === "plugin:menu|new")
      .at(-1)
      ?.args.options?.items.find((item) => item.text === text)
      ?.handler?.onmessage("selected");
  }, text);
}
async function requestRemoval(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page
    .getByRole("button", { name: `Options ${name}`, exact: true })
    .click();
  await chooseNativeMenu(page, "Supprimer de l’historique");
}

test("bibliothèque : recherche dans les archives, tri et ouverture par double-clic", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.evaluate(async () => {
    const native = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (command: string) => Promise<{
            jobs: Array<{
              id: string;
              name: string;
              cues: Array<{ text: string }>;
              archived?: boolean;
            }>;
          }>;
        };
      }
    ).__TAURI_INTERNALS__;
    const state = await native.invoke("fixture_state");
    const other = structuredClone(state.jobs[0]);
    other.id = "archive";
    other.name = "Été2.mp3";
    other.cues[0].text = "Eucharistie et Évangile.";
    other.archived = true;
    state.jobs.push(other);
  });
  await expect(
    page.getByRole("button", { name: "Options Été2.mp3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mes transcriptions", exact: true }),
  ).toHaveCount(0);
  const search = page.getByRole("searchbox", {
    name: "Rechercher dans la bibliothèque",
  });
  await search.fill("evangile");
  await expect(
    page.getByRole("button", { name: "Options Voix.wav", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Options Été2.mp3", exact: true }),
  ).toBeVisible();
  await search.fill("");
  await page.getByRole("button", { name: "Nom", exact: true }).click();
  await expect(page.locator(".library-table tbody tr").first()).toContainText(
    "Été2.mp3",
  );
  await page.locator(".library-table tbody tr").first().dblclick();
  await expect(page.getByLabel("Sous-titre 1", { exact: true })).toHaveValue(
    "Eucharistie et Évangile.",
  );
});
test("bibliothèque : second avis sur la bonne source, export et voile de dépôt", async ({
  page,
}) => {
  await localReviewFixture(page);
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["fixture"], "audio.mp3", { type: "audio/mpeg" }),
    );
    document
      .querySelector(".shell")!
      .dispatchEvent(
        new DragEvent("dragover", { bubbles: true, dataTransfer: transfer }),
      );
  });
  await expect(
    page.getByText("Déposez vos fichiers audio", { exact: true }),
  ).toBeVisible();
  await page.locator(".shell").dispatchEvent("dragleave");
  await expect(
    page.getByText("Déposez vos fichiers audio", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Options Voix.wav", exact: true })
    .click();
  await chooseNativeMenu(page, "Exporter");
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
  await page.evaluate(async () => {
    const native = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (command: string) => Promise<{
            jobs: Array<{ id: string; name: string; archived?: boolean }>;
          }>;
        };
      }
    ).__TAURI_INTERNALS__;
    const state = await native.invoke("fixture_state");
    const copy = structuredClone(state.jobs[0]);
    copy.id = "copy-review";
    copy.name = "Copie Voix.wav";
    copy.archived = true;
    state.jobs.push(copy);
  });
  await page
    .getByRole("button", { name: "Options Copie Voix.wav", exact: true })
    .click();
  await chooseNativeMenu(page, "Demander un second avis");
  await expect(
    page.getByLabel("Audio à vérifier", { exact: true }),
  ).toHaveValue("copy-review");
});

test("bibliothèque : compteur près de la limite et information calculée sur les cues", async ({
  page,
}) => {
  await localReviewFixture(page);
  await expect(page.locator(".batch-limit")).toHaveCount(0);
  await page.evaluate(async () => {
    const native = (
      window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (command: string) => Promise<{
            jobs: Array<{
              id: string;
              name: string;
              cues: Array<{ text: string }>;
            }>;
          }>;
        };
      }
    ).__TAURI_INTERNALS__;
    const state = await native.invoke("fixture_state");
    state.jobs[0].cues[0].text = "mot ".repeat(20);
    for (let i = 1; i < 8; i++) {
      const job = structuredClone(state.jobs[0]);
      job.id = `fixture-${i}`;
      job.name = `Audio${i}.mp3`;
      state.jobs.push(job);
    }
  });
  await expect(page.locator(".batch-limit")).toContainText("8 / 10");
  await expect(
    page.getByRole("img", { name: /1 sous-titres dépassent/ }).first(),
  ).toBeVisible();
});
