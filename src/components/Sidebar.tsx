/**
 * Verdex — collapsible sidebar (Step 2, rewritten).
 *
 * The sidebar is now dedicated to chat history. Model configuration has moved
 * to the SettingsModal, invoked from the bottom "⚙️ 设置" button.
 *
 *  - Top:     "新建会话" button.
 *  - Middle:  session list (newest first), each row selectable / renamable /
 *             deletable.
 *  - Bottom:  "⚙️ 设置" button → opens SettingsModal.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatSession } from "../types/moa";

interface SidebarProps {
  open: boolean;
  sessions: ChatSession[];
  currentSessionId: string | null;
  onToggle: () => void;
  onNewSession: () => void;
  onSelectSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onRemoveSession: (id: string) => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  language: "en" | "zh";
  onLanguageChange: (lng: "en" | "zh") => void;
  theme: "dark" | "light" | "soft";
  onThemeChange: (t: "dark" | "light" | "soft") => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return sameDay
    ? `${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SessionRow({
  session,
  active,
  onSelect,
  onRename,
  onRemove,
}: {
  session: ChatSession;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);

  const commit = () => {
    const next = draft.trim() || t("common.newSession");
    onRename(next);
    setEditing(false);
  };

  return (
    <div
      className={
        "group relative cursor-pointer rounded-lg px-2.5 py-2 text-xs transition-colors " +
        (active
          ? "bg-accent-soft/15 text-ink-strong ring-1 ring-inset ring-accent/30"
          : "text-ink-muted hover:bg-surface-2/60 hover:text-ink")
      }
      onClick={onSelect}
    >
      {editing ? (
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(session.title);
              setEditing(false);
            }
          }}
          className="w-full rounded border border-hairline-strong bg-canvas px-1.5 py-0.5 text-xs text-ink-strong focus:outline-none"
        />
      ) : (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{session.title}</div>
            <div className="mt-0.5 text-[10px] text-ink-faint">
              {formatTime(session.createdAt)} · {session.messages.length}{" "}
              {t("common.rounds")}
            </div>
          </div>
          {/* Hover actions */}
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              title={t("sidebar.renameTooltip")}
              onClick={(e) => {
                e.stopPropagation();
                setDraft(session.title);
                setEditing(true);
              }}
              className="rounded p-1 text-ink-muted hover:bg-surface-3 hover:text-ink"
            >
              ✎
            </button>
            <button
              type="button"
              title={t("sidebar.deleteTooltip")}
              onClick={(e) => {
                e.stopPropagation();
                if (
                  window.confirm(
                    t("sidebar.deleteConfirm", { title: session.title })
                  )
                )
                  onRemove();
              }}
              className="rounded p-1 text-ink-muted hover:bg-error/20 hover:text-error"
            >
              🗑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  open,
  sessions,
  currentSessionId,
  onToggle,
  onNewSession,
  onSelectSession,
  onRenameSession,
  onRemoveSession,
  onOpenSettings,
  onOpenHelp,
  language,
  onLanguageChange,
  theme,
  onThemeChange,
}: SidebarProps) {
  const { t } = useTranslation();
  return (
    <>
      {/* Collapse toggle, anchored to the sidebar rail. */}
      <button
        type="button"
        onClick={onToggle}
        title={open ? t("sidebar.collapse") : t("sidebar.expand")}
        className="absolute top-0 z-30 flex h-9 w-9 items-center justify-center rounded-br-lg border-b border-r border-hairline bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink"
        style={{ left: open ? "16rem" : 0 }}
      >
        {open ? "‹" : "›"}
      </button>

      <aside
        className={
          "verdex-sidebar-transition relative z-20 flex h-full shrink-0 flex-col overflow-hidden border-r border-hairline bg-canvas " +
          (open ? "w-64 opacity-100" : "w-0 opacity-0")
        }
      >
        <div className="flex w-64 flex-col">
          {/* Brand */}
          <div className="flex items-center gap-2 px-3 pt-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-from to-brand-to text-sm font-bold text-white">
              V
            </div>
            <div>
              <div className="text-sm font-semibold text-ink-strong">Verdex</div>
              <div className="text-[10px] text-ink-muted">
                {t("sidebar.brandSubtitle")}
              </div>
            </div>
          </div>

          {/* New session */}
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={onNewSession}
              className="w-full rounded-md border border-hairline-strong bg-surface/60 px-3 py-2 text-xs font-medium text-ink hover:border-accent/40 hover:bg-accent-soft/10 hover:text-accent"
            >
              {t("sidebar.newSession")}
            </button>
          </div>

          {/* Session list (sessions array is already newest-first in state) */}
          <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {sessions.length === 0 && (
              <div className="px-2 py-6 text-center text-[11px] text-ink-faint">
                {t("sidebar.noSessions")}
              </div>
            )}
            {sessions.map((s) => (
              <SessionRow
                key={s.sessionId}
                session={s}
                active={s.sessionId === currentSessionId}
                onSelect={() => onSelectSession(s.sessionId)}
                onRename={(title) => onRenameSession(s.sessionId, title)}
                onRemove={() => onRemoveSession(s.sessionId)}
              />
            ))}
          </div>

          {/* Settings + Help */}
          <div className="space-y-1.5 border-t border-hairline p-3">
            <button
              type="button"
              onClick={onOpenSettings}
              className="w-full rounded-md border border-hairline-strong bg-surface/60 px-3 py-2 text-xs text-ink hover:border-hairline-strong hover:bg-surface-2"
            >
              {t("sidebar.settings")}
            </button>
            <button
              type="button"
              onClick={onOpenHelp}
              className="w-full rounded-md border border-hairline-strong bg-surface/60 px-3 py-2 text-xs text-ink hover:border-accent/50 hover:bg-accent/20 hover:text-accent"
            >
              {t("sidebar.help")}
            </button>
          </div>

          {/* Language + Theme selectors — pinned to very bottom */}
          <div className="space-y-2 border-t border-hairline p-3">
            <div>
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-muted">
                {t("settingsModal.language")}
              </span>
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value as "en" | "zh")}
                className="w-full rounded-md border border-hairline-strong bg-surface px-2.5 py-1.5 text-xs text-ink-strong focus:border-accent/60 focus:outline-none"
              >
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
            </div>
            <div>
              <span className="mb-1 block text-[10px] uppercase tracking-wider text-ink-muted">
                {t("settingsModal.theme")}
              </span>
              <select
                value={theme}
                onChange={(e) => onThemeChange(e.target.value as "dark" | "light" | "soft")}
                className="w-full rounded-md border border-hairline-strong bg-surface px-2.5 py-1.5 text-xs text-ink-strong focus:border-accent/60 focus:outline-none"
              >
                <option value="dark">{t("settingsModal.themeDark")}</option>
                <option value="light">{t("settingsModal.themeLight")}</option>
                <option value="soft">{t("settingsModal.themeSoft")}</option>
              </select>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
