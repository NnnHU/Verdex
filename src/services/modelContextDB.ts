/**
 * Verdex — Built-in model context window database.
 *
 * A curated map of common modelString patterns → context window in characters
 * (~4 chars ≈ 1 token, so 128K tokens ≈ 512K chars).
 *
 * Used during "Test connection" to auto-fill the context window field when
 * the API endpoint doesn't expose a /models endpoint. If the API does return
 * context_length (OpenRouter, Groq), that takes priority over this database.
 *
 * Sources: official vendor docs (OpenAI, Anthropic, DeepSeek, Google, Meta,
 * Alibaba, Mistral, Kimi) as of mid-2026.
 */

/** Pattern → context window in characters. Keys are matched as substring. */
const MODEL_CONTEXT_CHARS: Record<string, number> = {
  // --- OpenAI ---
  "gpt-4o": 256_000,
  "gpt-4-turbo": 256_000,
  "gpt-4.1": 1_048_576,
  "gpt-4.5": 256_000,
  "gpt-5": 1_048_576,
  "o1": 400_000,
  "o3": 400_000,
  "o4-mini": 400_000,
  "gpt-oss-120b": 256_000,
  "gpt-oss-20b": 256_000,

  // --- Anthropic ---
  "claude-3-5-sonnet": 200_000,
  "claude-3-5-haiku": 200_000,
  "claude-3-opus": 200_000,
  "claude-sonnet-4": 200_000,
  "claude-opus-4": 200_000,
  "claude-haiku": 200_000,

  // --- DeepSeek ---
  "deepseek-chat": 512_000,
  "deepseek-reasoner": 512_000,
  "deepseek-v4": 4_000_000,
  "deepseek-v3": 512_000,
  "deepseek-r1": 512_000,

  // --- Qwen ---
  "qwen-plus": 655_360,
  "qwen-max": 655_360,
  "qwen-turbo": 655_360,
  "qwen2.5": 655_360,
  "qwen3": 655_360,

  // --- Llama (Groq / Meta) ---
  "llama-3.3-70b": 256_000,
  "llama-3.1-405b": 256_000,
  "llama-3.1-70b": 256_000,
  "llama-3.1-8b": 256_000,
  "llama-4": 4_000_000,
  "llama-3": 128_000,

  // --- Mistral ---
  "mistral-large": 256_000,
  "mistral-7b": 128_000,
  "mixtral": 128_000,

  // --- Google Gemini ---
  "gemini-1.5-pro": 4_000_000,
  "gemini-1.5-flash": 4_000_000,
  "gemini-2": 4_000_000,
  "gemini-3": 4_000_000,

  // --- Kimi / Moonshot ---
  "kimi-k2": 512_000,
  "moonshot": 128_000,

  // --- GLM / Zhipu ---
  "glm-4": 128_000,
  "chatglm": 128_000,

  // --- Grok ---
  "grok-4": 256_000,
  "grok-3": 1_048_576,
  "grok-2": 128_000,

  // --- NVIDIA ---
  "nvidia/llama": 256_000,
  "nvidia/mistral": 256_000,
};

/**
 * Look up a model's context window in characters by substring matching the
 * modelString against the built-in database. Returns undefined if no match.
 *
 * Matching is case-insensitive and checks the longest matching key first
 * (so "deepseek-v4-flash" matches "deepseek-v4" before "deepseek-chat").
 */
export function lookupContextChars(modelString: string): number | undefined {
  const lower = modelString.toLowerCase();

  // Sort keys by length descending so the most specific match wins.
  const keys = Object.keys(MODEL_CONTEXT_CHARS).sort(
    (a, b) => b.length - a.length
  );

  for (const key of keys) {
    if (lower.includes(key)) {
      return MODEL_CONTEXT_CHARS[key];
    }
  }

  return undefined;
}

/**
 * Convert token count to approximate character count (~4 chars per token).
 */
export function tokensToChars(tokens: number): number {
  return tokens * 4;
}

