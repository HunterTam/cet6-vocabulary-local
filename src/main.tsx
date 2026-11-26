import { createRoot } from "react-dom/client";
import VocabularyDesk from "./page";
import "./globals.css";

if (typeof window !== "undefined" && "serviceWorker" in navigator && window.location.protocol === "https:") {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    // Guard against reload loops on iOS PWA
    const lastReload = Number(sessionStorage.getItem("cet6-sw-reloaded-at") || 0);
    if (Date.now() - lastReload < 15_000) return;
    reloading = true;
    try { sessionStorage.setItem("cet6-sw-reloaded-at", String(Date.now())); } catch {}
    window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js", { updateViaCache: "none" })
      .then(reg => {
        void reg.update().catch(() => undefined);
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            void reg.update().catch(() => undefined);
          }
        });
      })
      .catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(<VocabularyDesk />);
