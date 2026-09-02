"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Globe,
  ClipboardList,
  Settings,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { LogoMark } from "@/components/ui/logo";

interface Item {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

export function IconRail({ pendingOnline }: { pendingOnline: number }) {
  const { locale, dict } = useI18n();
  const pathname = usePathname();
  const base = `/${locale}`;

  const top: Item[] = [
    { href: `${base}/dashboard`, label: dict.nav.dashboard, icon: LayoutDashboard },
    { href: base, label: dict.nav.newOrder, icon: ShoppingBag },
    { href: `${base}/online-orders`, label: dict.nav.onlineOrders, icon: Globe, badge: pendingOnline },
    { href: `${base}/daily-report`, label: dict.nav.dailyReport, icon: ClipboardList },
  ];
  const bottom: Item[] = [
    { href: `${base}/settings`, label: dict.nav.settings, icon: Settings },
    { href: `${base}/switch-user`, label: dict.nav.switchUser, icon: UserRoundCog },
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
        <span className="relative">
          <Icon className="size-6" />
          {item.badge && item.badge > 0 ? (
            <span className="absolute -end-2 -top-2 flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white tnum">
              {item.badge}
            </span>
          ) : null}
        </span>
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
