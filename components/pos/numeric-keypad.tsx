"use client";

import { useEffect } from "react";
import { Delete, CornerDownLeft } from "lucide-react";

/**
 * Large touch numeric keypad. Digits are always Latin numerals. Emits string
 * edits; the physical keyboard works too. Used for phone lookup and amounts.
 */
export function NumericKeypad({
  onKey,
  onBackspace,
  onEnter,
  enterLabel,
  backspaceLabel,
  captureKeyboard = false,
}: {
  onKey: (char: string) => void;
  onBackspace: () => void;
  onEnter: () => void;
  enterLabel: string;
  backspaceLabel: string;
  captureKeyboard?: boolean;
}) {
  useEffect(() => {
    if (!captureKeyboard) return;
    function handler(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") onKey(e.key);
      else if (e.key === "," || e.key === ".") onKey(",");
      else if (e.key === "Backspace") onBackspace();
      else if (e.key === "Enter") onEnter();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [captureKeyboard, onKey, onBackspace, onEnter]);

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  const btn =
    "press flex items-center justify-center rounded-[var(--radius-btn)] border border-border bg-surface text-xl font-semibold text-text tnum hover:border-border-strong hover:bg-surface-muted min-h-14";

  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((k) => (
        <button key={k} className={btn} onClick={() => onKey(k)} aria-label={k}>
          {k}
        </button>
      ))}
      <button className={btn} onClick={() => onKey(",")} aria-label=",">
        ,
      </button>
      <button className={btn} onClick={() => onKey("0")} aria-label="0">
        0
      </button>
      <button
        className="press flex min-h-14 items-center justify-center rounded-[var(--radius-btn)] border border-border bg-surface text-text-muted hover:border-border-strong hover:bg-surface-muted"
        onClick={onBackspace}
        aria-label={backspaceLabel}
      >
        <Delete className="size-6" />
      </button>
      <button
        className="press col-span-3 flex min-h-[52px] items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent text-base font-bold text-accent-fg hover:bg-accent-strong"
        onClick={onEnter}
      >
        <CornerDownLeft className="size-5" />
        {enterLabel}
      </button>
    </div>
  );
}
