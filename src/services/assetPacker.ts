/**
 * Verdex — Knowledge Asset Packer (Stage 4: Knowledge Packaging).
 *
 * Takes the output of Verdex's three-stage pipeline (Judge verdict / extract
 * JSON / map-reduce merged result) and packs it into a KnowledgeAsset — the
 * persistent, reusable internal format that captures the full reasoning process.
 *
 * The KnowledgeAsset is format-independent; exporters (claudeSkill, markdown,
 * etc.) translate it to external formats.
 */

import type {
  Attachment,
  JudgeResponse,
  KnowledgeAsset,
  Turn,
} from "../types/moa";

/**
 * Pack a Judge verdict response (four-field) into a KnowledgeAsset.
 */
export function packVerdictAsset(params: {
  query: string;
  response: Extract<JudgeResponse, { kind: "verdict" }>;
  taskType: KnowledgeAsset["originTaskType"];
  sources: string[];
  panelModels: string[];
  judgeModel: string;
  name?: string;
  description?: string;
}): KnowledgeAsset {
  const r = params.response;
  return {
    id: crypto.randomUUID(),
    name: params.name ?? autoName(params.query),
    description:
      params.description ?? autoDescription(params.query, r.consensus),
    sourceQuery: params.query,
    createdAt: Date.now(),
    consensus: r.consensus,
    divergences: r.divergence,
    blindspots: r.blindspots,
    verdict: r.verdict,
    sources: params.sources,
    originTaskType: params.taskType,
    panelModels: params.panelModels,
    judgeModel: params.judgeModel,
    categories: [],
  };
}

/**
 * Pack an extract response (structured JSON) into a KnowledgeAsset.
 *
 * If the structured data happens to be a four-field verdict shape
 * ({consensus, divergence, blindspots, verdict}) — e.g. the user picked the
 * "four-field verdict (extract)" schema — populate the asset's verdict fields
 * from those values instead of collapsing everything into a flat summary
 * (which previously left Consensus/Verdict holding the same semicolon-joined
 * blob of all four fields).
 */
export function packExtractAsset(params: {
  query: string;
  data: Record<string, unknown>;
  taskType: KnowledgeAsset["originTaskType"];
  sources: string[];
  panelModels: string[];
  judgeModel: string;
  name?: string;
  description?: string;
}): KnowledgeAsset {
  const verdictFields = extractVerdictFields(params.data);
  const summary = verdictFields
    ? verdictFields.consensus
    : summarizeStructuredData(params.data);
  return {
    id: crypto.randomUUID(),
    name: params.name ?? autoName(params.query),
    description:
      params.description ?? autoDescription(params.query, summary),
    sourceQuery: params.query,
    createdAt: Date.now(),
    consensus: verdictFields?.consensus ?? summary,
    divergences: verdictFields?.divergences ?? "",
    blindspots: verdictFields?.blindspots ?? "",
    verdict: verdictFields?.verdict ?? summary,
    structuredData: params.data,
    sources: params.sources,
    originTaskType: params.taskType,
    panelModels: params.panelModels,
    judgeModel: params.judgeModel,
    categories: [],
  };
}

/**
 * Detect whether an extract-mode data object is actually a four-field verdict
 * ({consensus, divergence, blindspots, verdict}). Returns the four values (with
 * the asset field name `divergences`) if so, otherwise null.
 *
 * Matching is lenient: divergence may be singular (`divergence`) or plural
 * (`divergences`), and all four keys must be present with string values.
 */
function extractVerdictFields(
  data: Record<string, unknown>
): { consensus: string; divergences: string; blindspots: string; verdict: string } | null {
  const keys = Object.keys(data);
  const has = (k: string) => keys.includes(k);
  // divergence may appear as either singular or plural depending on schema wording.
  const hasDivergence = has("divergence") || has("divergences");
  if (!(has("consensus") && hasDivergence && has("blindspots") && has("verdict"))) {
    return null;
  }
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const divergences =
    (data["divergences"] as unknown as string) ??
    (data["divergence"] as unknown as string);
  return {
    consensus: str(data["consensus"]),
    divergences: str(divergences),
    blindspots: str(data["blindspots"]),
    verdict: str(data["verdict"]),
  };
}

/**
 * Pack from a Turn's judge response — convenience wrapper that handles both
 * verdict and extract kinds.
 */
export function packFromTurn(params: {
  turn: Turn;
  taskType: KnowledgeAsset["originTaskType"];
  attachments?: Attachment[];
  panelModels: string[];
  judgeModel: string;
  name?: string;
  description?: string;
}): KnowledgeAsset | null {
  const { turn, attachments, panelModels, judgeModel } = params;

  // For mapreduce turns, use mergedResult; otherwise use the first judge.
  const response: JudgeResponse | null =
    turn.mergedResult ?? turn.judges[0]?.response ?? null;
  if (!response) return null;

  const sources = (attachments ?? []).map((a) => a.name);

  if (response.kind === "verdict") {
    return packVerdictAsset({
      query: turn.prompt,
      response,
      taskType: params.taskType,
      sources,
      panelModels,
      judgeModel,
      name: params.name,
      description: params.description,
    });
  } else {
    return packExtractAsset({
      query: turn.prompt,
      data: response.data,
      taskType: params.taskType,
      sources,
      panelModels,
      judgeModel,
      name: params.name,
      description: params.description,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Generate a reasonable name from the query (first 30 chars). */
function autoName(query: string): string {
  const clean = query.trim().replace(/\n/g, " ").slice(0, 30);
  return clean.length < query.trim().length ? `${clean}…` : clean;
}

/** Generate a trigger description for host AI to know when to use this asset. */
function autoDescription(query: string, summary: string): string {
  const zh = summary.length > 0 && /[\u4e00-\u9fff]/.test(summary);
  const qSnippet = query.trim().slice(0, 80);
  const sSnippet = summary.trim().slice(0, 120);
  return zh
    ? `基于以下分析的知识资产。原始问题：${qSnippet}。核心结论：${sSnippet}`
    : `Knowledge asset from multi-model analysis. Query: ${qSnippet}. Key finding: ${sSnippet}`;
}

/** Extract a brief summary from structured JSON data (top-level values). */
function summarizeStructuredData(data: Record<string, unknown>): string {
  const entries = Object.entries(data);
  if (entries.length === 0) return "";

  const parts: string[] = [];
  for (const [key, val] of entries) {
    if (Array.isArray(val)) {
      parts.push(`${key}: ${val.length} 项`);
    } else if (typeof val === "string") {
      parts.push(`${key}: ${val.slice(0, 80)}`);
    } else if (val && typeof val === "object") {
      parts.push(`${key}: ${Object.keys(val).length} 字段`);
    } else {
      parts.push(`${key}: ${String(val)}`);
    }
  }
  return parts.join("; ").slice(0, 300);
}
