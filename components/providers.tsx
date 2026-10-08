"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/context";
import { ToastProvider } from "@/components/ui/toast";
import type { Dictionary } from "@/lib/i18n/types";
import type { Locale } from "@/lib/i18n/config";

export function Providers({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}) {
  return (
    <I18nProvider locale={locale} dict={dict}>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}
