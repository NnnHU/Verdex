/**
 * Verdex — Step-by-step task config bar.
 *
 * Replaces the old flat layout with a guided step flow:
 *   ❶ Task type → ❷ Documents → ❸ Schema → ❹ Analysis → ❺ Options
 * Each step only shows when relevant to the selected task type.
 * Advanced options (roles, collision, reference assets) are in a collapsible.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { filterByLanguage } from "../services/templateFilter";
import type {
  AIProvider,
  ExtractSchemaTemplate,
  JudgePromptTemplate,
  KnowledgeAsset,
  MoASessionConfig,
  RoleTemplate,
} from "../types/moa";

interface MoAConfigBarProps {
  providers: AIProvider[];
  roleTemplates: RoleTemplate[];
  judgePrompts: JudgePromptTemplate[];
  extractSchemas: ExtractSchemaTemplate[];
  knowledgeAssets: KnowledgeAsset[];
  config: MoASessionConfig;
  onChange: (patch: Partial<MoASessionConfig>) => void;
  running: boolean;
}

const selectCls =
  "rounded-md border border-hairline-strong bg-surface px-2 py-1 text-[11px] text-ink-strong focus:border-accent/60 focus:outline-none disabled:opacity-50";

const stepNumCls = "flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft/20 text-[10px] font-bold text-accent";
const stepLabelCls = "text-[10px] font-semibold uppercase tracking-wider text-ink-muted";
const stepHintCls = "text-[10px] text-ink-faint";

export function MoAConfigBar({
  providers,
  roleTemplates,
  judgePrompts,
  extractSchemas,
  knowledgeAssets,
  config,
  onChange,
  running,
}: MoAConfigBarProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language.startsWith("zh") ? "zh" : "en";
  const [showRefAssets, setShowRefAssets] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isCollision = showAdvanced && config.judgeStrategy === "collision";
  const isDocTask = config.taskType === "document_extract" || config.taskType === "document_analysis";
  const needsAnalysis = config.taskType === "document_analysis" || config.taskType === "quick_qa";
  const isMultiModel = providers.length >= 2;

  // --- helpers ---
  const togglePanel = (id: string) => {
    const next = config.panelIds.includes(id)
      ? config.panelIds.filter((x) => x !== id)
      : [...config.panelIds, id];
    onChange({ panelIds: next });
  };
  const setPanelRole = (panelId: string, roleId: string) => {
    const next = { ...config.panelRoles };
    if (roleId) next[panelId] = roleId; else delete next[panelId];
    onChange({ panelRoles: next });
  };
  const selectSingleJudge = (id: string) => {
    onChange({ judgeIds: id ? [id] : [], collisionJudgePromptIds: [] });
  };
  const toggleJudge = (id: string) => {
    const next = config.judgeIds.includes(id)
      ? config.judgeIds.filter((x) => x !== id)
      : [...config.judgeIds, id];
    onChange({ judgeIds: next, collisionJudgePromptIds: config.collisionJudgePromptIds.slice(0, next.length) });
  };

  const ready = config.judgeIds.length > 0 && (config.taskType === "document_extract" || config.panelIds.length > 0);

  return (
    <div className="border-b border-hairline bg-canvas/60 px-4 py-3">
      <div className="mx-auto max-w-4xl space-y-3">

        {/* ❶ Task type */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className={stepNumCls}>1</span>
            <span className={stepLabelCls}>{t("moaConfigBar.stepTask")}</span>
            <span className={stepHintCls}>{t("moaConfigBar.stepTaskHint")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={running} onClick={() => onChange({ taskType: "document_extract", extractSchemaId: config.extractSchemaId })}
              className={"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 " +
                (config.taskType === "document_extract" ? "border-accent bg-accent text-on-accent" : "border-hairline-strong bg-surface text-ink-muted hover:text-ink")}>
              📄 {t("moaConfigBar.taskTypeDocumentExtract")}
            </button>
            {isMultiModel && (
              <button type="button" disabled={running} onClick={() => onChange({ taskType: "document_analysis", extractSchemaId: config.extractSchemaId })}
                className={"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 " +
                  (config.taskType === "document_analysis" ? "border-accent bg-accent text-on-accent" : "border-hairline-strong bg-surface text-ink-muted hover:text-ink")}>
                📊 {t("moaConfigBar.taskTypeDocumentAnalysis")}
              </button>
            )}
            <button type="button" disabled={running} onClick={() => onChange({ taskType: "quick_qa" })}
              className={"rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 " +
                (config.taskType === "quick_qa" ? "border-accent bg-accent text-on-accent" : "border-hairline-strong bg-surface text-ink-muted hover:text-ink")}>
                💬 {t("moaConfigBar.taskTypeQuickQa")}
              </button>
          </div>
        </div>

        {/* ❷ Documents (doc tasks only) */}
        {isDocTask && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={stepNumCls}>2</span>
              <span className={stepLabelCls}>{t("moaConfigBar.stepDocs")}</span>
              <span className={stepHintCls}>{t("moaConfigBar.stepDocsHint")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1 text-[11px] text-ink-muted" title={t("moaConfigBar.cleanTooltip")}>
                <input type="checkbox" checked={config.cleanAttachments} disabled={running}
                  onChange={(e) => onChange({ cleanAttachments: e.target.checked })}
                  className="h-3 w-3 cursor-pointer accent-[var(--accent)] disabled:opacity-50" />
                {t("moaConfigBar.clean")}
              </label>
              <span className="text-[10px] text-ink-faint">{t("moaConfigBar.docsViaChatInput")}</span>
            </div>
          </div>
        )}

        {/* ❸ Schema (doc tasks only) */}
        {isDocTask && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={stepNumCls}>{isDocTask ? "3" : "2"}</span>
              <span className={stepLabelCls}>{t("moaConfigBar.stepSchema")}</span>
              <span className={stepHintCls}>{t("moaConfigBar.stepSchemaHint")}</span>
            </div>
            <select value={config.extractSchemaId ?? ""} disabled={running}
              onChange={(e) => onChange({ extractSchemaId: e.target.value || null })} className={selectCls}>
              <option value="">{t("moaConfigBar.default")}</option>
              {filterByLanguage(extractSchemas, lang).map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
            </select>
          </div>
        )}

        {/* ❹ Analysis (analysis/qa only) */}
        {needsAnalysis && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={stepNumCls}>{isDocTask ? "4" : "2"}</span>
              <span className={stepLabelCls}>{t("moaConfigBar.stepAnalysis")}</span>
              <span className={stepHintCls}>{t("moaConfigBar.stepAnalysisHint")}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Analysis style */}
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-ink-muted">{t("moaConfigBar.analysisStyle")}</span>
                <select value={config.judgePromptId ?? ""} disabled={running}
                  onChange={(e) => onChange({ judgePromptId: e.target.value || null })} className={selectCls}>
                  {filterByLanguage(judgePrompts, lang).map((j) => (<option key={j.id} value={j.id}>{j.name}</option>))}
                </select>
              </div>
            </div>
            {/* Panel selection */}
            {isMultiModel && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-medium text-ink-muted">{t("moaConfigBar.panel")}</span>
                {providers.length === 0 && <span className="text-[11px] text-ink-faint">{t("moaConfigBar.noProviders")}</span>}
                {providers.map((p) => {
                  const selected = config.panelIds.includes(p.id);
                  return (
                    <span key={p.id} className="inline-flex items-center gap-1">
                      <button type="button" disabled={running} onClick={() => togglePanel(p.id)}
                        title={p.apiKey ? `${p.name} · ${p.modelString}` : t("moaConfigBar.noApiKey", { name: p.name })}
                        className={"rounded-full border px-2.5 py-0.5 text-[11px] transition-colors disabled:opacity-50 " +
                          (selected ? "border-accent/50 bg-accent-soft/15 text-accent" : "border-hairline-strong bg-surface/50 text-ink-muted hover:text-ink")}>
                        {p.name || t("common.unnamed")}
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {/* Judge selection */}
            <div className="flex items-center gap-1.5 pt-1">
              <span className="text-[10px] font-medium text-ink-muted">{t("moaConfigBar.judge")}</span>
              <select value={config.judgeIds[0] ?? ""} disabled={running}
                onChange={(e) => selectSingleJudge(e.target.value)} className={selectCls}>
                <option value="">{t("moaConfigBar.notSelected")}</option>
                {providers.map((p) => (<option key={p.id} value={p.id}>{p.name || t("common.unnamed")}</option>))}
              </select>
            </div>
          </div>
        )}

        {/* ❺ Options */}
        <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-2">
          <label className="flex items-center gap-1 text-[11px] text-ink-muted" title={t("moaConfigBar.memoryTooltip")}>
            <input type="checkbox" checked={config.memoryEnabled} disabled={running}
              onChange={(e) => onChange({ memoryEnabled: e.target.checked })}
              className="h-3 w-3 cursor-pointer accent-[var(--accent)] disabled:opacity-50" />
            {t("moaConfigBar.memory")}
          </label>
          <label className="flex items-center gap-1 text-[11px] text-ink-muted" title={t("moaConfigBar.autoSaveTooltip")}>
            <input type="checkbox" checked={config.autoSaveAsset} disabled={running}
              onChange={(e) => onChange({ autoSaveAsset: e.target.checked })}
              className="h-3 w-3 cursor-pointer accent-[var(--accent)] disabled:opacity-50" />
            {t("moaConfigBar.autoSave")}
          </label>

          {/* Reference assets popover */}
          {knowledgeAssets.length > 0 && (
            <div className="relative">
              <button type="button" disabled={running} onClick={() => setShowRefAssets((v) => !v)} className={selectCls}
                title={t("moaConfigBar.referenceAssetsTooltip")}>
                {t("moaConfigBar.referenceAssets")}
                {config.referenceAssetIds.length > 0 && ` (${config.referenceAssetIds.length})`}
              </button>
              {showRefAssets && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-60 w-64 overflow-y-auto rounded-md border border-hairline-strong bg-canvas shadow-lg">
                  {knowledgeAssets.map((a) => {
                    const checked = config.referenceAssetIds.includes(a.id);
                    return (
                      <label key={a.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-surface-2">
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const next = checked ? config.referenceAssetIds.filter((id) => id !== a.id) : [...config.referenceAssetIds, a.id];
                            onChange({ referenceAssetIds: next });
                          }} className="h-3 w-3 accent-[var(--accent)]" />
                        <span className="truncate text-[11px] text-ink">{a.name}</span>
                      </label>
                    );
                  })}
                  <button type="button" onClick={() => setShowRefAssets(false)}
                    className="block w-full border-t border-hairline px-3 py-1.5 text-center text-[11px] text-ink-muted hover:bg-surface-2">
                    {t("common.done")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Advanced toggle */}
          {isMultiModel && (
            <button type="button" onClick={() => setShowAdvanced((v) => !v)}
              className="text-[11px] text-ink-faint hover:text-ink">
              {showAdvanced ? "▼" : "▸"} {t("moaConfigBar.advanced")}
            </button>
          )}

          {/* Readiness indicator */}
          <span className={"ml-auto text-[11px] " + (ready ? "text-success" : "text-warning")}
            title={ready ? t("moaConfigBar.readyTooltip") : t("moaConfigBar.notReadyTooltip") + (isCollision ? t("moaConfigBar.notReadyCollision") : "")}>
            {ready ? t("moaConfigBar.ready") : t("moaConfigBar.notReady")}
          </span>
        </div>

        {/* Advanced options (collapsible) */}
        {showAdvanced && isMultiModel && (
          <div className="space-y-2 rounded-md border border-hairline bg-surface/30 px-3 py-2">
            {/* Judge strategy */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-muted">{t("moaConfigBar.strategy")}</span>
              <select value={config.judgeStrategy} disabled={running}
                onChange={(e) => { const strategy = e.target.value as "single" | "collision"; onChange({ judgeStrategy: strategy, collisionJudgePromptIds: strategy === "collision" ? config.collisionJudgePromptIds : [] }); }}
                className={selectCls}>
                <option value="single">{t("moaConfigBar.singleJudge")}</option>
                <option value="collision">{t("moaConfigBar.collision")}</option>
              </select>
            </div>
            {/* Multi-judge collision (if collision mode) */}
            {isCollision && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-medium text-ink-muted">{t("moaConfigBar.judgesCollision")}</span>
                {providers.map((p) => {
                  const selected = config.judgeIds.includes(p.id);
                  return (
                    <button key={p.id} type="button" disabled={running} onClick={() => toggleJudge(p.id)}
                      className={"rounded-full border px-2 py-0.5 text-[11px] transition-colors disabled:opacity-50 " +
                        (selected ? "border-success/50 bg-success/10 text-success" : "border-hairline-strong bg-surface text-ink-muted hover:text-ink")}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
            {/* Per-panel roles (advanced) */}
            {config.panelIds.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-medium text-ink-muted">{t("moaConfigBar.panelRolesLabel")}</span>
                {config.panelIds.map((pid) => {
                  const p = providers.find((x) => x.id === pid);
                  if (!p) return null;
                  return (
                    <div key={pid} className="flex items-center gap-2">
                      <span className="text-[11px] text-ink">{p.name}</span>
                      <select value={config.panelRoles[pid] ?? ""} disabled={running}
                        onChange={(e) => setPanelRole(pid, e.target.value)} className={selectCls + " !px-1 !py-0.5 !text-[10px]"}>
                        <option value="">{t("moaConfigBar.noRole")}</option>
                        {filterByLanguage(roleTemplates, lang).map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default MoAConfigBar;
