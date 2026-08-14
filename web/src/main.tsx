import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Self-hosted and bundled. A CDN font link would render a fallback serif on the
// demo machine, which runs fully offline.
import "@fontsource-variable/archivo";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import "./styles.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
