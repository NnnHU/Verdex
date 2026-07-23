/**
 * Verdex — unit tests for the Map-Reduce trigger strategy (Stage 4).
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

const MAX = 200000; // 200K chars context cap

describe("shouldMapReduce", () => {
  it("disabled for a single document in auto mode", () => {
    const res = shouldMapReduce([att("a", 50000)], MAX, 0.6, "auto");
    expect(res.enabled).toBe(false);
  });

  it("disabled when total chars under threshold in auto mode", () => {
    // 3 docs × 20K = 60K, threshold = 200K × 0.6 = 120K → under.
    const res = shouldMapReduce([att("a", 20000), att("b", 20000), att("c", 20000)], MAX, 0.6, "auto");
    expect(res.enabled).toBe(false);
  });

  it("enabled when total chars exceed threshold in auto mode", () => {
    // 7 docs × 15K = 105K still under 120K → bump to exceed.
    const docs = Array.from({ length: 10 }, (_, i) => att(`d${i}`, 15000));
    // 150K < 120K? No, 150K > 120K → enabled.
    const res = shouldMapReduce(docs, MAX, 0.6, "auto");
    expect(res.enabled).toBe(true);
  });

  it("enabled regardless of size when force=always", () => {
    const res = shouldMapReduce([att("a", 100)], MAX, 0.6, "always");
    expect(res.enabled).toBe(true);
  });

  it("disabled regardless of size when force=never", () => {
    const docs = Array.from({ length: 20 }, (_, i) => att(`d${i}`, 50000));
    const res = shouldMapReduce(docs, MAX, 0.6, "never");
    expect(res.enabled).toBe(false);
  });

  it("always wins over never when both could apply (always takes precedence by order)", () => {
    // force is a single value; "always" forces enabled even for tiny corpus.
    expect(shouldMapReduce([att("a", 10)], MAX, 0.6, "always").enabled).toBe(true);
  });

  it("flags oversized attachments (single doc larger than context cap)", () => {
    const big = att("big", MAX + 10000);
    const res = shouldMapReduce([big, att("small", 1000)], MAX, 0.6, "auto");
    expect(res.oversized).toHaveLength(1);
    expect(res.oversized[0].id).toBe("big");
  });

  it("reports totalChars correctly", () => {
    const res = shouldMapReduce([att("a", 1000), att("b", 2500)], MAX, 0.6, "auto");
    expect(res.totalChars).toBe(3500);
  });

  it("reason string is non-empty", () => {
    const res = shouldMapReduce([att("a", 1000)], MAX, 0.6, "auto");
    expect(res.reason.length).toBeGreaterThan(0);
  });
});
