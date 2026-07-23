/**
 * Verdex — Map-Reduce turn renderer (Stage 4).
 *
 * Renders a mapreduce turn in two parts:
 *   📄 Document extraction (Map) — per-document cards showing status + field count.
 *   📋 Merged result (Reduce) — the final synthesized JSON via JsonCardRenderer.
 *
 * Reuses the verdict-card visual language and the raw-JSON toggle.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { JsonCardRenderer } from "./JsonCardRenderer";
import type { MapOutputState, SynthesisResponse } from "../types/moa";

interface MapReduceMessageProps {
  mapOutputs: MapOutputState[];
  mergedResult: SynthesisResponse | null;
  raw?: string;
  reduceError?: string;
}

/** Count top-level keys in a Map output's data, for a compact status line. */
function fieldCount(data: Record<string, unknown> | undefined): number {
  return data ? Object.keys(data).length : 0;
}

export function MapReduceMessage({
  mapOutputs,
  mergedResult,
  raw,
  reduceError,
}: MapReduceMessageProps) {
  const { t } = useTranslation();
  const [showRaw, setShowRaw] = useState(false);
  const anyMapping = mapOutputs.some((m) => m.status === "mapping" || m.status === "pending");
  const doneCount = mapOutputs.filter((m) => m.status === "done").length;
  const total = mapOutputs.length;
  const allMapDone = !anyMapping && total > 0 && doneCount + mapOutputs.filter((m) => m.status === "error").length === total;
  // Reduce phase: waiting (Map not done) | merging (Map done, no result yet) | done.
  const reduceWaiting = anyMapping;
  void allMapDone; // reserved for future "merging" badge styling

  return (
    <div className="flex justify-start px-4 py-3">
      <div className="flex max-w-3xl items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm">
          🗂️
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {/* Map phase */}
          <div className="text-[11px] uppercase tracking-wider text-ink-muted">
            {t("mapReduce.mapHeader")} · {t("mapReduce.mapProgress", { done: doneCount, total })}
          </div>
          <div className="space-y-1.5">
            {mapOutputs.map((m) => {
              const status =
                m.status === "done"
                  ? `${t("mapReduce.docDone")} · ${t("mapReduce.docFields", {
                      count: fieldCount(m.data),
                    })}`
                  : m.status === "error"
                    ? t("mapReduce.docError")
                    : t("mapReduce.docMapping");
              const statusColor =
                m.status === "done"
                  ? "text-success"
                  : m.status === "error"
                    ? "text-error"
                    : "text-ink-muted";
              return (
                <div
                  key={m.attachmentId}
                  className="flex items-center gap-2 rounded-md border border-hairline-strong bg-surface/60 px-2.5 py-1.5"
                  title={m.error}
                >
                  <span className="max-w-[280px] truncate text-[12px] text-ink">
                    {m.name}
                  </span>
                  <span className={"ml-auto text-[11px] " + statusColor}>{status}</span>
                </div>
              );
            })}
          </div>

          {/* Reduce phase */}
          <div className="pt-1 text-[11px] uppercase tracking-wider text-ink-muted">
            {t("mapReduce.reduceHeader")}
          </div>
          {reduceError ? (
            <div className="rounded-md border border-error/30 bg-error/10 px-3 py-2 text-[12px] text-error">
              {reduceError}
            </div>
          ) : !mergedResult ? (
            <div className="rounded-md border border-hairline-strong bg-surface/60 px-3 py-2 text-[12px] text-ink-muted">
              {mapOutputs.length === 0
                ? t("mapReduce.reduceEmpty")
                : reduceWaiting
                  ? t("mapReduce.reduceWaiting")
                  : t("mapReduce.reduceRunning")}
            </div>
          ) : mergedResult.kind === "extract" ? (
            <JsonCardRenderer data={mergedResult.data} />
          ) : null}

          {raw && mergedResult && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="text-[11px] text-ink-muted hover:text-ink"
              >
                {showRaw ? t("mapReduce.hideRaw") : t("mapReduce.showRaw")}
              </button>
              {showRaw && (
                <pre className="mt-1 max-h-60 overflow-auto rounded bg-surface-2 p-2 text-[11px] text-ink-muted whitespace-pre-wrap break-words">
                  {raw}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MapReduceMessage;
