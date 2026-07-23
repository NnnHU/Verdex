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
 * Trigger logic (auto mode) — REVISED 2026-07-24 after real API benchmark:
 *   Map-Reduce vs 单次 Extract on DeepSeek-V3 (scripts/perf-test.mjs):
 *     C(5.3万): 单次 36s vs MR 153s;  D(7.4万): 单次 47s vs MR 218s;
 *     F(9.7万): 单次 34s.  → 大模型单次完胜 (Map-Reduce 的 Reduce 是瓶颈).
 *   结论: 对大上下文模型, Map-Reduce 是负优化 (除非语料超单次容量).
 *
 *   新 auto 规则 (单次优先):
 *   - 总字符 > maxContextChars × triggerRatio (default 0.75 = 15万 at 20万 cap)
 *     → 触发 (单次真的撑不下/太慢才切分)
 *   - 单份附件 > maxContextChars (oversized) → 也触发 (单份就超模型上下文)
 *   - 否则 → 单次 Extract (快又好)
 *   - 份数不再单独触发 (实测: 份数多不等于单次不行, V3 能一次读 7 份)
 *
 *   注: 对小模型 (8-32K 上下文), 用户应把 maxContextChars 调小 或 force=always,
 *       此时 Map-Reduce 变成必需 (单次塞不下).
 *
 * @param attachments      The session's loaded documents.
 * @param maxContextChars  Conservative per-call context cap (chars).
 * @param triggerRatio     Fraction of maxContextChars: total chars above this triggers.
 * @param forceMode        auto | always | never.
 * @param docCountThreshold (保留参数兼容; auto 模式不再因份数触发)
 */
export function shouldMapReduce(
  attachments: Attachment[],
  maxContextChars: number,
  triggerRatio: number,
  forceMode: MapReduceForceMode,
  docCountThreshold: number = 4
): MapReduceDecision {
  void docCountThreshold; // 保留参数兼容; auto 不再用份数触发 (见上注释)
  const totalChars = attachments.reduce((sum, a) => sum + a.chars, 0);
  const oversized = attachments.filter((a) => a.chars > maxContextChars);
  const charThreshold = Math.floor(maxContextChars * triggerRatio);
  const docCount = attachments.length;
  // 单次优先: 只在字符超阈值 或 有单份超大附件时触发.
  const byChars = totalChars > charThreshold;
  const byOversized = oversized.length > 0;

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

  // auto — 单次优先 (实测: 大模型单次远快于 Map-Reduce, 见函数头注释)
  if (byOversized) {
    return {
      enabled: true,
      reason: `${oversized.length} oversized doc(s) > ${maxContextChars.toLocaleString()} chars — Map-Reduce (single can't fit)`,
      totalChars,
      oversized,
    };
  }
  if (byChars) {
    return {
      enabled: true,
      reason: `${docCount} docs, ${totalChars.toLocaleString()} chars > ${charThreshold.toLocaleString()} (${triggerRatio}× ctx) — Map-Reduce`,
      totalChars,
      oversized,
    };
  }
  return {
    enabled: false,
    reason: `${docCount} docs, ${totalChars.toLocaleString()} chars (≤ ${charThreshold.toLocaleString()}) — single-pass extract (大模型单次够快)`,
    totalChars,
    oversized,
  };
}
