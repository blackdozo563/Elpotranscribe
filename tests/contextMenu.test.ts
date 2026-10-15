import { expect, test, vi } from "vitest";
const native = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@tauri-apps/api/menu", () => ({ Menu: { new: native.create } }));
import { showNativeMenu } from "../src/components/ui/showNativeMenu";
test("le menu reste vivant après popup et libère le précédent au prochain affichage", async () => {
  const first = {
    popup: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const second = {
    popup: vi.fn().mockRejectedValue(new Error("popup failed")),
    close: vi.fn().mockResolvedValue(undefined),
  };
  native.create.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
  const action = vi.fn();
  const options = [{ id: "open", text: "Ouvrir", action }];
  await showNativeMenu(options);
  expect(first.close).not.toHaveBeenCalled();
  expect(native.create.mock.calls[0][0].items[0].action).toBe(action);
  expect(native.create.mock.calls[0][0].items[0]).not.toBe(options[0]);
  await expect(showNativeMenu([{ text: "Exporter" }])).rejects.toThrow(
    "popup failed",
  );
  expect(first.close).toHaveBeenCalledOnce();
  expect(second.close).toHaveBeenCalledOnce();
});
