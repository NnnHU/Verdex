/**
 * Verdex — Mixture-of-Agents synthesis engine.
 *
 * Pure native TypeScript async orchestration. No LangChain / AutoGen / SDKs.
 *
 * Flow:
 *   1. Resolve selected panel providers (with optional per-panel role prompts)
 *      and the judge specs (provider + per-judge system prompt).
 *   2. Fire all panels concurrently with Promise.all (each resolves to a
 *      result object — never rejects — so one failure can't nuke the run).
 *   3. Collect panel raw texts.
 *   4. Fire all judges concurrently (Promise.all), each consuming the SAME
 *      panel results but applying its OWN system prompt. Each judge resolves
 *      to a result object too — multi-judge fan-out is also fail-safe.
 *   5. Each judge's raw text is parsed into a SynthesisResponse.
 */

import { streamChat } from "./httpClient";
import i18n from "../i18n";
import type {
  AIProvider,
  ChatMessage,
  JudgePromptTemplate,
  JudgeSpec,
  MoaCallbacks,
  SynthesisRequest,
  SynthesisResponse,
} from "../types/moa";

/* ------------------------------------------------------------------ *
 * Built-in default judge prompt templates. Panel role templates now live
 * exclusively in config.template.json (single source of truth).
 * ------------------------------------------------------------------ */

/** The canonical default four-field judge prompt (English). Used as the
 *  fallback in buildJudgeSystemPrompt and as DEFAULT_JUDGE_PROMPTS[0]. */
const DEFAULT_JUDGE_SYSTEM_PROMPT = [
  "You are a top-tier Mixture-of-Agents Judge.",
  "Multiple experts (Panels) will each give an independent answer to the same question.",
  "Your job is to synthesize all expert answers into a structured final verdict.",
  "",
  "【Expert answers】",
  "{PANELS}",
  "",
  "【Output requirements】",
  "You must output ONLY a JSON object — no Markdown code fences, no prefix/suffix prose.",
  "The JSON must contain exactly these four fields (field names must match exactly):",
  '  - "consensus": string. The core consensus that all/most experts agree on.',
  '  - "divergence": string. Meaningful divergence where experts disagree.',
  '  - "blindspots": string. Blind spots / overlooked insights only one or few experts raised.',
  '  - "verdict": string. Your final verdict as the judge. Must be clear and actionable.',
  "",
  "Example format:",
  '{"consensus":"...","divergence":"...","blindspots":"...","verdict":"..."}',
  "",
  "Now synthesize the expert answers above and output that JSON.",
].join("\n");

export const DEFAULT_JUDGE_PROMPTS: JudgePromptTemplate[] = [
  {
    id: "judge-default-en",
    name: "Default four-field verdict",
    systemPrompt: DEFAULT_JUDGE_SYSTEM_PROMPT,
  },
  {
    id: "judge-strict-logic-en",
    name: "Strict logic audit",
    systemPrompt: [
      "You are a strict logic auditor. Your sole standard is argumentative validity.",
      "Review the experts' answers; focus on finding logical fallacies, circular reasoning, and unfalsifiable self-exemption clauses.",
      "For each consensus ask 'on what basis'; for each verdict ask 'is it falsifiable'.",
      "",
      "【Expert answers】",
      "{PANELS}",
      "",
      "【Output requirements】Output ONLY a JSON with four fields:",
      '  "consensus": the most logically robust part of the majority consensus;',
      '  "divergence": substantive disagreement at the logical level;',
      '  "blindspots": overlooked logical premises or counterexamples;',
      '  "verdict": final verdict based on argumentative validity.',
      'Format: {"consensus":"...","divergence":"...","blindspots":"...","verdict":"..."}',
    ].join("\n"),
  },
  {
    id: "judge-multi-perspective-en",
    name: "Multi-perspective synthesis",
    systemPrompt: [
      "You are a multi-perspective synthesizer. Your value lies in integration, not splitting the difference.",
      "Review the experts' answers; identify which disagreements are superficial and which are substantive.",
      "For substantive disagreements, do not force a compromise — preserving the tension is itself information.",
      "",
      "【Expert answers】",
      "{PANELS}",
      "",
      "【Output requirements】Output ONLY a JSON with four fields:",
      '  "consensus": the conclusion all perspectives genuinely converge on;',
      '  "divergence": irreconcilable substantive disagreements, stating each side\'s premises;',
      '  "blindspots": insights invisible from a single perspective but apparent after synthesis;',
      '  "verdict": your synthesized verdict; if it cannot converge, state conditions for each lean.',
      'Format: {"consensus":"...","divergence":"...","blindspots":"...","verdict":"..."}',
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ *
 * Input circuit breaker (abuse / quota protection)
 * ------------------------------------------------------------------ */

/**
 * Hard limits to protect API quota under the parallel MoA fan-out. Each panel
 * call carries the full prompt, so an 8k-char prompt × N panels escalates fast.
 * Character counts are a deliberate, conservative proxy for tokens (~4 chars ≈
 * 1 token) — cheap to compute, no network round-trip, and fails closed.
 */
export const PROMPT_CHAR_LIMIT = 8_000;
export const CONTEXT_CHAR_LIMIT = 32_000;

export interface InputLimitResult {
  ok: boolean;
  /** Human-readable reason when ok === false. */
  reason?: string;
}

/**
 * Validate a single send against the input circuit breaker.
 *
 * @param prompt   The new user prompt.
 * @param history  Existing conversation context to measure the cumulative
 *                 window. Pass "" for a fresh session.
 */
export function checkInputLimits(
  prompt: string,
  history = ""
): InputLimitResult {
  const promptLen = prompt.length;
  if (promptLen > PROMPT_CHAR_LIMIT) {
    return {
      ok: false,
      reason: i18n.t("errors.PROMPT_TOO_LONG", {
        len: promptLen.toLocaleString(),
        limit: PROMPT_CHAR_LIMIT.toLocaleString(),
      }),
    };
  }

  const contextLen = history.length + promptLen;
  if (contextLen > CONTEXT_CHAR_LIMIT) {
    return {
      ok: false,
      reason: i18n.t("errors.CONTEXT_TOO_LONG", {
        len: contextLen.toLocaleString(),
        limit: CONTEXT_CHAR_LIMIT.toLocaleString(),
      }),
    };
  }

  return { ok: true };
}

/* ------------------------------------------------------------------ *
 * Panel execution (with retry + per-panel role prompt injection)
 * ------------------------------------------------------------------ */

interface PanelResult {
  providerId: string;
  label: string;
  ok: boolean;
  text: string;
  error?: string;
}

/**
 * Heuristic: should a failed panel call be retried? We retry on transient
 * failures (network errors, timeouts, 5xx, 429 rate limits) but NOT on
 * definitive auth/rejection errors (401/403 invalid key, 400 bad request),
 * where retrying just wastes quota and time.
 */
function isRetriableError(message: string): boolean {
  const m = message.toLowerCase();
  if (
    m.includes("401") ||
    m.includes("403") ||
    m.includes("unauthorized") ||
    m.includes("forbidden") ||
    m.includes("invalid api key")
  ) {
    return false;
  }
  return true;
}

/** Sleep helper for retry backoff. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const PANEL_RETRY_BACKOFF_MS = 800;
const PANEL_MAX_ATTEMPTS = 2;

/**
 * One streaming attempt against a panel provider. Prepends the optional role
 * system prompt as a leading `{role:"system"}` message before the user prompt.
 * Streams deltas via `onDeltaAttempt`, resolves the full text (or throws).
 */
async function callPanelOnce(
  provider: AIProvider,
  prompt: string,
  roleSystemPrompt: string | undefined,
  request: SynthesisRequest,
  onDeltaAttempt: (delta: string) => void
): Promise<string> {
  const messages: ChatMessage[] = [];
  if (roleSystemPrompt && roleSystemPrompt.trim()) {
    messages.push({ role: "system", content: roleSystemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  return streamChat(
    {
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.modelString,
      messages,
      temperature: request.temperature ?? 0.7,
      maxTokens: request.maxTokens ?? 2048,
      timeoutMs: request.timeoutMs ?? 60000,
      protocol: provider.protocol,
    },
    onDeltaAttempt
  );
}

/**
 * Run a single panel to completion with one retry on transient errors.
 * UI callbacks (Start/Delta/Done/Error) fire at THIS level, not inside the
 * retry loop — so a retry is invisible to the user.
 *
 * Always resolves (never rejects) so Promise.all stays fail-safe.
 */
async function runPanel(
  provider: AIProvider,
  prompt: string,
  roleSystemPrompt: string | undefined,
  request: SynthesisRequest,
  cb: MoaCallbacks
): Promise<PanelResult> {
  cb.onPanelStart?.(provider.id);

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= PANEL_MAX_ATTEMPTS; attempt++) {
    try {
      const text = await callPanelOnce(
        provider,
        prompt,
        roleSystemPrompt,
        request,
        (delta) => cb.onPanelDelta?.(provider.id, delta)
      );
      cb.onPanelDone?.(provider.id, text);
      return {
        providerId: provider.id,
        label: provider.name,
        ok: true,
        text,
      };
    } catch (err) {
      lastErr = err;
      const message = (err as Error).message || String(err);
      if (attempt < PANEL_MAX_ATTEMPTS && isRetriableError(message)) {
        cb.onPanelRetry?.(provider.id);
        await sleep(PANEL_RETRY_BACKOFF_MS);
        continue;
      }
      break;
    }
  }

  const message = (lastErr as Error)?.message || String(lastErr) || "未知错误";
  cb.onPanelError?.(provider.id, message);
  return {
    providerId: provider.id,
    label: provider.name,
    ok: false,
    text: "",
    error: message,
  };
}

/* ------------------------------------------------------------------ *
 * Judge prompt construction + parsing
 * ------------------------------------------------------------------ */

/** Locate a provider by id. Returns undefined if not found. */
function findProvider(
  providers: AIProvider[],
  id: string
): AIProvider | undefined {
  return providers.find((p) => p.id === id);
}

/** Render the panel answers block inserted into any judge system prompt. */
function renderPanelBlock(results: PanelResult[]): string {
  const expertWord = i18n.language === "zh" ? "专家" : "Expert";
  const emptyBody = i18n.language === "zh" ? "(该专家未返回有效内容)" : "(this expert returned no content)";
  const failedPrefix = i18n.language === "zh" ? "(调用失败:" : "(call failed: ";
  return results
    .map((r, i) => {
      const header = `### ${expertWord} ${i + 1}: ${r.label}`;
      const body = r.ok
        ? r.text.trim() || emptyBody
        : `${failedPrefix}${r.error ?? i18n.t("common.unknownError")})`;
      return `${header}\n${body}`;
    })
    .join("\n\n");
}

/**
 * Build a judge's system prompt. If `customPrompt` is provided (a user
 * template), it is used as-is after the {PANELS} placeholder is substituted
 * with the rendered panel answers. If not, the built-in default four-field
 * prompt is used (also with {PANELS} substituted).
 */
function buildJudgeSystemPrompt(
  results: PanelResult[],
  customPrompt?: string
): string {
  const panelBlock = renderPanelBlock(results);
  const template = customPrompt && customPrompt.trim()
    ? customPrompt
    : DEFAULT_JUDGE_SYSTEM_PROMPT;
  // Substitute the {PANELS} placeholder if present; otherwise append.
  if (template.includes("{PANELS}")) {
    return template.replace("{PANELS}", panelBlock);
  }
  const header = i18n.language === "zh" ? "【专家回答】" : "【Expert answers】";
  return `${template}\n\n${header}\n${panelBlock}`;
}

/**
 * Parse the judge's raw streamed text into a SynthesisResponse. Tolerant of
 * ```json fences, leading/trailing prose, and missing fields — always returns
 * a structurally complete object so the UI can never crash on rendering.
 */
export function parseJudgeResponse(raw: string): SynthesisResponse {
  const zh = i18n.language === "zh";
  const fbConsensus = zh ? "(未能解析出结构化共识)" : "(could not parse structured consensus)";
  const fbDivergence = zh ? "(未能解析出观点碰撞)" : "(could not parse divergence)";
  const fbBlindspots = zh ? "(未能解析出独特盲点)" : "(could not parse blind spots)";
  const fbVerdictEmpty = zh ? "(裁判未返回有效内容)" : "(judge returned no content)";
  const fallback: SynthesisResponse = {
    consensus: fbConsensus,
    divergence: fbDivergence,
    blindspots: fbBlindspots,
    verdict: raw.trim().slice(0, 1000) || fbVerdictEmpty,
  };

  if (!raw || !raw.trim()) return fallback;

  let text = raw.trim();

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return fallback;
  }
  const jsonSlice = text.slice(firstBrace, lastBrace + 1);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    return fallback;
  }

  const str = (v: unknown, label: string): string => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v)) {
      const joined = v
        .map((x) => (typeof x === "string" ? x : JSON.stringify(x)))
        .join("\uFF1B");
      return joined.trim() || `(${label} empty)`;
    }
    if (v && typeof v === "object") {
      return JSON.stringify(v);
    }
    return `(${label} missing)`;
  };

  return {
    consensus: str(parsed.consensus, "consensus"),
    divergence: str(parsed.divergence, "divergence"),
    blindspots: str(parsed.blindspots, "blindspots"),
    verdict: str(parsed.verdict, "verdict"),
  };
}

/* ------------------------------------------------------------------ *
 * Judge execution (single attempt, fail-safe resolve)
 * ------------------------------------------------------------------ */

interface JudgeResult {
  judgeId: string;
  label: string;
  ok: boolean;
  raw: string;
  response: SynthesisResponse | null;
  error?: string;
}

/**
 * Run one judge to completion against its provider. The system prompt already
 * has the rendered panel answers baked in (built by buildJudgeSystemPrompt
 * before this call). Streams deltas keyed by judgeId. Always resolves (never
 * rejects) so the multi-judge Promise.all is fail-safe — one judge failing
 * never blocks the others (collision mode).
 */
async function runSingleJudge(
  provider: AIProvider,
  systemPrompt: string,
  userPrompt: string,
  request: SynthesisRequest,
  cb: MoaCallbacks
): Promise<JudgeResult> {
  cb.onJudgeStart?.(provider.id);
  let raw = "";
  try {
    raw = await streamChat(
      {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.modelString,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              i18n.language === "zh"
                ? `用户原始问题:\n${userPrompt}\n\n请综合各专家回答,按指定 JSON 格式输出终审裁决。`
                : `Original user question:\n${userPrompt}\n\nPlease synthesize the expert answers and output the final verdict in the specified JSON format.`,
          },
        ],
        temperature: 0.3,
        maxTokens: request.maxTokens ?? 2048,
        timeoutMs: request.timeoutMs ?? 60000,
        protocol: provider.protocol,
      },
      (delta) => {
        raw += delta;
        cb.onJudgeDelta?.(provider.id, delta);
      }
    );
  } catch (err) {
    const message = (err as Error).message || String(err);
    cb.onJudgeError?.(provider.id, message);
    return {
      judgeId: provider.id,
      label: provider.name,
      ok: false,
      raw,
      response: null,
      error: message,
    };
  }

  const response = parseJudgeResponse(raw);
  cb.onJudgeDone?.(provider.id, response, raw);
  return {
    judgeId: provider.id,
    label: provider.name,
    ok: true,
    raw,
    response,
  };
}

/* ------------------------------------------------------------------ *
 * Top-level synthesis
 * ------------------------------------------------------------------ */

/**
 * Run a full MoA synthesis. Reports progress via `cb`; never throws — errors
 * are reported through onPanelError / onJudgeError so the UI stays in control.
 *
 * Providers are resolved from the global list; the hook resolves role/judge
 * prompt templates into the request before calling.
 */
export async function runMoaSynthesis(
  request: SynthesisRequest,
  providers: AIProvider[],
  cb: MoaCallbacks
): Promise<void> {
  // --- Resolve panel providers ----------------------------------------
  const resolvedPanels = request.panelIds
    .map((id) => findProvider(providers, id))
    .filter((p): p is AIProvider => Boolean(p));

  if (request.judges.length === 0) {
    cb.onJudgeError?.("", i18n.t("errors.JUDGE_EMPTY"));
    return;
  }
  if (resolvedPanels.length === 0) {
    cb.onJudgeError?.("", i18n.t("errors.PANEL_EMPTY"));
    return;
  }

  // --- Pre-flight: skip panels over their declared context cap ----------
  const promptLen = request.prompt.length;
  const panelProviders: AIProvider[] = [];
  for (const p of resolvedPanels) {
    const max = p.capabilities?.maxContextChars;
    if (max !== undefined && max > 0 && promptLen > max) {
      cb.onPanelSkipped?.(
        p.id,
        i18n.t("errors.PANEL_SKIP_REASON", {
          prompt: promptLen.toLocaleString(),
          max: max.toLocaleString(),
        })
      );
    } else {
      panelProviders.push(p);
    }
  }
  if (panelProviders.length === 0) {
    cb.onJudgeError?.(
      "",
      i18n.t("errors.ALL_PANELS_SKIPPED")
    );
    return;
  }

  // --- Phase 1: Panels in parallel (with per-panel role prompts) -------
  const results = await Promise.all(
    panelProviders.map((p) =>
      runPanel(p, request.prompt, request.panelRoles[p.id], request, cb)
    )
  );
  cb.onPanelsComplete?.();

  // --- Phase 2: Judges in parallel (fan-out, fail-safe) ----------------
  // Resolve each judge spec to its provider; drop any that can't resolve.
  const judgeProviders = request.judges
    .map((spec) => ({ spec, provider: findProvider(providers, spec.providerId) }))
    .filter(
      (j): j is { spec: JudgeSpec; provider: AIProvider } => Boolean(j.provider)
    );

  if (judgeProviders.length === 0) {
    cb.onJudgeError?.("", i18n.t("errors.JUDGE_NOT_FOUND"));
    return;
  }

  // Each judge builds its OWN system prompt from its spec + the shared panel
  // results (the panel block is rendered into the prompt before the call).
  // Promise.all is fail-safe: runSingleJudge never rejects.
  await Promise.all(
    judgeProviders.map(({ spec, provider }) =>
      runSingleJudge(
        provider,
        buildJudgeSystemPrompt(results, spec.systemPrompt),
        request.prompt,
        request,
        cb
      )
    )
  );
}
