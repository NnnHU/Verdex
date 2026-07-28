/**
 * Verdex — Asset Classifier (Stage 3: Knowledge Vault).
 *
 * Uses a model call to auto-classify a Knowledge Asset into categories.
 * Matches against existing categories; creates new ones when no match.
 * Best-effort: on failure, returns empty (asset stays "uncategorized").
 */

import { streamChat } from "./httpClient";
import type { AIProvider, AssetCategory, KnowledgeAsset } from "../types/moa";

/**
 * Classify an asset into existing or new categories.
 *
 * @param asset     The asset to classify.
 * @param existing  Current categories (for matching).
 * @param provider  Model to use.
 * @param timeoutMs Per-call timeout.
 * @returns Category names (may include new ones not in `existing`).
 */
export async function classifyAsset(
  asset: KnowledgeAsset,
  existing: AssetCategory[],
  provider: AIProvider,
  timeoutMs: number
): Promise<string[]> {
  const existingNames = existing.map((c) => c.name).join(", ") || "(none)";
  const content = [
    `Asset name: ${asset.name}`,
    `Description: ${asset.description}`,
    `Consensus (first 200 chars): ${asset.consensus.slice(0, 200)}`,
  ].join("\n");

  const sysPrompt = [
    "You are a knowledge asset classifier. Given an asset's info, output 1-3 category names that best describe it.",
    `Existing categories: ${existingNames}`,
    "Rules:",
    "- Match existing category names when appropriate (use the exact name).",
    "- If no existing category fits, invent a concise new category name (1-3 words).",
    "- Output ONLY comma-separated category names, nothing else.",
    "- Example output: 投资, 市场分析",
  ].join("\n");

  try {
    const raw = await streamChat(
      {
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.modelString,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content },
        ],
        temperature: 0.2,
        maxTokens: 100,
        timeoutMs,
        protocol: provider.protocol,
      },
      () => undefined
    );
    const names = raw
      .split(/[,，\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 30)
      .slice(0, 3);
    return names;
  } catch {
    return [];
  }
}

/**
 * Resolve raw category names into AssetCategory objects.
 * Matches existing by name (case-insensitive); creates new ones for misses.
 *
 * @param names    Raw category names from classifyAsset.
 * @param existing Current categories.
 * @returns { matched: existing ids, newCategories: new AssetCategory[] }
 */
export function resolveCategories(
  names: string[],
  existing: AssetCategory[]
): { matchedIds: string[]; newCategories: AssetCategory[] } {
  const matchedIds: string[] = [];
  const newCategories: AssetCategory[] = [];

  for (const name of names) {
    const existingCat = existing.find(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    if (existingCat) {
      if (!matchedIds.includes(existingCat.id)) matchedIds.push(existingCat.id);
    } else {
      newCategories.push({
        id: crypto.randomUUID(),
        name,
        isAuto: true,
      });
    }
  }

  return { matchedIds, newCategories };
}
