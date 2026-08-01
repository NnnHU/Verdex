/**
 * Verdex — unit tests for Knowledge Asset packer (Stage 4).
 */
import { describe, it, expect } from "vitest";
import { packVerdictAsset, packExtractAsset, packFromTurn } from "../src/services/assetPacker";
import type { Turn } from "../src/types/moa";

function makeVerdictTurn(): Turn {
  return {
    id: "t1",
    prompt: "分析格兰瑟姆的投资模型",
    createdAt: Date.now(),
    panels: [{ providerId: "p1", label: "V3", model: "deepseek-v3", status: "done", rawText: "answer" }],
    judges: [{
      judgeId: "j1",
      label: "V3",
      status: "done",
      raw: '{"consensus":"均值回归","divergence":"AI泡沫分歧","blindspots":"职业风险","verdict":"逆向投资"}',
      response: {
        kind: "verdict",
        consensus: "均值回归是核心",
        divergence: "AI泡沫严重程度有分歧",
        blindspots: "职业风险常被忽略",
        verdict: "保持逆向投资策略",
      },
    }],
  };
}

describe("packVerdictAsset", () => {
  it("packs a verdict response into a KnowledgeAsset", () => {
    const asset = packVerdictAsset({
      query: "分析投资模型",
      response: {
        kind: "verdict",
        consensus: "共识A",
        divergence: "分歧B",
        blindspots: "盲点C",
        verdict: "裁决D",
      },
      taskType: "document_analysis",
      sources: ["doc1.txt", "doc2.txt"],
      panelModels: ["V3", "R1"],
      judgeModel: "V3",
    });
    expect(asset.id).toBeTruthy();
    expect(asset.consensus).toBe("共识A");
    expect(asset.divergences).toBe("分歧B");
    expect(asset.blindspots).toBe("盲点C");
    expect(asset.verdict).toBe("裁决D");
    expect(asset.sources).toEqual(["doc1.txt", "doc2.txt"]);
    expect(asset.originTaskType).toBe("document_analysis");
    expect(asset.description.length).toBeGreaterThan(0);
  });

  it("auto-generates name from query", () => {
    const asset = packVerdictAsset({
      query: "提取思维模型",
      response: { kind: "verdict", consensus: "c", divergence: "d", blindspots: "b", verdict: "v" },
      taskType: "quick_qa",
      sources: [],
      panelModels: [],
      judgeModel: "",
    });
    expect(asset.name).toContain("提取思维模型");
  });
});

describe("packExtractAsset", () => {
  it("packs structured data with summary", () => {
    const asset = packExtractAsset({
      query: "提取思维模型",
      data: { 思维模型: [{ 名称: "均值回归" }], 因果链: [] },
      taskType: "document_extract",
      sources: ["g1.txt"],
      panelModels: ["V3"],
      judgeModel: "V3",
    });
    expect(asset.structuredData).toEqual({ 思维模型: [{ 名称: "均值回归" }], 因果链: [] });
    expect(asset.consensus).toContain("思维模型");
    expect(asset.consensus).toContain("因果链");
  });

  it("detects a four-field verdict shape in extract data and populates verdict fields instead of joining them", () => {
    // Regression: when the extract schema is the "four-field verdict (extract)"
    // template, the model returns {consensus, divergence, blindspots, verdict}.
    // Previously the packer ran summarizeStructuredData over those 4 keys and
    // stuffed the same semicolon-joined blob into BOTH consensus and verdict,
    // losing the per-field content. It must now split them correctly.
    const asset = packExtractAsset({
      query: "分析投资模型",
      data: {
        consensus: "均值回归是核心",
        divergence: "AI泡沫程度有分歧",
        blindspots: "职业风险常被忽略",
        verdict: "保持逆向投资",
      },
      taskType: "document_extract",
      sources: ["g1.txt"],
      panelModels: ["V3", "R1"],
      judgeModel: "V3",
    });
    expect(asset.consensus).toBe("均值回归是核心");
    expect(asset.divergences).toBe("AI泡沫程度有分歧");
    expect(asset.blindspots).toBe("职业风险常被忽略");
    expect(asset.verdict).toBe("保持逆向投资");
    // Must NOT contain the joined blob.
    expect(asset.consensus).not.toContain("divergence");
    expect(asset.consensus).not.toContain("blindspots");
  });

  it("accepts the plural 'divergences' key as the four-field shape", () => {
    const asset = packExtractAsset({
      query: "q",
      data: {
        consensus: "c",
        divergences: "d",
        blindspots: "b",
        verdict: "v",
      },
      taskType: "document_extract",
      sources: [],
      panelModels: [],
      judgeModel: "",
    });
    expect(asset.divergences).toBe("d");
    expect(asset.consensus).toBe("c");
  });
});

describe("packFromTurn", () => {
  it("packs from a verdict turn", () => {
    const turn = makeVerdictTurn();
    const asset = packFromTurn({
      turn,
      taskType: "document_analysis",
      attachments: [],
      panelModels: ["V3"],
      judgeModel: "V3",
    });
    expect(asset).not.toBeNull();
    expect(asset!.consensus).toBe("均值回归是核心");
    expect(asset!.sourceQuery).toBe("分析格兰瑟姆的投资模型");
  });

  it("returns null for turn with no response", () => {
    const turn: Turn = {
      id: "t2", prompt: "q", createdAt: 0,
      panels: [], judges: [{ judgeId: "j", label: "J", status: "error", raw: "", response: null }],
    };
    const asset = packFromTurn({ turn, taskType: "quick_qa", panelModels: [], judgeModel: "" });
    expect(asset).toBeNull();
  });

  it("uses mergedResult for mapreduce turns", () => {
    const turn: Turn = {
      id: "t3", prompt: "提取模型", createdAt: 0,
      panels: [],
      judges: [],
      mapOutputs: [],
      mergedResult: { kind: "extract", data: { 结果: "test" } },
    };
    const asset = packFromTurn({ turn, taskType: "document_extract", panelModels: ["V3"], judgeModel: "V3" });
    expect(asset).not.toBeNull();
    expect(asset!.structuredData).toEqual({ 结果: "test" });
  });
});
