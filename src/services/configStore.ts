/**
 * Verdex — configuration persistence store.
 *
 * Two backends, selected at runtime by isTauri():
 *   - Tauri (desktop): a single plaintext config.json in appDataDir.
 *     Contains everything: providers (with API keys), role templates, judge
 *     prompt templates, all sessions, and currentSessionId. Human-readable,
 *     user-editable, backupable.
 *   - Browser (npm run dev, no Tauri): localStorage fallback so pure-Vite dev
 *     still works. One key (verdex.config) holds the same JSON shape.
 *
 * First-launch seeding: if no config exists on either backend, the bundled
 * template (config.template.json, imported as ?raw) is returned as the initial
 * state. The hook then writes it back on the first save, materialising the
 * config file. A one-time migration from the legacy 5-key localStorage layout
 * is attempted before falling back to the template.
 *
 * No third-party deps — just Tauri's fs/path plugins (lazy dynamic import,
 * mirroring httpClient.ts) + localStorage in the browser path.
 */

import type {
  AIProvider,
  ChatSession,
  JudgePromptTemplate,
  RoleTemplate,
} from "../types/moa";

// Bundled template string (Vite ?raw import). Kept out of the runtime fetch
// path — it ships in the JS bundle.
import templateRaw from "./config.template.json?raw";

/** The on-disk / on-storage shape: all five persisted domains in one object. */
export interface ConfigFile {
  providers: AIProvider[];
  roleTemplates: RoleTemplate[];
  judgePrompts: JudgePromptTemplate[];
  sessions: ChatSession[];
  currentSessionId: string | null;
  /** UI language: "en" (default) or "zh". */
  language: "en" | "zh";
  /** UI theme: "dark" (default), "light", or "soft". */
  theme: "dark" | "light" | "soft";
}

/** Filename inside appDataDir (Tauri) / key namespace (browser). */
const CONFIG_FILENAME = "config.json";
const LS_CONFIG = "verdex.config";

// Legacy localStorage keys (pre-migration). Used only by migrateLegacyLs().
const LS_LEGACY_KEYS = {
  providers: "verdex.providers",
  roles: "verdex.roleTemplates",
  judgePrompts: "verdex.judgePrompts",
  sessions: "verdex.sessions",
  current: "verdex.currentSessionId",
};

/* ------------------------------------------------------------------ *
 * Environment detection (mirrors httpClient.ts)
 * ------------------------------------------------------------------ */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/* ------------------------------------------------------------------ *
 * Template parsing
 * ------------------------------------------------------------------ */

/** Parsed template, cached after first access. */
let cachedTemplate: ConfigFile | null = null;

/** Return the bundled default config template as a typed object. */
export function getTemplateConfig(): ConfigFile {
  if (cachedTemplate) return cachedTemplate;
  const parsed = JSON.parse(templateRaw) as ConfigFile;
  // Defensive: strip the non-schema "_comment" field if present.
  const { _comment, ...rest } = parsed as ConfigFile & { _comment?: unknown };
  void _comment;
  cachedTemplate = rest;
  return cachedTemplate;
}

/* ------------------------------------------------------------------ *
 * Tauri (desktop) file backend
 * ------------------------------------------------------------------ */

interface FsBackend {
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, contents: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  mkdir: (path: string, opts?: { recursive: boolean }) => Promise<void>;
  appDataDir: () => Promise<string>;
  join: (...parts: string[]) => Promise<string>;
}

let fsBackendPromise: Promise<FsBackend | null> | null = null;

/** Lazily resolve the Tauri fs + path backend (cached after first load). */
async function resolveFsBackend(): Promise<FsBackend | null> {
  if (!isTauri()) return null;
  if (!fsBackendPromise) {
    fsBackendPromise = (async () => {
      try {
        const [fs, path] = await Promise.all([
          import("@tauri-apps/plugin-fs"),
          import("@tauri-apps/api/path"),
        ]);
        return {
          readTextFile: fs.readTextFile,
          writeTextFile: fs.writeTextFile,
          exists: fs.exists,
          mkdir: fs.mkdir,
          appDataDir: path.appDataDir,
          join: path.join,
        } as FsBackend;
      } catch {
        return null;
      }
    })();
  }
  return fsBackendPromise;
}

/** Read config.json from appDataDir. Returns null if missing/unreadable. */
async function loadFromTauri(): Promise<ConfigFile | null> {
  const fs = await resolveFsBackend();
  if (!fs) return null;
  try {
    const dir = await fs.appDataDir();
    const path = await fs.join(dir, CONFIG_FILENAME);
    if (!(await fs.exists(path))) return null;
    const text = await fs.readTextFile(path);
    const parsed = JSON.parse(text) as ConfigFile;
    return normalizeConfigShape(parsed);
  } catch {
    return null;
  }
}

/** Write config.json into appDataDir, creating the directory if needed. */
async function saveToTauri(data: ConfigFile): Promise<void> {
  const fs = await resolveFsBackend();
  if (!fs) return;
  try {
    const dir = await fs.appDataDir();
    await fs.mkdir(dir, { recursive: true }).catch(() => undefined);
    const path = await fs.join(dir, CONFIG_FILENAME);
    await fs.writeTextFile(path, JSON.stringify(data, null, 2));
  } catch {
    /* ignore write errors — config is best-effort persistent */
  }
}

/* ------------------------------------------------------------------ *
 * Browser (dev) localStorage backend
 * ------------------------------------------------------------------ */

function loadFromLs(): ConfigFile | null {
  try {
    const raw = localStorage.getItem(LS_CONFIG);
    if (!raw) return null;
    return normalizeConfigShape(JSON.parse(raw) as ConfigFile);
  } catch {
    return null;
  }
}

function saveToLs(data: ConfigFile): void {
  try {
    localStorage.setItem(LS_CONFIG, JSON.stringify(data));
  } catch {
    /* ignore quota errors */
  }
}

/* ------------------------------------------------------------------ *
 * Legacy localStorage migration (one-time)
 * ------------------------------------------------------------------ */

/**
 * If the user has data under the OLD 5-key localStorage layout (pre-file-migration)
 * but nothing under the new single key, assemble it into a ConfigFile and return
 * it. Caller is responsible for then saving it (which writes the new key).
 * Returns null if no legacy data found.
 */
function migrateLegacyLs(): ConfigFile | null {
  try {
    const rawProviders = localStorage.getItem(LS_LEGACY_KEYS.providers);
    const rawSessions = localStorage.getItem(LS_LEGACY_KEYS.sessions);
    // Require at least providers or sessions to consider it a real legacy store.
    if (!rawProviders && !rawSessions) return null;

    const parseArr = <T>(raw: string | null): T[] => {
      if (!raw) return [];
      const p = JSON.parse(raw);
      return Array.isArray(p) ? (p as T[]) : [];
    };

    const providers = parseArr<AIProvider>(rawProviders);
    const roleTemplates = parseArr<RoleTemplate>(
      localStorage.getItem(LS_LEGACY_KEYS.roles)
    );
    const judgePrompts = parseArr<JudgePromptTemplate>(
      localStorage.getItem(LS_LEGACY_KEYS.judgePrompts)
    );
    const sessions = parseArr<ChatSession>(rawSessions);
    const currentSessionId =
      localStorage.getItem(LS_LEGACY_KEYS.current) ?? null;

    return normalizeConfigShape({
      providers,
      roleTemplates,
      judgePrompts,
      sessions,
      currentSessionId,
    });
  } catch {
    return null;
  }
}

/** After a successful migration write, clear the old keys. */
function clearLegacyLs(): void {
  try {
    Object.values(LS_LEGACY_KEYS).forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Load the full config. Resolution order:
 *   1. Current backend (Tauri file OR new localStorage key).
 *   2. Legacy 5-key localStorage (one-time migration source) — if found, it's
 *      returned so the caller can save it to the new backend, then cleared.
 *   3. Bundled template (first launch with no data anywhere).
 *
 * Always returns a valid ConfigFile; never throws.
 */
export async function loadConfig(): Promise<ConfigFile> {
  // 1. Current backend.
  const current = isTauri() ? await loadFromTauri() : loadFromLs();
  if (current) return current;

  // 2. Legacy localStorage (browser-side only; Tauri users never had LS data
  //    in the desktop build, so this is a dev-mode convenience).
  if (!isTauri()) {
    const legacy = migrateLegacyLs();
    if (legacy) {
      saveToLs(legacy);
      clearLegacyLs();
      return legacy;
    }
  }

  // 3. Template.
  return getTemplateConfig();
}

/**
 * Persist the full config to the active backend. Best-effort; never throws.
 * In Tauri this materialises/updates config.json; in browser it writes the
 * single localStorage key.
 */
export async function saveConfig(data: ConfigFile): Promise<void> {
  if (isTauri()) {
    await saveToTauri(data);
  } else {
    saveToLs(data);
  }
}

/* ------------------------------------------------------------------ *
 * Shape normalization
 * ------------------------------------------------------------------ */

/**
 * Coerce a parsed config into a structurally valid ConfigFile: ensure all five
 * arrays exist and provider.protocol is present (back-compat with older saves
 * that predate the protocol field). Deep config/session normalization
 * (sanitize in-flight states, migrate legacy judgeId, prune dangling refs) is
 * intentionally left to useMoa.ts, which has the type-aware helpers.
 */
function normalizeConfigShape(raw: Partial<ConfigFile>): ConfigFile {
  const providers = Array.isArray(raw.providers)
    ? raw.providers.map((p) => ({
        ...p,
        protocol: p.protocol ?? "openai",
      }))
    : [];
  return {
    providers,
    roleTemplates: Array.isArray(raw.roleTemplates) ? raw.roleTemplates : [],
    judgePrompts: Array.isArray(raw.judgePrompts) ? raw.judgePrompts : [],
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    currentSessionId: raw.currentSessionId ?? null,
    language: raw.language === "zh" ? "zh" : "en",
    theme: raw.theme === "light" || raw.theme === "soft" ? raw.theme : "dark",
  };
}
