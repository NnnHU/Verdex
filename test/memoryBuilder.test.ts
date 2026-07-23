/**
 * Verdex — unit tests for the multi-turn memory builder (Stage 1a).
 *
 * Covers history reconstruction (per-provider filtering, user/assistant
 * alternation, sliding window) and the ratio-based trim. These are pure
 * functions; no model calls.
 */
import { describe, it, expect } from "vitest";
import { buildHistory, trimHistoryByRatio } from "../src/services/memoryBuilder";
import type { ChatSession, Turn } from "../src/types/moa";

/* ------------------------------- helpers ------------------------------- */

/** Build a Turn where provider `pid` answered `ans` to prompt `q`. */
function turn(id: string, q: string, pid: string, ans: string): Turn {
  return {
    id,
    prompt: q,
    createdAt: 0,
    panels: [{ providerId: pid, label: pid, model: "m", status: "done", rawText: ans }],
    judges: [{ judgeId: pid, label: pid, status: "done", raw: ans, response: null }],
  };
}

function session(turns: Turn[]): ChatSession {
  return {
    sessionId: "s1",
    title: "t",
    createdAt: 0,
    config: {
      mode: "simple",
      panelIds: [],
      panelRoles: {},
      judgeIds: [],
      judgeStrategy: "single",
      judgePromptId: null,
      collisionJudgePromptIds: [],
      memoryEnabled: true,
    },
    messages: turns,
  };
}

/* ------------------------------- buildHistory ------------------------------- */

describe("buildHistory", () => {
  it("returns empty for a provider that never participated", () => {
    const s = session([turn("t1", "q1", "A", "a1")]);
    expect(buildHistory(s, "B", false, 10)).toEqual([]);
  });

  it("returns empty for a provider whose answer was empty", () => {
    const s = session([turn("t1", "q1", "A", "   ")]);
    expect(buildHistory(s, "A", false, 10)).toEqual([]);
  });

  it("builds alternating user/assistant for a panel", () => {
    const s = session([
      turn("t1", "q1", "A", "a1"),
      turn("t2", "q2", "A", "a2"),
    ]);
    expect(buildHistory(s, "A", false, 10)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
    ]);
  });

  it("reads from judges[].raw when isJudge=true", () => {
    const s = session([turn("t1", "q1", "J", "verdict1")]);
    expect(buildHistory(s, "J", true, 10)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "verdict1" },
    ]);
  });

  it("only includes turns where THIS provider participated (isolation)", () => {
    const s = session([
      turn("t1", "q1", "A", "a1"),
      turn("t2", "q2", "B", "b2"), // different provider
      turn("t3", "q3", "A", "a3"),
    ]);
    // A sees only t1 and t3, not t2.
    expect(buildHistory(s, "A", false, 10)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q3" },
      { role: "assistant", content: "a3" },
    ]);
  });

  it("applies the sliding window: keeps only the most recent N turns", () => {
    const s = session([
      turn("t1", "q1", "A", "a1"),
      turn("t2", "q2", "A", "a2"),
      turn("t3", "q3", "A", "a3"),
    ]);
    // recentTurns=1 → only the last turn.
    expect(buildHistory(s, "A", false, 1)).toEqual([
      { role: "user", content: "q3" },
      { role: "assistant", content: "a3" },
    ]);
  });
});

/* ------------------------------- trimHistoryByRatio ------------------------------- */

describe("trimHistoryByRatio", () => {
  const hist = [
    { role: "user", content: "q1" },
    { role: "assistant", content: "a1" },
    { role: "user", content: "q2" },
    { role: "assistant", content: "a2" },
  ];

  it("returns the full history when under budget", () => {
    const res = trimHistoryByRatio(hist, "prompt", 10000, 0.75);
    expect(res.dropped).toBe(0);
    expect(res.history).toHaveLength(4);
  });

  it("drops oldest pairs until under budget", () => {
    // budget = 100 * 0.75 = 75 chars; total content "q1a1q2a2prompt" = 14 chars → under.
    // Force a trim with a tiny budget.
    const res = trimHistoryByRatio(hist, "prompt", 10, 0.75);
    // budget = 7.5 → 7. "q2a2prompt" = 9 > 7, so t1 pair dropped; then "q2a2prompt" still 9 > 7
    // → t2 pair dropped → empty.
    expect(res.history).toHaveLength(0);
    expect(res.dropped).toBe(4);
  });

  it("drops one pair and stops when the remainder fits", () => {
    // Build history where dropping the first pair makes it fit.
    const big = [
      { role: "user", content: "x".repeat(50) },
      { role: "assistant", content: "y".repeat(50) },
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
    ];
    // budget = 200 * 0.75 = 150. Full = 50+50+1+1+prompt(5) = 107 < 150 → no trim.
    expect(trimHistoryByRatio(big, "ppp", 200, 0.75).dropped).toBe(0);
    // budget = 110 * 0.75 = 82. Full 107 > 82 → drop first pair (100 chars)
    // → remaining 1+1+5=7 < 82. dropped=2.
    const res = trimHistoryByRatio(big, "ppp", 110, 0.75);
    expect(res.dropped).toBe(2);
    expect(res.history).toEqual([
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
    ]);
  });

  it("handles empty history", () => {
    const res = trimHistoryByRatio([], "prompt", 100, 0.75);
    expect(res.history).toEqual([]);
    expect(res.dropped).toBe(0);
    expect(res.chars).toBe(0);
  });
});
