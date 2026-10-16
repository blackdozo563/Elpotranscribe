import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Settings, Snapshot } from "./domain";
export interface SettingsPatch {
  engine?: string;
  language?: string;
  autoSave?: boolean;
  autoModelUpdates?: boolean;
  lineLength?: number;
  maxLines?: number;
  maxDurationMs?: number;
  profileId?: string;
  clearProfile?: boolean;
}
export interface SettingsDocument {
  settings: Settings;
  revision: number;
}
export interface ApplicationInfo {
  version: string;
  macModel: string | null;
  platform: string;
}
export const settingsChanged = "settings-changed";
export const updateSettings = (patch: SettingsPatch) =>
  invoke<SettingsDocument>("update_settings", { patch });
export const openSettings = () => invoke<void>("open_settings");
export const applicationInfo = () =>
  invoke<ApplicationInfo>("application_info");
export const connectSettings = (change: (document: SettingsDocument) => void) =>
  listen<SettingsDocument>(settingsChanged, (event) => change(event.payload));
/** Event and polling responses may arrive out of order. Only settings use this revision. */
export function mergeSettings(
  snapshot: Snapshot,
  document: SettingsDocument,
): Snapshot {
  return document.revision < (snapshot.settingsRevision ?? 0)
    ? snapshot
    : {
        ...snapshot,
        settings: document.settings,
        settingsRevision: document.revision,
      };
}
export function mergeSnapshot(
  previous: Snapshot | null,
  next: Snapshot,
): Snapshot {
  return previous &&
    (next.settingsRevision ?? 0) < (previous.settingsRevision ?? 0)
    ? {
        ...next,
        settings: previous.settings,
        settingsRevision: previous.settingsRevision,
      }
    : next;
}
export function draftSettings(
  settings: Settings,
  patch: SettingsPatch,
): Settings {
  return {
    ...settings,
    ...(patch.autoSave !== undefined ? { autoSave: patch.autoSave } : {}),
    ...(patch.autoModelUpdates !== undefined
      ? { autoModelUpdates: patch.autoModelUpdates }
      : {}),
    subtitles: {
      ...settings.subtitles,
      ...(patch.lineLength !== undefined
        ? { lineLength: patch.lineLength }
        : {}),
      ...(patch.maxLines !== undefined ? { maxLines: patch.maxLines } : {}),
      ...(patch.maxDurationMs !== undefined
        ? { maxDurationMs: patch.maxDurationMs }
        : {}),
    },
  };
}
