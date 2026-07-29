/**
 * Verdex — Knowledge Vault View.
 *
 * Independent view for browsing, searching, and managing Knowledge Assets.
 * Accessed from Sidebar's "📚 知识仓库" button. Replaces the old Assets tab
 * in SettingsModal.
 */
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AIProvider, AssetCategory, KnowledgeAsset } from "../types/moa";
import { exportAsset } from "../services/exporters";
import { JsonCardRenderer } from "./JsonCardRenderer";

interface VaultViewProps {
  assets: KnowledgeAsset[];
  categories: AssetCategory[];
  providers: AIProvider[];
  classifyModelId: string | null;
  onClassifyModelChange: (id: string | null) => void;
  onClassifyAsset: (assetId: string) => Promise<void>;
  onRemoveCategory: (categoryId: string) => void;
  onAddCategory: (name: string) => string;
  onUpdateAssetCategories: (assetId: string, categoryIds: string[]) => void;
  onUpdateAsset: (id: string, patch: Partial<KnowledgeAsset>) => void;
  onRemoveAsset: (id: string) => void;
  /** Sessions for reference tracking. */
  sessions: { sessionId: string; title: string; config: { referenceAssetIds: string[] } }[];
  onClose: () => void;
}

/** Trigger browser download. */
function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Format date for display. */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** A single asset card with expand/collapse. */
function AssetCard({
  asset,
  categories,
  onRemove,
  onUpdateCategories,
  onAddCategory,
  onUpdateAsset,
  referencedBy,
}: {
  asset: KnowledgeAsset;
  categories: AssetCategory[];
  onRemove: (id: string) => void;
  onUpdateCategories?: (assetId: string, categoryIds: string[]) => void;
  onAddCategory?: (name: string) => string;
  onUpdateAsset?: (id: string, patch: Partial<KnowledgeAsset>) => void;
  referencedBy: string[];
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [catMenu, setCatMenu] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(asset.name);
  const [editDesc, setEditDesc] = useState(asset.description);
  const [editTags, setEditTags] = useState((asset.tags ?? []).join(", "));

  const handleExport = (format: "claude-skill" | "markdown" | "json" | "verdex-native") => {
    const result = exportAsset(asset, format);
    downloadFile(result.filename, result.content);
    if (result.extraFiles) {
      for (const f of result.extraFiles) downloadFile(f.filename, f.content);
    }
    setExportMenu(false);
  };

  return (
    <div className="rounded-lg border border-card-verdict/30 bg-card-verdict/5 overflow-visible relative z-10">
      {/* Header (always visible) */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 text-left transition-colors hover:bg-card-verdict/10"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-ink">{asset.name}</h3>
            <p className="mt-0.5 truncate text-[11px] text-ink-faint">{asset.description}</p>
            {/* Category tags */}
            {asset.categories.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-1">
                {asset.categories.map((catId) => {
                  const cat = categories.find((c) => c.id === catId);
                  if (!cat) return null;
                  return (
                    <span key={catId} className="rounded bg-accent-soft/15 px-1.5 py-0.5 text-[9px] text-accent">
                      {cat.name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-[10px] text-ink-faint">
            <span>{asset.originTaskType.replace("_", " ")}</span>
            <span>·</span>
            <span>{formatDate(asset.createdAt)}</span>
            <span className="text-ink-muted">{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="space-y-3 border-t border-hairline px-4 py-3">
          {asset.consensus && (
            <div>
              <h4 className="text-[11px] font-semibold text-success">🎯 {t("judge.consensus")}</h4>
              <p className="mt-0.5 text-xs leading-relaxed text-ink whitespace-pre-wrap">{asset.consensus}</p>
            </div>
          )}
          {asset.divergences && (
            <div>
              <h4 className="text-[11px] font-semibold text-warning">⚔️ {t("judge.divergence")}</h4>
              <p className="mt-0.5 text-xs leading-relaxed text-ink whitespace-pre-wrap">{asset.divergences}</p>
            </div>
          )}
          {asset.blindspots && (
            <div>
              <h4 className="text-[11px] font-semibold text-info">💡 {t("judge.blindspots")}</h4>
              <p className="mt-0.5 text-xs leading-relaxed text-ink whitespace-pre-wrap">{asset.blindspots}</p>
            </div>
          )}
          {asset.verdict && (
            <div>
              <h4 className="text-[11px] font-semibold text-accent">⚖️ {t("judge.verdict")}</h4>
              <p className="mt-0.5 text-xs leading-relaxed text-ink whitespace-pre-wrap">{asset.verdict}</p>
            </div>
          )}

          {/* Structured data */}
          {asset.structuredData && Object.keys(asset.structuredData).length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-ink-muted">📋 {t("vault.structuredData")}</h4>
              <div className="mt-1">
                <JsonCardRenderer data={asset.structuredData} />
              </div>
            </div>
          )}

          {/* Sources + metadata */}
          <div className="space-y-1 border-t border-hairline pt-2 text-[10px] text-ink-faint">
            {asset.sources.length > 0 && (
              <div>
                <span className="font-medium">📎 {t("vault.sources")}:</span>{" "}
                {asset.sources.join(", ")}
              </div>
            )}
            <div>
              <span className="font-medium">🔧 {t("vault.metadata")}:</span>{" "}
              {asset.originTaskType} · {asset.panelModels.join("+")} → {asset.judgeModel}
            </div>
          </div>

          {/* Reference tracking */}
          {referencedBy.length > 0 && (
            <div className="border-t border-hairline pt-2 text-[10px] text-ink-faint">
              <span className="font-medium">📎 {t("vault.referencedBy")}:</span>{" "}
              {referencedBy.join(", ")}
            </div>
          )}

          {/* Edit mode */}
          {editing && (
            <div className="space-y-2 border-t border-hairline pt-2">
              <label className="block">
                <span className="text-[10px] text-ink-muted">{t("vault.assetName")}</span>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded border border-hairline-strong bg-surface px-2 py-1 text-xs text-ink"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-ink-muted">{t("vault.assetDescription")}</span>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-hairline-strong bg-surface px-2 py-1 text-xs text-ink"
                />
              </label>
              <label className="block">
                <span className="text-[10px] text-ink-muted">{t("vault.assetTags")}</span>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder={t("vault.assetTagsPlaceholder")}
                  className="w-full rounded border border-hairline-strong bg-surface px-2 py-1 text-xs text-ink"
                />
              </label>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <div className="relative">
              <button
                type="button"
                onClick={() => setExportMenu((v) => !v)}
                className="text-[11px] text-ink-muted hover:text-ink"
              >
                📦 {t("vault.export")}
              </button>
              {exportMenu && (
                <div className="absolute left-0 top-full z-20 mt-1 rounded-md border border-hairline-strong bg-canvas shadow-lg">
                  <button onClick={() => handleExport("claude-skill")} className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-surface-2">{t("common.exportClaudeSkill")}</button>
                  <button onClick={() => handleExport("markdown")} className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-surface-2">{t("common.exportMarkdown")}</button>
                  <button onClick={() => handleExport("json")} className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-surface-2">{t("common.exportJson")}</button>
                  <button onClick={() => handleExport("verdex-native")} className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-surface-2">{t("common.exportVerdexNative")}</button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onRemove(asset.id)}
              className="text-[11px] text-ink-muted hover:text-error"
            >
              🗑️ {t("common.delete")}
            </button>
            {onUpdateAsset && !editing && (
              <button
                type="button"
                onClick={() => { setEditing(true); setEditName(asset.name); setEditDesc(asset.description); }}
                className="text-[11px] text-ink-muted hover:text-accent"
              >
                ✏️ {t("vault.edit")}
              </button>
            )}
            {editing && onUpdateAsset && (
              <button
                type="button"
                onClick={() => {
                  onUpdateAsset(asset.id, {
                    name: editName,
                    description: editDesc,
                    tags: editTags.split(",").map((s) => s.trim()).filter(Boolean),
                  });
                  setEditing(false);
                }}
                className="text-[11px] text-success"
              >
                ✓ {t("vault.save")}
              </button>
            )}
            {editing && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-[11px] text-ink-muted"
              >
                ✕ {t("common.close")}
              </button>
            )}
            {onUpdateCategories && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setCatMenu((v) => !v)}
                  className="text-[11px] text-ink-muted hover:text-ink"
                >
                  📁 {t("vault.setCategory")}
                </button>
                {catMenu && (
                  <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-48 overflow-y-auto rounded-md border border-hairline-strong bg-canvas shadow-lg">
                    {categories.map((cat) => {
                      const checked = asset.categories.includes(cat.id);
                      return (
                        <label key={cat.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-surface-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const next = checked
                                ? asset.categories.filter((id) => id !== cat.id)
                                : [...asset.categories, cat.id];
                              onUpdateCategories(asset.id, next);
                            }}
                            className="h-3 w-3 accent-[var(--accent)]"
                          />
                          <span className="text-[11px] text-ink">{cat.name}</span>
                        </label>
                      );
                    })}
                    {/* Quick add new category */}
                    <div className="flex gap-1 border-t border-hairline px-2 py-1.5">
                      <input
                        type="text"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newCatName.trim() && onAddCategory) {
                            const newId = onAddCategory(newCatName.trim());
                            onUpdateCategories(asset.id, [...asset.categories, newId]);
                            setNewCatName("");
                            setCatMenu(false);
                          }
                        }}
                        placeholder={t("vault.categoryName")}
                        className="w-full rounded border border-hairline bg-surface px-1.5 py-0.5 text-[10px] text-ink"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function VaultView({ assets, categories, providers, classifyModelId, onClassifyModelChange, onRemoveAsset, onClassifyAsset, onRemoveCategory, onAddCategory, onUpdateAssetCategories, onUpdateAsset, sessions, onClose }: VaultViewProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState<string | null>(null);
  const [filterTaskType, setFilterTaskType] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [batchClassifying, setBatchClassifying] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);

  const filtered = useMemo(() => {
    let result = assets;
    if (filterCategoryId) {
      result = result.filter((a) => a.categories.includes(filterCategoryId));
    }
    if (filterTaskType) {
      result = result.filter((a) => a.originTaskType === filterTaskType);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.consensus.toLowerCase().includes(q) ||
          a.verdict.toLowerCase().includes(q) ||
          a.sources.some((s) => s.toLowerCase().includes(q))
      );
    }
    // Sort
    if (sortBy === "newest") result = [...result].sort((a, b) => b.createdAt - a.createdAt);
    else if (sortBy === "oldest") result = [...result].sort((a, b) => a.createdAt - b.createdAt);
    else if (sortBy === "name") result = [...result].sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [assets, searchQuery, filterCategoryId, filterTaskType, sortBy]);

  const uncategorized = assets.filter((a) => a.categories.length === 0);

  const displayAssets = filterCategoryId === "__uncategorized__" ? uncategorized : filtered;

  const handleBatchClassify = async () => {
    setBatchClassifying(true);
    for (const a of uncategorized) {
      await onClassifyAsset(a.id);
    }
    setBatchClassifying(false);
  };

  const handleAddCategory = () => {
    const name = newCatName.trim();
    if (!name) return;
    onAddCategory(name);
    setNewCatName("");
    setShowNewCat(false);
  };

  return (
    <div className="flex h-full bg-canvas">
      {/* Category sidebar */}
      <div className="w-44 shrink-0 overflow-y-auto border-r border-hairline p-2">
        <button
          type="button"
          onClick={() => setFilterCategoryId(null)}
          className={"mb-1 w-full rounded px-2 py-1 text-left text-[11px] transition-colors " +
            (filterCategoryId === null ? "bg-accent-soft/15 text-accent" : "text-ink-muted hover:bg-surface-2")}
        >
          {t("vault.allCategories")} ({assets.length})
        </button>
        {categories.map((cat) => {
          const count = assets.filter((a) => a.categories.includes(cat.id)).length;
          return (
            <div key={cat.id} className="group flex items-center">
              <button
                type="button"
                onClick={() => setFilterCategoryId(cat.id)}
                className={"flex-1 rounded px-2 py-1 text-left text-[11px] transition-colors " +
                  (filterCategoryId === cat.id ? "bg-accent-soft/15 text-accent" : "text-ink-muted hover:bg-surface-2")}
              >
                {cat.name} ({count})
                {cat.isAuto && <span className="ml-1 text-[9px] text-ink-faint">AI</span>}
              </button>
              <button
                type="button"
                onClick={() => onRemoveCategory(cat.id)}
                className="px-1 text-[9px] text-ink-faint opacity-0 hover:text-error group-hover:opacity-100"
                title={t("common.delete")}
              >
                ×
              </button>
            </div>
          );
        })}
        {uncategorized.length > 0 && (
          <button
            type="button"
            onClick={() => setFilterCategoryId("__uncategorized__")}
            className={"mt-1 w-full rounded px-2 py-1 text-left text-[11px] text-ink-faint hover:bg-surface-2"}
          >
            {t("vault.uncategorized")} ({uncategorized.length})
          </button>
        )}
        {uncategorized.length > 0 && (
          <button
            type="button"
            onClick={handleBatchClassify}
            disabled={batchClassifying}
            className="mt-2 w-full rounded bg-accent-soft/15 px-2 py-1.5 text-left text-[11px] text-accent hover:bg-accent-soft/25 disabled:opacity-50"
          >
            {batchClassifying ? "⏳..." : `🏷️ ${t("vault.batchClassify")} (${uncategorized.length})`}
          </button>
        )}
        {/* New category */}
        {showNewCat ? (
          <div className="mt-2 flex gap-1">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              placeholder={t("vault.categoryName")}
              className="w-full rounded border border-hairline-strong bg-surface px-1.5 py-1 text-[11px] text-ink"
              autoFocus
            />
            <button onClick={handleAddCategory} className="rounded bg-accent px-2 py-1 text-[11px] text-on-accent">✓</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewCat(true)}
            className="mt-2 w-full rounded px-2 py-1 text-left text-[11px] text-ink-faint hover:bg-surface-2"
          >
            + {t("vault.newCategory")}
          </button>
        )}
      </div>

      {/* Main panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-ink-strong">📚 {t("vault.title")}</h1>
            <span className="text-[11px] text-ink-faint">({filtered.length})</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Classify model selector */}
            {providers.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-ink-faint">{t("vault.classifyModel")}</span>
                <select
                  value={classifyModelId ?? ""}
                  onChange={(e) => onClassifyModelChange(e.target.value || null)}
                  className="rounded-md border border-hairline-strong bg-surface px-2 py-1 text-[11px] text-ink"
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
            >
              ✕ {t("common.close")}
            </button>
          </div>
        </div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-2 border-b border-hairline px-4 py-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("vault.searchPlaceholder")}
            className="flex-1 rounded-md border border-hairline-strong bg-surface/60 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
          />
          <select
            value={filterTaskType}
            onChange={(e) => setFilterTaskType(e.target.value)}
            className="rounded-md border border-hairline-strong bg-surface px-2 py-1.5 text-[11px] text-ink-muted"
          >
            <option value="">{t("vault.allTasks")}</option>
            <option value="document_extract">📄 {t("vault.taskExtract")}</option>
            <option value="document_analysis">📊 {t("vault.taskAnalysis")}</option>
            <option value="quick_qa">💬 {t("vault.taskQa")}</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-md border border-hairline-strong bg-surface px-2 py-1.5 text-[11px] text-ink-muted"
          >
            <option value="newest">{t("vault.sortNewest")}</option>
            <option value="oldest">{t("vault.sortOldest")}</option>
            <option value="name">{t("vault.sortName")}</option>
          </select>
        </div>

        {/* Asset list */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {displayAssets.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <span className="mb-2 text-3xl">📦</span>
              <p className="text-sm text-ink-muted">
                {assets.length === 0 ? t("vault.empty") : t("vault.noSearchResults")}
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-2">
              {displayAssets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  categories={categories}
                  onRemove={onRemoveAsset}
                  onUpdateCategories={onUpdateAssetCategories}
                  onAddCategory={onAddCategory}
                  onUpdateAsset={onUpdateAsset}
                  referencedBy={sessions
                    .filter((s) => s.config.referenceAssetIds.includes(asset.id))
                    .map((s) => s.title)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VaultView;
