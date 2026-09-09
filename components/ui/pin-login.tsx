"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useI18n } from "@/lib/i18n/context";
import { NumericKeypad } from "@/components/pos/numeric-keypad";
import { LogoMark } from "@/components/ui/logo";

/**
 * The four-digit sign-in card, shared by the two independent entrances: the POS
 * and the Master panel. It only collects the PIN — the caller decides what a
 * successful sign-in means and returns an error message when one fails.
 */
export function PinLogin({
  title,
  subtitle,
  pinLabel,
  enterLabel,
  icon,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  pinLabel: string;
  enterLabel: string;
  icon?: ReactNode;
  /** Resolves to an error message, or null when the sign-in succeeded. */
  onSubmit: (pin: string) => Promise<string | null>;
}) {
  const { dict } = useI18n();
  const [pending, start] = useTransition();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(value: string) {
    if (value.length !== 4 || pending) return;
    setError(null);
    start(async () => {
      const message = await onSubmit(value);
      if (message) {
        setPin("");
        setError(message);
      }
    });
  }

  function press(char: string) {
    if (!/^[0-9]$/.test(char) || pending || pin.length >= 4) return;
    const next = pin + char;
    setPin(next);
    // A four-digit PIN is complete — verify it without a separate tap.
    if (next.length === 4) submit(next);
  }

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-bg p-6">
      <div className="w-full max-w-xs rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)]">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <LogoMark className="size-10" />
          <h1 className="flex items-center gap-2 text-lg font-bold text-text">
            {icon}
            {title}
          </h1>
          <p className="text-sm text-text-muted">{subtitle}</p>
        </div>

        <div className="mb-4 flex justify-center gap-3" aria-label={pinLabel}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`size-3.5 rounded-full border transition-colors ${
                i < pin.length ? "border-accent bg-accent" : "border-border bg-surface-muted"
              }`}
            />
          ))}
        </div>

        {error ? (
          <p className="mb-3 text-center text-sm font-semibold text-danger">{error}</p>
        ) : null}

        <NumericKeypad
          captureKeyboard
          onKey={press}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
          onEnter={() => submit(pin)}
          enterLabel={enterLabel}
          backspaceLabel={dict.keypad.backspace}
        />
      </div>
    </div>
  );
}
