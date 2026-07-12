/**
 * Verdex — unit tests for the Anthropic protocol adapter's pure transform.
 *
 * extractAnthropicSystem is the core of the native-Claude support: it pulls
 * system messages out into the top-level `system` param and guarantees the
 * resulting conversation starts with a user turn. This pins that contract.
 */
import { describe, it, expect } from "vitest";
import { extractAnthropicSystem } from "../src/services/httpClient";
import type { ChatMessage } from "../src/types/moa";

const u = (content: string): ChatMessage => ({ role: "user", content });
const a = (content: string): ChatMessage => ({ role: "assistant", content });
const s = (content: string): ChatMessage => ({ role: "system", content });

describe("extractAnthropicSystem", () => {
  it("extracts a single leading system message into `system`", () => {
    const out = extractAnthropicSystem([s("SYS"), u("hi")]);
    expect(out.system).toBe("SYS");
    expect(out.messages).toEqual([u("hi")]);
  });

  it("removes ALL system messages (not just the first)", () => {
    const out = extractAnthropicSystem([s("one"), u("hi"), s("two")]);
    expect(out.system).toBe("one\n\ntwo");
    expect(out.messages.every((m) => m.role !== "system")).toBe(true);
    expect(out.messages).toEqual([u("hi")]);
  });

  it("concatenates multiple system messages with double newlines", () => {
    const out = extractAnthropicSystem([s("rule A"), s("rule B"), u("q")]);
    expect(out.system).toBe("rule A\n\nrule B");
  });

  it("drops empty/whitespace system messages", () => {
    const out = extractAnthropicSystem([s("   "), s(""), u("q")]);
    expect(out.system).toBe("");
    expect(out.messages).toEqual([u("q")]);
  });

  it("returns empty system when there are no system messages", () => {
    const out = extractAnthropicSystem([u("q1"), a("a1"), u("q2")]);
    expect(out.system).toBe("");
    expect(out.messages).toEqual([u("q1"), a("a1"), u("q2")]);
  });

  it("injects a leading user turn when conversation starts with assistant", () => {
    // Anthropic rejects a messages[] that doesn't start with user.
    const out = extractAnthropicSystem([a("hello?")]);
    expect(out.messages[0].role).toBe("user");
    expect(out.messages.length).toBe(2);
    expect(out.messages[1]).toEqual(a("hello?"));
  });

  it("injects a leading user turn carrying the system content when only a system message was given", () => {
    const out = extractAnthropicSystem([s("be terse")]);
    expect(out.messages.length).toBe(1);
    expect(out.messages[0].role).toBe("user");
    expect(out.messages[0].content).toBe("be terse");
  });

  it("injects a default leading user turn when input is empty", () => {
    const out = extractAnthropicSystem([]);
    expect(out.messages.length).toBe(1);
    expect(out.messages[0].role).toBe("user");
    expect(out.messages[0].content.length).toBeGreaterThan(0);
  });

  it("preserves multi-turn user/assistant alternation", () => {
    const conv = [s("sys"), u("q1"), a("a1"), u("q2"), a("a2"), u("q3")];
    const out = extractAnthropicSystem(conv);
    expect(out.system).toBe("sys");
    expect(out.messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
      "user",
    ]);
  });
});
