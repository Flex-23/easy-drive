"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShoppingBag,
  Package,
  ClipboardList,
  Settings,
  Info,
  Headset,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { formatTime } from "@/lib/money";
import { LogoMark, Wordmark } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

/**
 * The till's one chrome bar: who is signed in at the start, where to go in the
 * middle, and the shift controls at the end. Everything below it belongs to the
 * screen the cashier chose, edge to edge.
 */
export function PosHeader({
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
    <header className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-border bg-surface px-4 shadow-[var(--shadow-sm)]">
      {/* start: brand + who is on shift */}
      <div className="flex min-w-0 items-center gap-3">
        <LogoMark className="size-8 shrink-0" />
        <Wordmark className="hidden text-sm font-extrabold tracking-tight text-text sm:block" />
        <span className="hidden h-4 w-px bg-border sm:block" />
        <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
          <span className="size-2 shrink-0 rounded-full bg-success" aria-hidden />
          <span className="truncate text-sm text-text-muted">
            {cashierName ?? restaurantName}
          </span>
        </div>
      </div>

      <NavTabs />

      {/* end: support and version, then clock and theme */}
      <div className="flex items-center justify-end gap-2">
        <div className="hidden items-center gap-1 2xl:flex">
          <a
            href="mailto:baqir7710@gmail.com"
            className="press flex items-center gap-1.5 rounded-[var(--radius-btn)] px-2.5 py-1.5 text-sm whitespace-nowrap text-text-muted hover:bg-surface-muted hover:text-text"
          >
            <Headset className="size-4" />
            <span>{dict.topbar.support}</span>
          </a>
          <span className="tnum px-1 text-xs whitespace-nowrap text-text-faint">
            {dict.topbar.version} {version}
          </span>
          <span className="mx-1 h-5 w-px bg-border" />
        </div>
        <Clock />
        <ThemeToggle />
      </div>
    </header>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * The screens, as one segmented strip in the middle of the bar. Settings and
 * About sit in the same strip but behind a divider: they are not part of the
 * working day.
 * The Master panel is intentionally absent — it lives at /panel behind its own
 * sign-in and is reached by URL, not from the POS.
 */
function NavTabs() {
  const { locale, dict } = useI18n();
  const pathname = usePathname();
  const base = `/${locale}`;

  const screens: NavItem[] = [
    { href: base, label: dict.nav.newOrder, icon: ShoppingBag },
    { href: `${base}/drivers`, label: dict.nav.drivers, icon: Package },
    { href: `${base}/daily-report`, label: dict.nav.dailyReport, icon: ClipboardList },
  ];
  const aside: NavItem[] = [
    { href: `${base}/settings`, label: dict.nav.settings, icon: Settings },
    { href: `${base}/about`, label: dict.nav.about, icon: Info },
  ];

  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href);

  const tab = (item: NavItem) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        title={item.label}
        className={`press flex items-center gap-2 rounded-[calc(var(--radius-btn)-2px)] px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${
          active
            ? "bg-surface text-accent shadow-[var(--shadow-sm)]"
            : "text-text-muted hover:text-text"
        }`}
      >
        <Icon className="size-4 shrink-0" />
        <span className="hidden lg:inline">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label={dict.common.appName}
      className="flex items-center gap-0.5 rounded-[var(--radius-btn)] border border-border bg-surface-muted p-1"
    >
      {screens.map(tab)}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      {aside.map(tab)}
    </nav>
  );
}

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
    <span
      className="tnum hidden min-w-20 text-center text-sm font-semibold text-text md:block"
      suppressHydrationWarning
    >
      {now ? formatTime(now, locale) : "--:--:--"}
    </span>
  );
}
