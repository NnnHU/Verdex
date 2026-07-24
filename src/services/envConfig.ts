/**
 * Verdex — environment-based configuration (Stage 1a).
 *
 * Reads VITE_-prefixed env vars (exposed by Vite via `import.meta.env`) to:
 *   1. Seed a Provider on first launch (when no config.json exists yet).
 *   2. Tune the memory sliding-window (recent turns, trim ratio, etc.).
 *
 * No third-party deps — Vite's `import.meta.env` is build-time injected and
 * zero-cost. Fields MUST be `VITE_`-prefixed or they won't reach the frontend.
 *
 * After first launch, config.json is the single source of truth; these values
 * only matter when seeding (see configStore.loadConfig).
 */

import type { AIProvider, ProtocolType } from "../types/moa";

/* ------------------------------------------------------------------ *
 * Typed accessor for import.meta.env — keeps TS happy and centralizes
 * the cast. Vite injects only VITE_-prefixed vars as strings.
 * ------------------------------------------------------------------ */

type EnvRecord = Record<string, string | undefined>;
const env = (import.meta.env ?? {}) as EnvRecord;

const str = (key: string): string | undefined => {
  const v = env[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
};

const num = (key: string, fallback: number): number => {
  const v = str(key);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const bool = (key: string, fallback: boolean): boolean => {
  const v = str(key);
  if (v === undefined) return fallback;
  return v === "true" || v === "1" || v === "yes";
};

/* ------------------------------------------------------------------ *
 * Provider seed
 * ------------------------------------------------------------------ */

/**
 * Build a Provider from VITE_VERDEX_PROVIDER_* env vars. Returns null if the
 * three required fields (base url, api key, model) are not all present.
 *
 * The id is deterministic (constant string) so the seeded Provider is stable
 * across reloads during the first-launch window — once it lands in config.json,
 * the persisted id takes over and this seed is never read again.
 */
export function getEnvProvider(): AIProvider | null {
  const all = getEnvProviders();
  return all[0] ?? null;
}

/** Build ALL env-seeded Providers (supports a second model via VITE_VERDEX_PROVIDER2_*). */
let cachedProviders: AIProvider[] | undefined;
export function getEnvProviders(): AIProvider[] {
  if (cachedProviders) return cachedProviders;
  const result: AIProvider[] = [];
  // Primary provider
  const p1 = buildEnvProvider(1, "");
  if (p1) result.push(p1);
  // Second provider (optional, for multi-model analysis)
  const p2 = buildEnvProvider(2, "2");
  if (p2) result.push(p2);
  cachedProviders = result;
  return result;
}

/** Build one provider from env vars with the given suffix ("" or "2"). */
function buildEnvProvider(idx: number, suffix: string): AIProvider | null {
  const baseUrl = str(`VITE_VERDEX_PROVIDER${suffix}_BASE_URL`);
  const apiKey = str(`VITE_VERDEX_PROVIDER${suffix}_API_KEY`);
  const model = str(`VITE_VERDEX_PROVIDER${suffix}_MODEL`);
  if (!baseUrl || !apiKey || !model) return null;

  const protocolRaw = str(`VITE_VERDEX_PROVIDER${suffix}_PROTOCOL`) ?? "openai";
  const protocol: ProtocolType =
    protocolRaw === "anthropic" ? "anthropic" : "openai";

  const maxContextRaw = num(`VITE_VERDEX_PROVIDER${suffix}_MAX_CONTEXT_CHARS`, 0);

  return {
    id: idx === 1 ? "env-seed-provider" : "env-seed-provider2",
    name: str(`VITE_VERDEX_PROVIDER${suffix}_NAME`) ?? `${model} (env)`,
    modelString: model,
    baseUrl,
    apiKey,
    protocol,
    capabilities:
      maxContextRaw > 0 ? { maxContextChars: maxContextRaw } : undefined,
  };
}

/* ------------------------------------------------------------------ *
 * Memory tuning (Stage 1a: sliding window)
 * ------------------------------------------------------------------ */

export interface MemoryConfig {
  /** Number of recent turns kept as raw user/assistant messages. */
  recentTurns: number;
  /** History is trimmed when (history + prompt) chars exceed
   *  maxContextChars * trimRatio. Range (0, 1]. */
  trimRatio: number;
  /** Conservative context cap in chars, used when a provider has no
   *  configured maxContextChars. */
  defaultMaxContextChars: number;
  /** Print memory trim logs to console (dev only). */
  debugMemory: boolean;
  /** Default per-request timeout in ms. */
  requestTimeoutMs: number;
  /** Stage 4 Map-Reduce force mode: auto | always | never. */
  mapreduceForce: "auto" | "always" | "never";
  /** Stage 4 Map-Reduce trigger ratio (fraction of maxContextChars): total
   *  chars above this triggers. Default 0.4 (= 8万 at 20万 cap). 实测驱动. */
  mapreduceTriggerRatio: number;
  /** Stage 4 Map-Reduce doc-count threshold: ≥ this many docs triggers.
   *  Default 4. 实测: 份数多比字数大更拖慢(注意力切换成本). */
  mapreduceDocCountThreshold: number;
  /** Stage 1b: model used for history summarization. Empty = use first judge. */
  summaryModel: string;
  /** Stage 1b: how many new turns beyond the recent window must accumulate
   *  before triggering a fresh summary (avoids re-summarizing every turn). */
  summaryInterval: number;
}

let cachedMemory: MemoryConfig | undefined;

/** Read memory tuning from env, with safe defaults. */
export function getMemoryConfig(): MemoryConfig {
  if (cachedMemory) return cachedMemory;
  const trimRatio = num("VITE_VERDEX_MEMORY_TRIM_RATIO", 0.75);
  const forceRaw = str("VITE_VERDEX_MAPREDUCE_FORCE") ?? "auto";
  const mapreduceForceRaw: "auto" | "always" | "never" =
    forceRaw === "always" || forceRaw === "never" ? forceRaw : "auto";
  const triggerRaw = num("VITE_VERDEX_MAPREDUCE_TRIGGER_RATIO", 0.75);
  const mapreduceTriggerRatio = triggerRaw > 0 && triggerRaw <= 1 ? triggerRaw : 0.75;
  const docCountThresholdRaw = num("VITE_VERDEX_MAPREDUCE_DOC_THRESHOLD", 4);
  cachedMemory = {
    recentTurns: Math.max(1, Math.floor(num("VITE_VERDEX_MEMORY_RECENT_TURNS", 8))),
    trimRatio: trimRatio > 0 && trimRatio <= 1 ? trimRatio : 0.75,
    defaultMaxContextChars: num(
      "VITE_VERDEX_PROVIDER_MAX_CONTEXT_CHARS",
      200000
    ),
    debugMemory: bool("VITE_VERDEX_DEBUG_MEMORY", false),
    requestTimeoutMs: num("VITE_VERDEX_REQUEST_TIMEOUT_MS", 60000),
    mapreduceForce: mapreduceForceRaw,
    mapreduceTriggerRatio,
    mapreduceDocCountThreshold: Math.max(2, Math.floor(docCountThresholdRaw)),
    summaryModel: str("VITE_VERDEX_SUMMARY_MODEL") ?? "",
    summaryInterval: Math.max(1, Math.floor(num("VITE_VERDEX_SUMMARY_INTERVAL", 4))),
  };
  return cachedMemory;
}
