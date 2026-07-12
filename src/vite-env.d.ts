/// <reference types="vite/client" />

interface Window {
  // Tauri injects this global when running inside the webview. We use it to
  // decide whether to route HTTP through the Rust-side fetch (no CORS).
  __TAURI_INTERNALS__?: unknown;
}
