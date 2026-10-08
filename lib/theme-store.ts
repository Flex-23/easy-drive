"use client";

/**
 * Tiny external store for the theme preference, read via useSyncExternalStore
 * so components stay hydration-safe and free of setState-in-effect. The actual
 * `data-theme` attribute is also set by the blocking inline script in the
 * layout to avoid any flash before hydration.
 */
export type ThemePref = "light" | "dark" | "system";

const KEY = "theme";
const listeners = new Set<() => void>();

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(t: ThemePref): "light" | "dark" {
  return t === "dark" || (t === "system" && systemDark()) ? "dark" : "light";
}

export function applyTheme(t: ThemePref): void {
  document.documentElement.setAttribute("data-theme", resolveTheme(t));
}

export function getTheme(): ThemePref {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem(KEY) as ThemePref) || "system";
}

export function getServerTheme(): ThemePref {
  return "system";
}

export function setTheme(t: ThemePref): void {
  localStorage.setItem(KEY, t);
  applyTheme(t);
  listeners.forEach((l) => l());
}

export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (getTheme() === "system") applyTheme("system");
    cb();
  };
  mq.addEventListener("change", onSystem);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", onSystem);
  };
}
