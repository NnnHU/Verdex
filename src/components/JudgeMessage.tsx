/**
 * Verdex — Judge verdict bubble with the four structured cards.
 *
 *  🎯 核心共识 (Consensus) — blue tint
 *  ⚔️ 观点碰撞 (Divergence) — orange tint
 *  💡 独特盲点 (Blindspots) — purple tint
 *  ⚖️ 最终裁决 (Verdict)    — borderless, slightly larger, emphasized
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  JudgeStatus,
  PanelState,
  SynthesisResponse,
} from "../types/moa";

interface JudgeMessageProps {
  status: JudgeStatus;
  panelCount: number;
  /** Panel snapshots — used to render a degraded fallback when the judge fails
   *  (shows the raw panel answers directly instead of the structured cards). */
  panels: PanelState[];
  response: SynthesisResponse | null;
  raw: string;
  error?: string;
  /** Optional judge display name; when present (multi-judge), it's shown in the
   *  header so each verdict block is attributable to its source judge. */
  judgeLabel?: string;
}

function Card({
  emoji,
  title,
  text,
  className,
}: {
  emoji: string;
  title: string;
  text: string;
  className: string;
}) {
  return (
    <div className={"rounded-lg p-3 " + className}>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink">
        <span className="text-sm">{emoji}</span>
        <span>{title}</span>
      </div>
      <div className="text-sm leading-relaxed text-ink-strong whitespace-pre-wrap break-words">
        {text}
      </div>
    </div>
  );
}

export function JudgeMessage({
  status,
  panelCount,
  panels,
  response,
  raw,
  error,
  judgeLabel,
}: JudgeMessageProps) {
  const { t } = useTranslation();
  const [showRaw, setShowRaw] = useState(false);

  // Successful panel answers, for the degraded fallback view.
  const okPanels = panels.filter(
    (p) => p.status === "done" && p.rawText.trim()
  );

  // ---- Loading states ----
  if (status === "pending" || status === "judging" || status === "streaming") {
    return (
      <div className="flex justify-start px-4 py-3">
        <div className="flex max-w-3xl items-start gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm">
            ⚖️
          </div>
          <div className="rounded-2xl rounded-tl-sm border border-hairline-strong/60 bg-surface/70 px-4 py-3 text-sm text-ink">
            <div className="flex items-center gap-1.5">
              <span>{t("judge.loading", { count: panelCount })}</span>
              <span className="inline-flex gap-0.5">
                <span className="verdex-dot inline-block h-1.5 w-1.5 rounded-full bg-accent-soft" style={{ animationDelay: "0ms" }} />
                <span className="verdex-dot inline-block h-1.5 w-1.5 rounded-full bg-accent-soft" style={{ animationDelay: "150ms" }} />
                <span className="verdex-dot inline-block h-1.5 w-1.5 rounded-full bg-accent-soft" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
            {status === "streaming" && raw && (
              <div className="mt-2 max-h-24 overflow-hidden text-xs text-ink-muted font-mono verdex-caret whitespace-pre-wrap break-words">
                {raw.slice(-400)}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Error state (with degraded fallback to raw panel answers) ----
  if (status === "error") {
    return (
      <div className="flex justify-start px-4 py-3">
        <div className="flex max-w-3xl items-start gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm">
            ⚖️
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="rounded-2xl rounded-tl-sm border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
              <div className="font-medium">{t("judge.errorTitle")}</div>
              <div className="mt-1 text-error/90 break-words">
                {error || t("common.unknownError")}
              </div>
            </div>
            {okPanels.length > 0 && (
              <div className="rounded-2xl rounded-tl-sm border border-warning/30 bg-warning/10 px-4 py-3 text-sm">
                <div className="mb-2 font-medium text-warning">
                  {t("judge.degradedHeader")}
                </div>
                <div className="space-y-2">
                  {okPanels.map((p) => (
                    <div
                      key={p.providerId}
                      className="rounded-md border border-hairline-strong/50 bg-surface/50 p-2"
                    >
                      <div className="mb-1 text-xs font-medium text-ink">
                        {p.label}
                      </div>
                      <div className="text-xs leading-relaxed text-ink whitespace-pre-wrap break-words">
                        {p.rawText}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- Done: render four structured cards ----
  if (!response) return null;

  return (
    <div className="flex justify-start px-4 py-3">
      <div className="flex max-w-3xl items-start gap-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm">
          ⚖️
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-ink-muted">
            {judgeLabel ? t("judge.headerWithLabel", { label: judgeLabel }) : t("judge.header")}
          </div>

          <Card
            emoji="🎯"
            title={t("judge.consensus")}
            text={response.consensus}
            className="bg-card-consensus/10 border border-card-consensus/20"
          />
          <Card
            emoji="⚔️"
            title={t("judge.divergence")}
            text={response.divergence}
            className="bg-card-divergence/10 border border-card-divergence/20"
          />
          <Card
            emoji="💡"
            title={t("judge.blindspots")}
            text={response.blindspots}
            className="bg-card-blindspots/10 border border-card-blindspots/20"
          />
          <Card
            emoji="⚖️"
            title={t("judge.verdict")}
            text={response.verdict}
            className="bg-card-verdict/5 text-base font-medium"
          />

          {raw && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="text-[11px] text-ink-muted hover:text-ink hover:underline"
              >
                {showRaw ? t("judge.hideRaw") : t("judge.showRaw")}
              </button>
              {showRaw && (
                <pre className="mt-1 max-h-60 overflow-auto rounded-md border border-hairline bg-canvas/80 p-2 text-[11px] text-ink-muted whitespace-pre-wrap break-words">
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

export default JudgeMessage;
