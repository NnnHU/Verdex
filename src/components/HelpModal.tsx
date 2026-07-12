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

          <Section title={t("help.quickStartTitle")}>
            <ol className="list-decimal space-y-1 pl-4">
              <li>{t("help.quickStart1")}</li>
              <li>{t("help.quickStart2")}</li>
              <li>{t("help.quickStart3")}</li>
              <li>{t("help.quickStart4")}</li>
            </ol>
          </Section>

          <Section title={t("help.modesTitle")}>
            <p>{t("help.modesSimple")}</p>
            <p>{t("help.modesAdvanced")}</p>
          </Section>

          <Section title={t("help.templatesTitle")}>
            {t("help.templatesBody")}
          </Section>

          <Section title={t("help.configTitle")}>
            {t("help.configBody")}
          </Section>

          <Section title={t("help.shortcutsTitle")}>
            {t("help.shortcutsBody")}
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
