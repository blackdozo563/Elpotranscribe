import type { Page } from "@playwright/test";
import type { Cue, Job, Snapshot } from "../../src/domain";
import type { ReviewDecision, ReviewSession } from "../../src/review";

/** Renderer/IPC fixture only. No inference, alignment, disk I/O or audio playback is proved here. */
export async function reviewFixture(page: Page, vocabulary = false) {
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
  if (vocabulary) {
    cues[0].text = "Je lis l’Evengile.";
    const range = { start: 9, end: 17 };
    reviewState.differences[0] = {
      id: "review-ui:vocabulary",
      cueIndex: 0,
      range,
      currentText: "Evengile",
      status: "pending",
      source: {
        cueIndex: 0,
        range,
        primaryText: "Evengile",
        secondaryText: "Évangile",
        alternativeText: "Évangile",
        primaryEngine: "ultra",
        secondaryEngine: "vocabulary",
        profileTerm: true,
        vocabulary: true,
      },
    };
    job.profileSnapshot = {
      id: "liturgy-fr",
      name: "Liturgie FR",
      language: "fr",
      terms: ["Évangile"],
      whisper_prompt: "",
      builtin: true,
    };
  }
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
    const doc = (id?: string) => {
      const job = state.jobs.find((j) => j.id === id) ?? state.jobs[0];
      return structuredClone({
        cues: job.cues,
        reviewState: job.reviewState,
        revision: job.editRevision ?? 0,
      });
    };
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
            primary?: string;
            secondary?: string;
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
          if (command === "prepare_vocabulary_review") return doc(args.id);
          if (command === "list_review") return doc(args.id);
          if (command === "plugin:menu|new")
            return [99, "fixture-context-menu"];
          if (command === "confirm_action")
            return (
              (window as unknown as { __TEST_CONFIRM__?: boolean })
                .__TEST_CONFIRM__ !== false
            );
          if (command === "start_verification") {
            const original = state.jobs.find((j) => j.id === args.id)!;
            const job: Job = {
              ...structuredClone(original),
              id: "opinion-ui",
              createdAt: Math.floor(Date.now() / 1000),
              status: "transcribing",
              archived: true,
              cues: [],
              reviewState: null,
              editRevision: 0,
              verification: null,
              verificationStatus: "processing",
              verificationError: null,
              engine: args.primary!,
              verificationProgress: {
                stage: "queued",
                startedAt: Math.floor(Date.now() / 1000),
                secondaryEngine: args.secondary!,
              },
            };
            state.jobs.push(job);
            state.busy = true;
            persist();
            return job.id;
          }
          if (command === "cancel_job") {
            const job = state.jobs.find((j) => j.id === args.id)!;
            job.verificationStatus = "cancelled";
            job.status = job.cues.length ? "completed" : "cancelled";
            state.busy = false;
            persist();
            return null;
          }
          if (command === "export_job") return "/fixture/Voix.srt";
          if (command === "restore_review" || command === "resolve_review") {
            if (
              (window as unknown as { __TEST_REVIEW_FAIL__?: boolean })
                .__TEST_REVIEW_FAIL__
            )
              throw new Error("Écriture impossible (simulation)");
            const job = state.jobs.find((j) => j.id === args.id)!;
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
            return doc(args.id);
          }
          return null;
        },
      },
    });
  }, seed);
  await page.goto("/");
}

/** Explicitly inject observed worker states. This does not run either engine. */
export async function opinionFixtureStage(
  page: Page,
  stage:
    | "primary"
    | "secondary"
    | "comparison"
    | "completed"
    | "failed"
    | "noDifferences",
) {
  await page.evaluate((stage) => {
    const state = (window as unknown as { __TEST_REVIEW_STATE__: Snapshot })
      .__TEST_REVIEW_STATE__;
    const job = state.jobs.find((j) => j.id === "opinion-ui")!,
      source = state.jobs.find((j) => j.id === "review-ui")!;
    if (["primary", "secondary", "comparison"].includes(stage)) {
      job.verificationProgress!.stage = stage as
        | "primary"
        | "secondary"
        | "comparison";
      if (stage !== "primary") job.cues = structuredClone(source.cues);
      return;
    }
    job.status = "completed";
    state.busy = false;
    job.cues = structuredClone(source.cues);
    if (stage === "failed") {
      job.verificationStatus = "failed";
      job.verificationError = "Second moteur interrompu (simulation).";
      return;
    }
    job.verificationStatus = "completed";
    job.verificationProgress!.stage = "comparison";
    job.reviewState = structuredClone(source.reviewState!);
    job.reviewState.anchors = job.cues;
    if (stage === "noDifferences") job.reviewState.differences = [];
    for (const [i, d] of job.reviewState.differences.entries()) {
      d.id = `${job.id}:${i}`;
      d.source.primaryEngine = job.engine;
      d.source.secondaryEngine = job.verificationProgress!.secondaryEngine;
    }
    job.verification = structuredClone(source.verification!);
    job.verification.secondaryEngine =
      job.verificationProgress!.secondaryEngine;
    job.verification.referenceCues = job.cues;
    if (stage === "noDifferences") job.verification.review.differences = [];
    localStorage.setItem("fixture-review-phase7", JSON.stringify(state));
  }, stage);
}
