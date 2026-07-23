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
 * @param attachments   The session's loaded documents.
 * @param maxContextChars Conservative per-call context cap (chars).
 * @param triggerRatio  Fraction of maxContextChars at which Map-Reduce kicks in.
 * @param forceMode     auto | always | never.
 */
export function shouldMapReduce(
  attachments: Attachment[],
  maxContextChars: number,
  triggerRatio: number,
  forceMode: MapReduceForceMode
): MapReduceDecision {
  const totalChars = attachments.reduce((sum, a) => sum + a.chars, 0);
  const oversized = attachments.filter((a) => a.chars > maxContextChars);
  const threshold = Math.floor(maxContextChars * triggerRatio);

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
      reason: `force=always (${attachments.length} docs, ${totalChars.toLocaleString()} chars)`,
      totalChars,
      oversized,
    };
  }

  // auto
  if (attachments.length <= 1) {
    return {
      enabled: false,
      reason: `single doc (${totalChars.toLocaleString()} chars) — extract pass-through`,
      totalChars,
      oversized,
    };
  }
  if (totalChars > threshold) {
    return {
      enabled: true,
      reason: `${attachments.length} docs, ${totalChars.toLocaleString()} chars > ${threshold.toLocaleString()} threshold (${triggerRatio}× ctx)`,
      totalChars,
      oversized,
    };
  }
  return {
    enabled: false,
    reason: `${attachments.length} docs, ${totalChars.toLocaleString()} chars ≤ threshold — single-pass extract`,
    totalChars,
    oversized,
  };
}
