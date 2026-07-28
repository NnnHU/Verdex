/**
 * Verdex — Asset Export Button.
 *
 * Shows a dropdown to export the current turn's result as a Knowledge Asset
 * in various formats. On export, packs the JudgeResponse into a KnowledgeAsset,
 * converts to the selected format, and downloads the file(s).
 *
 * Used in JudgeMessage (verdict/extract) and MapReduceMessage (merged result).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AssetExportFormat,
  Attachment,
  KnowledgeAsset,
  Turn,
} from "../types/moa";
import { packFromTurn } from "../services/assetPacker";
import { exportAsset } from "../services/exporters";

interface AssetExportButtonProps {
  /** The turn to pack into an asset. */
  turn: Turn;
  /** Task type that produced this turn. */
  taskType: KnowledgeAsset["originTaskType"];
  /** Attachments (for source traceability). */
  attachments?: Attachment[];
  /** Panel model names. */
  panelModels: string[];
  /** Judge model name. */
  judgeModel: string;
}

/** Trigger a browser download for the given content. */
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

export function AssetExportButton({
  turn,
  taskType,
  attachments,
  panelModels,
  judgeModel,
}: AssetExportButtonProps) {
  const { t } = useTranslation();
  const [showMenu, setShowMenu] = useState(false);
  const [exported, setExported] = useState(false);

  const handleExport = (format: AssetExportFormat) => {
    const asset = packFromTurn({
      turn,
      taskType,
      attachments,
      panelModels,
      judgeModel,
    });
    if (!asset) {
      setShowMenu(false);
      return;
    }

    const result = exportAsset(asset, format);
    downloadFile(result.filename, result.content);

    // Download extra files (e.g. claude-skill chapters).
    if (result.extraFiles) {
      for (const f of result.extraFiles) {
        downloadFile(f.filename, f.content);
      }
    }

    setExported(true);
    setShowMenu(false);
    setTimeout(() => setExported(false), 2000);
  };

  if (exported) {
    return (
      <span className="text-[11px] text-success">{t("common.assetExported")}</span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowMenu((v) => !v)}
        className="text-[11px] text-ink-muted hover:text-ink"
      >
        {t("common.exportAsset")}
      </button>
      {showMenu && (
        <div className="absolute right-0 top-full z-20 mt-1 rounded-md border border-hairline-strong bg-canvas shadow-lg">
          <button
            type="button"
            onClick={() => handleExport("claude-skill")}
            className="block w-full px-3 py-1.5 text-left text-[11px] text-ink hover:bg-surface-2"
          >
            {t("common.exportClaudeSkill")}
          </button>
          <button
            type="button"
            onClick={() => handleExport("markdown")}
            className="block w-full px-3 py-1.5 text-left text-[11px] text-ink hover:bg-surface-2"
          >
            {t("common.exportMarkdown")}
          </button>
          <button
            type="button"
            onClick={() => handleExport("json")}
            className="block w-full px-3 py-1.5 text-left text-[11px] text-ink hover:bg-surface-2"
          >
            {t("common.exportJson")}
          </button>
          <button
            type="button"
            onClick={() => handleExport("verdex-native")}
            className="block w-full px-3 py-1.5 text-left text-[11px] text-ink hover:bg-surface-2"
          >
            {t("common.exportVerdexNative")}
          </button>
        </div>
      )}
    </div>
  );
}

export default AssetExportButton;
