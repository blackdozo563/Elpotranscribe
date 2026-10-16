//! Native presentation only. Custom actions are dispatched to the existing renderer handlers.
use serde::Deserialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{
    menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder},
    AppHandle, Emitter, Manager, State,
};

#[derive(Default)]
pub struct MenuSession {
    pub ready: AtomicBool,
    settings_opening: AtomicBool,
    pub allow_exit: AtomicBool,
    context: Mutex<MenuContext>,
}

#[derive(Clone, Default, Deserialize)]
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
    *app.state::<MenuSession>()
        .context
        .lock()
        .map_err(|e| e.to_string())? = context;
    refresh_context(&app)
}
pub fn refresh_context(app: &AppHandle) -> Result<(), String> {
    let Some(session) = app.try_state::<MenuSession>() else {
        return Ok(());
    };
    let context = if settings_focused(app) {
        MenuContext::default()
    } else {
        session.context.lock().map_err(|e| e.to_string())?.clone()
    };
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
        if let Some(settings) = app.get_webview_window("settings") {
            settings.destroy().map_err(|e| e.to_string())?;
        }
        let session = app.state::<MenuSession>();
        session.allow_exit.store(true, Ordering::SeqCst);
        if let Err(error) = window.destroy() {
            session.allow_exit.store(false, Ordering::SeqCst);
            return Err(error.to_string());
        }
    }
    Ok(())
}

fn settings_focused(app: &AppHandle) -> bool {
    app.get_webview_window("settings")
        .is_some_and(|window| window.is_focused().unwrap_or(false))
}
#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    let session = app.state::<MenuSession>();
    if session.settings_opening.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let result = (|| {
        if let Some(window) = app.get_webview_window("settings") {
            window.show().map_err(|e| e.to_string())?;
            window.unminimize().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        } else {
            tauri::WebviewWindowBuilder::new(
                &app,
                "settings",
                tauri::WebviewUrl::App("index.html?window=settings".into()),
            )
            .title("Réglages")
            .inner_size(740.0, 620.0)
            .resizable(false)
            .maximizable(false)
            .build()
            .map_err(|e| e.to_string())?;
        }
        refresh_context(&app)
    })();
    session.settings_opening.store(false, Ordering::SeqCst);
    result
}
pub fn dispatch(app: &AppHandle, action: &str) {
    if action == "settings" {
        let _ = open_settings(app.clone());
        return;
    }
    if settings_focused(app) && action != "quit" {
        if action == "close" {
            if let Some(window) = app.get_webview_window("settings") {
                let _ = window.close();
            }
        }
        return;
    }
    if app.get_webview_window("main").is_none() && action == "quit" {
        app.state::<MenuSession>()
            .allow_exit
            .store(true, Ordering::SeqCst);
        app.exit(0);
        return;
    }
    let _ = app.emit_to("main", "app-menu", action);
}
