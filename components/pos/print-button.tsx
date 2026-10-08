"use client";

import { useTransition } from "react";
import { Printer } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useToast } from "@/components/ui/toast";
import { printDailyReport } from "@/app/actions/print";

/** Sends the day-close sheet straight to the till's printer. */
export function PrintButton() {
  const { dict } = useI18n();
  const { toast } = useToast();
  const [pending, start] = useTransition();

  return (
    <button
      onClick={() =>
        start(async () => {
          const res = await printDailyReport();
          if (!res.ok) {
            const errors = dict.errors as Record<string, string>;
            toast(errors[res.error] ?? dict.toast.genericError, "error");
          }
        })
      }
      disabled={pending}
      className="press flex items-center gap-2 rounded-[var(--radius-btn)] bg-accent px-4 py-2 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-50"
    >
      <Printer className="size-4" />
      {dict.dailyReport.print}
    </button>
  );
}
