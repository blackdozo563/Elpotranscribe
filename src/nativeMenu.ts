import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type MenuAction =
  | "settings"
  | "new"
  | "import-audio"
  | "import-folder"
  | "export"
  | "undo"
  | "redo"
  | "find"
  | "sidebar"
  | "close"
  | "quit";
export interface EditorMenuContext {
  canUndo: boolean;
  canRedo: boolean;
  canExport: boolean;
}
export const menuEvent = "elpo-menu-action";
export const editorMenuEvent = "elpo-editor-action";
const actions: ReadonlySet<string> = new Set<MenuAction>([
  "settings",
  "new",
  "import-audio",
  "import-folder",
  "export",
  "undo",
  "redo",
  "find",
  "sidebar",
  "close",
  "quit",
]);
export function dispatchMenuAction(value: string) {
  if (actions.has(value))
    window.dispatchEvent(new CustomEvent(menuEvent, { detail: value }));
}
export async function connectNativeMenu() {
  const dispose = await listen<string>("app-menu", (event) =>
    dispatchMenuAction(event.payload),
  );
  try {
    await invoke("menu_ready");
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
