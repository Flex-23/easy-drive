"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Headset,
  MonitorSmartphone,
  Database,
  Printer,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatTime } from "@/lib/money";
import { Wordmark } from "@/components/ui/logo";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
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

function StatusDot({
  ok,
  icon: Icon,
  label,
}: {
  ok: boolean;
  icon: typeof Database;
  label: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      className={`flex size-8 items-center justify-center rounded-[var(--radius-btn)] ${
        ok ? "text-success" : "text-warning"
      }`}
    >
      <Icon className="size-[18px]" />
    </span>
  );
}

export function TopBar({
  restaurantName,
  cashierName,
  dbHealthy,
  version,
  terminalId,
}: {
  restaurantName: string;
  cashierName: string | null;
  dbHealthy: boolean;
  version: string;
  terminalId: string;
}) {
  const { dict } = useI18n();
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
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

      {/* center/end: support, terminal, version, status */}
      <div className="hidden items-center gap-1 md:flex">
        <a
          href="mailto:support@easydrive.app"
          className="press flex items-center gap-1.5 rounded-[var(--radius-btn)] px-2.5 py-1.5 text-sm text-text-muted hover:bg-surface-muted hover:text-text"
        >
          <Headset className="size-4" />
          <span>{dict.topbar.support}</span>
        </a>
        <span className="flex items-center gap-1.5 px-2 text-xs text-text-faint">
          <MonitorSmartphone className="size-4" />
          <span className="tnum">{terminalId}</span>
        </span>
        <span className="px-1 text-xs text-text-faint tnum">
          {dict.topbar.version} {version}
        </span>
        <div className="mx-1 flex items-center">
          <StatusDot
            ok={dbHealthy}
            icon={Database}
            label={dbHealthy ? dict.topbar.dbConnected : dict.topbar.dbReconnecting}
          />
          <StatusDot ok icon={Printer} label={dict.topbar.printerReady} />
          <StatusDot
            ok={online}
            icon={online ? Wifi : WifiOff}
            label={online ? dict.topbar.networkOnline : dict.topbar.networkOffline}
          />
        </div>
      </div>

      <span className="mx-1 hidden h-5 w-px bg-border md:block" />

      {/* inline-end: clock, language, theme */}
      <div className="flex items-center gap-2">
        <Clock />
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
