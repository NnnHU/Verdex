/**
 * Verdex — unit tests for the engine's pure functions.
 *
 * Covers the input circuit breaker (checkInputLimits) and the judge JSON
 * parser (parseJudgeResponse). These are the two pieces of engine logic most
 * likely to silently regress and hardest to exercise through the live UI.
 */
import { describe, it, expect } from "vitest";
import {
  checkInputLimits,
  parseJudgeResponse,
  PROMPT_CHAR_LIMIT,
  CONTEXT_CHAR_LIMIT,
} from "../src/services/moaEngine";

/* ----------------------------- checkInputLimits ----------------------------- */

describe("checkInputLimits", () => {
  it("passes for an empty prompt and empty history", () => {
    expect(checkInputLimits("", "")).toEqual({ ok: true });
  });

  it("passes for a prompt well under the limit", () => {
    expect(checkInputLimits("a".repeat(100), "")).toEqual({ ok: true });
  });

  it("rejects a prompt exactly at the limit + 1", () => {
    const over = "a".repeat(PROMPT_CHAR_LIMIT + 1);
    const res = checkInputLimits(over, "");
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/too long/i);
    expect(res.reason).toContain((PROMPT_CHAR_LIMIT + 1).toLocaleString());
  });

  it("accepts a prompt exactly at the limit", () => {
    const at = "a".repeat(PROMPT_CHAR_LIMIT);
    expect(checkInputLimits(at, "").ok).toBe(true);
  });

  it("rejects when prompt + history exceed the context limit", () => {
    // Prompt alone is fine, but combined history pushes over the context cap.
    const history = "x".repeat(CONTEXT_CHAR_LIMIT);
    const res = checkInputLimits("hello", history);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/too long/i);
    expect(res.reason).toMatch(/new session/i);
  });

  it("accepts when prompt + history exactly equal the context limit", () => {
    const prompt = "a".repeat(100);
    const history = "b".repeat(CONTEXT_CHAR_LIMIT - 100);
    expect(checkInputLimits(prompt, history).ok).toBe(true);
  });

  it("reports a numeric reason that reflects combined length", () => {
    const history = "y".repeat(CONTEXT_CHAR_LIMIT - 10);
    const res = checkInputLimits("z".repeat(20), history);
    expect(res.ok).toBe(false);
    // Combined length is CONTEXT_CHAR_LIMIT + 10.
    expect(res.reason).toContain((CONTEXT_CHAR_LIMIT + 10).toLocaleString());
  });
});

/* ----------------------------- parseJudgeResponse --------------------------- */

describe("parseJudgeResponse", () => {
  it("parses a clean JSON object with all four fields", () => {
    const raw = JSON.stringify({
      consensus: "共识A",
      divergence: "分歧B",
      blindspots: "盲点C",
      verdict: "裁决D",
    });
    const res = parseJudgeResponse(raw);
    expect(res).toEqual({
      consensus: "共识A",
      divergence: "分歧B",
      blindspots: "盲点C",
      verdict: "裁决D",
    });
  });

  it("strips ```json code fences before parsing", () => {
    const raw = '```json\n{"consensus":"c","divergence":"d","blindspots":"b","verdict":"v"}\n```';
    const res = parseJudgeResponse(raw);
    expect(res.consensus).toBe("c");
    expect(res.verdict).toBe("v");
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const raw =
      "好的，这是我的综合：\n{\"consensus\":\"x\",\"divergence\":\"y\",\"blindspots\":\"z\",\"verdict\":\"w\"}\n以上。";
    const res = parseJudgeResponse(raw);
    expect(res.consensus).toBe("x");
    expect(res.verdict).toBe("w");
  });

  it("trims whitespace from each field", () => {
    // Use JSON.stringify so embedded whitespace/control chars are validly escaped.
    const raw = JSON.stringify({
      consensus: "  spaced  ",
      divergence: "\td\n",
      blindspots: "b",
      verdict: "v",
    });
    const res = parseJudgeResponse(raw);
    expect(res.consensus).toBe("spaced");
    expect(res.divergence).toBe("d");
  });

  it("joins array-valued fields into a string", () => {
    const raw =
      '{"consensus":["a","b"],"divergence":"d","blindspots":"b","verdict":"v"}';
    const res = parseJudgeResponse(raw);
    expect(res.consensus).toBe("a；b");
  });

  it("falls back gracefully on missing fields (keeps structure complete)", () => {
    const raw = '{"verdict":"only verdict"}';
    const res = parseJudgeResponse(raw);
    expect(res.consensus).toMatch(/missing/i);
    expect(res.verdict).toBe("only verdict");
    // All four keys always present — UI never crashes on render.
    expect(res).toHaveProperty("divergence");
    expect(res).toHaveProperty("blindspots");
  });

  it("falls back completely on garbage input (no braces)", () => {
    const res = parseJudgeResponse("totally not json at all");
    expect(res.consensus).toMatch(/could not parse/i);
    // Verdict should carry a snippet of the raw text.
    expect(res.verdict).toContain("totally not json at all");
  });

  it("falls back on empty input", () => {
    const res = parseJudgeResponse("");
    expect(res.consensus).toMatch(/could not parse/i);
    expect(res.verdict).toMatch(/no content/i);
  });

  it("falls back on malformed JSON inside braces", () => {
    const res = parseJudgeResponse("{not valid json}");
    expect(res.consensus).toMatch(/could not parse/i);
  });

  it("truncates very long fallback verdicts to 1000 chars", () => {
    const long = "x".repeat(5000);
    const res = parseJudgeResponse(long);
    expect(res.verdict.length).toBeLessThanOrEqual(1000);
  });
});
