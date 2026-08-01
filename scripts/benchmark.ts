/**
 * Verdex — P1 Benchmark harness.
 *
 * Compares three execution modes against the same case corpus to quantify the
 * relative value of multi-model orchestration (validates MULTI_MODEL_REVIEW.md
 * Hypothesis A: does a structured multi-step flow beat a single-shot answer?).
 *
 *   M1  single-model single-shot    — one streamChat call, doc + query in prompt   (1× cost)
 *   M2  single-model multi-step     — extract → analyze → judge, same one model    (3× cost)
 *   M3  multi-model Panel + Judge   — runMoaSynthesis with panelIds = [p1, p2]     (4× cost)
 *
 * This script drives the REAL engine (runMoaSynthesis / streamChat /
 * parseJudgeResponse) — not a re-implemented fetch — so the pipeline under test
 * is exactly what the app runs. Full-fidelity Trace Dump is captured from the
 * engine callbacks (un-truncated, unlike the 4k/6k caps in config.json).
 *
 * Usage:
 *   npm run bench                # run all cases × all queries × all modes
 *   npx tsx scripts/benchmark.ts # equivalent
 *
 * Outputs land in bench-results/<timestamp>-{trace.json,report.md}.
 * Config comes from .env (VITE_VERDEX_PROVIDER_* / PROVIDER2_*).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { runMoaSynthesis, parseJudgeResponse, DEFAULT_JUDGE_PROMPTS } from "../src/services/moaEngine.js";
import { streamChat } from "../src/services/httpClient.js";
import "../src/i18n/index.js"; // initialize i18n (moaEngine depends on it for error strings)
import type { AIProvider, SynthesisResponse } from "../src/types/moa.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SAMPLES_DIR = join(ROOT, "bench-samples");
const RESULTS_DIR = join(ROOT, "bench-results");

/* ------------------------------------------------------------------ *
 * Config: build two providers from .env (same as the app's seed).
 * ------------------------------------------------------------------ */

function parseEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = readFileSync(join(ROOT, ".env"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function buildProvider(env: Record<string, string>, suffix: string, id: string): AIProvider | null {
  const baseUrl = env[`VITE_VERDEX_PROVIDER${suffix}_BASE_URL`];
  const apiKey = env[`VITE_VERDEX_PROVIDER${suffix}_API_KEY`];
  const model = env[`VITE_VERDEX_PROVIDER${suffix}_MODEL`];
  if (!baseUrl || !apiKey || !model) return null;
  const name = env[`VITE_VERDEX_PROVIDER${suffix}_NAME`] ?? model;
  const protocolRaw = env[`VITE_VERDEX_PROVIDER${suffix}_PROTOCOL`] ?? "openai";
  return {
    id,
    name,
    modelString: model,
    baseUrl,
    apiKey,
    protocol: protocolRaw === "anthropic" ? "anthropic" : "openai",
  };
}

/* ------------------------------------------------------------------ *
 * Sample loading.
 * ------------------------------------------------------------------ */

interface SampleQuery { id: string; text: string; }
interface SampleCase {
  id: string;
  doc: string;
  /** Optional additional docs to combine into one corpus (multi-doc case). */
  multiDocs?: string[];
  queries: SampleQuery[];
}

function loadSamples(): { cases: SampleCase[]; docs: Map<string, string> } {
  const manifest = JSON.parse(readFileSync(join(SAMPLES_DIR, "samples.json"), "utf8")) as
    { cases: SampleCase[] };
  const docs = new Map<string, string>();
  // Collect every filename referenced by any case (primary + multiDocs).
  for (const c of manifest.cases) {
    const names = [c.doc, ...(c.multiDocs ?? [])];
    for (const n of names) {
      if (!docs.has(n)) {
        docs.set(n, readFileSync(join(SAMPLES_DIR, n), "utf8"));
      }
    }
  }
  return { cases: manifest.cases, docs };
}

/** Build the combined corpus text for a case (single doc, or multi-doc joined). */
function caseCorpus(c: SampleCase, docs: Map<string, string>): { text: string; sourceNames: string[] } {
  const names = [c.doc, ...(c.multiDocs ?? [])];
  const parts = names.map((n) => {
    const body = docs.get(n)!;
    // Prefix each doc with a header so the model can tell them apart.
    return `=== ${n} ===\n${body}`;
  });
  return { text: parts.join("\n\n"), sourceNames: names };
}

/* ------------------------------------------------------------------ *
 * Timing + metric helpers.
 * ------------------------------------------------------------------ */

function nowMs(): number { return Date.now(); }

/** Pull the four verdict fields out of a parsed response (verdict or extract kind). */
function verdictFields(resp: SynthesisResponse | null): {
  consensus: string; divergences: string; blindspots: string; verdict: string;
} {
  if (!resp) return { consensus: "", divergences: "", blindspots: "", verdict: "" };
  if (resp.kind === "verdict") {
    return {
      consensus: resp.consensus, divergences: resp.divergence,
      blindspots: resp.blindspots, verdict: resp.verdict,
    };
  }
  // extract kind: data may itself be a four-field shape
  const d = resp.data as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    consensus: s(d.consensus),
    divergences: s(d.divergences ?? d.divergence),
    blindspots: s(d.blindspots),
    verdict: s(d.verdict),
  };
}

function countNonEmpty(fields: Record<string, string>): number {
  return Object.values(fields).filter((v) => v.trim().length > 0).length;
}

/* ------------------------------------------------------------------ *
 * M1 — single-model single-shot.
 * One streamChat call; the doc + query go straight into the user prompt.
 * ------------------------------------------------------------------ */

interface ModeResult {
  mode: string;
  ok: boolean;
  latencyMs: number;
  apiCalls: number;
  rawOutput: string;
  parsed: SynthesisResponse | null;
  validJson: boolean;
  fields: ReturnType<typeof verdictFields>;
  trace: unknown;
  error?: string;
}

async function runMode1(
  provider: AIProvider, docText: string, query: string, timeoutMs: number
): Promise<ModeResult> {
  const start = nowMs();
  const prompt = [
    "You are an expert analyst. Read the document below and answer the question.",
    "Output ONLY a JSON object with exactly these four fields:",
    '"consensus", "divergence", "blindspots", "verdict" (each a non-empty string).',
    "No markdown fences, no extra prose.",
    "",
    "Question: " + query,
    "",
    "Document:",
    docText,
  ].join("\n");
  try {
    const raw = await streamChat(
      {
        baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.modelString,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7, maxTokens: 2048, timeoutMs, protocol: provider.protocol,
      },
      () => { /* swallow deltas for headless run */ }
    );
    const parsed = parseJudgeResponse(raw, "verdict");
    const fields = verdictFields(parsed);
    return {
      mode: "M1-single-shot", ok: true, latencyMs: nowMs() - start, apiCalls: 1,
      rawOutput: raw, parsed, validJson: parsed.kind === "verdict", fields,
      trace: { prompt, rawOutput: raw },
    };
  } catch (err) {
    return {
      mode: "M1-single-shot", ok: false, latencyMs: nowMs() - start, apiCalls: 1,
      rawOutput: "", parsed: null, validJson: false,
      fields: { consensus: "", divergences: "", blindspots: "", verdict: "" },
      trace: { prompt, error: String(err) }, error: String(err),
    };
  }
}

/* ------------------------------------------------------------------ *
 * M2 — single-model multi-step (extract → analyze → judge, same model).
 * Replicates the document_analysis pre-stage the hook does inline, then feeds
 * the extracted knowledge into a Panel+Judge run with panelIds=[same model].
 * ------------------------------------------------------------------ */

async function runMode2(
  provider: AIProvider, docText: string, query: string, timeoutMs: number
): Promise<ModeResult> {
  const start = nowMs();
  const trace: Record<string, unknown> = {};
  try {
    // Step 1: extract — one call that turns the doc into structured knowledge.
    const extractPrompt = [
      "Read the document and extract its core structured knowledge as concise notes.",
      "Focus on: key events, core arguments, named entities, and stated lessons.",
      "Output plain text notes, not JSON.",
      "",
      "Document:",
      docText,
    ].join("\n");
    const extracted = await streamChat(
      {
        baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.modelString,
        messages: [{ role: "user", content: extractPrompt }],
        temperature: 0.5, maxTokens: 2048, timeoutMs, protocol: provider.protocol,
      },
      () => {}
    );
    trace.extractPrompt = extractPrompt;
    trace.extracted = extracted;

    // Step 2+3: analyze + judge via the real engine, panelIds = [this model].
    // The "panel" analyzes the extracted knowledge; the judge synthesizes.
    const analysisPrompt = [
      "Based on the following extracted knowledge, answer the question.",
      "Output ONLY a JSON object with exactly these four fields:",
      '"consensus", "divergence", "blindspots", "verdict" (each a non-empty string).',
      "No markdown fences, no extra prose.",
      "",
      "Question: " + query,
      "",
      "Extracted knowledge:",
      extracted,
    ].join("\n");
    const judgeSpec = {
      providerId: provider.id,
      systemPrompt: DEFAULT_JUDGE_PROMPTS[0].systemPrompt,
      outputKind: "verdict" as const,
    };
    let panelRaw = "";
    let judgeRaw = "";
    let judgeResp: SynthesisResponse | null = null;
    await runMoaSynthesis(
      {
        prompt: analysisPrompt,
        panelIds: [provider.id],
        panelRoles: {},
        judges: [judgeSpec],
        taskType: "document_analysis",
        temperature: 0.7, maxTokens: 2048, timeoutMs,
      },
      [provider],
      {
        onPanelDone: (_id, text) => { panelRaw = text; },
        onJudgeDone: (_id, resp, raw) => { judgeResp = resp; judgeRaw = raw; },
      }
    );
    trace.panelRaw = panelRaw;
    trace.judgeRaw = judgeRaw;
    const fields = verdictFields(judgeResp);
    return {
      mode: "M2-single-multi-step", ok: true, latencyMs: nowMs() - start, apiCalls: 3,
      rawOutput: judgeRaw, parsed: judgeResp, validJson: judgeResp?.kind === "verdict",
      fields, trace,
    };
  } catch (err) {
    return {
      mode: "M2-single-multi-step", ok: false, latencyMs: nowMs() - start, apiCalls: 3,
      rawOutput: "", parsed: null, validJson: false,
      fields: { consensus: "", divergences: "", blindspots: "", verdict: "" },
      trace, error: String(err),
    };
  }
}

/* ------------------------------------------------------------------ *
 * M3 — multi-model Panel + Judge (the real Verdex pipeline).
 * ------------------------------------------------------------------ */

async function runMode3(
  providers: AIProvider[], panelIds: string[], judgeId: string,
  docText: string, query: string, timeoutMs: number
): Promise<ModeResult> {
  const start = nowMs();
  const trace: Record<string, unknown> = { panelRaw: {} as Record<string, string> };
  try {
    // M3 includes the extract pre-stage too (document_analysis), so the
    // comparison vs M2 is about multi-model panel, not about skipping extract.
    const extractPrompt = [
      "Read the document and extract its core structured knowledge as concise notes.",
      "Focus on: key events, core arguments, named entities, and stated lessons.",
      "Output plain text notes, not JSON.",
      "",
      "Document:",
      docText,
    ].join("\n");
    const firstProvider = providers[0];
    const extracted = await streamChat(
      {
        baseUrl: firstProvider.baseUrl, apiKey: firstProvider.apiKey, model: firstProvider.modelString,
        messages: [{ role: "user", content: extractPrompt }],
        temperature: 0.5, maxTokens: 2048, timeoutMs, protocol: firstProvider.protocol,
      },
      () => {}
    );
    trace.extractPrompt = extractPrompt;
    trace.extracted = extracted;

    const analysisPrompt = [
      "Based on the following extracted knowledge, answer the question.",
      "",
      "Question: " + query,
      "",
      "Extracted knowledge:",
      extracted,
    ].join("\n");
    const judgeSpec = {
      providerId: judgeId,
      systemPrompt: DEFAULT_JUDGE_PROMPTS[0].systemPrompt,
      outputKind: "verdict" as const,
    };
    let judgeRaw = "";
    let judgeResp: SynthesisResponse | null = null;
    await runMoaSynthesis(
      {
        prompt: analysisPrompt,
        panelIds,
        panelRoles: {},
        judges: [judgeSpec],
        taskType: "document_analysis",
        temperature: 0.7, maxTokens: 2048, timeoutMs,
      },
      providers,
      {
        onPanelDone: (id, text) => { (trace.panelRaw as Record<string, string>)[id] = text; },
        onJudgeDone: (_id, resp, raw) => { judgeResp = resp; judgeRaw = raw; },
      }
    );
    const fields = verdictFields(judgeResp);
    return {
      mode: "M3-multi-model", ok: true, latencyMs: nowMs() - start,
      apiCalls: 1 + panelIds.length + 1, // extract + panels + judge
      rawOutput: judgeRaw, parsed: judgeResp, validJson: judgeResp?.kind === "verdict",
      fields, trace,
    };
  } catch (err) {
    return {
      mode: "M3-multi-model", ok: false, latencyMs: nowMs() - start,
      apiCalls: 1 + panelIds.length + 1, rawOutput: "", parsed: null, validJson: false,
      fields: { consensus: "", divergences: "", blindspots: "", verdict: "" },
      trace, error: String(err),
    };
  }
}

/* ------------------------------------------------------------------ *
 * Report generation.
 * ------------------------------------------------------------------ */

function writeReport(
  runId: string, caseId: string, docChars: number, sourceNames: string[],
  queryId: string, query: string, results: ModeResult[]
): void {
  // trace.json — full fidelity dump
  writeFileSync(
    join(RESULTS_DIR, `${runId}-${caseId}-${queryId}-trace.json`),
    JSON.stringify({
      runId, caseId, queryId, query, docChars, sourceNames,
      generatedAt: new Date().toISOString(),
      results: results.map((r) => ({
        mode: r.mode, ok: r.ok, latencyMs: r.latencyMs, apiCalls: r.apiCalls,
        validJson: r.validJson, error: r.error,
        fields: r.fields, nonEmptyFields: countNonEmpty(r.fields),
        trace: r.trace,
      })),
    }, null, 2),
    "utf8"
  );

  // report.md — human-readable comparison table
  const lines: string[] = [];
  lines.push(`# Benchmark: ${caseId} / ${queryId}`, "");
  lines.push(`- **Generated**: ${new Date().toISOString()}`);
  lines.push(`- **Sources**: ${sourceNames.join(", ")}`);
  lines.push(`- **Corpus chars**: ${docChars.toLocaleString()}${sourceNames.length > 1 ? ` (multi-doc)` : ""}`);
  lines.push(`- **Query**: ${query}`, "");
  lines.push("## Comparison", "");
  lines.push("| Mode | OK | Latency (s) | API calls | Valid JSON | Fields (0-4) |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(
      `| ${r.mode} | ${r.ok ? "✅" : "❌"} | ${(r.latencyMs / 1000).toFixed(1)} | ${r.apiCalls} | ${r.validJson ? "✅" : "❌"} | ${countNonEmpty(r.fields)}/4 |`
    );
  }
  lines.push("");
  lines.push("## Field character counts (non-zero = populated)", "");
  lines.push("| Mode | consensus | divergences | blindspots | verdict |");
  lines.push("|---|---|---|---|---|");
  for (const r of results) {
    lines.push(
      `| ${r.mode} | ${r.fields.consensus.length} | ${r.fields.divergences.length} | ${r.fields.blindspots.length} | ${r.fields.verdict.length} |`
    );
  }
  lines.push("");
  if (results.some((r) => r.error)) {
    lines.push("## Errors", "");
    for (const r of results) {
      if (r.error) lines.push(`- **${r.mode}**: ${r.error}`, "");
    }
  }
  lines.push("---");
  lines.push(`*Full trace: \`${runId}-${caseId}-${queryId}-trace.json\`*`);
  writeFileSync(
    join(RESULTS_DIR, `${runId}-${caseId}-${queryId}-report.md`),
    lines.join("\n"),
    "utf8"
  );
}

/* ------------------------------------------------------------------ *
 * Main.
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  mkdirSync(RESULTS_DIR, { recursive: true });
  const env = parseEnv();
  const p1 = buildProvider(env, "", "bench-provider-1");
  const p2 = buildProvider(env, "2", "bench-provider-2");
  if (!p1) {
    console.error("✗ VITE_VERDEX_PROVIDER_* not set in .env — cannot run benchmark.");
    process.exit(1);
  }
  const providers = p2 ? [p1, p2] : [p1];
  console.log(`▶ Loaded ${providers.length} provider(s): ${providers.map((p) => p.name).join(", ")}`);

  const { cases, docs } = loadSamples();
  console.log(`▶ Loaded ${cases.length} case(s) from bench-samples/`);

  const timeoutMs = Number(env.VITE_VERDEX_REQUEST_TIMEOUT_MS) || 360000;
  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  for (const c of cases) {
    const { text: corpusText, sourceNames } = caseCorpus(c, docs);
    const multiLabel = sourceNames.length > 1 ? ` [multi-doc ×${sourceNames.length}]` : "";
    for (const q of c.queries) {
      console.log(`\n=== Case "${c.id}" / query "${q.id}"${multiLabel} ===`);
      console.log(`  Corpus: ${corpusText.length.toLocaleString()} chars from ${sourceNames.join(", ")}`);
      console.log(`  Q: ${q.text.slice(0, 80)}...`);

      const results: ModeResult[] = [];

      console.log("  ▷ M1 single-model single-shot...");
      results.push(await runMode1(p1, corpusText, q.text, timeoutMs));
      console.log(`    ✓ ${results[0].ok ? "ok" : "FAILED"} in ${(results[0].latencyMs / 1000).toFixed(1)}s`);

      console.log("  ▷ M2 single-model multi-step...");
      results.push(await runMode2(p1, corpusText, q.text, timeoutMs));
      console.log(`    ✓ ${results[1].ok ? "ok" : "FAILED"} in ${(results[1].latencyMs / 1000).toFixed(1)}s`);

      if (p2) {
        console.log("  ▷ M3 multi-model Panel+Judge...");
        results.push(await runMode3(providers, [p1.id, p2.id], p1.id, corpusText, q.text, timeoutMs));
        console.log(`    ✓ ${results[2].ok ? "ok" : "FAILED"} in ${(results[2].latencyMs / 1000).toFixed(1)}s`);
      } else {
        console.log("  ⊘ M3 multi-model SKIPPED (only 1 provider configured)");
      }

      writeReport(runId, c.id, corpusText.length, sourceNames, q.id, q.text, results);
      console.log(`  ▶ Report written to bench-results/${runId}-${c.id}-${q.id}-report.md`);
    }
  }
  console.log("\n✓ Benchmark complete.");
}

main().catch((err) => {
  console.error("✗ Benchmark failed:", err);
  process.exit(1);
});
