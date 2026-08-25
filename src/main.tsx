import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DataProvider } from "@/providers/api";
import Desktop from "./desktop/Desktop";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <DataProvider>
      <Desktop />
    </DataProvider>
  </StrictMode>,
);
