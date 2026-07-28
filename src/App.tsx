/**
 * Verdex — application shell (refactored).
 *
 * Layout:
 *   ┌────────────┬──────────────────────────────────────┐
 *   │  Sidebar   │  Header                              │
 *   │ (history)  │  MoAConfigBar (Panel + Judge picker) │
 *   │            │  ───────────────────────────────────  │
 *   │            │  Message stream (scroll)             │
 *   │            │    UserMessage → PanelCollapseGroup  │
 *   │            │                 → JudgeMessage       │
 *   │            │  ───────────────────────────────────  │
 *   │            │  ChatInput (pinned bottom)           │
 *   └────────────┴──────────────────────────────────────┘
 *
 * Global model config is now decoupled from session state: the sidebar shows
 * chat history, the SettingsModal manages providers, and MoAConfigBar picks
 * the active session's panels/judge. The engine resolves providers from the
 * global list at run time.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMoa } from "./hooks/useMoa";
import { Sidebar } from "./components/Sidebar";
import { MoAConfigBar } from "./components/MoAConfigBar";
import { SettingsModal } from "./components/SettingsModal";
import { HelpModal } from "./components/HelpModal";
import { UserMessage } from "./components/UserMessage";
import { PanelCollapseGroup } from "./components/PanelCollapseGroup";
import { JudgeMessage } from "./components/JudgeMessage";
import { MapReduceMessage } from "./components/MapReduceMessage";
import { TurnTimer } from "./components/TurnTimer";
import { AssetExportButton } from "./components/AssetExportButton";
import { ChatInput } from "./components/ChatInput";
import { readTextFiles } from "./services/fileReader";

function EmptyState({
  hasProviders,
  onOpenSettings,
}: {
  hasProviders: boolean;
  onOpenSettings: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-from to-brand-to text-2xl font-bold text-white shadow-lg shadow-blue-900/30">
        V
      </div>
      <h1 className="text-xl font-semibold text-ink-strong">
        {t("app.title")}
      </h1>
      <p className="mt-1.5 max-w-md text-sm text-ink-muted">
        {t("app.subtitle")}
      </p>
      {!hasProviders && (
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-4 rounded-md border border-accent/40 bg-accent-soft/10 px-3 py-1.5 text-xs text-accent hover:bg-accent-soft/20"
        >
          {t("app.goToSettings")}
        </button>
      )}
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  const moa = useMoa();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const session = moa.currentSession;
  const messages = session?.messages ?? [];

  // Stage 2: read user-picked files and attach them to the current session.
  // Reads run through fileReader (txt/md only); per-file errors are surfaced
  // via lastError so the user sees why a file was rejected.
  const handleAddFiles = useCallback(
    async (files: File[]) => {
      if (!session || files.length === 0) return;
      const { ok, errors } = await readTextFiles(files);
      if (ok.length > 0) moa.addAttachments(session.sessionId, ok);
      if (errors.length > 0) {
        moa.setError(errors.join("\n"));
      }
      // Stage 5: if ASR cleaning is on, clean each newly-added attachment.
      // Pass the source text directly to avoid stale-session reads.
      if (ok.length > 0 && session.config.cleanAttachments) {
        for (const a of ok) {
          void moa.cleanAttachment(session.sessionId, a.id, a.text);
        }
      }
    },
    [session, moa]
  );

  const handleRemoveAttachment = useCallback(
    (attachmentId: string) => {
      if (!session) return;
      moa.removeAttachment(session.sessionId, attachmentId);
    },
    [session, moa]
  );

  // Auto-scroll to the newest content whenever messages change or stream ticks.
  // NOTE: this useEffect MUST stay before any early return — React requires
  // hooks to run unconditionally on every render.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // While the persisted config is still loading from disk/storage, show a
  // minimal loading screen instead of rendering an empty config. This early
  // return is safe because all hooks above it run on every render.
  if (!moa.loaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas text-ink-muted">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-from to-brand-to text-xl font-bold text-white shadow-lg shadow-blue-900/30">
            V
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="verdex-dot inline-block h-1.5 w-1.5 rounded-full bg-accent-soft" />
            {t("app.loading")}
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  // Derive a short judge summary for the header from the judges array.
  const judgeNames = (session?.config.judgeIds ?? [])
    .map((id) => moa.providers.find((p) => p.id === id)?.name)
    .filter(Boolean) as string[];
  const judgeSummary =
    judgeNames.length === 0
      ? "—"
      : judgeNames.length === 1
        ? judgeNames[0]
        : t("app.judgesCount", { count: judgeNames.length });

  // While no session is active, show an empty state prompting a new session.
  if (!session) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-canvas text-ink-strong">
        <Sidebar
          open={moa.sidebarOpen}
          sessions={moa.sessions}
          currentSessionId={moa.currentSessionId}
          onToggle={moa.toggleSidebar}
          onNewSession={moa.newSession}
          onSelectSession={moa.selectSession}
          onRenameSession={moa.renameSession}
          onRemoveSession={moa.removeSession}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          language={moa.language}
          onLanguageChange={moa.setLanguage}
          theme={moa.theme}
          onThemeChange={moa.setTheme}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <div>
              <p className="text-sm text-ink-muted">{t("app.noSession")}</p>
              <button
                type="button"
                onClick={moa.newSession}
                className="mt-3 rounded-md border border-accent/40 bg-accent-soft/10 px-4 py-2 text-xs font-medium text-accent hover:bg-accent-soft/20"
              >
                {t("app.newSessionBtn")}
              </button>
            </div>
          </div>
        </div>
        <SettingsModal
          open={settingsOpen}
          providers={moa.providers}
          roleTemplates={moa.roleTemplates}
          judgePrompts={moa.judgePrompts}
          onClose={() => setSettingsOpen(false)}
          onAddProvider={() => moa.addProvider()}
          onUpdateProvider={moa.updateProvider}
          onRemoveProvider={moa.removeProvider}
          onAddRole={() => moa.addRoleTemplate()}
          onUpdateRole={moa.updateRoleTemplate}
          onRemoveRole={moa.removeRoleTemplate}
          onAddJudgePrompt={() => moa.addJudgePrompt()}
          onUpdateJudgePrompt={moa.updateJudgePrompt}
          onRemoveJudgePrompt={moa.removeJudgePrompt}
          extractSchemas={moa.extractSchemas}
          onAddSchema={() => moa.addExtractSchema()}
          onUpdateSchema={moa.updateExtractSchema}
          onRemoveSchema={moa.removeExtractSchema}
          knowledgeAssets={moa.knowledgeAssets}
          onRemoveAsset={moa.removeKnowledgeAsset}
        />
        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-ink-strong">
      <Sidebar
        open={moa.sidebarOpen}
        sessions={moa.sessions}
        currentSessionId={moa.currentSessionId}
        onToggle={moa.toggleSidebar}
        onNewSession={moa.newSession}
        onSelectSession={moa.selectSession}
        onRenameSession={moa.renameSession}
        onRemoveSession={moa.removeSession}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHelp={() => setHelpOpen(true)}
        language={moa.language}
        onLanguageChange={moa.setLanguage}
        theme={moa.theme}
        onThemeChange={moa.setTheme}
      />

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-9 shrink-0 items-center gap-2 border-b border-hairline bg-canvas/80 px-4 pl-12 text-xs text-ink-muted">
          <span className="max-w-[40%] truncate font-medium text-ink">
            {session.title}
          </span>
          <span className="text-ink-faint">·</span>
          <span className="truncate">
            {session.config.mode === "advanced" ? t("app.modeAdvanced") : t("app.modeSimple")} · Panel:{" "}
            {session.config.panelIds.length} · Judge: {judgeSummary}
          </span>
          {moa.running && (
            <span className="ml-auto inline-flex items-center gap-1 text-accent">
              <span className="verdex-dot inline-block h-1.5 w-1.5 rounded-full bg-accent-soft" />
              {t("app.running")}
            </span>
          )}
        </header>

        {/* Per-session MoA config */}
        <MoAConfigBar
          providers={moa.providers}
          roleTemplates={moa.roleTemplates}
          judgePrompts={moa.judgePrompts}
          extractSchemas={moa.extractSchemas}
          config={session.config}
          running={moa.running}
          onChange={(patch) =>
            moa.updateSessionConfig(session.sessionId, patch)
          }
        />

        {/* Blocking error banner (e.g. circuit-breaker trip on oversized input) */}
        {moa.lastError && (
          <div className="flex items-start gap-2 border-b border-error/30 bg-error/10 px-4 py-2 text-xs text-error">
            <span className="mt-0.5">⚠️</span>
            <span className="flex-1 break-words">{moa.lastError}</span>
            <button
              type="button"
              onClick={moa.clearError}
              className="shrink-0 rounded px-1.5 py-0.5 text-error hover:bg-error/10 hover:text-error"
            >
              {t("common.close")}
            </button>
          </div>
        )}

        {/* Message stream */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <EmptyState
              hasProviders={moa.providers.length > 0}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <div className="mx-auto max-w-4xl py-4">
              {messages.map((turn, idx) => {
                const isLiveTurn = moa.running && idx === messages.length - 1;
                return (
                <div key={turn.id} className="mb-2">
                  <UserMessage prompt={turn.prompt} />
                  <TurnTimer running={isLiveTurn} fromTs={turn.createdAt} />
                  <PanelCollapseGroup panels={turn.panels} />
                  {turn.mapOutputs ? (
                    <MapReduceMessage
                      mapOutputs={turn.mapOutputs}
                      mergedResult={turn.mergedResult ?? null}
                    />
                  ) : (
                    turn.judges.map((j) => (
                    <JudgeMessage
                      key={j.judgeId}
                      status={j.status}
                      panelCount={turn.panels.length}
                      panels={turn.panels}
                      response={j.response}
                      raw={j.raw}
                      error={j.error}
                      judgeLabel={
                        turn.judges.length > 1 ? j.label : undefined
                      }
                    />
                  ))
                  )}
                  {/* Knowledge Asset export — only show when turn has a result */}
                  {(() => {
                    const hasResult = turn.mergedResult || turn.judges.some((j) => j.response);
                    if (!hasResult) return null;
                    return (
                      <div className="px-4 py-1">
                        <AssetExportButton
                          turn={turn}
                          taskType={session.config.taskType}
                          attachments={session.attachments}
                          panelModels={turn.panels.map((p) => p.label)}
                          judgeModel={turn.judges[0]?.label ?? ""}
                        />
                      </div>
                    );
                  })()}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Composer */}
        <ChatInput
          onSend={moa.send}
          running={moa.running}
          onStop={moa.stop}
          attachments={session?.attachments ?? []}
          onAddFiles={handleAddFiles}
          onRemoveAttachment={handleRemoveAttachment}
        />
      </div>

      {/* Global settings (unified: providers + templates tabs) */}
      <SettingsModal
        open={settingsOpen}
        providers={moa.providers}
        roleTemplates={moa.roleTemplates}
        judgePrompts={moa.judgePrompts}
        onClose={() => setSettingsOpen(false)}
        onAddProvider={() => moa.addProvider()}
        onUpdateProvider={moa.updateProvider}
        onRemoveProvider={moa.removeProvider}
        onAddRole={() => moa.addRoleTemplate()}
        onUpdateRole={moa.updateRoleTemplate}
        onRemoveRole={moa.removeRoleTemplate}
        onAddJudgePrompt={() => moa.addJudgePrompt()}
        onUpdateJudgePrompt={moa.updateJudgePrompt}
        onRemoveJudgePrompt={moa.removeJudgePrompt}
        extractSchemas={moa.extractSchemas}
        onAddSchema={() => moa.addExtractSchema()}
        onUpdateSchema={moa.updateExtractSchema}
        onRemoveSchema={moa.removeExtractSchema}
        knowledgeAssets={moa.knowledgeAssets}
        onRemoveAsset={moa.removeKnowledgeAsset}
      />
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
