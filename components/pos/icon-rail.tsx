"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Package,
  ClipboardList,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { LogoMark } from "@/components/ui/logo";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function IconRail() {
  const { locale, dict } = useI18n();
  const pathname = usePathname();
  const base = `/${locale}`;

  const top: Item[] = [
    { href: base, label: dict.nav.newOrder, icon: ShoppingBag },
    { href: `${base}/drivers`, label: dict.nav.drivers, icon: Package },
    { href: `${base}/dashboard`, label: dict.nav.dashboard, icon: LayoutDashboard },
    { href: `${base}/daily-report`, label: dict.nav.dailyReport, icon: ClipboardList },
  ];
  const bottom: Item[] = [
    { href: `${base}/settings`, label: dict.nav.settings, icon: Settings },
  ];

  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href);

  const renderItem = (item: Item) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`press group relative flex w-full flex-col items-center gap-1 rounded-[var(--radius-btn)] py-2.5 text-[11px] font-medium transition-colors ${
          active
            ? "bg-accent-weak text-accent"
            : "text-text-faint hover:bg-surface-muted hover:text-text"
        }`}
      >
        {active ? (
          <span className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-accent" />
        ) : null}
        <Icon className="size-6" />
        <span className="text-center leading-tight">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label={dict.common.appName}
      className="flex w-20 shrink-0 flex-col items-center gap-1 border-e border-border bg-surface px-2 py-3"
    >
      <div className="mb-2 flex size-11 items-center justify-center">
        <LogoMark className="size-9" />
      </div>
      <div className="flex w-full flex-1 flex-col gap-1">{top.map(renderItem)}</div>
      <div className="flex w-full flex-col gap-1 border-t border-border pt-2">
        {bottom.map(renderItem)}
      </div>
    </nav>
  );
}
