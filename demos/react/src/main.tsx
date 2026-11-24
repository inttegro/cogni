import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CogniProvider } from "@inttegro/cogni-react";

import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CogniProvider>
      <App />
    </CogniProvider>
  </StrictMode>,
);
