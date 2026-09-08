import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import "./index.css";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: import.meta.env.PROD && !!import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 0.1,
  // No session replay. The option is deliberately absent rather than set to 0:
  // replaysOnErrorSampleRate was here without replayIntegration(), so nothing
  // recorded — but anyone adding that integration would have silently begun
  // capturing children's screens, free text included, and shipping them to a
  // US provider with no EU region. Removing the line removes the invitation.
})

// Catch unhandled promise rejections — forwards to Sentry in production.
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Trak] Unhandled promise rejection:', event.reason)
  Sentry.captureException(event.reason)
  event.preventDefault()
})

if (import.meta.env.DEV) {
  // Runtime render-performance overlay — highlights components that re-render
  const { scan } = await import("react-scan");
  scan({ enabled: true, showToolbar: true });

  // Accessibility audit — logs violations to the browser console
  const axe = await import("@axe-core/react");
  const React = await import("react");
  const ReactDOM = await import("react-dom");
  axe.default(React.default, ReactDOM.default, 1000);
}

createRoot(document.getElementById("root")!).render(<App />);
