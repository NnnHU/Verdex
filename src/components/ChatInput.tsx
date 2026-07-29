/**
 * Verdex — bottom-pinned composer with auto-growing textarea.
 *
 *  - Enter inserts a newline; Ctrl/Cmd+Enter sends.
 *  - Empty input can't be sent.
 *  - Disabled (with a "运行中…" label) while a synthesis is running.
 *  - 📎 button attaches txt/md documents (Stage 2); their text is prepended to
 *    the prompt by the hook. Attachments are session-scoped.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Attachment, KnowledgeAsset } from "../types/moa";
import { recommendAssets } from "../services/assetRecommender";

interface ChatInputProps {
  onSend: (prompt: string) => void;
  running: boolean;
  /** Abort the in-flight synthesis (shown as a Stop button while running). */
  onStop?: () => void;
  placeholder?: string;
  /** Session attachments to display as chips. */
  attachments?: Attachment[];
  /** Add files (called by the 📎 picker; the hook does the reading). */
  onAddFiles?: (files: File[]) => void;
  /** Remove one attachment by id. */
  onRemoveAttachment?: (attachmentId: string) => void;
  /** Knowledge assets for query-based recommendations. */
  knowledgeAssets?: KnowledgeAsset[];
  /** Currently referenced asset ids (to avoid re-recommending). */
  referencedAssetIds?: string[];
  /** Add an asset to references. */
  onAddReferenceAsset?: (assetId: string) => void;
}

const MAX_HEIGHT = 200; // px, before the textarea starts scrolling

export function ChatInput({
  onSend,
  running,
  onStop,
  placeholder,
  attachments = [],
  onAddFiles,
  onRemoveAttachment,
  knowledgeAssets = [],
  referencedAssetIds = [],
  onAddReferenceAsset,
}: ChatInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // AI asset recommendations based on current input.
  const recommendations = useMemo(() => {
    if (!value.trim() || value.trim().length < 4 || knowledgeAssets.length === 0) return [];
    return recommendAssets(value, knowledgeAssets, 3)
      .filter((r) => !referencedAssetIds.includes(r.asset.id));
  }, [value, knowledgeAssets, referencedAssetIds]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-grow the textarea to fit its content.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const submit = () => {
    // Hard request-state lock: while a synthesis is running, NO send path may
    // fire — not the button, not Ctrl/Cmd+Enter, not repeated keydown spam.
    // The MoA fan-out multiplies quota use, so this guard is mandatory.
    if (running) return;
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
    // Reset height after clearing.
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Only Ctrl/Cmd+Enter sends; plain Enter is a newline (default behavior).
    // When running, the modifier shortcut is intercepted and dropped so a held
    // key / rapid repeat cannot enqueue a second parallel synthesis.
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (running) return; // locked — swallow the keystroke entirely
      submit();
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onAddFiles) {
      onAddFiles(Array.from(files));
    }
    // Reset so picking the same file twice fires change again.
    e.target.value = "";
  };

  const canSend = value.trim().length > 0 && !running;
  const hasAttachments = attachments.length > 0;

  return (
    <div className="border-t border-hairline bg-canvas/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto max-w-4xl">
        {/* Attachment chips (above the textarea) */}
        {hasAttachments && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-md border border-hairline-strong bg-surface px-2 py-0.5 text-[11px] text-ink-muted"
                title={a.name}
              >
                <span className="max-w-[180px] truncate text-ink">
                  {a.name}
                </span>
                <span className="text-ink-faint">
                  {t("chatInput.attachmentChars", { chars: a.chars.toLocaleString() })}
                  {a.truncated ? ` · ${t("chatInput.attachmentTruncated")}` : ""}
                  {a.cleaned === false
                    ? ` · ${t("chatInput.attachmentCleaning")}`
                    : a.cleaned
                      ? ` · ${t("chatInput.attachmentCleaned")}`
                      : ""}
                </span>
                {onRemoveAttachment && (
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(a.id)}
                    disabled={running}
                    aria-label={t("chatInput.attachmentRemove")}
                    className="ml-0.5 text-ink-faint hover:text-danger disabled:opacity-50"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* AI asset recommendations (based on current input) */}
        {recommendations.length > 0 && onAddReferenceAsset && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-accent">💡 {t("chatInput.recommendedAssets")}</span>
            {recommendations.map((rec) => (
              <button
                key={rec.asset.id}
                type="button"
                onClick={() => onAddReferenceAsset(rec.asset.id)}
                disabled={running}
                className="rounded-full border border-accent/40 bg-accent-soft/10 px-2 py-0.5 text-[10px] text-accent transition-colors hover:bg-accent-soft/20 disabled:opacity-50"
                title={rec.matchedKeywords.join(", ")}
              >
                + {rec.asset.name}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* 📎 attach button */}
          {onAddFiles && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={running}
                title={t("chatInput.attachTooltip")}
                aria-label={t("chatInput.attachTooltip")}
                className="shrink-0 rounded-xl border border-hairline-strong bg-surface/80 px-3 py-2.5 text-sm transition-colors hover:border-accent/60 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("chatInput.attach")}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                onChange={handleFilePick}
                className="hidden"
              />
            </>
          )}

          <div className="flex-1 rounded-xl border border-hairline-strong bg-surface/80 focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/30 transition-colors">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={placeholder ?? t("chatInput.placeholder")}
              className="block max-h-[200px] w-full resize-none bg-transparent px-3.5 py-2.5 text-sm text-ink-strong placeholder:text-ink-muted focus:outline-none"
            />
          </div>
          {running && onStop ? (
            <button
              type="button"
              onClick={onStop}
              className="shrink-0 rounded-xl bg-error/90 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-error active:bg-error/80"
            >
              {t("chatInput.stop")}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className={
                "shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors " +
                (canSend
                  ? "bg-accent text-on-accent hover:bg-accent-soft active:bg-accent-hover"
                  : "cursor-not-allowed bg-surface-2 text-ink-muted")
              }
            >
              {t("chatInput.send")}
            </button>
          )}
        </div>
        <div className="mt-1.5 text-center text-[11px] text-ink-faint">
          {t("chatInput.hint")}
          {hasAttachments ? ` · ${t("chatInput.attachmentsHint")}` : ""}
        </div>
      </div>
    </div>
  );
}

export default ChatInput;
