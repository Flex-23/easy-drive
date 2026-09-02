"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import {
  applyTheme,
  getServerTheme,
  getTheme,
  setTheme,
  subscribeTheme,
  type ThemePref,
} from "@/lib/theme-store";

const order: ThemePref[] = ["light", "dark", "system"];
const icon = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle() {
  const { dict } = useI18n();
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);

  // Re-apply on mount (fixes React's dev remount clearing the attribute).
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const label = {
    light: dict.topbar.themeLight,
    dark: dict.topbar.themeDark,
    system: dict.topbar.themeSystem,
  };
  const Icon = icon[theme];

  return (
    <button
      onClick={() => setTheme(order[(order.indexOf(theme) + 1) % order.length])}
      className="press flex size-9 items-center justify-center rounded-[var(--radius-btn)] border border-border bg-surface text-text-muted hover:border-border-strong hover:text-text"
      title={`${dict.topbar.themeToggle}: ${label[theme]}`}
      aria-label={`${dict.topbar.themeToggle}: ${label[theme]}`}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
