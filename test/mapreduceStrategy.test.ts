/**
 * Verdex — unit tests for the Map-Reduce trigger strategy (Stage 4).
 * 双条件触发: 仂数 ≥ docCountThreshold (default 4) OR 总字符 > maxContextChars × triggerRatio.
 * 实测驱动 (2026-07-24): 5份/5.3万单次120s, 7份/7.4万单次150s, 3份/9.7万单次100s.
 */
import { describe, it, expect } from "vitest";
import { shouldMapReduce } from "../src/services/mapreduceStrategy";
import type { Attachment } from "../src/types/moa";

function att(id: string, chars: number): Attachment {
  return {
    id,
    name: `${id}.txt`,
    text: "x".repeat(chars),
    chars,
    source: "txt",
    truncated: false,
  };
}

const MAX = 200000; // 200K context cap → char threshold = 200K × 0.4 = 80K
const RATIO = 0.4;
const DOC_THRESH = 4;

describe("shouldMapReduce (auto, 双条件)", () => {
  it("single doc never triggers", () => {
    expect(shouldMapReduce([att("a", 50000)], MAX, RATIO, "auto", DOC_THRESH).enabled).toBe(false);
    // even a huge single doc stays single-pass (no parallelism gain with 1 doc)
    expect(shouldMapReduce([att("a", 150000)], MAX, RATIO, "auto", DOC_THRESH).enabled).toBe(false);
  });

  it("3 docs under char threshold → disabled (single-pass)", () => {
    // 3 docs × 20K = 60K < 80K threshold, and 3 < 4 doc threshold
    const res = shouldMapReduce(
      [att("a", 20000), att("b", 20000), att("c", 20000)],
      MAX, RATIO, "auto", DOC_THRESH
    );
    expect(res.enabled).toBe(false);
  });

  it("4 docs → enabled (doc count ≥ threshold)", () => {
    // 4 docs × 10K = 40K < 80K char threshold, but 4 ≥ 4 doc threshold
    const res = shouldMapReduce(
      [att("a", 10000), att("b", 10000), att("c", 10000), att("d", 10000)],
      MAX, RATIO, "auto", DOC_THRESH
    );
    expect(res.enabled).toBe(true);
  });

  it("3 docs over char threshold → enabled (chars > 8万)", () => {
    // 3 docs × 30K = 90K > 80K char threshold, but 3 < 4 doc threshold
    const res = shouldMapReduce(
      [att("a", 30000), att("b", 30000), att("c", 30000)],
      MAX, RATIO, "auto", DOC_THRESH
    );
    expect(res.enabled).toBe(true);
  });

  it("2 docs small → disabled", () => {
    expect(
      shouldMapReduce([att("a", 5000), att("b", 5000)], MAX, RATIO, "auto", DOC_THRESH).enabled
    ).toBe(false);
  });
});

describe("shouldMapReduce (force modes)", () => {
  it("always triggers regardless of size", () => {
    expect(shouldMapReduce([att("a", 100)], MAX, RATIO, "always", DOC_THRESH).enabled).toBe(true);
  });

  it("never triggers regardless of size", () => {
    const docs = Array.from({ length: 20 }, (_, i) => att(`d${i}`, 50000));
    expect(shouldMapReduce(docs, MAX, RATIO, "never", DOC_THRESH).enabled).toBe(false);
  });
});

describe("shouldMapReduce (metadata)", () => {
  it("flags oversized attachments", () => {
    const big = att("big", MAX + 10000);
    const res = shouldMapReduce([big, att("small", 1000)], MAX, RATIO, "auto", DOC_THRESH);
    expect(res.oversized).toHaveLength(1);
    expect(res.oversized[0].id).toBe("big");
  });

  it("reports totalChars", () => {
    const res = shouldMapReduce([att("a", 1000), att("b", 2500)], MAX, RATIO, "auto", DOC_THRESH);
    expect(res.totalChars).toBe(3500);
  });

  it("reason is non-empty", () => {
    const res = shouldMapReduce([att("a", 1000)], MAX, RATIO, "auto", DOC_THRESH);
    expect(res.reason.length).toBeGreaterThan(0);
  });

  it("custom docCountThreshold respected", () => {
    // 2 docs, but threshold lowered to 2 → triggers by doc count
    const res = shouldMapReduce([att("a", 1000), att("b", 1000)], MAX, RATIO, "auto", 2);
    expect(res.enabled).toBe(true);
  });
});
