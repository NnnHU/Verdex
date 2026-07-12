/**
 * Verdex — bottom-pinned composer with auto-growing textarea.
 *
 *  - Enter inserts a newline; Ctrl/Cmd+Enter sends.
 *  - Empty input can't be sent.
 *  - Disabled (with a "运行中…" label) while a synthesis is running.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface ChatInputProps {
  onSend: (prompt: string) => void;
  running: boolean;
  placeholder?: string;
}

const MAX_HEIGHT = 200; // px, before the textarea starts scrolling

export function ChatInput({ onSend, running, placeholder }: ChatInputProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const canSend = value.trim().length > 0 && !running;

  return (
    <div className="border-t border-hairline bg-canvas/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-end gap-2">
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
          {running ? t("chatInput.running") : t("chatInput.send")}
        </button>
      </div>
      <div className="mx-auto mt-1.5 max-w-4xl text-center text-[11px] text-ink-faint">
        {t("chatInput.hint")}
      </div>
    </div>
  );
}

export default ChatInput;
