import "@fontsource-variable/inter";
import "@fontsource/playfair-display/600.css";
import "@fontsource/jetbrains-mono/500.css";
import "@ganaderia/ui/tokens.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { watchForUpdates } from "./lib/appUpdate";
import { isStandalone } from "./lib/standalone";
import { AppProvider } from "./state";
import "./styles.css";
import "./ios.css";
import "./movil.css";
import "./modern.css";

watchForUpdates();

// Clases de entorno: permiten estilos distintos cuando se abre como app instalada.
document.documentElement.classList.toggle("standalone", isStandalone());

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </StrictMode>,
  );
}
