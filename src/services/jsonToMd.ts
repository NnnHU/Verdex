/**
 * Verdex — JSON → Markdown converter for "copy as MD" (阶段 3 补充).
 *
 * Converts an extract-mode JSON object into a readable Markdown string,
 * mirroring the JsonCardRenderer's structure but as plain MD text:
 *   - top-level keys → ## headings
 *   - arrays of objects → ### numbered items with sub-fields
 *   - nested objects → bold key: value lines
 *   - leaf values → list items / inline text
 *
 * Used by the "复制 MD" button next to extract / mapreduce results.
 * Pure function; no side effects.
 */

/** Render a leaf value (string/number/boolean/null) as a string. */
function renderLeaf(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** Indent helper (2 spaces per level). */
function pad(depth: number): string {
  return "  ".repeat(depth);
}

/** Core recursive renderer. Returns MD lines for one value. */
function renderValue(v: unknown, depth: number, key?: string): string[] {
  const lines: string[] = [];

  // Object (non-array)
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) {
      if (key) lines.push(`${pad(depth)}- **${key}**: {}`);
      return lines;
    }
    if (key) lines.push(`${pad(depth)}- **${key}**:`);
    for (const [k, val] of entries) {
      lines.push(...renderValue(val, depth + 1, k));
    }
    return lines;
  }

  // Array
  if (Array.isArray(v)) {
    if (v.length === 0) {
      if (key) lines.push(`${pad(depth)}- **${key}**: []`);
      return lines;
    }
    if (key) lines.push(`${pad(depth)}- **${key}** (${v.length} 项):`);
    v.forEach((item, i) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        // Array of objects: each as a sub-section
        const name = (item as Record<string, unknown>)["名称"] ?? (item as Record<string, unknown>)["name"] ?? `#${i + 1}`;
        lines.push(`${pad(depth + 1)}${i + 1}. **${String(name)}**`);
        for (const [k, val] of Object.entries(item as Record<string, unknown>)) {
          if (k === "名称" || k === "name") continue;
          lines.push(...renderValue(val, depth + 2, k));
        }
      } else {
        lines.push(`${pad(depth + 1)}${i + 1}. ${renderLeaf(item)}`);
      }
    });
    return lines;
  }

  // Leaf
  if (key) {
    lines.push(`${pad(depth)}- **${key}**: ${renderLeaf(v)}`);
  } else {
    lines.push(renderLeaf(v));
  }
  return lines;
}

/**
 * Convert an extract JSON object to a Markdown string.
 *
 * @param data  The parsed JSON object (JudgeResponse.data or Map-Reduce merged result).
 * @param title Optional document title (e.g. the user's question).
 * @returns Markdown text.
 */
export function jsonToMarkdown(
  data: Record<string, unknown>,
  title?: string
): string {
  const lines: string[] = [];
  if (title) {
    lines.push(`# ${title}`, "");
  }
  for (const [key, val] of Object.entries(data)) {
    lines.push(`## ${key}`, "");
    lines.push(...renderValue(val, 0));
    lines.push("");
  }
  return lines.join("\n");
}
