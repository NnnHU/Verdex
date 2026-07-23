/**
 * Verdex — unit tests for the plaintext attachment reader (Stage 2).
 *
 * Uses the global `File` constructor (available in Vitest's jsdom env) to
 * build in-memory files, so no real disk I/O is needed.
 */
import { describe, it, expect } from "vitest";
import {
  readTextFile,
  readTextFiles,
  isAllowedFile,
  MAX_ATTACHMENT_CHARS,
} from "../src/services/fileReader";

function mkFile(name: string, content: string, type = "text/plain"): File {
  return new File([content], name, { type });
}

/* ------------------------------- isAllowedFile ------------------------------- */

describe("isAllowedFile", () => {
  it("accepts txt, md, markdown (case-insensitive)", () => {
    expect(isAllowedFile("a.txt")).toBe(true);
    expect(isAllowedFile("b.MD")).toBe(true);
    expect(isAllowedFile("c.markdown")).toBe(true);
  });

  it("rejects other extensions and extensionless names", () => {
    expect(isAllowedFile("a.pdf")).toBe(false);
    expect(isAllowedFile("a.docx")).toBe(false);
    expect(isAllowedFile("noext")).toBe(false);
  });
});

/* ------------------------------- readTextFile ------------------------------- */

describe("readTextFile", () => {
  it("reads a txt file into an Attachment with correct fields", async () => {
    const att = await readTextFile(mkFile("note.txt", "hello world"));
    expect(att.name).toBe("note.txt");
    expect(att.text).toBe("hello world");
    expect(att.chars).toBe(11);
    expect(att.source).toBe("txt");
    expect(att.truncated).toBe(false);
    expect(att.id).toBeTruthy();
  });

  it("rejects a non-allowed extension", async () => {
    await expect(readTextFile(mkFile("doc.pdf", "x"))).rejects.toThrow(
      /unsupported file type/
    );
  });

  it("truncates content over the cap and flags it", async () => {
    const big = "a".repeat(MAX_ATTACHMENT_CHARS + 500);
    const att = await readTextFile(mkFile("big.md", big));
    expect(att.truncated).toBe(true);
    expect(att.chars).toBe(MAX_ATTACHMENT_CHARS);
    expect(att.text.length).toBe(MAX_ATTACHMENT_CHARS);
  });

  it("keeps markdown content under the cap intact", async () => {
    const md = "# Title\n\nsome **bold** text";
    const att = await readTextFile(mkFile("p.md", md, "text/markdown"));
    expect(att.text).toBe(md);
    expect(att.source).toBe("md");
    expect(att.truncated).toBe(false);
  });
});

/* ------------------------------- readTextFiles ------------------------------- */

describe("readTextFiles", () => {
  it("reads a mix, collecting successes and errors separately", async () => {
    const res = await readTextFiles([
      mkFile("ok1.txt", "one"),
      mkFile("bad.pdf", "x"),
      mkFile("ok2.md", "two"),
    ]);
    expect(res.ok).toHaveLength(2);
    expect(res.ok.map((a) => a.name).sort()).toEqual(["ok1.txt", "ok2.md"]);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]).toContain("bad.pdf");
  });

  it("returns empty results for no files", async () => {
    const res = await readTextFiles([]);
    expect(res.ok).toEqual([]);
    expect(res.errors).toEqual([]);
  });
});
