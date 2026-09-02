"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type Variant = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  variant: Variant;
}

interface ToastApi {
  toast: (message: string, variant?: Variant) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

const tone: Record<Variant, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-accent",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, variant: Variant = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  const dismiss = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 z-[100] flex flex-col gap-2 end-4"
        role="region"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const Icon = icons[t.variant];
          return (
            <div
              key={t.id}
              className="animate-slide-in pointer-events-auto flex min-w-64 max-w-96 items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface-raised px-4 py-3 shadow-[var(--shadow-lg)]"
            >
              <Icon className={`mt-0.5 size-5 shrink-0 ${tone[t.variant]}`} />
              <p className="flex-1 text-sm text-text">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="press -me-1 rounded-md p-0.5 text-text-faint hover:text-text"
                aria-label="close"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
