/**
 * Verdex — unit tests for Knowledge Asset exporters (Stage 4).
 */
import { describe, it, expect } from "vitest";
import { exportClaudeSkill, exportMarkdown, exportJson, exportVerdexNative, exportAsset } from "../src/services/exporters";
import type { KnowledgeAsset } from "../src/types/moa";

function makeAsset(): KnowledgeAsset {
  return {
    id: "test-asset-1",
    name: "格兰瑟姆投资模型",
    description: "多模型分析的投资策略知识资产",
    sourceQuery: "提取思维模型",
    createdAt: 1722144000000,
    consensus: "均值回归是核心规律",
    divergences: "AI泡沫严重程度有分歧",
    blindspots: "职业风险常被忽略",
    verdict: "保持逆向投资",
    structuredData: { 思维模型: [{ 名称: "均值回归" }] },
    sources: ["g1.txt", "g2.txt"],
    originTaskType: "document_analysis",
    panelModels: ["V3", "R1"],
    judgeModel: "V3",
  };
}

describe("exportClaudeSkill", () => {
  it("generates SKILL.md with frontmatter", () => {
    const result = exportClaudeSkill(makeAsset());
    expect(result.format).toBe("claude-skill");
    expect(result.filename).toBe("SKILL.md");
    expect(result.content).toContain("---");
    expect(result.content).toContain("name:");
    expect(result.content).toContain("description:");
    expect(result.content).toContain("格兰瑟姆投资模型");
    expect(result.content).toContain("## Consensus");
    expect(result.content).toContain("均值回归是核心规律");
  });

  it("includes extra files for structured data and sources", () => {
    const result = exportClaudeSkill(makeAsset());
    expect(result.extraFiles).toBeDefined();
    expect(result.extraFiles!.length).toBeGreaterThanOrEqual(1);
    const filenames = result.extraFiles!.map((f) => f.filename);
    expect(filenames).toContain("structured-data.md");
    expect(filenames).toContain("sources.md");
  });
});

describe("exportMarkdown", () => {
  it("generates readable Markdown", () => {
    const result = exportMarkdown(makeAsset());
    expect(result.format).toBe("markdown");
    expect(result.filename).toMatch(/\.md$/);
    expect(result.content).toContain("# 格兰瑟姆投资模型");
    expect(result.content).toContain("## Consensus");
    expect(result.content).toContain("## Divergences");
    expect(result.content).toContain("## Sources");
  });
});

describe("exportJson", () => {
  it("generates valid JSON", () => {
    const result = exportJson(makeAsset());
    expect(result.format).toBe("json");
    expect(result.filename).toMatch(/\.json$/);
    const parsed = JSON.parse(result.content);
    expect(parsed.id).toBe("test-asset-1");
    expect(parsed.consensus).toBe("均值回归是核心规律");
  });
});

describe("exportVerdexNative", () => {
  it("wraps asset with format identifier", () => {
    const result = exportVerdexNative(makeAsset());
    expect(result.format).toBe("verdex-native");
    const parsed = JSON.parse(result.content);
    expect(parsed.format).toBe("verdex-native");
    expect(parsed.version).toBe("1.0");
    expect(parsed.asset.id).toBe("test-asset-1");
  });
});

describe("exportAsset dispatch", () => {
  it("dispatches to correct exporter", () => {
    const asset = makeAsset();
    expect(exportAsset(asset, "claude-skill").filename).toBe("SKILL.md");
    expect(exportAsset(asset, "markdown").filename).toMatch(/\.md$/);
    expect(exportAsset(asset, "json").filename).toMatch(/\.json$/);
    expect(exportAsset(asset, "verdex-native").filename).toMatch(/\.verdex\.json$/);
  });
});
