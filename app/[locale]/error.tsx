"use client";

import { usePathname } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import ar from "@/lib/i18n/dictionaries/ar.json";
import de from "@/lib/i18n/dictionaries/de.json";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const pathname = usePathname();
  const locale = pathname.startsWith("/de") ? "de" : "ar";
  const dict = locale === "de" ? de : ar;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="size-12 text-danger" />
      <div>
        <h2 className="text-lg font-bold text-text">{dict.errors.somethingWrong}</h2>
        <p className="mt-1 text-sm text-text-muted">{dict.errors.tryAgain}</p>
      </div>
      <button
        onClick={reset}
        className="press rounded-[var(--radius-btn)] bg-accent px-5 py-2.5 text-sm font-bold text-accent-fg hover:bg-accent-strong"
      >
        {dict.common.retry}
      </button>
    </div>
  );
}
