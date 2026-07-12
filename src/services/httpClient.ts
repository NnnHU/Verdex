/**
 * Verdex — HTTP client for chat-completion endpoints (protocol-aware).
 *
 * Design goals:
 *  - One `streamChat` entry point used by both panels and the judge.
 *  - Protocol adapter: speaks both the OpenAI chat-completions wire format
 *    AND Anthropic's native Messages API, switched by `protocol` in opts.
 *  - Real SSE streaming when the endpoint supports it.
 *  - Automatic non-streaming fallback if the stream is unavailable / errors.
 *  - Routes through Tauri's Rust-side `fetch` when running inside the webview,
 *    so requests to gateways that don't send CORS headers still work locally.
 *
 * No third-party HTTP/AI libraries — just the platform fetch + ReadableStream.
 */

import type { ChatMessage, ProtocolType } from "../types/moa";
import i18n from "../i18n";
import { lookupContextChars, tokensToChars } from "./modelContextDB";

// Lazily import the Tauri HTTP plugin only when we detect we're in a webview.
// Dynamic import keeps it out of the pure-browser dev bundle path.
type FetchLike = typeof globalThis.fetch;

/** Detect whether we're running inside the Tauri webview. */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

let tauriFetchPromise: Promise<FetchLike | null> | null = null;

/**
 * Resolve the fetch implementation to use. Inside Tauri we use the Rust-origin
 * fetch from @tauri-apps/plugin-http (bypasses CORS). In a plain browser we
 * fall back to the native global fetch.
 */
async function resolveFetch(): Promise<FetchLike> {
  if (isTauri()) {
    if (!tauriFetchPromise) {
      tauriFetchPromise = (async () => {
        try {
          const mod = await import("@tauri-apps/plugin-http");
          return mod.fetch as FetchLike;
        } catch {
          return null;
        }
      })();
    }
    const f = await tauriFetchPromise;
    if (f) return f;
  }
  return globalThis.fetch;
}

export interface StreamChatOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Per-call timeout in ms. Defaults to 60000. */
  timeoutMs?: number;
  /** Wire protocol. Defaults to "openai". */
  protocol?: ProtocolType;
}

/* ------------------------------------------------------------------ *
 * Protocol adapter: request shaping
 * ------------------------------------------------------------------ */

interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  /** Body for the streaming attempt. */
  streamBody: string;
  /** Body for the non-streaming fallback attempt. */
  nonStreamBody: string;
}

/**
 * Normalize a user-entered base URL into the canonical form the adapter expects:
 * a scheme + host [+ /v1], with NO trailing slash and NO endpoint path.
 *
 * Repairs the common mistakes users make when copying URLs from provider docs:
 *   - trailing slashes              "https://api.x.com/v1/"  → ".../v1"
 *   - trailing "/chat/completions"  (we append that ourselves for OpenAI)
 *   - trailing "/v1/chat/completions"
 *   - trailing "/messages"          (Anthropic endpoint path)
 *   - trailing "/v1/messages"
 *
 * Exported so the UI can show the normalized form / validate input.
 */
export function normalizeBase(baseUrl: string): string {
  let s = baseUrl.trim();
  // Iteratively strip trailing slashes + known endpoint suffixes. Looping
  // handles cases like "https://x/v1/chat/completions/".
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const before = s;
    s = s.replace(/\/+$/, ""); // trailing slashes
    s = s.replace(/\/chat\/completions$/i, ""); // OpenAI endpoint
    s = s.replace(/\/messages$/i, ""); // Anthropic endpoint (but not ".../v1")
    if (s === before) break;
  }
  return s;
}

/**
 * Build the OpenAI-compatible request: POST {base}/chat/completions with
 * Bearer auth, messages inline, and a `stream` flag.
 */
function prepareOpenAI(opts: StreamChatOptions): PreparedRequest {
  const url = `${normalizeBase(opts.baseUrl)}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${opts.apiKey}`,
  };
  const shared: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens ?? 2048,
  };
  return {
    url,
    headers,
    streamBody: JSON.stringify({ ...shared, stream: true }),
    nonStreamBody: JSON.stringify({ ...shared, stream: false }),
  };
}

/**
 * Build the Anthropic-native request (Messages API):
 *  - Endpoint: {base}/v1/messages
 *  - Auth: x-api-key + anthropic-version headers (NOT Bearer).
 *  - The FIRST system message is extracted into the top-level `system` param;
 *    any remaining system messages are concatenated into it. The resulting
 *    `messages` array contains only user/assistant turns (required by Anthropic).
 *  - `max_tokens` is mandatory (Anthropic rejects requests without it).
 *  - Stream uses SSE `event: content_block_delta` frames.
 */
/**
 * Pure transformation: move all `system` messages into a single top-level
 * `system` string, leaving only user/assistant turns in `messages`. Ensures
 * the resulting `messages` begins with a user turn (an Anthropic API hard
 * requirement) by injecting a leading user turn if needed.
 *
 * Exported so it can be unit-tested without spinning up HTTP.
 */
export function extractAnthropicSystem(
  input: ChatMessage[]
): { system: string; messages: ChatMessage[] } {
  const systemParts: string[] = [];
  const turns: ChatMessage[] = [];
  for (const m of input) {
    if (m.role === "system") {
      if (m.content.trim()) systemParts.push(m.content.trim());
    } else {
      turns.push(m);
    }
  }
  const system = systemParts.join("\n\n");

  // Anthropic requires the conversation to begin with a user turn. If after
  // extraction we lead with assistant (or have nothing), inject a leading user.
  let messages = turns;
  if (messages.length === 0 || messages[0].role !== "user") {
    messages = [
      { role: "user", content: system || "Please begin." },
      ...messages,
    ];
  }
  return { system, messages };
}

function prepareAnthropic(opts: StreamChatOptions): PreparedRequest {
  // Anthropic's endpoint is {base}/v1/messages. If the user already included
  // /v1 in the base URL (common mistake), don't duplicate it.
  const base = normalizeBase(opts.baseUrl);
  const url = /\/v1$/i.test(base)
    ? `${base}/messages`
    : `${base}/v1/messages`;

  const { system, messages } = extractAnthropicSystem(opts.messages);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": opts.apiKey,
    "anthropic-version": "2023-06-01",
  };

  const basePayload: Record<string, unknown> = {
    model: opts.model,
    messages,
    max_tokens: opts.maxTokens ?? 2048,
  };
  if (system) basePayload.system = system;
  if (opts.temperature !== undefined) basePayload.temperature = opts.temperature;

  return {
    url,
    headers,
    // Anthropic needs `"stream": true` in the request body to enable SSE
    // (unlike the Accept header alone). The non-stream body omits it.
    streamBody: JSON.stringify({ ...basePayload, stream: true }),
    nonStreamBody: JSON.stringify(basePayload),
  };
}

function prepareRequest(opts: StreamChatOptions): PreparedRequest {
  return opts.protocol === "anthropic"
    ? prepareAnthropic(opts)
    : prepareOpenAI(opts);
}

/* ------------------------------------------------------------------ *
 * Protocol adapter: SSE delta extraction
 * ------------------------------------------------------------------ */

/** Extract a text delta from a single SSE `data:` JSON line for OpenAI. */
function openaiDelta(json: unknown): string {
  const j = json as { choices?: { delta?: { content?: string } }[] };
  return j.choices?.[0]?.delta?.content ?? "";
}

/**
 * Extract a text delta from an Anthropic SSE event. Content arrives via
 * `content_block_delta` frames whose `delta.text` holds the token chunk.
 * Message_start / ping / message_stop frames carry no text.
 */
function anthropicDelta(json: unknown): string {
  const j = json as {
    type?: string;
    delta?: { text?: string };
  };
  if (j.type === "content_block_delta") {
    return j.delta?.text ?? "";
  }
  return "";
}

/* ------------------------------------------------------------------ *
 * Streaming
 * ------------------------------------------------------------------ */

/**
 * Streaming SSE reader. Parses the `data:` framing shared by both protocols,
 * but delegates the per-event text extraction to the protocol's delta fn.
 *
 * Anthropic additionally emits `event:` lines; we ignore them and rely on the
 * `type` field inside each `data:` payload (see anthropicDelta).
 */
async function streamSse(
  fetchImpl: FetchLike,
  prepared: PreparedRequest,
  protocol: ProtocolType,
  signal: AbortSignal,
  onDelta: (delta: string) => void
): Promise<string> {
  const streamHeaders: Record<string, string> = { ...prepared.headers };
  if (protocol === "anthropic") {
    // Anthropic uses an Accept header to opt into SSE.
    streamHeaders.Accept = "text/event-stream";
  }

  const res = await fetchImpl(prepared.url, {
    method: "POST",
    headers: streamHeaders,
    body: prepared.streamBody,
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText}${errText ? `: ${errText.slice(0, 500)}` : ""}`
    );
  }

  const reader = res.body?.getReader();
  if (!reader) {
    // No streaming body available — read the whole thing once.
    const full = await res.text();
    const parsed = extractContent(full, protocol);
    if (parsed) onDelta(parsed);
    return parsed;
  }

  const deltaFn = protocol === "anthropic" ? anthropicDelta : openaiDelta;
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by newlines; process complete lines only.
    let nlIndex: number;
    while ((nlIndex = buffer.indexOf("\n")) !== -1) {
      const rawLine = buffer.slice(0, nlIndex).trim();
      buffer = buffer.slice(nlIndex + 1);
      if (!rawLine || rawLine.startsWith(":")) continue; // blank / comment

      if (!rawLine.startsWith("data:")) continue;
      const data = rawLine.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const json = JSON.parse(data);
        const delta = deltaFn(json);
        if (delta) {
          fullText += delta;
          onDelta(delta);
        }
      } catch {
        // Partial JSON mid-chunk — ignore, the rest will arrive next read.
      }
    }
  }

  // Flush any trailing data line left in the buffer.
  const tail = buffer.trim();
  if (tail.startsWith("data:")) {
    const data = tail.slice(5).trim();
    if (data && data !== "[DONE]") {
      try {
        const json = JSON.parse(data);
        const delta = deltaFn(json);
        if (delta) {
          fullText += delta;
          onDelta(delta);
        }
      } catch {
        /* ignore trailing parse error */
      }
    }
  }

  return fullText;
}

/** Best-effort extraction of content from a non-SSE (plain JSON) body. */
function extractContent(text: string, protocol: ProtocolType): string {
  if (!text) return "";
  try {
    const json = JSON.parse(text);
    if (protocol === "anthropic") {
      // Anthropic non-stream response: { content: [{ type:"text", text }] }
      const blocks = (json as { content?: { type?: string; text?: string }[] })
        .content;
      if (Array.isArray(blocks)) {
        return blocks
          .filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("");
      }
      return "";
    }
    // OpenAI: { choices: [{ message: { content } }] }
    const choices = (json as {
      choices?: { message?: { content?: string } }[];
    }).choices;
    return choices?.[0]?.message?.content ?? "";
  } catch {
    return "";
  }
}

/**
 * Run a chat completion with streaming, falling back to a non-streaming
 * request if streaming fails for any reason (network, no ReadableStream, etc.).
 *
 * Returns the full accumulated assistant text.
 */
export async function streamChat(
  opts: StreamChatOptions,
  onDelta: (delta: string) => void
): Promise<string> {
  const fetchImpl = await resolveFetch();
  const timeoutMs = opts.timeoutMs ?? 60000;
  const protocol: ProtocolType = opts.protocol ?? "openai";
  const prepared = prepareRequest(opts);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await streamSse(
      fetchImpl,
      prepared,
      protocol,
      controller.signal,
      onDelta
    );
  } catch (streamErr) {
    // If we were aborted by timeout, surface that specifically.
    if (controller.signal.aborted) {
      throw new Error(
        i18n.t("errors.REQUEST_TIMEOUT", { s: Math.round(timeoutMs / 1000) })
      );
    }

    // Streaming failed — retry once without streaming. Some gateways reject
    // stream:true or return non-SSE bodies; this keeps the synthesis alive.
    const fallbackController = new AbortController();
    const fallbackTimer = setTimeout(
      () => fallbackController.abort(),
      timeoutMs
    );
    try {
      const res = await fetchImpl(prepared.url, {
        method: "POST",
        headers: prepared.headers,
        body: prepared.nonStreamBody,
        signal: fallbackController.signal,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(
          `HTTP ${res.status} ${res.statusText}${errText ? `: ${errText.slice(0, 500)}` : ""}`
        );
      }
      const text = await res.text();
      const content = extractContent(text, protocol);
      if (content) onDelta(content);
      return content;
    } catch (fallbackErr) {
      if (fallbackController.signal.aborted) {
        throw new Error(
        i18n.t("errors.REQUEST_TIMEOUT", { s: Math.round(timeoutMs / 1000) })
      );
      }
      throw new Error(
        i18n.t("errors.REQUEST_FAILED", {
          message: (fallbackErr as Error).message || String(fallbackErr),
        })
      );
    } finally {
      clearTimeout(fallbackTimer);
    }
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * Provider connectivity test
 * ------------------------------------------------------------------ */

export interface ProviderTestResult {
  ok: boolean;
  /** Human-readable status: "OK" on success, or the error detail on failure. */
  message: string;
  /** How long the probe took in ms (for UX feedback). */
  ms: number;
  /** If detected, the context window in chars (from API or built-in DB). */
  detectedContextChars?: number;
}

/**
 * Probe a provider with a minimal non-streaming request to verify that the
 * base URL, API key, model name, and protocol are all correct. Sends a single
 * "ping" user message with max_tokens=1, so the cost is ~1-2 tokens.
 *
 * Uses the exact same request-shaping path (prepareRequest) as real calls, so
 * a passing test guarantees the synthesis path will work too.
 */
export async function testProvider(
  provider: import("../types/moa").AIProvider
): Promise<ProviderTestResult> {
  const started = Date.now();
  const fetchImpl = await resolveFetch();
  const protocol: ProtocolType = provider.protocol ?? "openai";

  // Build a minimal probe via the same adapter used for real calls.
  const prepared = prepareRequest({
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: provider.modelString,
    messages: [{ role: "user", content: "ping" }],
    maxTokens: 1,
    temperature: 0,
    timeoutMs: 20000,
    protocol,
  });

  // Both OpenAI and Anthropic prepareRequest bake max_tokens into the body.
  // For OpenAI we must also force stream off (prepareOpenAI sets stream flag
  // based on which body; nonStreamBody has stream:false). Use nonStreamBody.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetchImpl(prepared.url, {
      method: "POST",
      headers: prepared.headers,
      body: prepared.nonStreamBody,
      signal: controller.signal,
    });
    const ms = Date.now() - started;
    if (res.ok) {
      // Try to detect context window: first from /models API, then from DB.
      let detectedChars: number | undefined;
      try {
        // Only attempt /models for OpenAI-protocol endpoints (Anthropic uses
        // a different auth scheme + no /models endpoint).
        if (protocol !== "anthropic") {
          const modelsUrl = `${normalizeBase(provider.baseUrl)}/models`;
          const modelsController = new AbortController();
          const modelsTimer = setTimeout(
            () => modelsController.abort(),
            5000
          );
          const modelsRes = await fetchImpl(modelsUrl, {
            headers: { Authorization: `Bearer ${provider.apiKey}` },
            signal: modelsController.signal,
          });
          clearTimeout(modelsTimer);
          if (modelsRes.ok) {
            const modelsData = await modelsRes.json();
            const modelsRaw = modelsData?.data ?? modelsData;
            if (Array.isArray(modelsRaw)) {
              const match = modelsRaw.find(
                (m) =>
                  (m as { id?: string }).id === provider.modelString ||
                  (m as { id?: string }).id?.includes(provider.modelString)
              );
              const ctxTokens =
                (match as { context_length?: number })?.context_length ??
                (match as { context_window?: number })?.context_window;
              if (ctxTokens) detectedChars = tokensToChars(ctxTokens);
            }
          }
        }
      } catch {
        /* /models not supported — fall through to DB lookup */
      }
      // Fallback: built-in database.
      if (!detectedChars) {
        detectedChars = lookupContextChars(provider.modelString);
      }
      return {
        ok: true,
        message: i18n.t("errors.CONNECT_OK"),
        ms,
        detectedContextChars: detectedChars,
      };
    }
    const errText = await res.text().catch(() => "");
    let detail = `HTTP ${res.status}`;
    // Try to extract a structured error message from common shapes.
    try {
      const j = JSON.parse(errText);
      const msg =
        j?.error?.message ??
        j?.error?.code ??
        j?.message ??
        j?.detail ??
        errText.slice(0, 200);
      detail = `HTTP ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`;
    } catch {
      if (errText) detail = `HTTP ${res.status}: ${errText.slice(0, 200)}`;
    }
    return { ok: false, message: detail, ms };
  } catch (err) {
    const ms = Date.now() - started;
    if (controller.signal.aborted) {
      return { ok: false, message: i18n.t("errors.CONNECT_TIMEOUT"), ms };
    }
    return {
      ok: false,
      message: i18n.t("errors.REQUEST_FAILED", {
        message: (err as Error).message || String(err),
      }),
      ms,
    };
  } finally {
    clearTimeout(timer);
  }
}
