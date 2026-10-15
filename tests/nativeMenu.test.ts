import { afterEach, beforeEach, expect, test, vi } from "vitest";
const ipc = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: ipc.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: ipc.listen }));
import {
  connectNativeMenu,
  dispatchMenuAction,
  menuEvent,
} from "../src/nativeMenu";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("window", new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());
test("le pont ne déclare le frontend prêt qu’après son abonnement, puis se désabonne", async () => {
  const dispose = vi.fn();
  ipc.listen.mockImplementation(async (_name, callback) => {
    expect(ipc.invoke).not.toHaveBeenCalled();
    callback({ payload: "find" });
    return dispose;
  });
  const handler = vi.fn();
  window.addEventListener(menuEvent, handler);
  const disconnect = await connectNativeMenu();
  expect(ipc.listen).toHaveBeenCalledWith("app-menu", expect.any(Function));
  expect(ipc.invoke).toHaveBeenCalledWith("menu_ready");
  expect(handler).toHaveBeenCalledOnce();
  expect((handler.mock.calls[0][0] as CustomEvent).detail).toBe("find");
  disconnect();
  expect(dispose).toHaveBeenCalledOnce();
});
test("un événement inconnu est ignoré et un échec de disponibilité libère l’abonnement", async () => {
  const handler = vi.fn();
  window.addEventListener(menuEvent, handler);
  dispatchMenuAction("unknown-command");
  expect(handler).not.toHaveBeenCalled();
  const dispose = vi.fn();
  ipc.listen.mockResolvedValue(dispose);
  ipc.invoke.mockRejectedValueOnce(new Error("not ready"));
  await expect(connectNativeMenu()).rejects.toThrow("not ready");
  expect(dispose).toHaveBeenCalledOnce();
});
