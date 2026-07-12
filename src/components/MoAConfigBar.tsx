/**
 * Verdex — per-session MoA config bar (refactored for mode layering).
 *
 * Two modes (session-level toggle):
 *   - simple:   parallel panels → single judge (original flow).
 *   - advanced: role-driven panels → single OR collision judges.
 *
 * Sits atop the main chat area. The data source for panels/judges is the
 * global providers list; role/judge-prompt selectors draw from the global
 * template libraries. All selection writes through `onChange` into the
 * session's MoASessionConfig (shallow-merged by the hook).
 */
import { useTranslation } from "react-i18next";
import type {
  AIProvider,
  JudgePromptTemplate,
  MoASessionConfig,
  MoaMode,
  RoleTemplate,
} from "../types/moa";

interface MoAConfigBarProps {
  providers: AIProvider[];
  roleTemplates: RoleTemplate[];
  judgePrompts: JudgePromptTemplate[];
  config: MoASessionConfig;
  /** Patch the active session's config (shallow merge). */
  onChange: (patch: Partial<MoASessionConfig>) => void;
  running: boolean;
}

const selectCls =
  "rounded-md border border-hairline-strong bg-surface px-2 py-1 text-[11px] text-ink-strong focus:border-accent/60 focus:outline-none disabled:opacity-50";

export function MoAConfigBar({
  providers,
  roleTemplates,
  judgePrompts,
  config,
  onChange,
  running,
}: MoAConfigBarProps) {
  const { t } = useTranslation();
  const isAdvanced = config.mode === "advanced";
  const isCollision =
    isAdvanced && config.judgeStrategy === "collision";

  /* ----------------------- panel helpers ---------------------------- */
  const togglePanel = (id: string) => {
    const next = config.panelIds.includes(id)
      ? config.panelIds.filter((x) => x !== id)
      : [...config.panelIds, id];
    onChange({ panelIds: next });
  };

  const setPanelRole = (panelId: string, roleId: string) => {
    // Drop the key entirely when no role is selected (avoid undefined values
    // which would violate Record<string, string>).
    const next = { ...config.panelRoles };
    if (roleId) {
      next[panelId] = roleId;
    } else {
      delete next[panelId];
    }
    onChange({ panelRoles: next });
  };

  /* ----------------------- judge helpers ---------------------------- */
  const toggleJudge = (id: string) => {
    const next = config.judgeIds.includes(id)
      ? config.judgeIds.filter((x) => x !== id)
      : [...config.judgeIds, id];
    // Prune collisionJudgePromptIds to match the new judge count so stale
    // entries don't accumulate (the array is meant to be aligned with judgeIds).
    onChange({
      judgeIds: next,
      collisionJudgePromptIds: config.collisionJudgePromptIds.slice(
        0,
        next.length
      ),
    });
  };

  // For simple mode + single strategy, judge selection is effectively single.
  // judgeIds stays an array but only one entry is used; selecting a new one
  // replaces rather than appends.
  const selectSingleJudge = (id: string) => {
    onChange({
      judgeIds: id ? [id] : [],
      collisionJudgePromptIds: [],
    });
  };

  const setMode = (mode: MoaMode) => {
    if (mode === "simple") {
      onChange({
        mode: "simple",
        judgeStrategy: "single",
        judgeIds: config.judgeIds.slice(0, 1),
        collisionJudgePromptIds: [],
      });
    } else {
      onChange({ mode: "advanced" });
    }
  };

  const ready =
    config.panelIds.length > 0 &&
    config.judgeIds.length > 0 &&
    (!isCollision || config.judgeIds.length >= 2);

  return (
    <div className="border-b border-hairline bg-canvas/60 px-4 py-2">
      <div className="mx-auto max-w-4xl space-y-2">
        {/* Row 1: mode toggle + strategy + readiness */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="inline-flex overflow-hidden rounded-md border border-hairline-strong">
            <button
              type="button"
              disabled={running}
              onClick={() => setMode("simple")}
              className={
                "px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 " +
                (!isAdvanced
                  ? "bg-accent text-on-accent"
                  : "bg-surface text-ink-muted hover:text-ink")
              }
            >
              {t("moaConfigBar.simple")}
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setMode("advanced")}
              className={
                "px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 " +
                (isAdvanced
                  ? "bg-brand-to text-on-accent"
                  : "bg-surface text-ink-muted hover:text-ink")
              }
            >
              {t("moaConfigBar.advanced")}
            </button>
          </div>

          {isAdvanced && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-muted">
                {t("moaConfigBar.strategy")}
              </span>
              <select
                value={config.judgeStrategy}
                disabled={running}
                onChange={(e) => {
                  const strategy = e.target.value as "single" | "collision";
                  onChange({
                    judgeStrategy: strategy,
                    // Clear collision prompts when leaving collision mode.
                    collisionJudgePromptIds:
                      strategy === "collision"
                        ? config.collisionJudgePromptIds
                        : [],
                  });
                }}
                className={selectCls}
              >
                <option value="single">{t("moaConfigBar.singleJudge")}</option>
                <option value="collision">{t("moaConfigBar.collision")}</option>
              </select>
            </div>
          )}

          <span
            className={
              "ml-auto text-[11px] " +
              (ready ? "text-success" : "text-warning")
            }
            title={
              ready
                ? t("moaConfigBar.readyTooltip")
                : t("moaConfigBar.notReadyTooltip") +
                  (isCollision ? t("moaConfigBar.notReadyCollision") : "")
            }
          >
            {ready ? t("moaConfigBar.ready") : t("moaConfigBar.notReady")}
          </span>
        </div>

        {/* Row 2: Panel multi-select + (advanced) per-panel role */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Panel
          </span>
          {providers.length === 0 && (
            <span className="text-[11px] text-ink-faint">
              {t("moaConfigBar.noProviders")}
            </span>
          )}
          {providers.map((p) => {
            const selected = config.panelIds.includes(p.id);
            const hasKey = !!p.apiKey;
            return (
              <span key={p.id} className="inline-flex items-center gap-1">
                <button
                  type="button"
                  disabled={running}
                  onClick={() => togglePanel(p.id)}
                  title={
                    hasKey
                      ? `${p.name} · ${p.modelString}`
                      : t("moaConfigBar.noApiKey", { name: p.name })
                  }
                  className={
                    "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
                    (selected
                      ? "border-accent/50 bg-accent-soft/15 text-accent"
                      : "border-hairline-strong bg-surface/50 text-ink-muted hover:border-hairline-strong hover:text-ink")
                  }
                >
                  {p.name || t("common.unnamed")}
                  {!hasKey && (
                    <span
                      className="ml-1 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-warning align-middle"
                      title={t("moaConfigBar.noKeyDot")}
                    />
                  )}
                </button>
                {isAdvanced && selected && (
                  <select
                    value={config.panelRoles[p.id] ?? ""}
                    disabled={running}
                    onChange={(e) => setPanelRole(p.id, e.target.value)}
                    className={selectCls + " !px-1 !py-0.5 !text-[10px]"}
                    title={t("moaConfigBar.panelRoleSelect")}
                  >
                    <option value="">{t("moaConfigBar.noRole")}</option>
                    {roleTemplates.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            );
          })}
        </div>

        {/* Row 3: Judge selection + prompt */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {!isCollision ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                Judge
              </span>
              <select
                value={config.judgeIds[0] ?? ""}
                disabled={running}
                onChange={(e) => selectSingleJudge(e.target.value)}
                className={selectCls}
              >
                <option value="">{t("moaConfigBar.notSelected")}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || t("common.unnamed")}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                {t("moaConfigBar.judgesCollision")}
              </span>
              {providers.map((p) => {
                const selected = config.judgeIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={running}
                    onClick={() => toggleJudge(p.id)}
                    className={
                      "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors disabled:opacity-50 " +
                      (selected
                        ? "border-success/50 bg-success/15 text-success"
                        : "border-hairline-strong bg-surface/50 text-ink-muted hover:text-ink")
                    }
                  >
                    {p.name || t("common.unnamed")}
                  </button>
                );
              })}
            </div>
          )}

          {!isCollision && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-muted">
                {t("moaConfigBar.judgePrompt")}
              </span>
              <select
                value={config.judgePromptId ?? ""}
                disabled={running}
                onChange={(e) =>
                  onChange({ judgePromptId: e.target.value || null })
                }
                className={selectCls}
              >
                <option value="">{t("moaConfigBar.default")}</option>
                {judgePrompts.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {isCollision && config.judgeIds.length > 0 && (
            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 pl-1">
              <span className="text-[10px] text-ink-muted">
                {t("moaConfigBar.collisionPrompts")}
              </span>
              {config.judgeIds.map((jid, idx) => {
                const p = providers.find((x) => x.id === jid);
                return (
                  <span
                    key={jid}
                    className="inline-flex items-center gap-1 text-[10px]"
                  >
                    <span className="text-ink-muted">
                      {idx + 1}.{p?.name ?? "?"}
                    </span>
                    <select
                      value={config.collisionJudgePromptIds[idx] ?? ""}
                      disabled={running}
                      onChange={(e) => {
                        const next = [...config.collisionJudgePromptIds];
                        while (next.length <= idx) next.push("");
                        next[idx] = e.target.value;
                        onChange({ collisionJudgePromptIds: next });
                      }}
                      className={selectCls + " !px-1 !py-0.5 !text-[10px]"}
                    >
                      <option value="">{t("moaConfigBar.default")}</option>
                      {judgePrompts.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                        </option>
                      ))}
                    </select>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MoAConfigBar;
