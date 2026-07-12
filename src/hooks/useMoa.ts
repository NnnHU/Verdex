/**
 * Verdex — top-level UI state machine for the MoA engine.
 *
 * Four fully-decoupled persistence domains:
 *   - providers     : AIProvider[]          — global model endpoints (CRUD).
 *   - roleTemplates : RoleTemplate[]        — global panel role prompts (CRUD).
 *   - judgePrompts  : JudgePromptTemplate[] — global judge prompts (CRUD).
 *   - sessions      : ChatSession[]         — chat history (CRUD + messages).
 *
 * The active conversation is indexed by `currentSessionId`. Each session owns
 * its MoASessionConfig (mode + panel roles + judge selection + prompt refs);
 * the engine resolves providers + templates from the global lists at run time.
 *
 * Streaming correctness is preserved: token deltas are buffered in refs and
 * flushed on a ~60ms throttle (writing into sessions[].messages[].panels and
 * .judges[].raw), and Promise.all stays fail-safe inside the engine for BOTH
 * the panel fan-out and the judge fan-out.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkInputLimits,
  DEFAULT_JUDGE_PROMPTS,
  runMoaSynthesis,
} from "../services/moaEngine";
import i18n from "../i18n";
import {
  type ConfigFile,
  getTemplateConfig,
  loadConfig,
  saveConfig,
} from "../services/configStore";
import type {
  AIProvider,
  ChatSession,
  JudgePromptTemplate,
  JudgeState,
  MoASessionConfig,
  PanelState,
  RoleTemplate,
  SynthesisRequest,
  Turn,
} from "../types/moa";

/* ----------------------------- defaults ----------------------------- */

/** Build a default session config given the current providers + judge prompts.
 *  Used when the user creates a NEW session at runtime. */
function makeDefaultConfig(providers: AIProvider[]): MoASessionConfig {
  const panelIds = providers.slice(0, 3).map((p) => p.id);
  const judgeId =
    providers.length > 3
      ? providers[providers.length - 1].id
      : (providers[0]?.id ?? "");
  return {
    mode: "simple",
    panelIds,
    panelRoles: {},
    judgeIds: judgeId ? [judgeId] : [],
    judgeStrategy: "single",
    judgePromptId: DEFAULT_JUDGE_PROMPTS[0]?.id ?? null,
    collisionJudgePromptIds: [],
  };
}

function makeEmptySession(providers: AIProvider[]): ChatSession {
  return {
    sessionId: genId(),
    title: i18n.t("common.newSession"),
    createdAt: Date.now(),
    config: makeDefaultConfig(providers),
    messages: [],
  };
}

/* ----------------- load-time normalization (post configStore) --------- */

/**
 * Backward-compat for sessions: older configs used singular `judgeId`. Migrate
 * to the new shape and drop references to deleted providers/templates.
 */
function normalizeSessionConfig(
  cfg: Partial<MoASessionConfig> & {
    judgeId?: string | null;
  },
  validProviderIds: Set<string>
): MoASessionConfig {
  let judgeIds: string[] = Array.isArray(cfg.judgeIds)
    ? cfg.judgeIds
    : cfg.judgeId
      ? [cfg.judgeId]
      : [];
  judgeIds = judgeIds.filter((id) => validProviderIds.has(id));

  const panelIds = (cfg.panelIds ?? []).filter((id) =>
    validProviderIds.has(id)
  );

  const panelRoles: Record<string, string> = {};
  for (const [pid, rid] of Object.entries(cfg.panelRoles ?? {})) {
    if (validProviderIds.has(pid)) panelRoles[pid] = rid;
  }

  return {
    mode: cfg.mode ?? "simple",
    panelIds,
    panelRoles,
    judgeIds,
    judgeStrategy: cfg.judgeStrategy ?? "single",
    judgePromptId: cfg.judgePromptId ?? DEFAULT_JUDGE_PROMPTS[0]?.id ?? null,
    collisionJudgePromptIds: cfg.collisionJudgePromptIds ?? [],
  };
}

/** Drop any in-flight (non-terminal) panel/judge state when restoring. */
function sanitizeSessions(sessions: ChatSession[]): ChatSession[] {
  return sessions.map((s) => ({
    ...s,
    messages: s.messages.map((t) => {
      const panels = t.panels.map((p) =>
        p.status === "pending" || p.status === "streaming"
          ? {
              ...p,
              status: "error" as const,
              error: p.error ?? i18n.t("errors.SESSION_INTERRUPTED"),
            }
          : p
      );
      const judges = (t.judges ?? []).map((j) =>
        j.status === "judging" || j.status === "streaming"
          ? {
              ...j,
              status: "error" as const,
              error: j.error ?? i18n.t("errors.SESSION_INTERRUPTED"),
            }
          : j
      );
      return { ...t, panels, judges };
    }),
  }));
}

/**
 * Take a raw ConfigFile from configStore (already shape-normalized there) and
 * apply session-level normalization: sanitize in-flight states + migrate each
 * session's config against the loaded provider-id set + resolve currentSession.
 */
function finalizeConfig(raw: ConfigFile): ConfigFile {
  const validIds = new Set(raw.providers.map((p) => p.id));
  const sessions = sanitizeSessions(raw.sessions).map((s) => ({
    ...s,
    config: normalizeSessionConfig(s.config, validIds),
  }));
  // Ensure currentSessionId still points at an existing session.
  const currentSessionId =
    raw.currentSessionId &&
    sessions.some((s) => s.sessionId === raw.currentSessionId)
      ? raw.currentSessionId
      : (sessions[0]?.sessionId ?? null);
  return { ...raw, sessions, currentSessionId };
}

/* ------------------------------- hook -------------------------------- */

export interface UseMoa {
  // Provider state + CRUD
  providers: AIProvider[];
  addProvider: (partial?: Partial<AIProvider>) => void;
  updateProvider: (id: string, patch: Partial<AIProvider>) => void;
  removeProvider: (id: string) => void;

  // Role template state + CRUD
  roleTemplates: RoleTemplate[];
  addRoleTemplate: (partial?: Partial<RoleTemplate>) => void;
  updateRoleTemplate: (id: string, patch: Partial<RoleTemplate>) => void;
  removeRoleTemplate: (id: string) => void;

  // Judge prompt template state + CRUD
  judgePrompts: JudgePromptTemplate[];
  addJudgePrompt: (partial?: Partial<JudgePromptTemplate>) => void;
  updateJudgePrompt: (id: string, patch: Partial<JudgePromptTemplate>) => void;
  removeJudgePrompt: (id: string) => void;

  // Session state + CRUD
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentSession: ChatSession | null;
  newSession: () => void;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  removeSession: (id: string) => void;
  updateSessionConfig: (id: string, config: Partial<MoASessionConfig>) => void;

  // Sidebar
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // Engine
  running: boolean;
  /** False until the persisted config has been read from disk/storage; the UI
   *  shows a loading screen while false to avoid rendering an empty config. */
  loaded: boolean;
  /** Current UI language ("en" | "zh"). */
  language: "en" | "zh";
  /** Switch language: updates i18next + persists to config. */
  setLanguage: (lng: "en" | "zh") => void;
  /** Current UI theme ("dark" | "light" | "soft"). */
  theme: "dark" | "light" | "soft";
  /** Switch theme: updates data-theme attribute + persists to config. */
  setTheme: (t: "dark" | "light" | "soft") => void;
  lastError: string | null;
  clearError: () => void;
  send: (prompt: string) => Promise<void>;
}

function genId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function titleFromPrompt(prompt: string): string {
  const clean = prompt.trim().replace(/\s+/g, " ");
  return (
    clean.length > 24 ? clean.slice(0, 24) + "…" : clean || i18n.t("common.newSession")
  );
}

export function useMoa(): UseMoa {
  // Config is loaded asynchronously from the file/localStorage backend on
  // mount. State starts empty (or from the template snapshot for instant
  // first paint) and is replaced once loadConfig() resolves.
  const [providers, setProviders] = useState<AIProvider[]>(
    () => getTemplateConfig().providers
  );
  const [roleTemplates, setRoleTemplates] = useState<RoleTemplate[]>(
    () => getTemplateConfig().roleTemplates
  );
  const [judgePrompts, setJudgePrompts] = useState<JudgePromptTemplate[]>(
    () => getTemplateConfig().judgePrompts
  );
  const [sessions, setSessions] = useState<ChatSession[]>(
    () => getTemplateConfig().sessions
  );
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    () => getTemplateConfig().currentSessionId
  );
  const [loaded, setLoaded] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [language, setLanguageState] = useState<"en" | "zh">("en");
  const [theme, setThemeState] = useState<"dark" | "light" | "soft">("dark");

  // Streaming buffers (per run). Both panels and judges now buffer into maps
  // keyed by id, flushed together on a ~60ms throttle.
  const panelBuffers = useRef<Record<string, string>>({});
  const judgeBuffers = useRef<Record<string, string>>({});
  const flushTimer = useRef<number | null>(null);
  const saveTimer = useRef<number | null>(null);

  /* ----------------------- load on mount ----------------------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const raw = await loadConfig();
      if (cancelled) return;
      const finalized = finalizeConfig(raw);
      setProviders(finalized.providers);
      setRoleTemplates(finalized.roleTemplates);
      setJudgePrompts(finalized.judgePrompts);
      setSessions(finalized.sessions);
      setCurrentSessionId(finalized.currentSessionId);
      // Apply persisted language to i18next + local state.
      if (finalized.language) {
        i18n.changeLanguage(finalized.language);
        setLanguageState(finalized.language);
      }
      if (finalized.theme) {
        document.documentElement.setAttribute("data-theme", finalized.theme);
        setThemeState(finalized.theme);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ----------------------- unified persistence ----------------------- */

  // Persist the whole config whenever any domain changes — debounced + with
  // raw-text truncation to keep the file from ballooning. Skipped until the
  // initial load completes (avoids overwriting the file with empty/template
  // state during the brief pre-load window).
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const slim: ConfigFile = {
        providers,
        roleTemplates,
        judgePrompts,
        sessions: sessions.map((s) => ({
          ...s,
          messages: s.messages.map((t) => ({
            ...t,
            panels: t.panels.map((p) => ({
              ...p,
              rawText: p.rawText.slice(0, 4000),
            })),
            judges: t.judges.map((j) => ({
              ...j,
              raw: j.raw.slice(0, 6000),
            })),
          })),
        })),
        currentSessionId,
        language,
        theme,
      };
      void saveConfig(slim);
    }, 600);
  }, [
    loaded,
    providers,
    roleTemplates,
    judgePrompts,
    sessions,
    currentSessionId,
    language,
    theme,
  ]);

  useEffect(() => {
    return () => {
      if (flushTimer.current) window.clearTimeout(flushTimer.current);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, []);

  /* ----------------------- language ---------------------------------- */

  /** Switch the UI language. Updates i18next immediately + persists to config. */
  const setLanguage = useCallback((lng: "en" | "zh") => {
    i18n.changeLanguage(lng);
    setLanguageState(lng);
  }, []);

  /** Switch the UI theme. Updates data-theme attribute + persists to config. */
  const setTheme = useCallback((t: "dark" | "light" | "soft") => {
    document.documentElement.setAttribute("data-theme", t);
    setThemeState(t);
  }, []);

  /* ----------------------- provider CRUD ----------------------------- */

  const addProvider = useCallback((partial?: Partial<AIProvider>) => {
    setProviders((prev) => [
      ...prev,
      {
        id: genId(),
        name: partial?.name ?? (i18n.language === "zh" ? "新模型" : "New model"),
        modelString: partial?.modelString ?? "",
        baseUrl: partial?.baseUrl ?? "https://api.openai.com/v1",
        apiKey: partial?.apiKey ?? "",
        protocol: partial?.protocol ?? "openai",
      },
    ]);
  }, []);

  const updateProvider = useCallback(
    (id: string, patch: Partial<AIProvider>) => {
      setProviders((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      );
    },
    []
  );

  /** Remove a provider AND clean up every session config that referenced it. */
  const removeProvider = useCallback((id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
    setSessions((prev) =>
      prev.map((s) => {
        // Remove the deleted provider's id from panelRoles (if present).
        const panelRoles: Record<string, string> = {};
        for (const [pid, rid] of Object.entries(s.config.panelRoles)) {
          if (pid !== id) panelRoles[pid] = rid;
        }
        return {
          ...s,
          config: {
            ...s.config,
            panelIds: s.config.panelIds.filter((pid) => pid !== id),
            panelRoles,
            judgeIds: s.config.judgeIds.filter((jid) => jid !== id),
          },
        };
      })
    );
  }, []);

  /* ----------------------- role template CRUD ------------------------ */

  const addRoleTemplate = useCallback((partial?: Partial<RoleTemplate>) => {
    setRoleTemplates((prev) => [
      ...prev,
      {
        id: genId(),
        name: partial?.name ?? (i18n.language === "zh" ? "新角色" : "New role"),
        systemPrompt: partial?.systemPrompt ?? "",
      },
    ]);
  }, []);

  const updateRoleTemplate = useCallback(
    (id: string, patch: Partial<RoleTemplate>) => {
      setRoleTemplates((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    []
  );

  /** Remove a role template AND prune its references from all sessions. */
  const removeRoleTemplate = useCallback((id: string) => {
    setRoleTemplates((prev) => prev.filter((r) => r.id !== id));
    setSessions((prev) =>
      prev.map((s) => {
        const panelRoles: Record<string, string> = {};
        for (const [pid, rid] of Object.entries(s.config.panelRoles)) {
          if (rid !== id) panelRoles[pid] = rid;
        }
        return { ...s, config: { ...s.config, panelRoles } };
      })
    );
  }, []);

  /* ----------------------- judge prompt CRUD ------------------------- */

  const addJudgePrompt = useCallback(
    (partial?: Partial<JudgePromptTemplate>) => {
      setJudgePrompts((prev) => [
        ...prev,
        {
          id: genId(),
          name:
            partial?.name ??
            (i18n.language === "zh" ? "新裁判提示词" : "New judge prompt"),
          systemPrompt: partial?.systemPrompt ?? "",
        },
      ]);
    },
    []
  );

  const updateJudgePrompt = useCallback(
    (id: string, patch: Partial<JudgePromptTemplate>) => {
      setJudgePrompts((prev) =>
        prev.map((j) => (j.id === id ? { ...j, ...patch } : j))
      );
    },
    []
  );

  /** Remove a judge prompt AND null/strip its references from session configs. */
  const removeJudgePrompt = useCallback((id: string) => {
    setJudgePrompts((prev) => prev.filter((j) => j.id !== id));
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        config: {
          ...s.config,
          judgePromptId: s.config.judgePromptId === id ? null : s.config.judgePromptId,
          collisionJudgePromptIds: s.config.collisionJudgePromptIds.filter(
            (pid) => pid !== id
          ),
        },
      }))
    );
  }, []);

  /* ----------------------- session CRUD ------------------------------ */

  const newSession = useCallback(() => {
    setSessions((prev) => {
      const created = makeEmptySession(providers);
      setCurrentSessionId(created.sessionId);
      return [created, ...prev];
    });
  }, [providers]);

  const selectSession = useCallback((id: string) => {
    setCurrentSessionId(id);
  }, []);

  const renameSession = useCallback((id: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.sessionId === id ? { ...s, title } : s))
    );
  }, []);

  const removeSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.sessionId !== id);
        if (id === currentSessionId) {
          setCurrentSessionId(next[0]?.sessionId ?? null);
        }
        return next;
      });
    },
    [currentSessionId]
  );

  const updateSessionConfig = useCallback(
    (id: string, config: Partial<MoASessionConfig>) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId === id
            ? { ...s, config: { ...s.config, ...config } }
            : s
        )
      );
    },
    []
  );

  const currentSession =
    sessions.find((s) => s.sessionId === currentSessionId) ?? null;

  /* --------------------- streaming-aware helpers --------------------- */

  /** Throttled flush of BOTH panel and judge buffered deltas into the turn. */
  const scheduleFlush = useCallback((sessionId: string, turnId: string) => {
    if (flushTimer.current) return; // already pending
    flushTimer.current = window.setTimeout(() => {
      flushTimer.current = null;
      const panels = { ...panelBuffers.current };
      const judges = { ...judgeBuffers.current };
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId !== sessionId
            ? s
            : {
                ...s,
                messages: s.messages.map((t) => {
                  if (t.id !== turnId) return t;
                  return {
                    ...t,
                    panels: t.panels.map((p) =>
                      panels[p.providerId] !== undefined
                        ? { ...p, rawText: panels[p.providerId] }
                        : p
                    ),
                    judges: t.judges.map((j) =>
                      judges[j.judgeId] !== undefined
                        ? { ...j, raw: judges[j.judgeId] }
                        : j
                    ),
                  };
                }),
              }
        )
      );
    }, 60);
  }, []);

  /* ---------------------------- send --------------------------------- */

  const send = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || running) return;
      setLastError(null);

      const session = currentSession;
      if (!session) return;

      const { config } = session;
      if (config.panelIds.length === 0 || config.judgeIds.length === 0) return;

      // Resolve panel providers + snapshot their role names.
      const panelProviders = providers.filter((p) =>
        config.panelIds.includes(p.id)
      );
      if (panelProviders.length === 0) return;

      // Resolve judges per mode + strategy.
      const judgeProviders = providers.filter((p) =>
        config.judgeIds.includes(p.id)
      );
      if (judgeProviders.length === 0) return;

      // --- Input circuit breaker -----------------------------------------
      // Derive limits from the smallest selected panel's context window.
      // If no panel has a configured context window, fall back to defaults.
      const history = session.messages
        .map(
          (t) =>
            `${t.prompt}\n${t.panels.map((p) => p.rawText).join("\n")}\n${t.judges
              .map((j) => j.raw)
              .join("\n")}`
        )
        .join("\n\n");
      const configuredLimits = panelProviders
        .map((p) => p.capabilities?.maxContextChars)
        .filter((v): v is number => typeof v === "number" && v > 0);
      const minContext =
        configuredLimits.length > 0 ? Math.min(...configuredLimits) : undefined;
      const promptLimit = minContext
        ? Math.floor(minContext * 0.5)
        : undefined;
      const contextLimit = minContext
        ? Math.floor(minContext * 0.8)
        : undefined;
      const limitCheck = checkInputLimits(
        trimmed,
        history,
        promptLimit,
        contextLimit
      );
      if (!limitCheck.ok) {
        setLastError(limitCheck.reason ?? i18n.t("errors.INPUT_INVALID"));
        return;
      }

      const sessionId = session.sessionId;
      const turnId = genId();

      // --- Resolve per-panel role prompts (template id → systemPrompt) ---
      const panelRoles: Record<string, string> = {};
      const roleNameById: Record<string, string> = {};
      for (const p of panelProviders) {
        const roleId = config.panelRoles[p.id];
        if (roleId) {
          const tpl = roleTemplates.find((r) => r.id === roleId);
          if (tpl) {
            panelRoles[p.id] = tpl.systemPrompt;
            roleNameById[p.id] = tpl.name;
          }
        }
      }

      // --- Resolve per-judge prompts (template id → systemPrompt) --------
      // Single strategy / simple mode: one judge uses judgePromptId.
      // Collision strategy: each judge uses its aligned collisionJudgePromptIds
      // entry (falling back to default if misaligned).
      const defaultPrompt = judgePrompts[0]?.systemPrompt;
      const resolveJudgePrompt = (idx: number): string => {
        if (config.judgeStrategy === "collision") {
          const pid = config.collisionJudgePromptIds[idx];
          if (pid) {
            const tpl = judgePrompts.find((j) => j.id === pid);
            if (tpl) return tpl.systemPrompt;
          }
          return defaultPrompt ?? "";
        }
        // single / simple
        if (config.judgePromptId) {
          const tpl = judgePrompts.find((j) => j.id === config.judgePromptId);
          if (tpl) return tpl.systemPrompt;
        }
        return defaultPrompt ?? "";
      };

      const requestJudges = judgeProviders.map((jp, idx) => ({
        providerId: jp.id,
        systemPrompt: resolveJudgePrompt(idx),
      }));

      // Reset buffers for this run.
      panelBuffers.current = {};
      for (const p of panelProviders) panelBuffers.current[p.id] = "";
      judgeBuffers.current = {};
      for (const jp of judgeProviders) judgeBuffers.current[jp.id] = "";

      const newTurn: Turn = {
        id: turnId,
        prompt: trimmed,
        createdAt: Date.now(),
        panels: panelProviders.map<PanelState>((p) => ({
          providerId: p.id,
          label: p.name,
          model: p.modelString,
          status: "pending",
          rawText: "",
          roleName: roleNameById[p.id],
        })),
        judges: judgeProviders.map<JudgeState>((jp) => ({
          judgeId: jp.id,
          label: jp.name,
          status: "pending",
          raw: "",
          response: null,
        })),
      };

      setSessions((prev) =>
        prev.map((s) => {
          if (s.sessionId !== sessionId) return s;
          const isFirst = s.messages.length === 0;
          return {
            ...s,
            title: isFirst ? titleFromPrompt(trimmed) : s.title,
            messages: [...s.messages, newTurn],
          };
        })
      );
      setRunning(true);

      // --- Local mutators scoped to this (session, turn) ----------------
      const setPanel = (providerId: string, patch: Partial<PanelState>) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.sessionId !== sessionId
              ? s
              : {
                  ...s,
                  messages: s.messages.map((t) =>
                    t.id !== turnId
                      ? t
                      : {
                          ...t,
                          panels: t.panels.map((p) =>
                            p.providerId === providerId
                              ? { ...p, ...patch }
                              : p
                          ),
                        }
                  ),
                }
          )
        );
      };

      const setJudge = (judgeId: string, patch: Partial<JudgeState>) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.sessionId !== sessionId
              ? s
              : {
                  ...s,
                  messages: s.messages.map((t) =>
                    t.id !== turnId
                      ? t
                      : {
                          ...t,
                          judges: t.judges.map((j) =>
                            j.judgeId === judgeId ? { ...j, ...patch } : j
                          ),
                        }
                  ),
                }
          )
        );
      };

      const request: SynthesisRequest = {
        prompt: trimmed,
        panelIds: config.panelIds,
        panelRoles,
        judges: requestJudges,
      };

      try {
        await runMoaSynthesis(request, providers, {
          onPanelStart: (pid) => {
            panelBuffers.current[pid] = "";
            setPanel(pid, { status: "streaming", rawText: "" });
          },
          onPanelDelta: (pid, delta) => {
            panelBuffers.current[pid] =
              (panelBuffers.current[pid] ?? "") + delta;
            scheduleFlush(sessionId, turnId);
          },
          onPanelRetry: (pid) => {
            panelBuffers.current[pid] = "";
            setPanel(pid, { status: "streaming", rawText: "" });
          },
          onPanelDone: (pid, text) => {
            panelBuffers.current[pid] = text;
            setPanel(pid, { status: "done", rawText: text });
          },
          onPanelError: (pid, message) => {
            setPanel(pid, { status: "error", error: message });
          },
          onPanelSkipped: (pid, reason) => {
            setPanel(pid, { status: "skipped", error: reason });
          },
          onJudgeStart: (jid) => {
            judgeBuffers.current[jid] = "";
            setJudge(jid, { status: "judging", raw: "" });
          },
          onJudgeDelta: (jid, delta) => {
            judgeBuffers.current[jid] =
              (judgeBuffers.current[jid] ?? "") + delta;
            setSessions((prev) =>
              prev.map((s) =>
                s.sessionId !== sessionId
                  ? s
                  : {
                      ...s,
                      messages: s.messages.map((t) =>
                        t.id === turnId
                          ? {
                              ...t,
                              judges: t.judges.map((j) =>
                                j.judgeId === jid && j.status === "judging"
                                  ? { ...j, status: "streaming" }
                                  : j
                              ),
                            }
                          : t
                      ),
                    }
              )
            );
            scheduleFlush(sessionId, turnId);
          },
          onJudgeDone: (jid, response, raw) => {
            judgeBuffers.current[jid] = raw;
            setJudge(jid, { status: "done", response, raw });
          },
          onJudgeError: (jid, message) => {
            setJudge(jid, { status: "error", error: message });
          },
        });
      } finally {
        // Safety: commit any buffered tail text before yielding.
        if (flushTimer.current) {
          window.clearTimeout(flushTimer.current);
          flushTimer.current = null;
          // Run one final synchronous flush of whatever remains buffered.
          const panels = { ...panelBuffers.current };
          const judges = { ...judgeBuffers.current };
          setSessions((prev) =>
            prev.map((s) =>
              s.sessionId !== sessionId
                ? s
                : {
                    ...s,
                    messages: s.messages.map((t) => {
                      if (t.id !== turnId) return t;
                      return {
                        ...t,
                        panels: t.panels.map((p) =>
                          panels[p.providerId] !== undefined
                            ? { ...p, rawText: panels[p.providerId] }
                            : p
                        ),
                        judges: t.judges.map((j) =>
                          judges[j.judgeId] !== undefined
                            ? { ...j, raw: judges[j.judgeId] }
                            : j
                        ),
                      };
                    }),
                  }
            )
          );
        }
        setRunning(false);
      }
    },
    [
      currentSession,
      providers,
      roleTemplates,
      judgePrompts,
      running,
      scheduleFlush,
    ]
  );

  return {
    providers,
    addProvider,
    updateProvider,
    removeProvider,
    roleTemplates,
    addRoleTemplate,
    updateRoleTemplate,
    removeRoleTemplate,
    judgePrompts,
    addJudgePrompt,
    updateJudgePrompt,
    removeJudgePrompt,
    sessions,
    currentSessionId,
    currentSession,
    newSession,
    selectSession,
    renameSession,
    removeSession,
    updateSessionConfig,
    sidebarOpen,
    toggleSidebar: () => setSidebarOpen((v) => !v),
    running,
    loaded,
    language,
    setLanguage,
    theme,
    setTheme,
    lastError,
    clearError: () => setLastError(null),
    send,
  };
}
