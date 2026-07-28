/**
 * Verdex — Knowledge Vault View.
 *
 * Independent view for browsing, searching, and managing Knowledge Assets.
 * Accessed from Sidebar's "📚 知识仓库" button. Replaces the old Assets tab
 * in SettingsModal.
 */
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { KnowledgeAsset } from "../types/moa";
import { exportAsset } from "../services/exporters";
import { JsonCardRenderer } from "./JsonCardRenderer";

interface VaultViewProps {
  assets: KnowledgeAsset[];
  onRemoveAsset: (id: string) => void;
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
  onRemove,
}: {
  asset: KnowledgeAsset;
  onRemove: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);

  const handleExport = (format: "claude-skill" | "markdown" | "json" | "verdex-native") => {
    const result = exportAsset(asset, format);
    downloadFile(result.filename, result.content);
    if (result.extraFiles) {
      for (const f of result.extraFiles) downloadFile(f.filename, f.content);
    }
    setExportMenu(false);
  };

  return (
    <div className="rounded-lg border border-card-verdict/30 bg-card-verdict/5 overflow-hidden">
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
          </div>
        </div>
      )}
    </div>
  );
}

export function VaultView({ assets, onRemoveAsset, onClose }: VaultViewProps) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return assets;
    const q = searchQuery.toLowerCase();
    return assets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.consensus.toLowerCase().includes(q) ||
        a.verdict.toLowerCase().includes(q) ||
        a.sources.some((s) => s.toLowerCase().includes(q))
    );
  }, [assets, searchQuery]);

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-ink-strong">📚 {t("vault.title")}</h1>
          <span className="text-[11px] text-ink-faint">({assets.length})</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-ink-muted hover:bg-surface-2 hover:text-ink"
        >
          ✕ {t("common.close")}
        </button>
      </div>

      {/* Search bar */}
      <div className="border-b border-hairline px-4 py-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("vault.searchPlaceholder")}
          className="w-full rounded-md border border-hairline-strong bg-surface/60 px-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-accent/60 focus:outline-none"
        />
      </div>

      {/* Asset list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <span className="text-3xl mb-2">📦</span>
            <p className="text-sm text-ink-muted">
              {assets.length === 0 ? t("vault.empty") : t("vault.noSearchResults")}
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-2">
            {filtered.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onRemove={onRemoveAsset} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default VaultView;
