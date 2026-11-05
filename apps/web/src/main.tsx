import "@fontsource-variable/inter";
import "@fontsource/playfair-display/600.css";
import "@fontsource/jetbrains-mono/500.css";
import "@ganaderia/ui/tokens.css";
import { registerSW } from "virtual:pwa-register";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { isStandalone } from "./lib/standalone";
import { AppProvider } from "./state";
import "./styles.css";
import "./ios.css";

registerSW({ immediate: true });

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
