/**
 * Verdex — TurnTimer: shows "⏱ Xs" for a running turn.
 *
 * Wraps useElapsed so the ticking interval lives in a component (hooks can't
 * be called inside a .map). Only renders when `running` is true.
 */
import { useTranslation } from "react-i18next";
import { useElapsed } from "../hooks/useElapsed";

interface TurnTimerProps {
  running: boolean;
  fromTs: number;
}

export function TurnTimer({ running, fromTs }: TurnTimerProps) {
  const { t } = useTranslation();
  const elapsed = useElapsed(running, fromTs);
  if (!running) return null;
  return (
    <div className="px-4 py-1 text-center text-[11px] text-ink-faint">
      {t("common.elapsed", { s: elapsed })}
    </div>
  );
}

export default TurnTimer;
