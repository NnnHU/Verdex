/**
 * Verdex — unified settings modal with tabbed sections.
 *
 * Two tabs:
 *   📦 Providers  — AIProvider CRUD + test connection (formerly SettingsModal)
 *   🎭 Templates  — Panel role + Judge prompt templates (formerly TemplatesModal)
 *
 * Language and theme switching live in the Sidebar (always visible), NOT here.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AIProvider,
  JudgePromptTemplate,
  ProtocolType,
  RoleTemplate,
} from "../types/moa";
import {
  type ProviderTestResult,
  normalizeBase,
  testProvider,
} from "../services/httpClient";

interface SettingsModalProps {
  open: boolean;
  providers: AIProvider[];
  roleTemplates: RoleTemplate[];
  judgePrompts: JudgePromptTemplate[];
  onClose: () => void;
  // Provider CRUD
  onAddProvider: () => void;
  onUpdateProvider: (id: string, patch: Partial<AIProvider>) => void;
  onRemoveProvider: (id: string) => void;
  // Role template CRUD
  onAddRole: () => void;
  onUpdateRole: (id: string, patch: Partial<RoleTemplate>) => void;
  onRemoveRole: (id: string) => void;
  // Judge prompt CRUD
  onAddJudgePrompt: () => void;
  onUpdateJudgePrompt: (id: string, patch: Partial<JudgePromptTemplate>) => void;
  onRemoveJudgePrompt: (id: string) => void;
}

const inputCls =
  "w-full rounded-md border border-hairline-strong bg-canvas/60 px-2.5 py-1.5 text-xs text-ink-strong placeholder:text-ink-faint focus:border-accent/60 focus:outline-none focus:ring-1 focus:ring-accent/30";

/* ===================== Provider tab ===================== */

function ProviderRow({
  provider,
  onUpdate,
  onRemove,
  testResult,
}: {
  provider: AIProvider;
  onUpdate: (patch: Partial<AIProvider>) => void;
  onRemove: () => void;
  testResult?: ProviderTestResult;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-hairline-strong/60 bg-surface/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">
            {provider.name || t("common.unnamedModel")}
          </span>
          {testResult && (
            <span
              title={testResult.message}
              className={
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] " +
                (testResult.ok
                  ? "bg-success/15 text-success"
                  : "bg-error/15 text-error")
              }
            >
              {testResult.ok
                ? (testResult.detectedContextChars
                  ? t("settingsModal.testOkWithContext", {
                      ms: testResult.ms,
                      tokens: Math.round(testResult.detectedContextChars / 4).toLocaleString(),
                    })
                  : t("settingsModal.testOk", { ms: testResult.ms }))
                : t("settingsModal.testFail")}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                t("settingsModal.deleteConfirm", {
                  name: provider.name || t("common.unnamedModel"),
                })
              )
            ) {
              onRemove();
            }
          }}
          className="rounded px-2 py-0.5 text-[11px] text-ink-muted hover:bg-error/10 hover:text-error"
        >
          {t("common.delete")}
        </button>
      </div>
      {testResult && !testResult.ok && (
        <div className="mb-2 break-words rounded bg-error/10 px-2 py-1 text-[10px] text-error/90">
          {testResult.message}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-muted">
            {t("settingsModal.displayName")}
          </span>
          <input
            type="text"
            value={provider.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={t("settingsModal.displayNamePlaceholder")}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-muted">
            {t("settingsModal.model")}
          </span>
          <input
            type="text"
            value={provider.modelString}
            onChange={(e) => onUpdate({ modelString: e.target.value })}
            placeholder={t("settingsModal.modelPlaceholder")}
            className={inputCls + " font-mono"}
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-muted">
            {t("settingsModal.protocol")}
          </span>
          <select
            value={provider.protocol}
            onChange={(e) =>
              onUpdate({ protocol: e.target.value as ProtocolType })
            }
            className={inputCls}
          >
            <option value="openai">{t("settingsModal.protocolOpenai")}</option>
            <option value="anthropic">
              {t("settingsModal.protocolAnthropic")}
            </option>
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-muted">
            {t("settingsModal.maxContext")}
          </span>
          <input
            type="number"
            value={provider.capabilities?.maxContextChars ?? ""}
            onChange={(e) => {
              const val = Number(e.target.value);
              onUpdate({
                capabilities: {
                  ...provider.capabilities,
                  maxContextChars: val > 0 ? val : undefined,
                },
              });
            }}
            placeholder={t("settingsModal.maxContextPlaceholder")}
            className={inputCls}
            min={0}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-muted">
            Base URL
          </span>
          <input
            type="text"
            value={provider.baseUrl}
            onChange={(e) => onUpdate({ baseUrl: e.target.value })}
            placeholder={
              provider.protocol === "anthropic"
                ? t("settingsModal.baseUrlPlaceholderAnthropic")
                : t("settingsModal.baseUrlPlaceholderOpenai")
            }
            className={inputCls + " font-mono"}
            spellCheck={false}
          />
          {(() => {
            const norm = normalizeBase(provider.baseUrl);
            const orig = provider.baseUrl.trim();
            const endpoint =
              provider.protocol === "anthropic"
                ? /\/v1$/i.test(norm)
                  ? `${norm}/messages`
                  : `${norm}/v1/messages`
                : `${norm}/chat/completions`;
            const changed = norm !== orig;
            return (
              <span className="mt-1 block text-[10px] text-ink-muted break-all">
                {changed
                  ? t("settingsModal.baseUrlNormalized", { url: norm })
                  : t("settingsModal.baseUrlEndpoint", { endpoint })}
              </span>
            );
          })()}
          {provider.protocol === "anthropic" && (
            <span className="mt-1 block text-[10px] text-ink-muted">
              {t("settingsModal.anthropicNote")}
            </span>
          )}
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-muted">
            API Key
          </span>
          <input
            type="password"
            value={provider.apiKey}
            onChange={(e) => onUpdate({ apiKey: e.target.value })}
            placeholder="sk-…"
            className={inputCls + " font-mono"}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>
    </div>
  );
}

/* ===================== Template tab ===================== */

function RoleRow({
  template,
  onUpdate,
  onRemove,
}: {
  template: RoleTemplate;
  onUpdate: (patch: Partial<RoleTemplate>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-card-blindspots/30 bg-card-blindspots/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="truncate text-sm font-medium text-ink">
          {template.name || t("common.unnamedRole")}
        </span>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                t("templatesModal.deleteRoleConfirm", {
                  name: template.name || t("common.unnamed"),
                })
              )
            ) {
              onRemove();
            }
          }}
          className="rounded px-2 py-0.5 text-[11px] text-ink-muted hover:bg-error/10 hover:text-error"
        >
          {t("common.delete")}
        </button>
      </div>
      <div className="space-y-2">
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-muted">
            {t("templatesModal.roleName")}
          </span>
          <input
            type="text"
            value={template.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={t("templatesModal.roleNamePlaceholder")}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-muted">
            {t("templatesModal.rolePrompt")}
          </span>
          <textarea
            value={template.systemPrompt}
            onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
            rows={4}
            placeholder={t("templatesModal.rolePromptPlaceholder")}
            className={inputCls + " resize-y font-mono leading-relaxed"}
          />
        </label>
      </div>
    </div>
  );
}

function JudgePromptRow({
  template,
  onUpdate,
  onRemove,
}: {
  template: JudgePromptTemplate;
  onUpdate: (patch: Partial<JudgePromptTemplate>) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-success/40 bg-success/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="truncate text-sm font-medium text-ink">
          {template.name || t("common.unnamedPrompt")}
        </span>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                t("templatesModal.deletePromptConfirm", {
                  name: template.name || t("common.unnamed"),
                })
              )
            ) {
              onRemove();
            }
          }}
          className="rounded px-2 py-0.5 text-[11px] text-ink-muted hover:bg-error/10 hover:text-error"
        >
          {t("common.delete")}
        </button>
      </div>
      <div className="space-y-2">
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-muted">
            {t("templatesModal.judgePromptName")}
          </span>
          <input
            type="text"
            value={template.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={t("templatesModal.judgePromptNamePlaceholder")}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-[10px] uppercase tracking-wide text-ink-muted">
            {t("templatesModal.judgePromptBody")}
          </span>
          <textarea
            value={template.systemPrompt}
            onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
            rows={5}
            placeholder={t("templatesModal.judgePromptBodyPlaceholder")}
            className={inputCls + " resize-y font-mono leading-relaxed"}
          />
        </label>
      </div>
    </div>
  );
}

/* ===================== Unified modal ===================== */

export function SettingsModal({
  open,
  providers,
  roleTemplates,
  judgePrompts,
  onClose,
  onAddProvider,
  onUpdateProvider,
  onRemoveProvider,
  onAddRole,
  onUpdateRole,
  onRemoveRole,
  onAddJudgePrompt,
  onUpdateJudgePrompt,
  onRemoveJudgePrompt,
}: SettingsModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"providers" | "templates">(
    "providers"
  );
  const [testResults, setTestResults] = useState<
    Record<string, ProviderTestResult>
  >({});
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setTestResults({});
      setTesting(false);
    }
  }, [open]);

  const runTests = async () => {
    setTesting(true);
    setTestResults({});
    try {
      const entries = await Promise.all(
        providers.map(async (p) => {
          const r = await testProvider(p);
          // Auto-fill context window if detected and not already set.
          if (r.ok && r.detectedContextChars && !p.capabilities?.maxContextChars) {
            onUpdateProvider(p.id, {
              capabilities: {
                ...p.capabilities,
                maxContextChars: r.detectedContextChars,
              },
            });
          }
          return [p.id, r] as const;
        })
      );
      setTestResults(Object.fromEntries(entries));
    } catch {
      setTestResults({});
    } finally {
      setTesting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--vd-scrim)] p-4 backdrop-blur-sm">
      <div className="mt-10 w-full max-w-2xl rounded-2xl border border-hairline bg-canvas shadow-2xl">
        {/* Header with tabs */}
        <div className="border-b border-hairline">
          <div className="flex items-center justify-between px-5 pt-3">
            <h2 className="text-sm font-semibold text-ink-strong">
              {t("settingsModal.title")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
              aria-label={t("settingsModal.closeAria")}
            >
              ✕
            </button>
          </div>
          {/* Tab bar */}
          <div className="flex gap-1 px-5 pt-2">
            <button
              type="button"
              onClick={() => setActiveTab("providers")}
              className={
                "rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors " +
                (activeTab === "providers"
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-muted hover:text-ink")
              }
            >
              {t("settingsModal.tabProviders")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("templates")}
              className={
                "rounded-t-md border-b-2 px-3 py-1.5 text-xs font-medium transition-colors " +
                (activeTab === "templates"
                  ? "border-accent text-accent"
                  : "border-transparent text-ink-muted hover:text-ink")
              }
            >
              {t("settingsModal.tabTemplates")}
            </button>
          </div>
        </div>

        {/* Tab content */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {activeTab === "providers" && (
            <div className="space-y-2.5">
              <p className="text-[11px] text-ink-muted">
                {t("settingsModal.description")}
              </p>
              {providers.length === 0 && (
                <div className="rounded-lg border border-dashed border-hairline-strong p-6 text-center text-xs text-ink-muted">
                  {t("settingsModal.emptyState")}
                </div>
              )}
              {providers.map((p) => (
                <ProviderRow
                  key={p.id}
                  provider={p}
                  onUpdate={(patch) => onUpdateProvider(p.id, patch)}
                  onRemove={() => onRemoveProvider(p.id)}
                  testResult={testResults[p.id]}
                />
              ))}
            </div>
          )}

          {activeTab === "templates" && (
            <div className="space-y-5">
              <p className="text-[11px] text-ink-muted">
                {t("templatesModal.description")}
              </p>
              {/* Panel role templates */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-card-blindspots">
                    {t("templatesModal.panelRoles")}
                  </h3>
                  <button
                    type="button"
                    onClick={onAddRole}
                    className="rounded border border-card-blindspots/40 bg-card-blindspots/10 px-2.5 py-1 text-[11px] text-card-blindspots hover:bg-card-blindspots/20"
                  >
                    {t("templatesModal.addRole")}
                  </button>
                </div>
                <div className="space-y-2">
                  {roleTemplates.length === 0 && (
                    <div className="rounded-lg border border-dashed border-hairline-strong p-4 text-center text-[11px] text-ink-muted">
                      {t("templatesModal.noRoles")}
                    </div>
                  )}
                  {roleTemplates.map((r) => (
                    <RoleRow
                      key={r.id}
                      template={r}
                      onUpdate={(patch) => onUpdateRole(r.id, patch)}
                      onRemove={() => onRemoveRole(r.id)}
                    />
                  ))}
                </div>
              </section>
              {/* Judge prompt templates */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-success">
                    {t("templatesModal.judgePrompts")}
                  </h3>
                  <button
                    type="button"
                    onClick={onAddJudgePrompt}
                    className="rounded border border-success/40 bg-success/10 px-2.5 py-1 text-[11px] text-success hover:bg-success/20"
                  >
                    {t("templatesModal.addJudgePrompt")}
                  </button>
                </div>
                <div className="space-y-2">
                  {judgePrompts.length === 0 && (
                    <div className="rounded-lg border border-dashed border-hairline-strong p-4 text-center text-[11px] text-ink-muted">
                      {t("templatesModal.noJudgePrompts")}
                    </div>
                  )}
                  {judgePrompts.map((j) => (
                    <JudgePromptRow
                      key={j.id}
                      template={j}
                      onUpdate={(patch) => onUpdateJudgePrompt(j.id, patch)}
                      onRemove={() => onRemoveJudgePrompt(j.id)}
                    />
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-hairline px-5 py-3">
          {activeTab === "providers" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onAddProvider}
                className="rounded-md border border-accent/40 bg-accent-soft/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent-soft/20"
              >
                {t("settingsModal.addModel")}
              </button>
              <button
                type="button"
                onClick={runTests}
                disabled={testing || providers.length === 0}
                className="rounded-md border border-hairline-strong bg-surface-2/60 px-3 py-1.5 text-xs text-ink hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {testing
                  ? t("settingsModal.testing")
                  : t("settingsModal.testConnection")}
              </button>
            </div>
          ) : (
            <div />
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-surface-2 px-4 py-1.5 text-xs font-medium text-ink hover:bg-surface-3"
          >
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SettingsModal;
