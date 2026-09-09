"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";
import {
  UtensilsCrossed,
  Users,
  TrendingUp,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { panelLogout } from "@/app/actions/panel-auth";

/** Panel header: tabs, the signed-in admin, and the way out. */
export function PanelHeader({ adminName }: { adminName: string }) {
  const { dict } = useI18n();
  const pathname = usePathname();
  const [pending, start] = useTransition();

  const tabs = [
    { href: "/panel/menu", label: dict.master.tabs.menu, icon: UtensilsCrossed },
    { href: "/panel/staff", label: dict.master.tabs.staff, icon: Users },
    { href: "/panel/sales", label: dict.master.tabs.sales, icon: TrendingUp },
  ];

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-5 py-3">
      <div className="flex items-center gap-3">
        <ShieldCheck className="size-6 text-accent" />
        <div>
          <h1 className="text-lg font-bold text-text">{dict.master.title}</h1>
          <p className="text-xs text-text-muted">
            {dict.master.signedInAs} {adminName}
          </p>
        </div>
      </div>

      <nav className="flex flex-wrap items-center gap-1">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`press flex items-center gap-2 rounded-[var(--radius-btn)] px-3 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-accent text-accent-fg"
                  : "text-text-muted hover:bg-surface-muted hover:text-text"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>

      {/* No link into the POS: the panel is a separate area with its own session. */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => start(() => panelLogout())}
          disabled={pending}
          className="press flex items-center gap-1.5 rounded-[var(--radius-btn)] border border-border px-3 py-2 text-sm font-semibold text-danger hover:bg-danger-weak disabled:opacity-50"
        >
          <LogOut className="size-4" />
          {dict.master.logout}
        </button>
      </div>
    </header>
  );
}
