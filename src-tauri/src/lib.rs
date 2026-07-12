/// Verdex — Tauri application library.
///
/// The app is a pure local desktop client: the entire MoA orchestration lives
/// in the TypeScript frontend. The Rust side registers two plugins:
///   - http: lets the webview reach OpenAI-compatible endpoints from a Rust
///     origin (bypassing browser CORS restrictions).
///   - fs: lets the webview read/write the plaintext config.json in appDataDir
///     (so user config, including API keys, persists as an editable file rather
///     than opaque WebView storage). Scope is locked down in capabilities.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running Verdex application");
}
