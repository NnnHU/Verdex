/**
 * Verdex — Asset Recommender (Stage 4: AI Suggestions).
 *
 * Recommends relevant Knowledge Assets based on a user's query.
 * First version: keyword matching (no model call — fast, free, offline).
 * Future: upgrade to semantic similarity via model.
 */

import type { KnowledgeAsset } from "../types/moa";

export interface AssetRecommendation {
  asset: KnowledgeAsset;
  score: number;       // higher = more relevant
  matchedKeywords: string[];  // which keywords triggered the match
}

/**
 * Extract meaningful keywords from a query string.
 * Splits on spaces/punctuation, filters out stopwords, keeps 2+ char tokens.
 */
function extractKeywords(query: string): string[] {
  const stopwords = new Set([
    // English
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "how", "what", "why", "when", "where", "who", "which", "do", "does",
    "did", "can", "could", "should", "would", "will", "shall", "may", "might",
    "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by",
    "from", "about", "into", "through", "during", "this", "that", "these",
    "those", "i", "you", "he", "she", "it", "we", "they", "me", "him",
    // Chinese particles (2 chars)
    "什么", "怎么", "为什么", "如何", "是否", "可以", "能够", "以及", "或者",
    "这个", "那个", "我们", "你们", "他们", "一个", "这种", "那种",
  ]);

  // Split on non-word chars (keeps CJK chars together since they're word chars in \w with unicode)
  const tokens = query
    .toLowerCase()
    .split(/[^\w\u4e00-\u9fff]+/)
    .filter((t) => t.length >= 2 && !stopwords.has(t));

  // Also extract 2-char CJK bigrams for better matching
  const cjkBigrams: string[] = [];
  const cjkChars = query.match(/[\u4e00-\u9fff]+/g);
  if (cjkChars) {
    for (const segment of cjkChars) {
      for (let i = 0; i < segment.length - 1; i++) {
        const bg = segment.slice(i, i + 2);
        if (!stopwords.has(bg)) cjkBigrams.push(bg.toLowerCase());
      }
    }
  }

  return [...new Set([...tokens, ...cjkBigrams])];
}

/**
 * Recommend assets relevant to the given query.
 * Scores by counting keyword matches in asset fields.
 *
 * @param query   The user's question/prompt.
 * @param assets  All knowledge assets.
 * @param limit   Max recommendations (default 3).
 * @returns Sorted recommendations (best first).
 */
export function recommendAssets(
  query: string,
  assets: KnowledgeAsset[],
  limit: number = 3
): AssetRecommendation[] {
  const keywords = extractKeywords(query);
  if (keywords.length === 0 || assets.length === 0) return [];

  const results: AssetRecommendation[] = [];

  for (const asset of assets) {
    // Build the searchable text from asset fields.
    const haystack = [
      asset.name,
      asset.description,
      asset.consensus,
      asset.divergences,
      asset.verdict,
      ...(asset.tags ?? []),
    ].join(" ").toLowerCase();

    const matched: string[] = [];
    let score = 0;

    for (const kw of keywords) {
      if (haystack.includes(kw)) {
        matched.push(kw);
        score += 1;
        // Bonus: keyword in name (most important field)
        if (asset.name.toLowerCase().includes(kw)) score += 2;
        // Bonus: keyword in description
        if (asset.description.toLowerCase().includes(kw)) score += 1;
      }
    }

    if (score > 0) {
      results.push({ asset, score, matchedKeywords: matched });
    }
  }

  // Sort by score descending, take top N.
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
