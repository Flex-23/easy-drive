"use client";

import { useEffect, useState, useTransition } from "react";
import { Headset, LogOut } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { posLogout } from "@/app/actions/pos-auth";
import { formatTime } from "@/lib/money";
import { Wordmark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

function Clock() {
  const { locale } = useI18n();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return (
    <span className="tnum tabular-nums min-w-20 text-center text-sm font-semibold text-text" suppressHydrationWarning>
      {now ? formatTime(now, locale) : "--:--:--"}
    </span>
  );
}

export function TopBar({
  restaurantName,
  cashierName,
  version,
}: {
  restaurantName: string;
  cashierName: string | null;
  version: string;
}) {
  const { dict } = useI18n();

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 shadow-[var(--shadow-sm)]">
      {/* inline-start: brand + cashier */}
      <div className="flex min-w-0 items-center gap-3">
        <Wordmark className="text-sm font-extrabold tracking-tight text-text" />
        <span className="hidden h-4 w-px bg-border sm:block" />
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="size-2 rounded-full bg-success" aria-hidden />
          <span className="truncate text-sm text-text-muted">
            {cashierName ?? restaurantName}
          </span>
        </div>
      </div>

      <div className="flex-1" />

      {/* center/end: support and version — nothing else earns the space */}
      <div className="hidden items-center gap-1 md:flex">
        <a
          href="mailto:support@easydrive.app"
          className="press flex items-center gap-1.5 rounded-[var(--radius-btn)] px-2.5 py-1.5 text-sm text-text-muted hover:bg-surface-muted hover:text-text"
        >
          <Headset className="size-4" />
          <span>{dict.topbar.support}</span>
        </a>
        <span className="tnum px-1 text-xs text-text-faint">
          {dict.topbar.version} {version}
        </span>
      </div>

      <span className="mx-1 hidden h-5 w-px bg-border md:block" />

      {/* inline-end: clock, theme, end of shift */}
      <div className="flex items-center gap-2">
        <Clock />
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}

/** Ends the cashier's shift and returns the terminal to the sign-in screen. */
function SignOutButton() {
  const { locale, dict } = useI18n();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => posLogout(locale))}
      disabled={pending}
      aria-label={dict.login.logout}
      title={dict.login.logout}
      className="press flex size-8 items-center justify-center rounded-[var(--radius-btn)] text-text-faint hover:bg-surface-muted hover:text-danger disabled:opacity-50"
    >
      <LogOut className="size-[18px]" />
    </button>
  );
}
