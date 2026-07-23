/**
 * Verdex — unit tests for the Map-Reduce trigger strategy (Stage 4).
 * REVISED 2026-07-24: 单次优先 (实测 V3 单次远快于 Map-Reduce).
 *   auto 触发条件: 总字符 > maxContextChars × triggerRatio (0.75) 或 单份超大.
 *   份数不再触发.
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

const MAX = 200000; // 200K context cap → char threshold = 200K × 0.75 = 150K
const RATIO = 0.75;

describe("shouldMapReduce (auto, 单次优先)", () => {
  it("small docs → disabled (single-pass)", () => {
    // 7 docs × 10K = 70K < 150K → single-pass (实测 V3 单次 47s 够快)
    const docs = Array.from({ length: 7 }, (_, i) => att(`d${i}`, 10000));
    expect(shouldMapReduce(docs, MAX, RATIO, "auto").enabled).toBe(false);
  });

  it("total chars over threshold → enabled", () => {
    // 16 docs × 10K = 160K > 150K → Map-Reduce
    const docs = Array.from({ length: 16 }, (_, i) => att(`d${i}`, 10000));
    expect(shouldMapReduce(docs, MAX, RATIO, "auto").enabled).toBe(true);
  });

  it("single oversized doc → enabled (can't fit in one call)", () => {
    // 1 doc but 250K > 200K cap → Map-Reduce (must chunk)
    expect(shouldMapReduce([att("big", 250000)], MAX, RATIO, "auto").enabled).toBe(true);
  });

  it("single normal doc → disabled", () => {
    expect(shouldMapReduce([att("a", 50000)], MAX, RATIO, "auto").enabled).toBe(false);
  });

  it("doc count alone does NOT trigger (revised: 份数不触发)", () => {
    // 20 docs × 1K = 20K < 150K → still single-pass even though 20 docs
    const docs = Array.from({ length: 20 }, (_, i) => att(`d${i}`, 1000));
    expect(shouldMapReduce(docs, MAX, RATIO, "auto").enabled).toBe(false);
  });

  it("3 big docs under threshold → disabled (实测 F: 9.7万单次 34s)", () => {
    // mirrors test combo F: 3 × ~32K = 96K < 150K
    expect(
      shouldMapReduce([att("a", 32000), att("b", 32000), att("c", 32000)], MAX, RATIO, "auto").enabled
    ).toBe(false);
  });
});

describe("shouldMapReduce (force modes)", () => {
  it("always triggers regardless", () => {
    expect(shouldMapReduce([att("a", 100)], MAX, RATIO, "always").enabled).toBe(true);
  });

  it("never triggers regardless", () => {
    const docs = Array.from({ length: 50 }, (_, i) => att(`d${i}`, 50000));
    expect(shouldMapReduce(docs, MAX, RATIO, "never").enabled).toBe(false);
  });
});

describe("shouldMapReduce (metadata)", () => {
  it("flags oversized attachments", () => {
    const big = att("big", MAX + 10000);
    const res = shouldMapReduce([big, att("small", 1000)], MAX, RATIO, "auto");
    expect(res.oversized).toHaveLength(1);
    expect(res.oversized[0].id).toBe("big");
  });

  it("reports totalChars", () => {
    const res = shouldMapReduce([att("a", 1000), att("b", 2500)], MAX, RATIO, "auto");
    expect(res.totalChars).toBe(3500);
  });

  it("reason is non-empty", () => {
    const res = shouldMapReduce([att("a", 1000)], MAX, RATIO, "auto");
    expect(res.reason.length).toBeGreaterThan(0);
  });
});
