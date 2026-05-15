import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Bundled fonts — keeps the app offline-friendly and locks the visual
// language regardless of what the host OS has installed.
import "@fontsource-variable/inter";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "@fontsource-variable/jetbrains-mono";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
