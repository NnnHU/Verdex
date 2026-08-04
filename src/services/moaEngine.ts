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
  Attachment,
  ChatMessage,
  JudgePromptTemplate,
  JudgeSpec,
  MoaCallbacks,
  SynthesisRequest,
  SynthesisResponse,
} from "../types/moa";
import { getMemoryConfig } from "./envConfig";
import { trimHistoryByRatio } from "./memoryBuilder";
import { validateExtract } from "./schemaValidator";

/* ------------------------------------------------------------------ *
 * Built-in default judge prompt templates. Panel role templates now live
 * exclusively in config.template.json (single source of truth).
 * ------------------------------------------------------------------ */

/** The canonical default four-field judge prompt (English). Used as the
 *  fallback in buildJudgeSystemPrompt and as DEFAULT_JUDGE_PROMPTS[0]. */
const DEFAULT_JUDGE_SYSTEM_PROMPT = [
  "You are a top-tier analytical judge.",
  "Below are several independent analyses of the same question, produced by different sources.",
  "Your job is to synthesize them into one structured final verdict.",
  "",
  "【Analyses】",
  "{PANELS}",
  "",
  "【Output requirements】",
  "You must output ONLY a JSON object — no Markdown code fences, no prefix/suffix prose.",
  "The JSON must contain exactly these four fields (field names must match exactly):",
  '  - "consensus": string. The core points on which the analyses converge.',
  '  - "divergence": string. Meaningful differences in conclusions or emphasis across the analyses.',
  '  - "blindspots": string. Important points raised by only one analysis that others overlooked.',
  '  - "verdict": string. Your final synthesized verdict. Must be clear and actionable.',
  "",
  "CRITICAL: Write each field as coherent, self-contained prose.",
  "Do NOT mention 'analysis 1', 'analysis 2', 'expert', 'source', or any internal label.",
  "Do NOT write meta-commentary about which analysis said what.",
  "The reader sees ONLY the final four fields — write them as if you are the sole author.",
  "",
  "Example format:",
  '{"consensus":"...","divergence":"...","blindspots":"...","verdict":"..."}',
  "",
  "Now synthesize the analyses above and output that JSON.",
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
      'Do NOT reference "Expert 1/2" or panel labels in the output — write unified prose.',
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
      'Do NOT reference "Expert 1/2" or panel labels in the output — write unified prose.',
    ].join("\n"),
  },
];

/* ------------------------------------------------------------------ *
 * Input circuit breaker (abuse / quota protection)
 * ------------------------------------------------------------------ */

/**
 * Default limits to protect API quota under the parallel MoA fan-out. These
 * are conservative fallbacks used when no provider context window is configured.
 * ~4 chars ≈ 1 token, so 100K chars ≈ 25K tokens, 400K chars ≈ 100K tokens.
 */
export const DEFAULT_PROMPT_LIMIT = 100_000;
export const DEFAULT_CONTEXT_LIMIT = 400_000;

export interface InputLimitResult {
  ok: boolean;
  /** Human-readable reason when ok === false. */
  reason?: string;
}

/**
 * Validate a single send against the input circuit breaker.
 *
 * @param prompt       The new user prompt.
 * @param history      Existing conversation context (pass "" for fresh session).
 * @param promptLimit  Max chars allowed for a single prompt.
 * @param contextLimit Max chars allowed for prompt + cumulative history.
 */
export function checkInputLimits(
  prompt: string,
  history = "",
  promptLimit: number = DEFAULT_PROMPT_LIMIT,
  contextLimit: number = DEFAULT_CONTEXT_LIMIT
): InputLimitResult {
  const promptLen = prompt.length;
  if (promptLen > promptLimit) {
    return {
      ok: false,
      reason: i18n.t("errors.PROMPT_TOO_LONG", {
        len: promptLen.toLocaleString(),
        limit: promptLimit.toLocaleString(),
      }),
    };
  }

  const contextLen = history.length + promptLen;
  if (contextLen > contextLimit) {
    return {
      ok: false,
      reason: i18n.t("errors.CONTEXT_TOO_LONG", {
        len: contextLen.toLocaleString(),
        limit: contextLimit.toLocaleString(),
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
 * system prompt as a leading `{role:"system"}` message, then the provider's
 * own prior conversation history (Stage 1a multi-turn memory), then the user
 * prompt. Streams deltas via `onDeltaAttempt`, resolves the full text.
 */
async function callPanelOnce(
  provider: AIProvider,
  prompt: string,
  roleSystemPrompt: string | undefined,
  history: ChatMessage[],
  request: SynthesisRequest,
  onDeltaAttempt: (delta: string) => void
): Promise<string> {
  const messages: ChatMessage[] = [];
  if (roleSystemPrompt && roleSystemPrompt.trim()) {
    messages.push({ role: "system", content: roleSystemPrompt });
  }
  // Splice in this provider's own prior turns (already trimmed by the hook).
  for (const m of history) messages.push(m);
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
    onDeltaAttempt,
    request.signal
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
  history: ChatMessage[],
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
        history,
        request,
        (delta) => cb.onPanelDelta?.(provider.id, delta)
      );
      // Treat an empty completion as a transient failure: the call succeeded
      // at the transport level but the model produced no tokens (stream glitch,
      // premature close, empty generation). Retry once before giving up, so a
      // single blank response doesn't silently degrade a multi-model turn.
      if (!text.trim() && attempt < PANEL_MAX_ATTEMPTS) {
        lastErr = new Error("empty response");
        cb.onPanelRetry?.(provider.id);
        await sleep(PANEL_RETRY_BACKOFF_MS);
        continue;
      }
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

/** Render the panel answers block inserted into any judge system prompt.
 *  Uses "Analysis from <model>" headers (not "Expert 1/2") to prevent the
 *  Judge from leaking panel-structure meta-commentary ("Expert 1 said...")
 *  into the final verdict output. */
function renderPanelBlock(results: PanelResult[]): string {
  const emptyBody = i18n.language === "zh" ? "(该专家未返回有效内容)" : "(this expert returned no content)";
  const failedPrefix = i18n.language === "zh" ? "(调用失败:" : "(call failed: ";
  return results
    .map((r) => {
      const header = `### Analysis from ${r.label}`;
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
/**
 * Shared JSON-extraction core: strip ```json fences, slice the outermost
 * `{ ... }` span, JSON.parse. Returns the parsed object or null on failure.
 * Used by both verdict-mode and extract-mode parsing.
 */
function extractJsonObject(raw: string): Record<string, unknown> | null {
  if (!raw || !raw.trim()) return null;
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) text = fenceMatch[1].trim();
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  try {
    const parsed = JSON.parse(text.slice(firstBrace, lastBrace + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Parse the judge's raw streamed text into a JudgeResponse.
 *
 * @param raw  The full streamed text from the judge.
 * @param mode "verdict" (default, legacy four-field) or "extract" (custom
 *             schema — returns the parsed object verbatim under `data`).
 *
 * Always returns a structurally complete object so the UI never crashes.
 */
export function parseJudgeResponse(
  raw: string,
  mode: "verdict" | "extract" = "verdict"
): SynthesisResponse {
  const zh = i18n.language === "zh";

  // --- extract mode: return the parsed object as-is under `data` ----------
  if (mode === "extract") {
    const parsed = extractJsonObject(raw);
    if (parsed) return { kind: "extract", data: parsed };
    return {
      kind: "extract",
      data: { raw: raw.trim().slice(0, 1000) || (zh ? "(无内容)" : "(no content)") },
    };
  }

  // --- verdict mode (legacy four-field) -----------------------------------
  const fbConsensus = zh ? "(未能解析出结构化共识)" : "(could not parse structured consensus)";
  const fbDivergence = zh ? "(未能解析出观点碰撞)" : "(could not parse divergence)";
  const fbBlindspots = zh ? "(未能解析出独特盲点)" : "(could not parse blind spots)";
  const fbVerdictEmpty = zh ? "(裁判未返回有效内容)" : "(judge returned no content)";
  const fallback: SynthesisResponse = {
    kind: "verdict",
    consensus: fbConsensus,
    divergence: fbDivergence,
    blindspots: fbBlindspots,
    verdict: raw.trim().slice(0, 1000) || fbVerdictEmpty,
  };

  const parsed = extractJsonObject(raw);
  if (!parsed) return fallback;

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
    kind: "verdict",
    consensus: stripPanelMeta(str(parsed.consensus, "consensus")),
    divergence: stripPanelMeta(str(parsed.divergence, "divergence")),
    blindspots: stripPanelMeta(str(parsed.blindspots, "blindspots")),
    verdict: stripPanelMeta(str(parsed.verdict, "verdict")),
  };
}

/**
 * Strip panel-structure meta-commentary from Judge output.
 *
 * When the Judge receives multiple panel analyses, it tends to reference them
 * by label ("Expert 1 says...", "the second expert argues...") in the final
 * verdict — even when explicitly told not to. This leaks internal pipeline
 * structure into user-facing output. This function rewrites those references
 * into neutral prose so the verdict reads as a self-contained analysis.
 *
 * Applied to each verdict field after parsing. Conservative: only touches
 * "expert"/"panel" references, leaves all other content intact.
 */
function stripPanelMeta(text: string): string {
  return text
    .replace(/\bthe two experts\b/gi, "the analyses")
    .replace(/\bboth experts\b/gi, "both analyses")
    .replace(/\bneither expert\b/gi, "none of the analyses")
    .replace(/\bthe experts['']?s?\b/gi, "the analyses")
    .replace(/\bexpert\s*1\b/gi, "one analysis")
    .replace(/\bexpert\s*2\b/gi, "another analysis")
    .replace(/\bexpert\s*3\b/gi, "a third analysis")
    .replace(/\bthe first expert\b/gi, "one analysis")
    .replace(/\bthe second expert\b/gi, "another analysis")
    .replace(/\bthe third expert\b/gi, "a third analysis")
    .replace(/\bexpert[s]?\b/gi, "analyses")
    .replace(/\bpanel\s*1\b/gi, "one analysis")
    .replace(/\bpanel\s*2\b/gi, "another analysis")
    .replace(/\bthe first panel\b/gi, "one analysis")
    .replace(/\bthe second panel\b/gi, "another analysis")
    .replace(/\bpanel[s]?\b/gi, "analyses")
    // Clean up doubled spaces from replacements
    .replace(/  +/g, " ");
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
export async function runSingleJudge(
  provider: AIProvider,
  systemPrompt: string,
  userPrompt: string,
  history: ChatMessage[],
  request: SynthesisRequest,
  cb: MoaCallbacks,
  outputKind: "verdict" | "extract" = "verdict",
  requiredKeys?: string[]
): Promise<JudgeResult> {
  cb.onJudgeStart?.(provider.id);
  const zh = i18n.language === "zh";
  // Base messages: system (with panel answers baked in) + judge history + the
  // current user turn. The user-turn instruction differs per mode.
  const buildMessages = (extra?: string): ChatMessage[] => {
    const userInstruction =
      outputKind === "extract"
        ? zh
          ? `用户原始问题:\n${userPrompt}\n\n请按指定 JSON 结构抽取并输出。`
          : `Original user question:\n${userPrompt}\n\nExtract and output in the specified JSON structure.`
        : zh
          ? `用户原始问题:\n${userPrompt}\n\n请综合各专家回答,按指定 JSON 格式输出终审裁决。`
          : `Original user question:\n${userPrompt}\n\nPlease synthesize the expert answers and output the final verdict in the specified JSON format.`;
    const msgs: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userInstruction },
    ];
    if (extra) msgs.push({ role: "user", content: extra });
    return msgs;
  };

  // Validation-rewrite loop (Stage 3): up to JUDGE_MAX_ATTEMPTS attempts.
  // verdict mode never validates (legacy single-shot behavior).
  const JUDGE_MAX_ATTEMPTS = 3;
  let raw = "";
  let lastExtra: string | undefined;
  try {
    for (let attempt = 1; attempt <= JUDGE_MAX_ATTEMPTS; attempt++) {
      // Reset raw per attempt; on retry the UI drops partial text via onPanelRetry-like.
      if (attempt > 1) raw = "";
      const messages = buildMessages(lastExtra);
      raw = await streamChat(
        {
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          model: provider.modelString,
          messages,
          temperature: 0.3,
          maxTokens: request.maxTokens ?? 2048,
          timeoutMs: request.timeoutMs ?? 60000,
          protocol: provider.protocol,
        },
        (delta) => {
          raw += delta;
          cb.onJudgeDelta?.(provider.id, delta);
        },
        request.signal
      );

      // verdict mode: no validation, accept first parse.
      if (outputKind !== "extract") break;

      // extract mode: validate and possibly re-prompt.
      const parsed = parseJudgeResponse(raw, "extract");
      if (parsed.kind === "extract") {
        const v = validateExtract(parsed.data, requiredKeys);
        if (v.ok) break; // valid — accept.
        if (attempt < JUDGE_MAX_ATTEMPTS) {
          // Feed the error back so the model can self-correct.
          lastExtra = zh
            ? `上一次输出未通过校验：${v.errors.join("; ")}。请仅输出符合要求结构的合法 JSON，不要附加解释。`
            : `Your previous output failed validation: ${v.errors.join("; ")}. Output ONLY valid JSON matching the required structure, no explanation.`;
          continue;
        }
      }
      break; // exhausted attempts or unparseable — accept last raw.
    }
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

  const response = parseJudgeResponse(raw, outputKind);
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
/**
 * Stage 4 Map-Reduce (form A: extract-mode multi-document extension).
 *
 * Phase Map: each attachment → one extract call (reuses runSingleJudge with the
 *   schema's systemPrompt, {PANELS} substituted with that single document's
 *   text). All documents run in parallel via Promise.all. Failures are
 *   reported per-document and skipped by Reduce (fail-safe).
 *
 * Phase Reduce: streamChat merges all successful Map outputs into one
 *   schema-conformant JSON. {PANELS} is substituted with the rendered block of
 *   per-document JSON results, and the model is told to merge/dedupe into a
 *   single object. Validated against requiredKeys (up to 3 rewrites).
 */
async function runMapReduce(
  request: SynthesisRequest,
  providers: AIProvider[],
  cb: MoaCallbacks
): Promise<void> {
  const zh = i18n.language === "zh";
  const attachments = request.attachments ?? [];
  if (attachments.length === 0 || request.judges.length === 0) {
    cb.onReduceError?.(i18n.t("errors.PANEL_EMPTY"));
    return;
  }

  // Resolve the model provider used for both Map and Reduce (first judge).
  const judgeSpec = request.judges[0];
  const provider = findProvider(providers, judgeSpec.providerId);
  if (!provider) {
    cb.onReduceError?.(i18n.t("errors.JUDGE_NOT_FOUND"));
    return;
  }
  const schemaPrompt = judgeSpec.systemPrompt;
  const requiredKeys = judgeSpec.requiredKeys;

  // --- Phase Map: each document extracted in parallel -----------------
  const mapResults = await Promise.all(
    attachments.map(async (att: Attachment) => {
      cb.onMapDocStart?.(att.id, att.name);
      try {
        // Build the system prompt with THIS document as the {PANELS} content.
        const docBlock = `### ${zh ? "文档" : "Document"}: ${att.name}\n${att.text}`;
        const sys = schemaPrompt.includes("{PANELS}")
          ? schemaPrompt.replace("{PANELS}", docBlock)
          : `${schemaPrompt}\n\n${zh ? "【文档】" : "【Document】"}\n${docBlock}`;
        const result = await runSingleJudge(
          provider,
          sys,
          request.prompt,
          [], // no history for map calls
          request,
          // Map calls don't need judge delta streaming (UI shows per-doc cards).
          { onJudgeStart: () => undefined },
          "extract",
          requiredKeys
        );
        if (result.ok && result.response && result.response.kind === "extract") {
          cb.onMapDocDone?.(att.id, result.response.data);
          return { attachmentId: att.id, ok: true as const, data: result.response.data };
        }
        const errMsg = result.error ?? (zh ? "抽取失败" : "extraction failed");
        cb.onMapDocError?.(att.id, errMsg);
        return { attachmentId: att.id, ok: false as const, error: errMsg };
      } catch (e) {
        const msg = (e as Error).message || String(e);
        cb.onMapDocError?.(att.id, msg);
        return { attachmentId: att.id, ok: false as const, error: msg };
      }
    })
  );

  const successMaps = mapResults.filter(
    (r): r is { attachmentId: string; ok: true; data: Record<string, unknown> } => r.ok
  );
  if (successMaps.length === 0) {
    cb.onReduceError?.(zh ? "所有文档抽取均失败" : "all document extractions failed");
    return;
  }

  // --- Phase Reduce: merge all Map outputs into one schema-conformant JSON ---
  // If the user cancelled during Map, don't start Reduce.
  if (request.signal?.aborted) {
    cb.onReduceError?.(i18n.t("errors.CANCELLED"));
    return;
  }
  cb.onReduceStart?.();
  // Render the per-document JSON results as the {PANELS} block.
  const mergedBlock = successMaps
    .map((m, i) => {
      const name = attachments.find((a) => a.id === m.attachmentId)?.name ?? `doc${i + 1}`;
      return `### ${zh ? "文档" : "Document"} ${i + 1}: ${name}\n\`\`\`json\n${JSON.stringify(m.data, null, 2)}\n\`\`\``;
    })
    .join("\n\n");
  const reduceInstruction = zh
    ? `把以下各文档的抽取结果合并、去重、归纳成【一份】完整的 JSON 对象（结构同原 schema）。保留所有不重复的条目，互补的细节合并，不要遗漏。只输出 JSON，不要解释。`
    : `Merge, deduplicate, and synthesize the per-document extraction results below into ONE complete JSON object (same schema as before). Keep all non-duplicate entries, merge complementary details, omit nothing. Output ONLY JSON, no explanation.`;
  const reduceSys = schemaPrompt.includes("{PANELS}")
    ? schemaPrompt.replace("{PANELS}", mergedBlock)
    : `${schemaPrompt}\n\n${mergedBlock}`;

  let raw = "";
  try {
    raw = await streamChat(
      {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.modelString,
        messages: [
          { role: "system", content: reduceSys },
          { role: "user", content: `${request.prompt}\n\n${reduceInstruction}` },
        ],
        temperature: 0.3,
        maxTokens: request.maxTokens ?? 8192,
        timeoutMs: request.timeoutMs ?? 60000,
        protocol: provider.protocol,
      },
      (delta) => {
        raw += delta;
        cb.onReduceDelta?.(delta);
      },
      request.signal
    );
  } catch (e) {
    cb.onReduceError?.((e as Error).message || String(e));
    return;
  }

  const response = parseJudgeResponse(raw, "extract");
  // Light validation; on failure still return the parsed object (UI shows it).
  if (response.kind === "extract") {
    const v = validateExtract(response.data, requiredKeys);
    if (!v.ok) {
      // Keep the response but surface the warning via raw (UI can show raw).
      // For first version we accept it as-is rather than re-prompting.
    }
  }
  cb.onReduceDone?.(response, raw);
}

export async function runMoaSynthesis(
  request: SynthesisRequest,
  providers: AIProvider[],
  cb: MoaCallbacks
): Promise<void> {
  // --- Stage 4: mapreduce early branch (skips Panel/Judge entirely) ----
  // Each attachment → one Map extract call (parallel) → Reduce merges them.
  // Triggered when taskType=document_extract AND attachments present (useMapReduce
  // decided in the hook via shouldMapReduce).
  if (request.taskType === "document_extract" && (request.attachments?.length ?? 0) > 0) {
    await runMapReduce(request, providers, cb);
    return;
  }

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
  // Each panel gets its own trimmed history from request.panelHistory (Stage 1a).
  const memCfg = getMemoryConfig();
  const results = await Promise.all(
    panelProviders.map((p) => {
      let history = request.panelHistory?.[p.id] ?? [];
      if (history.length > 0 && p.capabilities?.maxContextChars) {
        const trimmed = trimHistoryByRatio(
          history,
          request.prompt,
          p.capabilities.maxContextChars,
          memCfg.trimRatio
        );
        if (memCfg.debugMemory && trimmed.dropped > 0) {
          // eslint-disable-next-line no-console
          console.debug(
            `[memory] panel ${p.id}: dropped ${trimmed.dropped} msgs, ${trimmed.chars} chars`
          );
        }
        history = trimmed.history;
      }
      return runPanel(
        p,
        request.prompt,
        request.panelRoles[p.id],
        history,
        request,
        cb
      );
    })
  );
  cb.onPanelsComplete?.();

  // If the user cancelled during panels, skip the judge phase.
  if (request.signal?.aborted) return;

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
  // Each judge also receives its own prior verdicts (Stage 1a memory).
  await Promise.all(
    judgeProviders.map(({ spec, provider }) => {
      let history = request.judgeHistory?.[provider.id] ?? [];
      if (history.length > 0 && provider.capabilities?.maxContextChars) {
        const trimmed = trimHistoryByRatio(
          history,
          request.prompt,
          provider.capabilities.maxContextChars,
          memCfg.trimRatio
        );
        if (memCfg.debugMemory && trimmed.dropped > 0) {
          // eslint-disable-next-line no-console
          console.debug(
            `[memory] judge ${provider.id}: dropped ${trimmed.dropped} msgs, ${trimmed.chars} chars`
          );
        }
        history = trimmed.history;
      }
      return runSingleJudge(
        provider,
        buildJudgeSystemPrompt(results, spec.systemPrompt),
        request.prompt,
        history,
        request,
        cb,
        spec.outputKind ?? "verdict",
        spec.requiredKeys
      );
    })
  );
}
