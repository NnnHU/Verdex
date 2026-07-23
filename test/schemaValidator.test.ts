/**
 * Verdex — unit tests for the extract-schema validator (Stage 3, Route 1).
 */
import { describe, it, expect } from "vitest";
import { validateExtract } from "../src/services/schemaValidator";

describe("validateExtract", () => {
  it("passes for an object with no required keys specified", () => {
    expect(validateExtract({ a: 1 })).toEqual({ ok: true, errors: [] });
  });

  it("passes when all required keys are present", () => {
    const res = validateExtract(
      { 思维模型: [], 因果链: [], 交易模型: [] },
      ["思维模型", "因果链", "交易模型"]
    );
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
  });

  it("fails listing missing keys when some required keys absent", () => {
    const res = validateExtract({ 思维模型: [] }, ["思维模型", "因果链", "交易模型"]);
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain("因果链");
    expect(res.errors[0]).toContain("交易模型");
  });

  it("fails when data is not an object", () => {
    expect(validateExtract("string", ["a"]).ok).toBe(false);
    expect(validateExtract(42, ["a"]).ok).toBe(false);
    expect(validateExtract(null, ["a"]).ok).toBe(false);
    expect(validateExtract([1, 2], ["a"]).ok).toBe(false);
  });

  it("treats empty/whitespace required keys as no requirement", () => {
    expect(validateExtract({ a: 1 }, ["", "  "]).ok).toBe(true);
  });

  it("passes for any object when requiredKeys is undefined", () => {
    expect(validateExtract({ whatever: true }).ok).toBe(true);
  });
});
