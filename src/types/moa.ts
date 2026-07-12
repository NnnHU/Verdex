/**
 * Verdex — Core data structures for the Mixture-of-Agents (MoA) engine.
 *
 * No third-party AI frameworks. These types are the single source of truth
 * shared between the engine (`services/moaEngine.ts`) and the UI.
 *
 * Architecture (two decoupled persistence domains + per-session scheduling):
 *   - providers   : AIProvider[]         — global model endpoints (CRUD).
 *   - roleTemplates / judgePrompts       — global prompt templates (CRUD).
 *   - sessions    : ChatSession[]        — chat history; each carries its own
 *                                          MoASessionConfig (mode + selection).
 *
 * A provider's role (panel vs judge) is decided per session, never on the
 * provider. `mode` selects the simple flow (parallel panels → single judge)
 * vs the advanced flow (role-driven panels → single OR collision judges).
 */

/* ------------------------------------------------------------------ *
 * 0. Wire-protocol primitives
 * ------------------------------------------------------------------ */

/** Wire protocol the endpoint speaks. Drives the request/response adapter. */
export type ProtocolType = "openai" | "anthropic";

/** A single chat message, in OpenAI's role/content shape (the canonical form
 *  used everywhere in the app; the HTTP adapter rewrites it per protocol). */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/* ------------------------------------------------------------------ *
 * 1. Global model provider configuration
 * ------------------------------------------------------------------ */

/** Declared capabilities of a provider, used by the scheduler to skip
 *  providers that can't serve a given request. Optional — undefined means
 *  "no constraint" (backward compatible with older stored providers). */
export interface ProviderCapabilities {
  /** Max context window in characters (conservative token proxy ~4 chars≈1tok).
   *  A panel whose declared max is smaller than the prompt is skipped. */
  maxContextChars?: number;
}

/**
 * A user-configured model endpoint. Any provider can serve as a panel OR a
 * judge — the role is chosen per session, not per provider. Stored once
 * globally and referenced by id from sessions.
 */
export interface AIProvider {
  /** Unique id. Prefer crypto.randomUUID(). */
  id: string;
  /** User-facing display name, e.g. "我的 DeepSeek". */
  name: string;
  /** The model identifier sent to the API, e.g. "deepseek-chat". */
  modelString: string;
  /** Base URL (no trailing slash). For anthropic use "https://api.anthropic.com". */
  baseUrl: string;
  /** Secret API key. Stored only in localStorage on the user's machine. */
  apiKey: string;
  /** Wire protocol. Defaults to "openai" for backward compatibility. */
  protocol: ProtocolType;
  /** Optional capability hints for the scheduler. */
  capabilities?: ProviderCapabilities;
}

/* ------------------------------------------------------------------ *
 * 2. Global prompt templates
 * ------------------------------------------------------------------ */

/**
 * A reusable Panel role template. A panel "role" is a system prompt that
 * biases the model toward a specific perspective (e.g. critical scrutiny,
 * structural decomposition, empirical verification). Templates are neutral,
 * general-purpose thinking tools — NOT domain/political scripts.
 *
 * Stored globally (verdex.roleTemplates) and referenced by id from sessions.
 */
export interface RoleTemplate {
  id: string;
  /** Short label shown in the config bar, e.g. "批判性审视". */
  name: string;
  /** The system prompt prepended to the panel's user prompt. */
  systemPrompt: string;
}

/**
 * A reusable Judge prompt template. The default enforces the four-field JSON
 * output contract; custom templates may alter tone/focus but the parser still
 * expects consensus/divergence/blindspots/verdict (missing fields fall back).
 *
 * Stored globally (verdex.judgePrompts) and referenced by id from sessions.
 */
export interface JudgePromptTemplate {
  id: string;
  /** Short label, e.g. "默认四段裁决". */
  name: string;
  /** The full judge system prompt (should instruct four-field JSON output). */
  systemPrompt: string;
}

/* ------------------------------------------------------------------ *
 * 3. Session-level MoA scheduling configuration
 * ------------------------------------------------------------------ */

/** Flow mode for a session. */
export type MoaMode = "simple" | "advanced";

/** Advanced-mode judge strategy.
 *  - "single": one judge synthesizes all panel answers.
 *  - "collision": multiple judges each produce an independent verdict,
 *    deliberately preserving disagreement (no forced reconciliation). */
export type JudgeStrategy = "single" | "collision";

/** Per-session selection of providers, roles, judges, and prompts. */
export interface MoASessionConfig {
  /** Flow mode. "simple" = parallel panels → single judge (the original flow).
   *  "advanced" = role-driven panels → single or collision judges. */
  mode: MoaMode;
  /** Provider ids to run in parallel as panels. */
  panelIds: string[];
  /** Map panelId → roleTemplateId. Absent key = no role (plain prompt). */
  panelRoles: Record<string, string>;
  /** Provider ids acting as judges. Length 1 for simple mode & single strategy;
   *  ≥2 for collision strategy. */
  judgeIds: string[];
  /** Advanced-mode sub-option. Ignored in simple mode (always "single"). */
  judgeStrategy: JudgeStrategy;
  /** Judge prompt template id used in simple mode & advanced-single.
   *  Null = use the built-in default four-field prompt. */
  judgePromptId: string | null;
  /** Per-judge prompt template ids for collision mode (aligned with judgeIds). */
  collisionJudgePromptIds: string[];
}

/* ------------------------------------------------------------------ *
 * 4. Engine request / response contract
 * ------------------------------------------------------------------ */

/** A resolved judge to run: its provider + the system prompt to apply. */
export interface JudgeSpec {
  /** Provider id of the judge model. */
  providerId: string;
  /** The judge's system prompt (role-specific or default four-field). */
  systemPrompt: string;
}

/** A request for a full MoA synthesis run. */
export interface SynthesisRequest {
  /** The user's prompt. */
  prompt: string;
  /** Provider ids of the panel models to run in parallel. */
  panelIds: string[];
  /** Map panelId → role system prompt text (resolved from templates by the
   *  hook; the engine just injects it). Absent key = no role. */
  panelRoles: Record<string, string>;
  /** Judges to run, each with its own system prompt. Length 1 for single,
   *  ≥2 for collision. */
  judges: JudgeSpec[];
  /** Sampling temperature for panels. Defaults to 0.7. */
  temperature?: number;
  /** Max tokens per model call. Defaults to 2048. */
  maxTokens?: number;
  /** Per-call timeout in ms. Defaults to 60000. */
  timeoutMs?: number;
}

/**
 * The structured output of every judge. The four fields are the stable render
 * contract for the verdict cards. The default judge prompt always enforces
 * them; a custom prompt may omit them, in which case the parser fills
 * placeholders so the UI never crashes.
 */
export interface SynthesisResponse {
  /** 🎯 核心共识 — points every panel agreed on. */
  consensus: string;
  /** ⚔️ 观点碰撞 — meaningful disagreements between panels. */
  divergence: string;
  /** 💡 独特盲点 — insights only one or few panels raised. */
  blindspots: string;
  /** ⚖️ 最终裁决 — the judge's final, actionable verdict. */
  verdict: string;
}

/* ------------------------------------------------------------------ *
 * 5. Runtime / UI state (engine → hook → components)
 * ------------------------------------------------------------------ */

export type PanelStatus =
  | "pending"
  | "streaming"
  | "done"
  | "error"
  | "skipped";

/** Live state of a single panel model within a turn. */
export interface PanelState {
  /** Id of the AIProvider this panel ran against. */
  providerId: string;
  /** Snapshot of the provider's name at run time (survives provider edits). */
  label: string;
  /** Snapshot of the provider's modelString at run time. */
  model: string;
  status: PanelStatus;
  /** Accumulated raw text streamed from the panel so far. */
  rawText: string;
  /** Populated when status === "error" or "skipped". */
  error?: string;
  /** Snapshot of the assigned role's name at run time, if any. */
  roleName?: string;
}

export type JudgeStatus =
  | "pending"
  | "judging"
  | "streaming"
  | "done"
  | "error";

/** Live state of a single judge within a turn. A turn holds an array of these
 *  (length 1 in simple / single mode, ≥2 in collision mode). */
export interface JudgeState {
  /** Id of the AIProvider this judge ran against. */
  judgeId: string;
  /** Snapshot of the provider's name at run time. */
  label: string;
  status: JudgeStatus;
  /** Raw streamed text from the judge (kept for debugging / raw view). */
  raw: string;
  /** Parsed structured verdict, once the judge finishes. */
  response: SynthesisResponse | null;
  /** Populated when status === "error". */
  error?: string;
}

/**
 * A single conversational turn = one user prompt + its parallel panels + the
 * judges' structured verdict(s). This is the atomic "message" unit persisted
 * inside a session's message list.
 */
export interface Turn {
  id: string;
  prompt: string;
  createdAt: number;
  /** Snapshot of the panel providers used for this turn. */
  panels: PanelState[];
  /** One entry per judge that ran (length 1 unless collision mode). */
  judges: JudgeState[];
}

/* ------------------------------------------------------------------ *
 * 6. Chat session
 * ------------------------------------------------------------------ */

/**
 * A chat session = a named conversation. Each session carries its own MoA
 * scheduling config (mode, panel roles, judges, prompts) and its message list.
 */
export interface ChatSession {
  /** Unique id. Prefer crypto.randomUUID(). */
  sessionId: string;
  /** Human-readable title shown in the sidebar. */
  title: string;
  /** Creation timestamp (ms epoch). */
  createdAt: number;
  /** Per-session scheduling selection. */
  config: MoASessionConfig;
  /** Ordered list of turns (newest last). */
  messages: Turn[];
}

/* ------------------------------------------------------------------ *
 * 7. Engine callbacks
 * ------------------------------------------------------------------ */

/**
 * Granular callbacks the engine invokes as the synthesis progresses. The UI
 * hook maps each of these to a state update on the matching turn.
 *
 * Panel callbacks key by providerId; judge callbacks key by judgeId (the
 * provider id of that judge) — mirroring the panel pattern so multi-judge
 * fan-out updates each judge independently.
 */
export interface MoaCallbacks {
  onPanelStart?: (providerId: string) => void;
  onPanelDelta?: (providerId: string, delta: string) => void;
  /** Fired before a retry so the UI can drop any partial streamed text from
   *  the failed attempt (keeps the retry invisible to the user). */
  onPanelRetry?: (providerId: string) => void;
  onPanelDone?: (providerId: string, fullText: string) => void;
  onPanelError?: (providerId: string, message: string) => void;
  /** Fired when a panel was skipped pre-flight (e.g. context too large for
   *  the provider's declared capability). The panel never runs. */
  onPanelSkipped?: (providerId: string, reason: string) => void;
  onPanelsComplete?: () => void;
  onJudgeStart?: (judgeId: string) => void;
  onJudgeDelta?: (judgeId: string, delta: string) => void;
  onJudgeDone?: (judgeId: string, response: SynthesisResponse, raw: string) => void;
  onJudgeError?: (judgeId: string, message: string) => void;
}
