import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { applyTheme, loadInitialThemeId } from "./themes";

// Apply the persisted theme before the first render so the UI never flashes the default palette.
applyTheme(loadInitialThemeId());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
