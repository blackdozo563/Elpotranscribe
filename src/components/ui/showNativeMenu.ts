import {
  Menu,
  type MenuItemOptions,
  type PredefinedMenuItemOptions,
} from "@tauri-apps/api/menu";
let current: Menu | null = null;
let pending: Promise<void> = Promise.resolve();
// popup() resolves when shown. Keep the resource alive for its action callbacks;
// release it when the next context menu replaces it (or the window is destroyed).
export function showNativeMenu(
  items: Array<MenuItemOptions | PredefinedMenuItemOptions>,
): Promise<void> {
  const request = pending.then(async () => {
    const previous = current;
    current = null;
    await previous?.close();
    const menu = await Menu.new({ items: items.map((item) => ({ ...item })) });
    current = menu;
    try {
      await menu.popup();
    } catch (error) {
      if (current === menu) current = null;
      await menu.close();
      throw error;
    }
  });
  pending = request.catch(() => {});
  return request;
}
