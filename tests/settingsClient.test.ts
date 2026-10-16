import { beforeEach, expect, test, vi } from "vitest";
const ipc = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: ipc.listen }));
import {
  connectSettings,
  updateSettings,
  openSettings,
  applicationInfo,
} from "../src/settingsClient";
beforeEach(() => vi.clearAllMocks());
test("écoute le document de réglages Tauri et libère son abonnement", async () => {
  const dispose = vi.fn(),
    change = vi.fn();
  const document = { revision: 3, settings: { autoSave: true } };
  ipc.listen.mockImplementation(async (_event, callback) => {
    callback({ payload: document });
    return dispose;
  });
  const disconnect = await connectSettings(change);
  expect(ipc.listen).toHaveBeenCalledWith(
    "settings-changed",
    expect.any(Function),
  );
  expect(change).toHaveBeenCalledWith(document);
  disconnect();
  expect(dispose).toHaveBeenCalledOnce();
});
test("envoie uniquement les champs modifiés, conserve les erreurs et demande les informations natives", async () => {
  ipc.invoke.mockResolvedValueOnce({ revision: 2 });
  await updateSettings({ lineLength: 24 });
  expect(ipc.invoke).toHaveBeenLastCalledWith("update_settings", {
    patch: { lineLength: 24 },
  });
  ipc.invoke.mockRejectedValueOnce(new Error("disque"));
  await expect(updateSettings({ autoSave: true })).rejects.toThrow("disque");
  await openSettings();
  expect(ipc.invoke).toHaveBeenLastCalledWith("open_settings");
  await applicationInfo();
  expect(ipc.invoke).toHaveBeenLastCalledWith("application_info");
});
