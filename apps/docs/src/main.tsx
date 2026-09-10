import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { sections } from "./pages";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App sections={sections} />
  </StrictMode>,
);
