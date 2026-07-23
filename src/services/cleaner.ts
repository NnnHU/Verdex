/**
 * Verdex — ASR text cleaner (Stage 5 data cleaning).
 *
 * Cleans speech-to-text (ASR) noise in attachments: entity normalization
 * (e.g. "格蘭色母"/"格蘭姆" → "格兰瑟姆"), number fixes (208 → 2008), obvious
 * mis-transcriptions. Uses a model call (best-effort, never blocks on failure).
 *
 * Triggered at attachment-load time when session.config.cleanAttachments is on
 * (default off — only for noisy ASR data). Result stored as
 * attachment.cleanedText and used in place of the original thereafter.
 */

import { streamChat } from "./httpClient";
import i18n from "../i18n";
import type { AIProvider } from "../types/moa";

/** Build the cleaning system prompt (localized). */
function cleanSystemPrompt(): string {
  const zh = i18n.language === "zh";
  return zh
    ? [
        "你是语音转文字(ASR)文本清洗器。修正常见的语音识别错误,只做以下几类修正:",
        "1. 实体名归一化: 同一人名/地名/机构名的不同误写统一成正确写法(如'格蘭色母'/'格蘭姆'→'格兰瑟姆')",
        "2. 数字修正: 明显的数字识别错误(如'208年金融危機'→'2008年金融危机')",
        "3. 明显错别字: 同音/近音导致的明显错误",
        "",
        "严格要求:",
        "- 只修正错误,不要改写句意、不要增删信息、不要润色",
        "- 不确定的不要改,保留原文",
        "- 保持原文的段落结构和口语风格",
        "- 直接输出清洗后的全文,不要加任何说明",
      ].join("\n")
    : [
        "You are an ASR (speech-to-text) text cleaner. Fix common recognition errors, only these categories:",
        "1. Entity normalization: unify different mis-transcriptions of the same name/entity",
        "2. Number fixes: obvious digit recognition errors",
        "3. Obvious typos from homophones",
        "",
        "Strict rules:",
        "- Only fix errors; do not rewrite meaning, add/remove info, or polish",
        "- If unsure, keep the original",
        "- Preserve paragraph structure and conversational tone",
        "- Output the cleaned full text directly, no explanation",
      ].join("\n");
}

/**
 * Clean one attachment's text via a model call.
 *
 * @param text       The original (noisy) text.
 * @param provider   Model to use for cleaning.
 * @param timeoutMs  Per-call timeout.
 * @returns Cleaned text. On failure, returns the original text (best-effort).
 */
export async function cleanText(
  text: string,
  provider: AIProvider,
  timeoutMs: number
): Promise<string> {
  if (!text.trim()) return text;
  try {
    const cleaned = await streamChat(
      {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.modelString,
        messages: [
          { role: "system", content: cleanSystemPrompt() },
          { role: "user", content: text },
        ],
        temperature: 0.1,
        maxTokens: Math.max(2048, Math.ceil(text.length / 2)),
        timeoutMs,
        protocol: provider.protocol,
      },
      () => undefined
    );
    // Only accept the cleaned text if it's substantially non-empty and not
    // drastically shorter (which would indicate the model summarized instead
    // of cleaning). Otherwise fall back to original.
    const trimmed = cleaned.trim();
    if (trimmed.length < text.length * 0.5) return text;
    return trimmed || text;
  } catch {
    // Cleaning is best-effort: never block the main flow.
    return text;
  }
}
