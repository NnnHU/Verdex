/**
 * Verdex — Panel parallel-status group.
 *
 * Renders one compact card per selected panel model, showing its live state:
 *  pending / streaming → "正在收集 <label> 的思考…" with pulsing dots
 *  done                → a short preview + a toggle to expand the full text
 *  error               → the error message in red
 *
 * Cards sit side-by-side and collapse/expand individually.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { PanelState } from "../types/moa";

interface PanelCardProps {
  panel: PanelState;
}

function PanelCard({ panel }: PanelCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const busy = panel.status === "pending" || panel.status === "streaming";

  const statusBadge =
    panel.status === "pending" ? (
      <span className="text-ink-muted">{t("panelStatus.pending")}</span>
    ) : panel.status === "streaming" ? (
      <span className="text-accent">{t("panelStatus.streaming")}</span>
    ) : panel.status === "done" ? (
      <span className="text-success">{t("panelStatus.done")}</span>
    ) : panel.status === "skipped" ? (
      <span className="text-warning">{t("panelStatus.skipped")}</span>
    ) : (
      <span className="text-error">{t("panelStatus.error")}</span>
    );

  return (
    <div className="flex-1 min-w-[180px] rounded-lg border border-hairline-strong/60 bg-surface/60 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted" />
          <span className="truncate">{panel.label}</span>
          {panel.roleName && (
            <span
              className="shrink-0 rounded bg-card-blindspots/15 px-1.5 py-0.5 text-[10px] text-card-blindspots"
              title={t("panelStatus.role", { name: panel.roleName })}
            >
              {panel.roleName}
            </span>
          )}
        </div>
        {statusBadge}
      </div>

      <div className="mt-1 text-[11px] text-ink-muted truncate font-mono">
        {panel.model}
      </div>

      {/* Body */}
      <div className="mt-2">
        {busy && (
          <div className="flex items-center gap-1 text-ink-muted">
            <span>{t("panelStatus.collecting", { label: panel.label })}</span>
            <span className="inline-flex gap-0.5">
              <span className="verdex-dot inline-block h-1 w-1 rounded-full bg-ink-muted" style={{ animationDelay: "0ms" }} />
              <span className="verdex-dot inline-block h-1 w-1 rounded-full bg-ink-muted" style={{ animationDelay: "150ms" }} />
              <span className="verdex-dot inline-block h-1 w-1 rounded-full bg-ink-muted" style={{ animationDelay: "300ms" }} />
            </span>
          </div>
        )}

        {panel.status === "error" && (
          <div className="text-error leading-relaxed break-words">
            {panel.error || t("panelStatus.callFailed")}
          </div>
        )}

        {panel.status === "skipped" && (
          <div className="text-warning/90 leading-relaxed break-words">
            {panel.error || t("panelStatus.skippedReason")}
          </div>
        )}

        {panel.status === "done" && (
          <>
            <div
              className={
                "text-ink leading-relaxed break-words " +
                (expanded ? "" : "line-clamp-3")
              }
            >
              {panel.rawText.trim() || t("panelStatus.emptyReply")}
            </div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[11px] text-accent hover:text-accent hover:underline"
            >
              {expanded ? t("panelStatus.collapse") : t("panelStatus.expand")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface PanelCollapseGroupProps {
  panels: PanelState[];
}

export function PanelCollapseGroup({ panels }: PanelCollapseGroupProps) {
  if (panels.length === 0) return null;
  return (
    <div className="px-4 py-2">
      <div className="flex flex-wrap gap-2">
        {panels.map((p) => (
          <PanelCard key={p.providerId} panel={p} />
        ))}
      </div>
    </div>
  );
}

export default PanelCollapseGroup;
