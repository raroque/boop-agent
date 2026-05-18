import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { App } from "./App.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import "./styles.css";

const storedTheme = (() => {
  try {
    return localStorage.getItem("boop-debug-theme");
  } catch {
    return null;
  }
})();
document.documentElement.classList.add(storedTheme === "light" ? "light" : "dark");

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  document.getElementById("root")!.innerHTML = `
    <div style="padding:2rem;font-family:Geist,ui-sans-serif,system-ui,sans-serif">
      <h1>VITE_CONVEX_URL is not set</h1>
      <p>Run <code>npm run setup</code> or <code>npx convex dev</code> to configure Convex, then reload.</p>
    </div>`;
} else {
  const convex = new ConvexReactClient(convexUrl);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <ConvexProvider client={convex}>
          <App />
        </ConvexProvider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}
