"use client";

import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";

export function DatePicker({ value }: { value: string }) {
  const { dict } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  return (
    <label className="flex items-center gap-2 text-sm text-text-muted">
      <span>{dict.dailyReport.selectDate}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => router.push(`${pathname}?date=${e.target.value}`)}
        className="tnum rounded-[var(--radius-btn)] border border-border bg-surface px-3 py-1.5 text-sm text-text outline-none focus:border-accent"
      />
    </label>
  );
}
