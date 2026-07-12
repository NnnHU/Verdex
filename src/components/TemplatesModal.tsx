/**
 * Verdex — prompt templates management modal.
 *
 * Manages the two global template domains behind the advanced flow:
 *   - Panel role templates (RoleTemplate[]) — per-panel system prompts.
 *   - Judge prompt templates (JudgePromptTemplate[]) — per-judge system prompts.
 *
 * Both follow the same add/edit/delete pattern as providers. systemPrompt is a
 * multi-line textarea (can be long). A {PANELS} placeholder is documented as
 * the insertion point for the panel answers in judge templates.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { JudgePromptTemplate, RoleTemplate } from "../types/moa";

interface TemplatesModalProps {
  open: boolean;
  roleTemplates: RoleTemplate[];
  judgePrompts: JudgePromptTemplate[];
  onClose: () => void;
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

export function TemplatesModal({
  open,
  roleTemplates,
  judgePrompts,
  onClose,
  onAddRole,
  onUpdateRole,
  onRemoveRole,
  onAddJudgePrompt,
  onUpdateJudgePrompt,
  onRemoveJudgePrompt,
}: TemplatesModalProps) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[var(--vd-scrim)] p-4 backdrop-blur-sm">
      <div className="mt-10 w-full max-w-2xl rounded-2xl border border-hairline bg-canvas shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-strong">
              {t("templatesModal.title")}
            </h2>
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {t("templatesModal.description")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
            aria-label={t("common.close")}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-5 py-4">
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

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-hairline px-5 py-3">
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

export default TemplatesModal;
