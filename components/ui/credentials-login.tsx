"use client";

import { useState, useTransition, type ReactNode } from "react";
import { LogIn, Mail, KeyRound } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { LogoMark } from "@/components/ui/logo";

/**
 * The e-mail and password card, shared by the two independent entrances: the
 * POS and the Master panel. It only collects the credentials — the caller
 * decides what a successful sign-in means and returns an error message when
 * one fails.
 */
export function CredentialsLogin({
  title,
  subtitle,
  enterLabel,
  icon,
  onSubmit,
}: {
  title: string;
  subtitle: string;
  enterLabel: string;
  icon?: ReactNode;
  /** Resolves to an error message, or null when the sign-in succeeded. */
  onSubmit: (credentials: { email: string; password: string }) => Promise<string | null>;
}) {
  const { dict } = useI18n();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ready = email.trim().length > 0 && password.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || pending) return;
    setError(null);
    start(async () => {
      const message = await onSubmit({ email, password });
      if (message) {
        setPassword("");
        setError(message);
      }
    });
  }

  const input =
    "w-full rounded-[var(--radius-btn)] border border-border bg-surface-muted py-2.5 text-sm text-text outline-none transition-colors placeholder:text-text-faint hover:border-border-strong focus:border-accent focus:bg-surface ps-10 pe-3";

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-bg p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-lg)]"
      >
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <LogoMark className="size-10" />
          <h1 className="flex items-center gap-2 text-lg font-bold text-text">
            {icon}
            {title}
          </h1>
          <p className="text-sm text-text-muted">{subtitle}</p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-text-muted">
              {dict.login.email}
            </span>
            <span className="relative block">
              <Mail className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-text-faint start-3" />
              <input
                data-autofocus
                type="email"
                name="email"
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
                className={input}
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-text-muted">
              {dict.login.password}
            </span>
            <span className="relative block">
              <KeyRound className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-text-faint start-3" />
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={pending}
                className={input}
              />
            </span>
          </label>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-center text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!ready || pending}
          className="press mt-5 flex w-full items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-3 font-bold text-accent-fg shadow-[var(--shadow-sm)] hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogIn className="size-4" />
          {pending ? dict.common.loading : enterLabel}
        </button>
      </form>
    </div>
  );
}
