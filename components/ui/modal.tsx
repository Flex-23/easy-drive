"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Accessible modal: backdrop blur, scale+fade entrance, Escape to close,
 * focus trap, focus restore, close X in the inline-end top corner.
 */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  closeLabel,
  maxWidth = "max-w-[640px]",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  maxWidth?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("[data-autofocus]")?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab" && panel) {
        const focusable = panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        className={`animate-scale-in relative flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-lg)]`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-text">{title}</h2>
            {subtitle ? (
              <div className="mt-0.5 text-sm text-text-muted">{subtitle}</div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label={closeLabel}
            className="press -me-1 -mt-1 rounded-[var(--radius-btn)] p-1.5 text-text-faint hover:bg-surface-muted hover:text-text"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-border bg-surface px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
