/**
 * Verdex — conversation summarizer (Stage 1b hierarchical memory).
 *
 * Compresses early conversation history into a structured summary (con.txt
 * four categories: key facts / user prefs / todos / context), so long
 * conversations retain early context without unbounded context growth.
 *
 * The summary is session-level (shared across all providers) and persisted on
 * the session (session.summary / session.summaryUpTo). It is injected as a
 * leading system message before each provider's recent-window history.
 *
 * Uses streamChat directly (no streaming UI — summarization is best-effort and
 * must never block the main flow; on failure it returns the existing summary).
 */

import { streamChat } from "./httpClient";
import i18n from "../i18n";
import type { AIProvider, ChatMessage, Turn } from "../types/moa";

/** Build the four-category summarization system prompt (localized). */
function summarizeSystemPrompt(existingSummary?: string): string {
  const zh = i18n.language === "zh";
  const base = zh
    ? [
        "你是对话压缩器。把下面这段早期对话压缩成结构化摘要,只保留四类信息:",
        "1. 关键事实(讨论的数据/决策/约束条件)",
        "2. 用户偏好(风格/格式/深度要求)",
        "3. 待办/未决事项",
        "4. 关系上下文(角色设定/项目背景)",
        "",
        "用简洁的要点形式,不要复述全部对话。保留所有关键信息,丢弃寒暄和重复。",
      ].join("\n")
    : [
        "You are a conversation compressor. Compress the early conversation below into a structured summary, keeping only four categories:",
        "1. Key facts (data/decisions/constraints discussed)",
        "2. User preferences (style/format/depth requirements)",
        "3. Todos / open items",
        "4. Context (roles / project background)",
        "",
        "Use concise bullet points. Do not reproduce the full conversation. Keep all key info, drop pleasantries and repetition.",
      ].join("\n");
  if (existingSummary && existingSummary.trim()) {
    const mergeLine = zh
      ? `\n\n【已有摘要】(在此基础上增量合并,不要丢失已有要点):\n${existingSummary}`
      : `\n\n【Existing summary】(merge incrementally on top of this; do not lose existing points):\n${existingSummary}`;
    return base + mergeLine;
  }
  return base;
}

/** Render early turns as a flat transcript for the summarizer to compress. */
function renderTranscript(turns: Turn[]): string {
  const zh = i18n.language === "zh";
  const userLabel = zh ? "用户" : "User";
  const asstLabel = zh ? "回答" : "Answer";
  return turns
    .map((t) => {
      const userBlock = `${userLabel}: ${t.prompt}`;
      // Pick the first panel/judge answer as representative for the transcript.
      const ans =
        t.panels.find((p) => p.rawText?.trim())?.rawText ??
        t.judges.find((j) => j.raw?.trim())?.raw ??
        "";
      const asstBlock = ans.trim() ? `${asstLabel}: ${ans.trim().slice(0, 2000)}` : "";
      return asstBlock ? `${userBlock}\n${asstBlock}` : userBlock;
    })
    .join("\n\n");
}

/**
 * Summarize a slice of early turns into a structured summary.
 *
 * @param earlyTurns      The turns to compress (already outside the recent window).
 * @param existingSummary Prior summary to merge into (incremental), if any.
 * @param provider        Model to use for summarization.
 * @param timeoutMs       Per-call timeout.
 * @returns The new summary text. On failure, returns existingSummary ?? "".
 */
export async function summarizeHistory(
  earlyTurns: Turn[],
  existingSummary: string | undefined,
  provider: AIProvider,
  timeoutMs: number
): Promise<string> {
  if (earlyTurns.length === 0) return existingSummary ?? "";
  const zh = i18n.language === "zh";
  const transcript = renderTranscript(earlyTurns);
  if (!transcript.trim()) return existingSummary ?? "";

  const messages: ChatMessage[] = [
    { role: "system", content: summarizeSystemPrompt(existingSummary) },
    {
      role: "user",
      content: zh
        ? `【待压缩的早期对话】\n${transcript}\n\n请输出压缩后的结构化摘要。`
        : `【Early conversation to compress】\n${transcript}\n\nOutput the compressed structured summary.`,
    },
  ];

  try {
    const summary = await streamChat(
      {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.modelString,
        messages,
        temperature: 0.2,
        maxTokens: 1024,
        timeoutMs,
        protocol: provider.protocol,
      },
      () => undefined // non-streaming; we only need the final text
    );
    return summary.trim() || (existingSummary ?? "");
  } catch {
    // Summarization is best-effort: never block the main synthesis.
    return existingSummary ?? "";
  }
}
