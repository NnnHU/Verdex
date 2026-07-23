/**
 * Verdex — Map-Reduce trigger strategy (Stage 4, adaptive).
 *
 * Decides whether a mapreduce-mode request should actually run the Map→Reduce
 * path or fall back to single-pass extract (whole corpus in one prompt).
 *
 * Trigger logic (when forceMode === "auto"):
 *   - enabled = totalChars > maxContextChars * triggerRatio
 *     (one call can't comfortably hold the whole corpus)
 *   - small corpus → disabled (degrade to extract; cheaper & often better)
 *
 * forceMode overrides: "always" forces Map-Reduce regardless of size;
 * "never" disables it (useful for very small or very homogeneous corpora).
 *
 * Pure functions; unit-testable.
 */

import type { Attachment } from "../types/moa";

export type MapReduceForceMode = "auto" | "always" | "never";

export interface MapReduceDecision {
  /** Whether to run the Map→Reduce path. */
  enabled: boolean;
  /** Human-readable reason (for UI display / debugging). */
  reason: string;
  /** Total characters across all attachments. */
  totalChars: number;
  /** Attachments whose individual size exceeds the context cap (can't fit
   *  even alone — Stage 4 first version only warns; intra-doc chunking later). */
  oversized: Attachment[];
}

/**
 * Decide whether to run Map-Reduce for the given corpus.
 *
 * Trigger logic (auto mode) — based on 2026-07-24 测试:
 *   - 仂数 ≥ docCountThreshold (default 4) → trigger (many docs: parallel wins)
 *   - OR 总字符 > maxContextChars × triggerRatio (default 0.4 = 8万) → trigger (too slow single-pass)
 *   - otherwise → single-pass extract
 * 实测依据: 5份/5.3万单次120s、7份/7.4万单次150s(慢)、3份/9.7万单次100s；
 *           份数多比字数大更拖慢(模型切换注意力成本)。
 *
 * @param attachments      The session's loaded documents.
 * @param maxContextChars  Conservative per-call context cap (chars).
 * @param triggerRatio     Fraction of maxContextChars: total chars above this triggers.
 * @param forceMode        auto | always | never.
 * @param docCountThreshold Trigger when doc count ≥ this (default 4).
 */
export function shouldMapReduce(
  attachments: Attachment[],
  maxContextChars: number,
  triggerRatio: number,
  forceMode: MapReduceForceMode,
  docCountThreshold: number = 4
): MapReduceDecision {
  const totalChars = attachments.reduce((sum, a) => sum + a.chars, 0);
  const oversized = attachments.filter((a) => a.chars > maxContextChars);
  const charThreshold = Math.floor(maxContextChars * triggerRatio);
  const docCount = attachments.length;
  // 实测驱动的双条件触发。
  const byDocCount = docCount >= docCountThreshold;
  const byChars = totalChars > charThreshold;

  if (forceMode === "never") {
    return {
      enabled: false,
      reason: `force=never (total ${totalChars.toLocaleString()} chars)`,
      totalChars,
      oversized,
    };
  }
  if (forceMode === "always") {
    return {
      enabled: true,
      reason: `force=always (${docCount} docs, ${totalChars.toLocaleString()} chars)`,
      totalChars,
      oversized,
    };
  }

  // auto
  if (docCount <= 1) {
    return {
      enabled: false,
      reason: `single doc (${totalChars.toLocaleString()} chars) — extract pass-through`,
      totalChars,
      oversized,
    };
  }
  if (byDocCount || byChars) {
    const why = byDocCount
      ? `${docCount} docs ≥ ${docCountThreshold} threshold`
      : `${totalChars.toLocaleString()} chars > ${charThreshold.toLocaleString()} (${triggerRatio}× ctx)`;
    return {
      enabled: true,
      reason: `${why} — Map-Reduce`,
      totalChars,
      oversized,
    };
  }
  return {
    enabled: false,
    reason: `${docCount} docs (< ${docCountThreshold}), ${totalChars.toLocaleString()} chars (≤ ${charThreshold.toLocaleString()}) — single-pass extract`,
    totalChars,
    oversized,
  };
}
