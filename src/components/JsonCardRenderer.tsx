/**
 * Verdex — generic JSON → card renderer (Stage 3 extract mode).
 *
 * Recursively renders an arbitrary JSON object/array/value into a nested card
 * layout: objects become titled sections, arrays become lists, leaves become
 * key-value lines. Reuses the verdict-card visual language (tinted boxes).
 *
 * Pure presentational; no data fetching. Depth-limited to avoid runaway
 * nesting in pathological inputs.
 */
import type { ReactNode } from "react";

interface JsonCardRendererProps {
  data: unknown;
  /** Nesting depth (internal). Stops expanding beyond MAX_DEPTH. */
  depth?: number;
}

const MAX_DEPTH = 6;

// Rotating tint per depth for visual hierarchy.
const depthTint = [
  "border-hairline-strong bg-surface/60",
  "border-card-consensus/20 bg-card-consensus/5",
  "border-card-divergence/20 bg-card-divergence/5",
  "border-card-blindspots/20 bg-card-blindspots/5",
  "border-card-verdict/20 bg-card-verdict/5",
  "border-hairline bg-surface-2/50",
];

/** Render a leaf (string/number/boolean/null) as text. */
function renderLeaf(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** Render one value (object/array/leaf) — the recursive core. */
function renderValue(v: unknown, depth: number, key?: string): ReactNode {
  // Object (non-array).
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const entries = Object.entries(v as Record<string, unknown>);
    if (entries.length === 0) {
      return key ? (
        <FieldRow label={key} value="{}" />
      ) : (
        <span className="text-ink-faint">{`{}`}</span>
      );
    }
    const body = (
      <div className="space-y-1.5">
        {entries.map(([k, val]) => (
          <div key={k}>{renderValue(val, depth + 1, k)}</div>
        ))}
      </div>
    );
    if (depth >= MAX_DEPTH) {
      return key ? <FieldRow label={key} value="{…}" /> : body;
    }
    return (
      <div className={"rounded-md border px-3 py-2 " + depthTint[depth % depthTint.length]}>
        {key && <div className="mb-1 text-[12px] font-semibold text-ink">{key}</div>}
        {body}
      </div>
    );
  }

  // Array.
  if (Array.isArray(v)) {
    if (v.length === 0) return key ? <FieldRow label={key} value="[]" /> : null;
    const items = v.map((item, i) => (
      <div key={i}>{renderValue(item, depth + 1)}</div>
    ));
    if (depth >= MAX_DEPTH) {
      return key ? <FieldRow label={key} value={`[${v.length} items]`} /> : <>{items}</>;
    }
    return (
      <div className={"rounded-md border px-3 py-2 " + depthTint[depth % depthTint.length]}>
        {key && <div className="mb-1 text-[12px] font-semibold text-ink">{key}</div>}
        <div className="space-y-1.5">{items}</div>
      </div>
    );
  }

  // Leaf.
  return key ? <FieldRow label={key} value={renderLeaf(v)} /> : (
    <div className="text-sm text-ink-strong whitespace-pre-wrap break-words">
      {renderLeaf(v)}
    </div>
  );
}

/** A label: value row for leaf fields. */
function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
      <span className="font-medium text-ink">{label}</span>
      <span className="min-w-0 flex-1 text-ink-strong whitespace-pre-wrap break-words">
        {value}
      </span>
    </div>
  );
}

export function JsonCardRenderer({ data, depth = 0 }: JsonCardRendererProps) {
  return <div className="space-y-2">{renderValue(data, depth)}</div>;
}

export default JsonCardRenderer;
