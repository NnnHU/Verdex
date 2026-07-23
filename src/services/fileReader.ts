/**
 * Verdex — plaintext attachment reader (Stage 2 document input).
 *
 * Reads user-selected txt/md files via the browser FileReader API. Works in
 * both the pure-Vite dev mode (browser) and the Tauri webview — no extra
 * permissions or plugins required. PDF/Word needs a Rust-side parser and is
 * deliberately out of scope here.
 *
 * Pure-ish: readTextFile resolves to an Attachment or rejects with a typed
 * Error; safe to unit-test with a mock File.
 */

import type { Attachment } from "../types/moa";

/** Filename extensions accepted at Stage 2. */
export const ATTACHMENT_ALLOWED_EXTENSIONS = ["txt", "md", "markdown"];

/**
 * Hard cap on a single attachment's character count (~50K tokens at ~4
 * chars/token). Larger files are truncated and flagged so the model still
 * gets something usable rather than the call blowing the context budget.
 */
export const MAX_ATTACHMENT_CHARS = 200_000;

/** Extract the lowercase extension (no dot) from a filename. "" if none. */
function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** True if the file's extension is on the allow-list. */
export function isAllowedFile(name: string): boolean {
  return ATTACHMENT_ALLOWED_EXTENSIONS.includes(extOf(name));
}

/** Read a File as UTF-8 text. Prefers the modern Promise-based `file.text()`
 *  (available in browsers, Tauri webview, and Node 18+); falls back to
 *  FileReader for older environments. */
async function readAsText(file: File): Promise<string> {
  // Modern path: File.prototype.text() — no FileReader needed.
  if (typeof (file as File & { text?: () => Promise<string> }).text === "function") {
    return (file as File & { text: () => Promise<string> }).text();
  }
  // Legacy path: FileReader (browser/webview only).
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === "string" ? result : "");
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsText(file, "utf-8");
  });
}

/**
 * Read a user-selected file into an Attachment.
 *
 * @throws Error if the extension is not on the allow-list.
 * Rejects (FileReader error) if the bytes can't be read.
 */
export async function readTextFile(file: File): Promise<Attachment> {
  const name = file.name;
  if (!isAllowedFile(name)) {
    throw new Error(
      `unsupported file type: .${extOf(name) || "?"} (allowed: ${ATTACHMENT_ALLOWED_EXTENSIONS.join(", ")})`
    );
  }

  const full = await readAsText(file);
  const truncated = full.length > MAX_ATTACHMENT_CHARS;
  const text = truncated ? full.slice(0, MAX_ATTACHMENT_CHARS) : full;

  return {
    id: crypto.randomUUID(),
    name,
    text,
    chars: text.length,
    source: extOf(name),
    truncated,
  };
}

/**
 * Read many files; returns {ok, attachments, errors}. One bad file does not
 * abort the rest — the UI can surface per-file errors.
 */
export async function readTextFiles(
  files: File[]
): Promise<{ ok: Attachment[]; errors: string[] }> {
  const ok: Attachment[] = [];
  const errors: string[] = [];
  for (const f of files) {
    try {
      ok.push(await readTextFile(f));
    } catch (e) {
      errors.push(`${f.name}: ${(e as Error).message}`);
    }
  }
  return { ok, errors };
}
