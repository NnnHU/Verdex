/**
 * Verdex — in-app Help modal (bilingual via i18n).
 *
 * Accessible from the Sidebar's "❓ Help" button. Explains what Verdex is,
 * how to get started, simple vs advanced mode, templates, config location,
 * shortcuts, and the security note.
 */
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

interface HelpModalProps {
  open: boolean;
  onClose: () => void;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
        {title}
      </h3>
      <div className="text-xs leading-relaxed text-ink">{children}</div>
    </section>
  );
}

export function HelpModal({ open, onClose }: HelpModalProps) {
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
          <h2 className="text-sm font-semibold text-ink-strong">
            {t("help.title")}
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

        {/* Body */}
        <div className="max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
          <Section title={t("help.whatIsTitle")}>{t("help.whatIsBody")}</Section>

          <Section title={t("help.tasksTitle")}>
            <p className="mb-1">{t("help.tasksBody")}</p>
            <p>• {t("help.taskExtract")}</p>
            <p>• {t("help.taskAnalysis")}</p>
            <p>• {t("help.taskQa")}</p>
          </Section>

          <Section title={t("help.settingsTitle")}>
            <p>• <strong>{t("help.settingsTask")}</strong></p>
            <p>• <strong>{t("help.settingsSchema")}</strong></p>
            <p>• <strong>{t("help.settingsStyle")}</strong></p>
            <p>• <strong>{t("help.settingsPanel")}</strong></p>
            <p>• <strong>{t("help.settingsJudge")}</strong></p>
            <p>• <strong>{t("help.settingsClean")}</strong></p>
            <p>• <strong>{t("help.settingsMemory")}</strong></p>
          </Section>

          <Section title={t("help.flowTitle")}>
            <p>• {t("help.flowExtract")}</p>
            <p>• {t("help.flowAnalysis")}</p>
            <p>• {t("help.flowQa")}</p>
          </Section>

          <Section title={t("help.docsTitle")}>
            {t("help.docsBody")}
          </Section>

          <Section title={t("help.providersTitle")}>
            {t("help.providersBody")}
          </Section>

          <Section title={t("help.schemasTitle")}>
            {t("help.schemasBody")}
          </Section>

          <Section title={t("help.copyMdTitle")}>
            {t("help.copyMdBody")}
          </Section>

          <Section title={t("help.shortcutsTitle")}>
            {t("help.shortcutsBody")}
          </Section>

          <Section title={t("help.configTitle")}>
            {t("help.configBody")}
          </Section>

          <Section title={t("help.securityTitle")}>
            <span className="text-warning">{t("help.securityBody")}</span>
          </Section>
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

export default HelpModal;
