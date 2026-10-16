import type { BrowserContext } from "@playwright/test";
import type { Snapshot } from "../../src/domain";
import { draftSettings, type SettingsPatch } from "../../src/settingsClient";

// Renderer-only IPC simulation, shared by two browser windows. No inference or AppKit.
export async function settingsFixture(context: BrowserContext, empty = false) {
  const state: Snapshot = {
    settingsRevision: 0,
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
    jobs: empty
      ? []
      : [
          {
            id: "settings-preview",
            source: "/fixture/Français.mp3",
            name: "Français.mp3",
            size: 1200,
            durationMs: 120000,
            status: "completed",
            createdAt: 2,
            engine: "ultra",
            language: "fr",
            error: null,
            exportPath: null,
            dirty: false,
            cues: [
              {
                startMs: 1200,
                endMs: 7200,
                text: "Une vraie phrase de transcription pour vérifier les sous-titres.",
              },
            ],
          },
        ],
  };
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  const control = { fail: false, delay: 0 };
  await context.exposeBinding(
    "__SETTINGS_IPC__",
    async (_source, command: string, args: Record<string, unknown> = {}) => {
      calls.push({ command, args });
      if (command === "snapshot") return structuredClone(state);
      if (command === "application_info")
        return {
          version: "1.2.0-test",
          macModel: "Mac14,2 (fixture)",
          platform: "Simulation IPC",
        };
      if (command === "update_settings") {
        if (control.delay)
          await new Promise((resolve) => setTimeout(resolve, control.delay));
        if (control.fail) throw new Error("Écriture refusée (fixture)");
        const patch = args.patch as SettingsPatch;
        state.settings = {
          ...draftSettings(state.settings, patch),
          ...(patch.engine ? { engine: patch.engine } : {}),
          ...(patch.language ? { language: patch.language } : {}),
        };
        state.settingsRevision = (state.settingsRevision ?? 0) + 1;
        const document = {
          settings: structuredClone(state.settings),
          revision: state.settingsRevision,
        };
        await Promise.all(
          context
            .pages()
            .filter((p) => !p.isClosed())
            .map((p) =>
              p.evaluate((document) => {
                (
                  window as unknown as {
                    __SETTINGS_EVENT__: (payload: unknown) => void;
                  }
                ).__SETTINGS_EVENT__(document);
              }, document),
            ),
        );
        return document;
      }
      if (command === "confirm_action") return true;
      return 1;
    },
  );
  await context.addInitScript(() => {
    let sequence = 0;
    const callbacks = new Map<number, (payload: unknown) => void>();
    const events = new Map<number, string>();
    const label =
      new URLSearchParams(location.search).get("window") === "settings"
        ? "settings"
        : "main";
    Object.assign(window, {
      __SETTINGS_EVENT__: (payload: unknown) => {
        for (const [handler, event] of events)
          if (event === "settings-changed")
            callbacks.get(handler)?.({ event, id: handler, payload });
      },
      __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
      __TAURI_INTERNALS__: {
        metadata: {
          currentWindow: { label },
          currentWebview: { label, windowLabel: label },
        },
        transformCallback: (callback: (payload: unknown) => void) => {
          callbacks.set(++sequence, callback);
          return sequence;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
        convertFileSrc: () => "",
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          if (command === "plugin:event|listen") {
            events.set(args.handler as number, args.event as string);
            return args.handler;
          }
          if (command === "plugin:event|unlisten") {
            events.delete(args.eventId as number);
            return;
          }
          if (command === "open_settings") {
            window.open(
              "/?window=settings",
              "elpo-settings",
              "width=740,height=620",
            );
            return;
          }
          if (command === "plugin:window|destroy") {
            window.close();
            return;
          }
          return (
            window as unknown as {
              __SETTINGS_IPC__: (
                command: string,
                args: unknown,
              ) => Promise<unknown>;
            }
          ).__SETTINGS_IPC__(command, args);
        },
      },
    });
  });
  return { state, calls, control };
}
