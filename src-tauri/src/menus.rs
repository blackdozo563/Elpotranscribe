//! Native presentation only. Custom actions are dispatched to the existing renderer handlers.
use serde::Deserialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{
    menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Emitter, Manager, State,
};

#[derive(Default)]
pub struct MenuSession {
    pub ready: AtomicBool,
    pub allow_exit: AtomicBool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuContext {
    editor: bool,
    can_undo: bool,
    can_redo: bool,
    can_export: bool,
    can_import: bool,
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let item = |id: &str, title: &str, shortcut: &str, enabled: bool| {
        MenuItemBuilder::with_id(id, title)
            .accelerator(shortcut)
            .enabled(enabled)
            .build(app)
    };
    let application = SubmenuBuilder::new(app, "Elpotranscribe")
        .item(&PredefinedMenuItem::about(
            app,
            Some("À propos d’Elpotranscribe"),
            Some(AboutMetadata {
                name: Some("Elpotranscribe".into()),
                version: Some(app.package_info().version.to_string()),
                ..Default::default()
            }),
        )?)
        .separator()
        .item(&item("settings", "Réglages…", "CmdOrCtrl+,", true)?)
        .separator()
        .item(&PredefinedMenuItem::services(app, Some("Services"))?)
        .separator()
        .item(&PredefinedMenuItem::hide(
            app,
            Some("Masquer Elpotranscribe"),
        )?)
        .item(&PredefinedMenuItem::hide_others(
            app,
            Some("Masquer les autres"),
        )?)
        .item(&PredefinedMenuItem::show_all(app, Some("Tout afficher"))?)
        .separator()
        .item(&item(
            "quit",
            "Quitter Elpotranscribe",
            "CmdOrCtrl+Q",
            true,
        )?)
        .build()?;
    let file = SubmenuBuilder::new(app, "Fichier")
        .item(&item(
            "new",
            "Nouvelle transcription",
            "CmdOrCtrl+N",
            false,
        )?)
        .item(&item(
            "import-audio",
            "Importer des fichiers audio…",
            "CmdOrCtrl+O",
            false,
        )?)
        .item(&item(
            "import-folder",
            "Importer un dossier…",
            "CmdOrCtrl+Shift+O",
            false,
        )?)
        .separator()
        .item(&item("export", "Exporter…", "CmdOrCtrl+Shift+E", false)?)
        .separator()
        .item(&item("close", "Fermer la fenêtre", "CmdOrCtrl+W", true)?)
        .build()?;
    let edit = SubmenuBuilder::new(app, "Édition")
        .item(&item("undo", "Annuler", "CmdOrCtrl+Z", false)?)
        .item(&item("redo", "Rétablir", "CmdOrCtrl+Shift+Z", false)?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("Couper"))?)
        .item(&PredefinedMenuItem::copy(app, Some("Copier"))?)
        .item(&PredefinedMenuItem::paste(app, Some("Coller"))?)
        .item(&PredefinedMenuItem::select_all(
            app,
            Some("Tout sélectionner"),
        )?)
        .separator()
        .item(&item("find", "Rechercher…", "CmdOrCtrl+F", false)?)
        .build()?;
    let view = SubmenuBuilder::new(app, "Présentation")
        .item(&item(
            "sidebar",
            "Masquer la barre latérale",
            "Ctrl+Super+S",
            true,
        )?)
        .item(&PredefinedMenuItem::fullscreen(app, Some("Plein écran"))?)
        .build()?;
    let window = SubmenuBuilder::new(app, "Fenêtre")
        .item(&PredefinedMenuItem::minimize(
            app,
            Some("Placer dans le Dock"),
        )?)
        .item(&PredefinedMenuItem::maximize(
            app,
            Some("Réduire/agrandir"),
        )?)
        .build()?;
    // No fictitious help action: the menu remains disabled until help exists.
    let help = SubmenuBuilder::new(app, "Aide").enabled(false).build()?;
    window.set_as_windows_menu_for_nsapp()?;
    help.set_as_help_menu_for_nsapp()?;
    app.set_menu(
        MenuBuilder::new(app)
            .items(&[&application, &file, &edit, &view, &window, &help])
            .build()?,
    )?;
    app.manage(MenuSession::default());
    Ok(())
}

#[tauri::command]
pub fn menu_ready(session: State<'_, MenuSession>) {
    session.ready.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn sync_menu_context(app: AppHandle, context: MenuContext) -> Result<(), String> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };
    let states = [
        ("new", context.can_import),
        ("import-audio", context.can_import),
        ("import-folder", context.can_import),
        ("export", context.can_export),
        ("undo", context.editor && context.can_undo),
        ("redo", context.editor && context.can_redo),
        ("find", context.editor),
    ];
    for submenu in menu.items().map_err(|error| error.to_string())? {
        if let Some(submenu) = submenu.as_submenu() {
            for (id, enabled) in states {
                if let Some(kind) = submenu.get(id) {
                    if let Some(item) = kind.as_menuitem() {
                        item.set_enabled(enabled)
                            .map_err(|error| error.to_string())?;
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn finish_window_action(app: AppHandle, quit: bool) -> Result<(), String> {
    if quit {
        app.state::<MenuSession>()
            .allow_exit
            .store(true, Ordering::SeqCst);
        app.exit(0);
    } else if let Some(window) = app.get_webview_window("main") {
        let session = app.state::<MenuSession>();
        session.allow_exit.store(true, Ordering::SeqCst);
        if let Err(error) = window.destroy() {
            session.allow_exit.store(false, Ordering::SeqCst);
            return Err(error.to_string());
        }
    }
    Ok(())
}

pub fn dispatch(app: &AppHandle, action: &str) {
    let _ = app.emit_to("main", "app-menu", action);
}
