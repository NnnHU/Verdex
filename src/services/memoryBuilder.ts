/**
 * Verdex — multi-turn memory builder (Stage 1a: sliding window).
 *
 * Pure functions that reconstruct per-provider conversation history from a
 * session's persisted Turn[], then apply a sliding-window trim. No model
 * calls here — that's Stage 1b (summary compression). These helpers are
 * side-effect-free and unit-testable.
 *
 * Design (per docs/ORCHESTRATION_ROADMAP.md §5 Stage 1 + con.txt):
 *   - Each Panel/Judge sees ONLY its own prior turns (independent memory).
 *   - Recent N turns are kept as raw user/assistant messages.
 *   - If (history + new prompt) chars exceed maxContextChars * trimRatio,
 *     the oldest turns are dropped until under budget (1b will replace this
 *     drop with a summary).
 */

import type { ChatMessage, ChatSession, Turn } from "../types/moa";

/* ------------------------------------------------------------------ *
 * History reconstruction
 * ------------------------------------------------------------------ */

/**
 * Reconstruct one provider's prior conversation as alternating
 * user/assistant messages, drawn only from turns where that provider
 * participated and returned content.
 *
 * For a Panel: assistant content = its rawText from that turn.
 * For a Judge: assistant content = its raw verdict text from that turn.
 *
 * @param session    The session owning the history.
 * @param providerId The panel providerId OR judge providerId to filter on.
 * @param isJudge    When true, read from turn.judges[].raw; else turn.panels[].rawText.
 * @param recentTurns Keep at most this many most-recent turns (sliding window).
 * @returns Ordered ChatMessage[] (oldest first), possibly empty.
 */
export function buildHistory(
  session: ChatSession,
  providerId: string,
  isJudge: boolean,
  recentTurns: number
): ChatMessage[] {
  const msgs: ChatMessage[] = [];

  // Collect turns where this provider participated with non-empty content.
  const usable: Turn[] = [];
  for (const turn of session.messages) {
    const assistantText = isJudge
      ? turn.judges.find((j) => j.judgeId === providerId)?.raw
      : turn.panels.find((p) => p.providerId === providerId)?.rawText;
    if (assistantText && assistantText.trim()) {
      usable.push(turn);
    }
  }

  // Sliding window: keep only the most recent `recentTurns`.
  const windowed =
    recentTurns > 0 && usable.length > recentTurns
      ? usable.slice(usable.length - recentTurns)
      : usable;

  for (const turn of windowed) {
    // User side: the prompt that started this turn.
    if (turn.prompt && turn.prompt.trim()) {
      msgs.push({ role: "user", content: turn.prompt });
    }
    // Assistant side: this provider's own prior answer.
    const assistantText = isJudge
      ? turn.judges.find((j) => j.judgeId === providerId)?.raw
      : turn.panels.find((p) => p.providerId === providerId)?.rawText;
    if (assistantText && assistantText.trim()) {
      msgs.push({ role: "assistant", content: assistantText });
    }
  }

  return msgs;
}

/* ------------------------------------------------------------------ *
 * Sliding-window trim (Stage 1a — drop oldest; 1b will summarize instead)
 * ------------------------------------------------------------------ */

/** Total character length of a ChatMessage[]. */
function historyChars(history: ChatMessage[]): number {
  return history.reduce((sum, m) => sum + m.content.length, 0);
}

export interface TrimResult {
  /** The trimmed history (may be shorter than input, never longer). */
  history: ChatMessage[];
  /** Number of messages dropped from the front. */
  dropped: number;
  /** Final character count of the returned history. */
  chars: number;
}

/**
 * Drop oldest messages (in user/assistant pairs to keep alternation valid)
 * until (history + prompt) chars fit under maxChars * trimRatio.
 *
 * Trims in pairs to avoid leaving a dangling assistant-first message that
 * some APIs reject. If even after dropping all history the budget is still
 * exceeded (huge prompt), returns [] — the circuit breaker in useMoa is the
 * real backstop for that case.
 *
 * @param history    Reconstructed history (oldest first).
 * @param prompt     The upcoming user prompt (counted toward the budget).
 * @param maxChars   Provider context cap in chars.
 * @param trimRatio  Fraction of maxChars that history+prompt must stay under.
 */
export function trimHistoryByRatio(
  history: ChatMessage[],
  prompt: string,
  maxChars: number,
  trimRatio: number
): TrimResult {
  const budget = Math.floor(maxChars * trimRatio);
  let working = history.slice();
  let dropped = 0;

  // Trim in pairs (user+assistant) to preserve valid alternation.
  while (working.length >= 2 && historyChars(working) + prompt.length > budget) {
    working = working.slice(2);
    dropped += 2;
  }

  // Edge case: a single trailing message still over budget — drop it too.
  if (working.length === 1 && historyChars(working) + prompt.length > budget) {
    working = working.slice(1);
    dropped += 1;
  }

  return { history: working, dropped, chars: historyChars(working) };
}
