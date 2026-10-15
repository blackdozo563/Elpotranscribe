import type { Page } from "@playwright/test";
import type { Cue, Job, Snapshot } from "../../src/domain";
import type { ReviewDecision, ReviewSession } from "../../src/review";

/** Renderer/IPC fixture only. No inference, alignment, disk I/O or audio playback is proved here. */
export async function reviewFixture(page: Page) {
  const cues: Cue[] = [
    { startMs: 100, endMs: 2500, text: "Je sors ce foir." },
    { startMs: 2800, endMs: 5000, text: "Nous sommes à pari." },
    { startMs: 5300, endMs: 7900, text: "Il revient demain." },
  ];
  const reviewState: ReviewSession = {
    version: 1,
    anchors: cues,
    differences: [
      ["foir.", "soir."],
      ["pari.", "Paris."],
      ["demain.", "bientôt."],
    ].map(([primaryText, secondaryText], i) => {
      const start = cues[i].text.indexOf(primaryText),
        range = { start, end: start + primaryText.length };
      return {
        id: `review-ui:${i}`,
        cueIndex: i,
        range,
        currentText: primaryText,
        status: "pending",
        source: {
          cueIndex: i,
          range,
          primaryText,
          secondaryText,
          alternativeText: secondaryText,
          primaryEngine: "ultra",
          secondaryEngine: "whisper-turbo",
          profileTerm: false,
        },
      };
    }),
  };
  const job: Job = {
    id: "review-ui",
    source: "/fixture/Voix.wav",
    name: "Voix.wav",
    size: 100000,
    durationMs: 8000,
    status: "completed",
    cues,
    error: null,
    exportPath: null,
    dirty: false,
    createdAt: 0,
    engine: "ultra",
    language: "fr",
    reviewState,
    editRevision: 0,
    verificationStatus: "completed",
    verification: {
      secondaryEngine: "whisper-turbo",
      secondaryVersion: "ui-only",
      referenceCues: cues,
      review: {
        approximate: false,
        differences: cues.map((cue, i) => ({
          cueIndex: i,
          primaryText: cue.text,
          candidateText: cue.text.replace(
            reviewState.differences[i].source.primaryText,
            reviewState.differences[i].source.secondaryText!,
          ),
          alternativeText: reviewState.differences[i].source.secondaryText!,
        })),
      },
    },
  };
  const seed: Snapshot = {
    jobs: [job],
    settings: {
      engine: "ultra",
      language: "fr",
      autoSave: false,
      autoModelUpdates: false,
      subtitles: { lineLength: 42, maxLines: 2, maxDurationMs: 5000 },
      vocabulary: [],
    },
    busy: false,
    modelInstalled: true,
    installedModels: ["ultra", "whisper-turbo"],
    modelUpdates: [],
    platform: "Fixture UI uniquement",
  };
  await page.addInitScript((seed) => {
    const state: Snapshot =
      JSON.parse(localStorage.getItem("fixture-review-phase7") ?? "null") ??
      seed;
    const calls: Array<{ command: string; args: unknown }> = [];
    const persist = () =>
      localStorage.setItem("fixture-review-phase7", JSON.stringify(state));
    const doc = () =>
      structuredClone({
        cues: state.jobs[0].cues,
        reviewState: state.jobs[0].reviewState,
        revision: state.jobs[0].editRevision ?? 0,
      });
    HTMLMediaElement.prototype.play = function () {
      Object.assign(window, { __TEST_AUDIO_STARTED_AT__: this.currentTime });
      return Promise.resolve();
    };
    Object.assign(window, {
      __TEST_REVIEW_STATE__: state,
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
            id?: string;
            cues?: Cue[];
            reviewState?: ReviewSession;
            expectedRevision?: number;
            differenceId?: string;
            decision?: ReviewDecision;
          },
        ) => {
          calls.push({ command, args });
          if (command === "snapshot") {
            const snapshot = structuredClone(state);
            if (
              (
                window as unknown as {
                  __TEST_REVIEW_STALE_SNAPSHOT__?: boolean;
                }
              ).__TEST_REVIEW_STALE_SNAPSHOT__
            )
              snapshot.jobs[0].editRevision = 0;
            return snapshot;
          }
          if (command === "fixture_state") return state;
          if (command === "list_review") return doc();
          if (command === "confirm_action") return true;
          if (command === "export_job") return "/fixture/Voix.srt";
          if (command === "restore_review" || command === "resolve_review") {
            if (
              (window as unknown as { __TEST_REVIEW_FAIL__?: boolean })
                .__TEST_REVIEW_FAIL__
            )
              throw new Error("Écriture impossible (simulation)");
            const job = state.jobs[0];
            if (args.expectedRevision !== (job.editRevision ?? 0))
              throw new Error("Révision périmée");
            if (command === "restore_review") {
              job.cues = structuredClone(args.cues!);
              job.reviewState = structuredClone(args.reviewState!);
            } else {
              const d = job.reviewState!.differences.find(
                (d) => d.id === args.differenceId,
              )!;
              const decision = args.decision!;
              const selection =
                decision.kind === "modify" ? decision.selection : null;
              const range = selection?.range ?? d.range;
              if (!range) throw new Error("Plage périmée");
              const index = selection?.cueIndex ?? d.cueIndex;
              const text =
                decision.kind === "accept"
                  ? d.source.secondaryText!
                  : decision.kind === "keep"
                    ? d.source.primaryText
                    : decision.text;
              const cue = job.cues[index];
              cue.text =
                cue.text.slice(0, range.start) +
                text +
                cue.text.slice(range.end);
              d.cueIndex = index;
              d.range = { start: range.start, end: range.start + text.length };
              d.currentText = text;
              d.status =
                decision.kind === "accept"
                  ? "accepted"
                  : decision.kind === "keep"
                    ? "kept"
                    : "modified";
              job.reviewState!.anchors = structuredClone(job.cues);
            }
            job.editRevision = (job.editRevision ?? 0) + 1;
            job.dirty = true;
            persist();
            return doc();
          }
          return null;
        },
      },
    });
  }, seed);
  await page.goto("/");
}
