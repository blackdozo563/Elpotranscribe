import { useCallback, useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Button, NumberStepper, Select, TextField } from "./components/ui";
import type { Settings, Snapshot } from "./domain";
import { time } from "./domain";
import {
  applicationInfo,
  connectSettings,
  draftSettings,
  mergeSettings,
  mergeSnapshot,
  updateSettings,
  type ApplicationInfo,
  type SettingsPatch,
} from "./settingsClient";
import {
  latestPreview,
  previewSubtitle,
  standardSubtitles,
  verticalSubtitles,
  subtitlePreset,
} from "./settingsPreview";
import { number } from "./format";
const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const tabs = ["Sous-titres", "Modèles et réseau", "Application"];
export default function SettingsWindow() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [info, setInfo] = useState<ApplicationInfo | null>(null);
  const [tab, setTab] = useState(0),
    [custom, setCustom] = useState(false),
    [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<Promise<boolean> | null>(null),
    savingRef = useRef(false),
    closing = useRef(false);
  const desktop = isTauri() || "__TAURI_INTERNALS__" in window;
  const refresh = useCallback(async () => {
    const next = await invoke<Snapshot>("snapshot");
    setSnapshot((previous) => mergeSnapshot(previous, next));
  }, []);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false,
      unlisten: (() => void) | undefined;
    void connectSettings((document) => {
      if (!disposed)
        setSnapshot((previous) =>
          previous ? mergeSettings(previous, document) : previous,
        );
    })
      .then((fn) => {
        if (disposed) fn();
        else {
          unlisten = fn;
          void refresh().catch((e) => setError(String(e)));
        }
      })
      .catch((e) => setError(String(e)));
    void applicationInfo()
      .then((value) => {
        if (!disposed) setInfo(value);
      })
      .catch((e) => {
        if (!disposed) setError(String(e));
      });
    const timer = setInterval(
      () => void refresh().catch((e) => setError(String(e))),
      1000,
    );
    return () => {
      disposed = true;
      unlisten?.();
      clearInterval(timer);
    };
  }, [desktop, refresh]);
  const close = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    try {
      const result = await pending.current;
      if (result !== false) await getCurrentWindow().destroy();
    } finally {
      closing.current = false;
    }
  }, []);
  useEffect(() => {
    if (!desktop) return;
    let disposed = false,
      unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested((event) => {
        if (pending.current) {
          event.preventDefault();
          void close().catch((e) => setError(String(e)));
        }
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      })
      .catch((e) => setError(String(e)));
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();
        void close().catch((e) => setError(String(e)));
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      disposed = true;
      unlisten?.();
      window.removeEventListener("keydown", key);
    };
  }, [desktop, close]);
  const change = (patch: SettingsPatch) => {
    if (!snapshot || savingRef.current || snapshot.busy) return;
    savingRef.current = true;
    setSaving(true);
    setSaved(false);
    setError("");
    setDraft(draftSettings(snapshot.settings, patch));
    const focused = document.activeElement as HTMLElement | null;
    const operation = (async () => {
      try {
        const document = await updateSettings(patch);
        setSnapshot((previous) =>
          previous ? mergeSettings(previous, document) : previous,
        );
        setSaved(true);
        return true;
      } catch (error) {
        setError(String(error));
        return false;
      } finally {
        setDraft(null);
        setSaving(false);
        savingRef.current = false;
        if (focused?.isConnected && document.activeElement === document.body)
          requestAnimationFrame(() => focused.focus());
      }
    })();
    pending.current = operation;
    void operation.finally(() => {
      if (pending.current === operation) pending.current = null;
    });
  };
  const settings = draft ?? snapshot?.settings;
  const preview = snapshot ? latestPreview(snapshot.jobs) : null;
  const layout =
    preview && settings
      ? previewSubtitle(preview.cue, settings.subtitles)
      : null;
  const disabled = !settings || saving || snapshot?.busy === true;
  return (
    <main className="settings-window">
      <h1>Réglages</h1>
      <div
        role="tablist"
        aria-label="Catégories de réglages"
        className="settings-tabs"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? 2
                : (tab + (event.key === "ArrowRight" ? 1 : 2)) % 3;
          setTab(next);
          document.getElementById(`settings-tab-${next}`)?.focus();
        }}
      >
        {tabs.map((name, i) => (
          <Button
            key={name}
            id={`settings-tab-${i}`}
            role="tab"
            aria-selected={tab === i}
            aria-controls={`settings-panel-${i}`}
            tabIndex={tab === i ? 0 : -1}
            onClick={() => setTab(i)}
          >
            {name}
          </Button>
        ))}
      </div>
      <div className="settings-feedback" role="status" aria-live="polite">
        {saving
          ? "Enregistrement…"
          : saved
            ? "Enregistré"
            : snapshot?.busy
              ? "Un traitement est en cours. Les réglages seront modifiables à sa fin."
              : ""}
      </div>
      {error && (
        <p role="alert" className="settings-error">
          {error}
        </p>
      )}
      {!desktop && (
        <p>Les réglages sont disponibles dans l’application macOS.</p>
      )}
      {!settings && desktop && <p>Chargement des réglages…</p>}
      {settings && (
        <section
          role="tabpanel"
          id={`settings-panel-${tab}`}
          aria-labelledby={`settings-tab-${tab}`}
          tabIndex={0}
        >
          {tab === 0 && (
            <>
              <div className="settings-row">
                <label htmlFor="subtitle-preset">Préréglage</label>
                <Select
                  id="subtitle-preset"
                  aria-label="Préréglage"
                  disabled={disabled}
                  value={custom ? "custom" : subtitlePreset(settings.subtitles)}
                  onChange={(event) => {
                    setCustom(event.target.value === "custom");
                    if (event.target.value !== "custom") {
                      const value =
                        event.target.value === "vertical"
                          ? verticalSubtitles
                          : standardSubtitles;
                      change({
                        lineLength: value.lineLength,
                        maxLines: value.maxLines,
                        maxDurationMs: value.maxDurationMs,
                      });
                    }
                  }}
                >
                  <option value="standard">Standard / YouTube</option>
                  <option value="vertical">Vertical (Shorts, Reels)</option>
                  <option value="custom">Personnalisé</option>
                </Select>
              </div>
              <div className="settings-row">
                <span>Caractères par ligne</span>
                <NumberStepper
                  aria-label="Caractères par ligne"
                  disabled={disabled}
                  min={12}
                  max={80}
                  value={settings.subtitles.lineLength}
                  onValueChange={(value) => change({ lineLength: value })}
                />
              </div>
              <div className="settings-row">
                <span>Nombre de lignes</span>
                <NumberStepper
                  aria-label="Nombre de lignes"
                  disabled={disabled}
                  min={1}
                  max={2}
                  value={settings.subtitles.maxLines}
                  onValueChange={(value) => change({ maxLines: value })}
                />
              </div>
              <div className="settings-row">
                <span>Durée cible maximum (secondes)</span>
                <NumberStepper
                  aria-label="Durée cible maximum (secondes)"
                  disabled={disabled}
                  min={1}
                  max={10}
                  value={settings.subtitles.maxDurationMs / 1000}
                  onValueChange={(value) =>
                    change({ maxDurationMs: value * 1000 })
                  }
                />
              </div>
              {preview && layout && (
                <section
                  className="settings-preview"
                  aria-label="Aperçu du sous-titre"
                >
                  <h2>Aperçu</h2>
                  <p>
                    {preview.name} · segment {number(preview.index + 1)}
                  </p>
                  <div className="settings-preview-groups">
                    {layout.groups.map((text, i) => (
                      <div key={i} dir="auto">
                        {text}
                      </div>
                    ))}
                  </div>
                  <p className="mono">
                    {time(preview.cue.startMs)} → {time(preview.cue.endMs)}
                  </p>
                  <p>
                    {layout.cps === null
                      ? "Vitesse de lecture indisponible"
                      : `${decimal.format(layout.cps)} caractères par seconde`}{" "}
                    ·{" "}
                    {layout.durationMs > 0
                      ? `${decimal.format(layout.durationMs / 1000)} s`
                      : "Durée non exploitable"}
                  </p>
                  {(layout.groups.length > 1 ||
                    layout.tooLong ||
                    layout.overDuration) && (
                    <p className="settings-preview-warning">
                      Ce segment dépasse les limites choisies. Ses temps restent
                      inchangés.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
          {tab === 1 && (
            <>
              <label className="check-label">
                <TextField
                  type="checkbox"
                  disabled={disabled}
                  checked={settings.autoModelUpdates}
                  onChange={(event) =>
                    change({ autoModelUpdates: event.target.checked })
                  }
                />
                Rechercher automatiquement les mises à jour des modèles
              </label>
              <p className="settings-help">
                Les téléchargements restent à votre initiative dans Modèles IA.
              </p>
            </>
          )}
          {tab === 2 && (
            <>
              <dl className="settings-application">
                <dt>Version</dt>
                <dd>{info?.version ?? "Indisponible"}</dd>
                <dt>Modèle de Mac</dt>
                <dd>{info?.macModel ?? "Indisponible"}</dd>
                {info?.platform && (
                  <>
                    <dt>Configuration</dt>
                    <dd>{info.platform}</dd>
                  </>
                )}
              </dl>
              <p>Aucune télémétrie</p>
              <label className="check-label">
                <TextField
                  type="checkbox"
                  disabled={disabled}
                  checked={settings.autoSave}
                  onChange={(event) =>
                    change({ autoSave: event.target.checked })
                  }
                />
                Enregistrer les SRT dans les dossiers d’origine
              </label>
            </>
          )}
        </section>
      )}
    </main>
  );
}
