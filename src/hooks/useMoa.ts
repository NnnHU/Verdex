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
import { getMemoryConfig } from "../services/envConfig";
import { buildHistory } from "../services/memoryBuilder";
import { shouldMapReduce } from "../services/mapreduceStrategy";
import { summarizeHistory } from "../services/summarizer";
import { cleanText } from "../services/cleaner";
import { packFromTurn } from "../services/assetPacker";
import { classifyAsset, resolveCategories } from "../services/assetClassifier";
import type {
  AIProvider,
  AssetCategory,
  Attachment,
  ChatMessage,
  ChatSession,
  ExtractSchemaTemplate,
  JudgePromptTemplate,
  JudgeState,
  KnowledgeAsset,
  MapOutputState,
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
    memoryEnabled: true,
    taskType: "quick_qa",
    extractSchemaId: null,
    cleanAttachments: false,
    autoSaveAsset: false,
    referenceAssetIds: [],
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
    memoryEnabled: cfg.memoryEnabled ?? true,
    // Back-compat: accept legacy outputMode, map to taskType.
    // New field takes priority; old field used as fallback.
    taskType: resolveTaskType((cfg as { taskType?: string; outputMode?: string }).taskType, (cfg as { outputMode?: string }).outputMode),
    extractSchemaId: cfg.extractSchemaId ?? null,
    cleanAttachments: cfg.cleanAttachments ?? false,
    autoSaveAsset: (cfg as { autoSaveAsset?: boolean }).autoSaveAsset ?? false,
    referenceAssetIds: Array.isArray((cfg as { referenceAssetIds?: string[] }).referenceAssetIds)
      ? (cfg as { referenceAssetIds?: string[] }).referenceAssetIds!
      : [],
  };
}

/** Resolve taskType from new field or legacy outputMode. */
function resolveTaskType(
  taskType?: string,
  legacyOutputMode?: string
): "document_extract" | "document_analysis" | "quick_qa" {
  if (taskType === "document_extract" || taskType === "document_analysis" || taskType === "quick_qa") {
    return taskType;
  }
  // Legacy mapping
  if (legacyOutputMode === "extract" || legacyOutputMode === "mapreduce") return "document_extract";
  return "quick_qa";
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

  // Extract-schema template state + CRUD (Stage 3)
  extractSchemas: ExtractSchemaTemplate[];
  addExtractSchema: (partial?: Partial<ExtractSchemaTemplate>) => void;
  updateExtractSchema: (id: string, patch: Partial<ExtractSchemaTemplate>) => void;
  removeExtractSchema: (id: string) => void;

  // Knowledge Asset state + CRUD (Stage 4)
  knowledgeAssets: KnowledgeAsset[];
  addKnowledgeAsset: (asset: KnowledgeAsset) => void;
  removeKnowledgeAsset: (id: string) => void;
  classifyKnowledgeAsset: (assetId: string) => Promise<void>;
  assetCategories: AssetCategory[];
  classifyModelId: string | null;
  setClassifyModelId: (id: string | null) => void;
  addAssetCategory: (name: string) => string;
  removeAssetCategory: (id: string) => void;
  updateAssetCategories: (assetId: string, categoryIds: string[]) => void;

  // Session state + CRUD
  sessions: ChatSession[];
  currentSessionId: string | null;
  currentSession: ChatSession | null;
  newSession: () => void;
  selectSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  removeSession: (id: string) => void;
  updateSessionConfig: (id: string, config: Partial<MoASessionConfig>) => void;

  // Attachments (Stage 2 document input)
  addAttachments: (sessionId: string, attachments: Attachment[]) => void;
  removeAttachment: (sessionId: string, attachmentId: string) => void;
  /** Stage 5: ASR-clean one attachment in-place (sets cleanedText).
   *  Optionally pass the source text directly (avoids stale-session reads). */
  cleanAttachment: (sessionId: string, attachmentId: string, sourceText?: string) => Promise<void>;

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
  /** Surface a message to the user via the global error banner. */
  setError: (msg: string | null) => void;
  send: (prompt: string) => Promise<void>;
  /** Abort the in-flight synthesis (Stop button). No-op if not running. */
  stop: () => void;
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
  const [extractSchemas, setExtractSchemas] = useState<ExtractSchemaTemplate[]>(
    () => getTemplateConfig().extractSchemas
  );
  const [knowledgeAssets, setKnowledgeAssets] = useState<KnowledgeAsset[]>([]);
  const [assetCategories, setAssetCategories] = useState<AssetCategory[]>([]);
  const [classifyModelId, setClassifyModelId] = useState<string | null>(null);
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
  /** AbortController for the in-flight synthesis (Stop button). */
  const abortRef = useRef<AbortController | null>(null);
  /** Guard against duplicate asset packing (React StrictMode double-invoke). */
  const packedTurnsRef = useRef<Set<string>>(new Set());

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
      setExtractSchemas(finalized.extractSchemas);
      setKnowledgeAssets(finalized.knowledgeAssets);
      setAssetCategories(finalized.assetCategories);
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
        extractSchemas,
        knowledgeAssets,
        assetCategories,
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
    extractSchemas,
    knowledgeAssets,
    assetCategories,
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

  /* --- Extract-schema CRUD (Stage 3) --- */

  const addExtractSchema = useCallback(
    (partial?: Partial<ExtractSchemaTemplate>) => {
      setExtractSchemas((prev) => [
        ...prev,
        {
          id: genId(),
          name:
            partial?.name ??
            (i18n.language === "zh" ? "新抽取模板" : "New extract schema"),
          systemPrompt: partial?.systemPrompt ?? "",
          requiredKeys: partial?.requiredKeys ?? [],
        },
      ]);
    },
    []
  );

  const updateExtractSchema = useCallback(
    (id: string, patch: Partial<ExtractSchemaTemplate>) => {
      setExtractSchemas((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
      );
    },
    []
  );

  /** Remove an extract schema AND null its session references. */
  const removeExtractSchema = useCallback((id: string) => {
    setExtractSchemas((prev) => prev.filter((s) => s.id !== id));
    setSessions((prev) =>
      prev.map((s) => ({
        ...s,
        config: {
          ...s.config,
          extractSchemaId:
            s.config.extractSchemaId === id ? null : s.config.extractSchemaId,
        },
      }))
    );
  }, []);

  /* --- Knowledge Asset CRUD (Stage 4) --- */

  const addKnowledgeAsset = useCallback((asset: KnowledgeAsset) => {
    setKnowledgeAssets((prev) => [{ ...asset, categories: [] }, ...prev]);
    // Auto-classify in background (best-effort, non-blocking).
    queueMicrotask(() => {
      void classifyKnowledgeAssetInner(asset.id);
    });
  }, []);

  /** Inner classifier that reads latest state (avoids closure staleness). */
  const classifyKnowledgeAssetInner = async (assetId: string) => {
    // Read from latest state via functional update pattern.
    let assetToClassify: KnowledgeAsset | undefined;
    let catsSnapshot: AssetCategory[] = [];
    setKnowledgeAssets((prev) => {
      assetToClassify = prev.find((a) => a.id === assetId);
      return prev;
    });
    setAssetCategories((prev) => {
      catsSnapshot = prev;
      return prev;
    });
    if (!assetToClassify) return;
    const provider = classifyModelId
      ? providers.find((p) => p.id === classifyModelId)
      : providers[0];
    if (!provider) return;
    const memCfg = getMemoryConfig();
    const names = await classifyAsset(assetToClassify!, catsSnapshot, provider, memCfg.requestTimeoutMs);
    if (names.length === 0) return;
    const { matchedIds, newCategories } = resolveCategories(names, catsSnapshot);
    if (newCategories.length > 0) {
      setAssetCategories((prev) => [...prev, ...newCategories]);
    }
    const allIds = [...matchedIds, ...newCategories.map((c) => c.id)];
    setKnowledgeAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, categories: allIds } : a))
    );
  };

  const removeKnowledgeAsset = useCallback((id: string) => {
    setKnowledgeAssets((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /* --- Asset Category CRUD + Classifier (Stage 3 Vault) --- */

  const addAssetCategory = useCallback((name: string) => {
    const id = crypto.randomUUID();
    setAssetCategories((prev) => [...prev, { id, name, isAuto: false }]);
    return id;
  }, []);

  const updateAssetCategories = useCallback(
    (assetId: string, categoryIds: string[]) => {
      setKnowledgeAssets((prev) =>
        prev.map((a) =>
          a.id === assetId ? { ...a, categories: categoryIds } : a
        )
      );
    },
    []
  );

  const removeAssetCategory = useCallback((id: string) => {
    setAssetCategories((prev) => prev.filter((c) => c.id !== id));
    // Also remove the category id from all assets.
    setKnowledgeAssets((prev) =>
      prev.map((a) => ({
        ...a,
        categories: a.categories.filter((cId) => cId !== id),
      }))
    );
  }, []);

  /** Classify an asset using AI, then update its categories + create new ones. */
  const classifyKnowledgeAsset = useCallback(
    async (assetId: string) => {
      const asset = knowledgeAssets.find((a) => a.id === assetId);
      if (!asset) return;
      const provider = providers[0];
      if (!provider) return;
      const memCfg = getMemoryConfig();
      const names = await classifyAsset(asset, assetCategories, provider, memCfg.requestTimeoutMs);
      if (names.length === 0) return;
      const { matchedIds, newCategories } = resolveCategories(names, assetCategories);
      // Add new categories.
      if (newCategories.length > 0) {
        setAssetCategories((prev) => [...prev, ...newCategories]);
      }
      // Update asset's categories.
      const allIds = [...matchedIds, ...newCategories.map((c) => c.id)];
      setKnowledgeAssets((prev) =>
        prev.map((a) =>
          a.id === assetId ? { ...a, categories: allIds } : a
        )
      );
    },
    [knowledgeAssets, assetCategories, providers]
  );

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

  /* --- Attachment CRUD (Stage 2 document input) ---
   * Attachments live on the session. send() splices their text into the prompt
   * (Stage 2 usage); Stage 4 Map-Reduce will read them directly as the corpus. */

  /** Append attachments to a session (dedup by name to avoid double-loading). */
  const addAttachments = useCallback(
    (sessionId: string, additions: Attachment[]) => {
      if (additions.length === 0) return;
      setSessions((prev) =>
        prev.map((s) => {
          if (s.sessionId !== sessionId) return s;
          const existing = s.attachments ?? [];
          const existingNames = new Set(existing.map((a) => a.name));
          const fresh = additions.filter((a) => !existingNames.has(a.name));
          return { ...s, attachments: [...existing, ...fresh] };
        })
      );
    },
    []
  );

  /** Remove one attachment by id. */
  const removeAttachment = useCallback(
    (sessionId: string, attachmentId: string) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.sessionId !== sessionId) return s;
          const next = (s.attachments ?? []).filter(
            (a) => a.id !== attachmentId
          );
          return { ...s, attachments: next };
        })
      );
    },
    []
  );

  /** Stage 5: ASR-clean one attachment in-place. Uses the first provider as
   *  the cleaning model. Best-effort; on failure marks cleaned but keeps text.
   *  sourceText lets the caller pass the text directly (avoids stale-session
   *  reads when cleaning right after addAttachments, before re-render). */
  const cleanAttachment = useCallback(
    async (sessionId: string, attachmentId: string, sourceText?: string) => {
      // Prefer the caller-supplied text; fall back to reading from current state.
      const textToClean =
        sourceText ??
        sessions.find((s) => s.sessionId === sessionId)?.attachments?.find(
          (a) => a.id === attachmentId
        )?.text;
      if (!textToClean) return;
      const provider = providers[0];
      if (!provider) return;
      const memCfg = getMemoryConfig();
      // Mark "cleaning in progress" immediately so the UI can show it.
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId !== sessionId
            ? s
            : {
                ...s,
                attachments: (s.attachments ?? []).map((a) =>
                  a.id === attachmentId ? { ...a, cleaned: false } : a
                ),
              }
        )
      );
      const cleaned = await cleanText(textToClean, provider, memCfg.requestTimeoutMs);
      setSessions((prev) =>
        prev.map((s) =>
          s.sessionId !== sessionId
            ? s
            : {
                ...s,
                attachments: (s.attachments ?? []).map((a) =>
                  a.id === attachmentId
                    ? { ...a, cleanedText: cleaned, cleaned: true }
                    : a
                ),
              }
        )
      );
    },
    [sessions, providers]
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
      const memCfg = getMemoryConfig();
      // document_extract needs only a Judge (extraction model); Panel irrelevant.
      // document_analysis and quick_qa need both Panel and Judge.
      if (config.taskType === "document_extract") {
        if (config.judgeIds.length === 0) return;
      } else if (config.panelIds.length === 0 || config.judgeIds.length === 0) {
        return;
      }

      // --- Build the effective prompt (Stage 2: splice attachments) -------
      // Attachments are prepended to the user's prompt each turn. We keep
      // `trimmed` as the user's literal input (stored on the turn, used for the
      // title) and only the *effective* prompt sent to the model carries the
      // document text. This keeps session.messages compact; the attachment
      // corpus already lives on session.attachments.
      const atts = session.attachments ?? [];

      // Stage 5: if any attachment is mid-cleaning (cleaned === false), wait
      // for it to finish before sending, so we never use un-cleaned text when
      // the user expects cleaning. Re-reads latest state after waiting.
      const pendingClean = atts.filter((a) => a.cleaned === false);
      if (pendingClean.length > 0) {
        setLastError(i18n.t("memory.waitingClean", { count: pendingClean.length }));
        await Promise.all(
          pendingClean.map((a) => cleanAttachment(sessionId, a.id, a.text))
        );
        setLastError(null);
        // Re-read the session to get the cleaned texts.
        const refreshed = sessions.find((s) => s.sessionId === sessionId);
        if (refreshed) {
          const refreshedAtts = refreshed.attachments ?? [];
          // Merge any newly-cleaned texts back into our local atts snapshot.
          for (const a of atts) {
            const r = refreshedAtts.find((x) => x.id === a.id);
            if (r?.cleanedText) a.cleanedText = r.cleanedText;
            if (r?.cleaned !== undefined) a.cleaned = r.cleaned;
          }
        }
      }

      // Stage 4: decide whether to run Map-Reduce. In mapreduce output mode we
      // ask the strategy; otherwise never (verdict/extract splice attachments
      // into the prompt as before).
      const mrDecision =
        config.taskType === "document_extract"
          ? shouldMapReduce(
              atts,
              memCfg.defaultMaxContextChars,
              memCfg.mapreduceTriggerRatio,
              memCfg.mapreduceForce,
              memCfg.mapreduceDocCountThreshold
            )
          : null;
      const useMapReduce = mrDecision?.enabled ?? false;

      const attachmentBlock =
        atts.length > 0 && !useMapReduce
          ? atts
              .map(
                (a) =>
                  `【${i18n.t("chatInput.attachmentLabel", { name: a.name })}】\n${a.cleanedText ?? a.text}`
              )
              .join("\n\n")
          : "";
      // In mapreduce mode, the prompt carries only the user question; the
      // corpus goes through request.attachments for per-document Map calls.
      const effectivePrompt = attachmentBlock
        ? `${attachmentBlock}\n\n${trimmed}`
        : trimmed;

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
        effectivePrompt,
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

      // --- Stage 4: inject referenced Knowledge Assets into Panel context ---
      if (config.referenceAssetIds.length > 0) {
        const refAssets = config.referenceAssetIds
          .map((id) => knowledgeAssets.find((a) => a.id === id))
          .filter((a): a is KnowledgeAsset => Boolean(a));
        if (refAssets.length > 0) {
          const assetCtx = refAssets
            .map(
              (a, i) =>
                `【${i18n.language === "zh" ? "参考知识资产" : "Reference Asset"} ${i + 1}: ${a.name}】\n${a.description}\n${i18n.language === "zh" ? "共识" : "Consensus"}: ${a.consensus}\n${i18n.language === "zh" ? "分歧" : "Divergences"}: ${a.divergences || "—"}\n${i18n.language === "zh" ? "盲点" : "Blindspots"}: ${a.blindspots || "—"}\n${i18n.language === "zh" ? "结论" : "Verdict"}: ${a.verdict || "—"}`
            )
            .join("\n\n");
          for (const p of panelProviders) {
            panelRoles[p.id] = panelRoles[p.id]
              ? `${assetCtx}\n\n${panelRoles[p.id]}`
              : assetCtx;
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

      // Schema extraction applies to document_extract and document_analysis tasks.
      const extractSchema =
        (config.taskType === "document_extract" || config.taskType === "document_analysis") &&
        config.extractSchemaId
          ? extractSchemas.find((s) => s.id === config.extractSchemaId)
          : undefined;

      const requestJudges = judgeProviders.map((jp, idx) => {
        if (extractSchema) {
          return {
            providerId: jp.id,
            systemPrompt: extractSchema.systemPrompt,
            outputKind: "extract" as const,
            requiredKeys: extractSchema.requiredKeys,
          };
        }
        return {
          providerId: jp.id,
          systemPrompt: resolveJudgePrompt(idx),
          outputKind: "verdict" as const,
        };
      });

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
        // Stage 4 mapreduce slots (only populated when useMapReduce).
        mapOutputs: useMapReduce
          ? atts.map<MapOutputState>((a) => ({
              attachmentId: a.id,
              name: a.name,
              status: "pending",
            }))
          : undefined,
        mergedResult: useMapReduce ? null : undefined,
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
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      // --- document_analysis: 先提取(阶段1) → 再分析(阶段2+3) -----------
      // 先用第一个 judge provider 做 Extract，把结构化精华作为 Panel 的输入。
      let analysisPrompt = effectivePrompt;
      let analysisOutputKind: "verdict" | "extract" =
        config.taskType === "quick_qa" ? "verdict" : "extract";

      if (config.taskType === "document_analysis" && atts.length > 0) {
        const extractSchema =
          config.extractSchemaId &&
          extractSchemas.find((s) => s.id === config.extractSchemaId);
        const extractProvider = judgeProviders[0] || panelProviders[0];
        if (extractSchema && extractProvider) {
          setLastError(i18n.t("taskStatus.extracting"));
          try {
            const { streamChat } = await import("../services/httpClient");
            const docBlock = atts
              .map(
                (a) =>
                  `【${i18n.t("chatInput.attachmentLabel", { name: a.name })}】\n${a.cleanedText ?? a.text}`
              )
              .join("\n\n");
            const extractSys = extractSchema.systemPrompt.includes("{PANELS}")
              ? extractSchema.systemPrompt.replace("{PANELS}", docBlock)
              : `${extractSchema.systemPrompt}\n\n${docBlock}`;
            const extractedRaw = await streamChat(
              {
                baseUrl: extractProvider.baseUrl,
                apiKey: extractProvider.apiKey,
                model: extractProvider.modelString,
                messages: [
                  { role: "system", content: extractSys },
                  {
                    role: "user",
                    content: `${trimmed}\n\n请按指定 JSON 结构抽取并输出。`,
                  },
                ],
                temperature: 0.3,
                maxTokens: 8192,
                timeoutMs: memCfg.requestTimeoutMs,
                protocol: extractProvider.protocol,
              },
              () => undefined,
              signal
            );
            // 阶段1完成：把提取结果作为"文档精华"注入 Panel 分析
            analysisPrompt = `${i18n.t("taskStatus.extractedSummary")}\n\`\`\`json\n${extractedRaw}\n\`\`\`\n\n${i18n.t("taskStatus.analyzeQuestion")}: ${trimmed}`;
            analysisOutputKind = "verdict"; // 阶段2+3走 Panel→Judge
            setLastError(null);
          } catch (e) {
            setLastError(i18n.t("taskStatus.extractFailed") + ": " + (e as Error).message);
            return;
          }
        }
      }

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

      // Stage 4 mapreduce: patch one document's Map output state on the turn.
      const setMapOutput = (attachmentId: string, patch: Partial<MapOutputState>) => {
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
                          mapOutputs: (t.mapOutputs ?? []).map((m) =>
                            m.attachmentId === attachmentId ? { ...m, ...patch } : m
                          ),
                        }
                  ),
                }
          )
        );
      };
      // Stage 4 mapreduce: patch the Reduce merged result on the turn.
      const setMerged = (patch: Partial<Pick<Turn, "mergedResult">>) => {
        setSessions((prev) =>
          prev.map((s) =>
            s.sessionId !== sessionId
              ? s
              : {
                  ...s,
                  messages: s.messages.map((t) =>
                    t.id !== turnId ? t : { ...t, ...patch }
                  ),
                }
          )
        );
      };

      // --- Build per-provider history (Stage 1a multi-turn memory) --------
      // Each Panel/Judge sees ONLY its own prior turns. Reconstructed from
      // session.messages, sliding-windowed to recent N turns. The engine does
      // the ratio-based trim; here we just assemble the recent-N window.
      let panelHistory: Record<string, ChatMessage[]> | undefined;
      let judgeHistory: Record<string, ChatMessage[]> | undefined;
      if (config.memoryEnabled && session.messages.length > 0) {
        panelHistory = {};
        for (const p of panelProviders) {
          const h = buildHistory(
            session,
            p.id,
            false,
            memCfg.recentTurns
          );
          if (h.length > 0) panelHistory[p.id] = h;
        }
        judgeHistory = {};
        for (const jp of judgeProviders) {
          const h = buildHistory(
            session,
            jp.id,
            true,
            memCfg.recentTurns
          );
          if (h.length > 0) judgeHistory[jp.id] = h;
        }
      }

      // --- Stage 1b: hierarchical summary memory --------------------------
      // When the conversation extends well past the recent window, compress the
      // early turns into a structured summary (con.txt four categories) and
      // inject it as a leading system message before each provider's recent
      // history. This replaces 1a's pure-drop behavior with summary-then-keep.
      let sessionSummary = session.summary;
      if (
        config.memoryEnabled &&
        config.taskType !== "document_extract" && // document_extract (mapreduce) has its own corpus; skip
        session.messages.length > memCfg.recentTurns
      ) {
        const summaryUpTo = session.summaryUpTo ?? 0;
        const unsummarizedCount = session.messages.length - memCfg.recentTurns - summaryUpTo;
        // Re-summarize only when enough new turns accumulated beyond the window.
        const needFreshSummary =
          !sessionSummary || unsummarizedCount >= memCfg.summaryInterval;
        if (needFreshSummary) {
          // Pick the summarization model: .env SUMMARY_MODEL, else first judge provider.
          const summaryProvider =
            (memCfg.summaryModel &&
              providers.find(
                (p) => p.modelString === memCfg.summaryModel
              )) ||
            judgeProviders[0] ||
            panelProviders[0];
          if (summaryProvider) {
            const earlyTurns = session.messages.slice(
              summaryUpTo,
              session.messages.length - memCfg.recentTurns
            );
            if (earlyTurns.length > 0) {
              const newSummary = await summarizeHistory(
                earlyTurns,
                sessionSummary,
                summaryProvider,
                memCfg.requestTimeoutMs
              );
              if (newSummary) {
                sessionSummary = newSummary;
                const newUpTo = session.messages.length - memCfg.recentTurns;
                // Persist onto the session so it survives across turns.
                setSessions((prev) =>
                  prev.map((s) =>
                    s.sessionId !== sessionId
                      ? s
                      : { ...s, summary: newSummary, summaryUpTo: newUpTo }
                  )
                );
              }
            }
          }
        }
        // Inject the summary as a leading system message for every provider.
        if (sessionSummary && panelHistory) {
          const summaryMsg: ChatMessage = {
            role: "system",
            content: `${i18n.t("memory.summaryPrefix")}\n${sessionSummary}`,
          };
          for (const id of Object.keys(panelHistory)) {
            panelHistory[id] = [summaryMsg, ...panelHistory[id]];
          }
        }
        if (sessionSummary && judgeHistory) {
          const summaryMsg: ChatMessage = {
            role: "system",
            content: `${i18n.t("memory.summaryPrefix")}\n${sessionSummary}`,
          };
          for (const id of Object.keys(judgeHistory)) {
            judgeHistory[id] = [summaryMsg, ...judgeHistory[id]];
          }
        }
      }

      // Determine the effective request output mode:
      // - mapreduce mode + triggered → "mapreduce" (per-doc Map→Reduce)
      // - mapreduce mode + NOT triggered (auto-degraded) → "extract" (single-pass
      //   with the schema; attachments already spliced into effectivePrompt above)
      // Determine engine routing from taskType + mapreduce decision:
      // document_analysis 已在上面预处理（先 Extract → 精华注入 analysisPrompt）。
      // document_extract 走 Extract/Map-Reduce；quick_qa 走 Panel→Judge。
      const request: SynthesisRequest = {
        prompt: analysisPrompt,
        panelIds: config.panelIds,
        panelRoles,
        judges: requestJudges,
        panelHistory,
        judgeHistory,
        timeoutMs: memCfg.requestTimeoutMs,
        outputKind: analysisOutputKind,
        taskType: useMapReduce ? "document_extract" : config.taskType,
        attachments: useMapReduce
          ? atts.map((a) =>
              a.cleanedText ? { ...a, text: a.cleanedText } : a
            )
          : undefined,
        signal,
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
          // Stage 4 mapreduce callbacks.
          onMapDocStart: (attachmentId, _name) => {
            setMapOutput(attachmentId, { status: "mapping" });
          },
          onMapDocDone: (attachmentId, data) => {
            setMapOutput(attachmentId, { status: "done", data });
          },
          onMapDocError: (attachmentId, message) => {
            setMapOutput(attachmentId, { status: "error", error: message });
          },
          onReduceStart: () => {
            setMerged({ mergedResult: null });
          },
          onReduceDelta: (_delta) => {
            // Reduce streaming not buffered for first version; UI shows on done.
          },
          onReduceDone: (response, _raw) => {
            setMerged({ mergedResult: response });
          },
          onReduceError: (message) => {
            setLastError(message);
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
        abortRef.current = null;

        // Stage 4: auto-pack Knowledge Asset — only if autoSaveAsset is on.
        if (config.autoSaveAsset && !packedTurnsRef.current.has(turnId)) {
          packedTurnsRef.current.add(turnId);
          setSessions((prevSessions) => {
            const latestSession = prevSessions.find((s) => s.sessionId === sessionId);
            const latestTurn = latestSession?.messages.find((t) => t.id === turnId);
            if (latestTurn) {
              const asset = packFromTurn({
                turn: latestTurn,
                taskType: config.taskType,
                attachments: atts,
                panelModels: panelProviders.map((p) => p.name),
                judgeModel: judgeProviders[0]?.name ?? "",
              });
              if (asset) {
                queueMicrotask(() => {
                  setKnowledgeAssets((prevAssets) => [asset!, ...prevAssets]);
                });
              }
            }
            return prevSessions;
          });
        }
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

  /** Abort the in-flight synthesis (Stop button). The engine's streamChat
   *  calls reject with errors.CANCELLED; the send() finally block cleans up. */
  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setRunning(false);
  }, []);

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
    extractSchemas,
    addExtractSchema,
    updateExtractSchema,
    removeExtractSchema,
    knowledgeAssets,
    addKnowledgeAsset,
    removeKnowledgeAsset,
    classifyKnowledgeAsset,
    assetCategories,
    classifyModelId,
    setClassifyModelId,
    addAssetCategory,
    removeAssetCategory,
    updateAssetCategories,
    sessions,
    currentSessionId,
    currentSession,
    newSession,
    selectSession,
    renameSession,
    removeSession,
    updateSessionConfig,
    addAttachments,
    removeAttachment,
    cleanAttachment,
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
    setError: (msg: string | null) => setLastError(msg),
    send,
    stop,
  };
}
