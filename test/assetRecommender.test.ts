/**
 * Verdex — unit tests for Asset Recommender (Stage 4).
 */
import { describe, it, expect } from "vitest";
import { recommendAssets, AssetRecommendation } from "../src/services/assetRecommender";
import type { KnowledgeAsset } from "../src/types/moa";

function makeAsset(id: string, name: string, consensus: string, description = ""): KnowledgeAsset {
  return {
    id, name, description: description || name, sourceQuery: name, createdAt: 0,
    consensus, divergences: "", blindspots: "", verdict: "", sources: [],
    originTaskType: "quick_qa", panelModels: [], judgeModel: "",
    categories: [],
  };
}

describe("recommendAssets", () => {
  const assets = [
    makeAsset("a1", "投资模型分析", "均值回归是核心规律，估值极端时反向操作"),
    makeAsset("a2", "AI泡沫评估", "AI资本开支激增但回报率下降，泡沫风险高"),
    makeAsset("a3", "天气分析", "天气预报的准确性和影响因素"),
  ];

  it("recommends assets matching query keywords", () => {
    const recs = recommendAssets("分析投资策略", assets);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].asset.id).toBe("a1"); // 投资 matches
  });

  it("scores name matches higher", () => {
    const recs = recommendAssets("AI泡沫", assets);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].asset.id).toBe("a2");
  });

  it("returns empty for no matches", () => {
    const recs = recommendAssets("量子物理", assets);
    expect(recs).toEqual([]);
  });

  it("returns empty for short queries (< 4 chars)", () => {
    const recs = recommendAssets("ab", assets);
    expect(recs).toEqual([]);
  });

  it("respects limit parameter", () => {
    const recs = recommendAssets("分析投资AI泡沫天气", assets, 2);
    expect(recs.length).toBeLessThanOrEqual(2);
  });

  it("matches CJK keywords", () => {
    const recs = recommendAssets("天气怎么样", assets);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].asset.id).toBe("a3");
  });

  it("handles empty assets array", () => {
    expect(recommendAssets("anything", [])).toEqual([]);
  });
});
