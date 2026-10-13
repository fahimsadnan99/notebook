import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import Gate from "./components/Gate.jsx";
import { DialogProvider } from "./components/Dialogs.jsx";
import "./styles.css";

// Installable app + offline start (only in the built site; the dev server stays uncached).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")).render(
  <Gate>
    <DialogProvider>
      <App />
    </DialogProvider>
  </Gate>
);
