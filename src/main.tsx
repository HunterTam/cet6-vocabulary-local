import { createRoot } from "react-dom/client";
import VocabularyDesk from "./page";
import "./globals.css";

if (typeof window !== "undefined" && "serviceWorker" in navigator && window.location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(<VocabularyDesk />);
