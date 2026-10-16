import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import SettingsWindow from "./SettingsWindow";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {new URLSearchParams(location.search).get("window") === "settings" ? (
      <SettingsWindow />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
