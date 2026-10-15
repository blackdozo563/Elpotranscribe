import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { MoreHorizontal, RotateCcw } from "lucide-react";
import type { Snapshot } from "./domain";
import { Button, showNativeMenu } from "./components/ui";
import { bytes, checkedDate, exactDate, number } from "./format";
const models = [
  {
    id: "ultra",
    name: "Parakeet Ultra",
    backend: "FluidAudio · Core ML",
    languages: "Français, anglais et langues européennes",
  },
  {
    id: "whisper-turbo",
    name: "Whisper large-v3-turbo Q5_0",
    backend: "whisper.cpp · Metal",
    languages:
      "Français, anglais et autres langues prises en charge par Whisper",
  },
];
type Action = (
  command: string,
  args?: Record<string, unknown>,
) => Promise<unknown>;
interface Usage {
  allocatedBytes: number;
  logicalBytes: number;
  files: number;
}
export default function Models({
  data,
  disabled,
  action,
  onError,
  operation,
}: {
  operation?: string | null;
  data: Snapshot;
  disabled: boolean;
  action: Action;
  onError: (error: string) => void;
}) {
  const [usage, setUsage] = useState<Record<string, Usage>>({});
  const [verified, setVerified] = useState<string | null>(null);
  const installed = data.installedModels.join(",");
  useEffect(() => {
    let disposed = false;
    setUsage({});
    if (data.busy) return;
    for (const engine of data.installedModels)
      void invoke("model_disk_usage", { engine })
        .then((result) => {
          if (
            !disposed &&
            result &&
            typeof result === "object" &&
            "allocatedBytes" in result &&
            "logicalBytes" in result &&
            "files" in result
          ) {
            const measured = result as Usage;
            if (
              [
                measured.allocatedBytes,
                measured.logicalBytes,
                measured.files,
              ].every((n) => Number.isSafeInteger(n) && n >= 0)
            )
              setUsage((old) => ({ ...old, [engine]: measured }));
          }
        })
        .catch(() => {});
    return () => {
      disposed = true;
    };
    // Measurement is read-only: action's global working flag must not reschedule this effect.
  }, [installed, data.busy]);
  const run = (command: string, args?: Record<string, unknown>) => {
    void action(command, args).catch((error) => onError(String(error)));
  };
  return (
    <div className="models">
      {operation === "install_model" && (
        <p role="status">Installation du modèle en cours…</p>
      )}
      {operation === "verify_model" && (
        <p role="status">Vérification d’intégrité en cours…</p>
      )}
      <section className="model-version-row">
        <strong>Versions des modèles</strong>
        <Button disabled={disabled} onClick={() => run("check_model_updates")}>
          <RotateCcw size={14} />
          Vérifier les mises à jour
        </Button>
      </section>
      {models.map((model) => {
        const ready = data.installedModels.includes(model.id),
          update = data.modelUpdates.find((item) => item.engine === model.id),
          size = usage[model.id];
        const status = !ready
          ? "Non installé"
          : !update
            ? "Installé"
            : update.status === "current"
              ? `✓ À jour · ${checkedDate(update.checkedAt)}`
              : update.status === "available"
                ? `Mise à jour disponible · ${checkedDate(update.checkedAt)}`
                : update.status === "error"
                  ? "Vérification des versions indisponible"
                  : "Version non identifiée";
        const more = () => {
          void showNativeMenu([
            {
              id: "verify",
              text: "Vérifier l’intégrité",
              enabled: !disabled,
              action: () => {
                void action("verify_model", { engine: model.id })
                  .then(() => setVerified(model.id))
                  .catch((error) => onError(String(error)));
              },
            },
            {
              id: "reinstall",
              text: "Réinstaller",
              enabled: !disabled,
              action: () => run("install_model", { engine: model.id }),
            },
            { item: "Separator" },
            {
              id: "remove",
              text: "Supprimer",
              enabled: !disabled,
              action: () => {
                void action("confirm_action", {
                  message: `Supprimer ${model.name} du Mac ?`,
                })
                  .then((answer) => {
                    if (answer === true)
                      run("remove_model", { engine: model.id });
                  })
                  .catch((error) => onError(String(error)));
              },
            },
          ]).catch((error) => onError(String(error)));
        };
        return (
          <section
            className="model-entry"
            key={model.id}
            aria-label={model.name}
          >
            <div className="model-entry-heading">
              <div>
                <h2>{model.name}</h2>
                <p>{model.backend}</p>
              </div>
              <div className="button-row">
                {!ready ? (
                  <Button
                    variant="primary"
                    disabled={disabled}
                    onClick={() => run("install_model", { engine: model.id })}
                  >
                    Installer{" "}
                    {model.id === "ultra" ? "Parakeet Ultra" : "Whisper Turbo"}
                  </Button>
                ) : data.settings.engine === model.id ? (
                  <span className="default-engine">Moteur par défaut</span>
                ) : (
                  <Button
                    variant="primary"
                    disabled={disabled}
                    onClick={() =>
                      run("save_settings", {
                        settings: {
                          ...data.settings,
                          engine: model.id,
                          language:
                            model.id === "ultra" &&
                            data.settings.language === "ar"
                              ? "auto"
                              : data.settings.language,
                        },
                      })
                    }
                  >
                    Utiliser par défaut
                  </Button>
                )}
                {ready && (
                  <Button
                    aria-label={`Options ${model.name}`}
                    disabled={disabled}
                    onClick={more}
                  >
                    <MoreHorizontal size={16} />
                  </Button>
                )}
              </div>
            </div>
            <p>{model.languages}</p>
            <p
              className={
                update?.status === "current" && ready ? "model-current" : ""
              }
            >
              {status}
            </p>
            {size && <p>{bytes(size.allocatedBytes)} sur disque</p>}
            {verified === model.id && <p role="status">Intégrité vérifiée.</p>}
            {ready && update?.status === "available" && (
              <Button
                disabled={disabled}
                onClick={() => run("install_model", { engine: model.id })}
              >
                Télécharger la mise à jour
              </Button>
            )}
            {ready && (
              <details>
                <summary>Détails techniques</summary>
                {update?.installedRevision && (
                  <p>
                    Révision installée :{" "}
                    <span className="selectable">
                      {update.installedRevision}
                    </span>
                  </p>
                )}
                {update && update.checkedAt > 0 && (
                  <p>Versions vérifiées le {exactDate(update.checkedAt)}</p>
                )}
                {size && (
                  <p>
                    {number(size.files)} fichiers · {bytes(size.logicalBytes)}{" "}
                    de contenu logique
                  </p>
                )}
                {update?.error && <p>{update.error}</p>}
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}
