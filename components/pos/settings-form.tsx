"use client";

import { useEffect, useState, useTransition, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, Monitor, Printer } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { useToast } from "@/components/ui/toast";
import { settingsSchema } from "@/lib/validations/settings";
import { updateSettings } from "@/app/actions/settings";
import { systemPrinters, printTest } from "@/app/actions/print";
import { posLocale } from "@/lib/i18n/config";
import {
  getServerTheme,
  getTheme,
  setTheme as setThemePref,
  subscribeTheme,
  type ThemePref,
} from "@/lib/theme-store";
import type { AppSettings } from "@/lib/queries/settings";
import type { Dictionary } from "@/lib/i18n/types";

type ValidationKey = keyof Dictionary["validation"];

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const { dict } = useI18n();
  const { toast } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const theme = useSyncExternalStore(subscribeTheme, getTheme, getServerTheme);

  /** What Windows reports is attached to this machine. */
  const [printers, setPrinters] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    systemPrinters().then((list) => {
      if (alive) setPrinters(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  function testPrint() {
    start(async () => {
      const res = await printTest();
      if (res.ok) toast(dict.settings.printTestDone, "success");
      else toast(errorText(res.error), "error");
    });
  }

  const errorText = (key: string) =>
    (dict.errors as Record<string, string>)[key] ?? dict.toast.genericError;

  const [form, setForm] = useState({
    restaurantName: initial.restaurantName,
    currency: initial.currency,
    receiptHeader: initial.receiptHeader,
    receiptFooter: initial.receiptFooter,
    printerName: initial.printerName,
    printerColumns: String(initial.printerColumns),
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const msg = (key: string) => dict.validation[key as ValidationKey] ?? dict.validation.required;

  function save() {
    const payload = {
      restaurantName: form.restaurantName,
      // Fixed by policy: the till is German, the Master panel is Arabic.
      defaultLocale: posLocale,
      currency: form.currency,
      receiptHeader: form.receiptHeader,
      receiptFooter: form.receiptFooter,
      printerName: form.printerName,
      printerColumns: Number(form.printerColumns),
    };
    const parsed = settingsSchema.safeParse(payload);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) {
        const k = i.path.join(".");
        if (!fe[k]) fe[k] = i.message;
      }
      setErrors(fe);
      return;
    }
    setErrors({});
    start(async () => {
      const res = await updateSettings(parsed.data);
      if (res.ok) {
        toast(dict.settings.saved, "success");
        router.refresh();
      } else {
        setErrors(res.fieldErrors ?? {});
        toast(dict.toast.genericError, "error");
      }
    });
  }

  const input =
    "w-full rounded-[var(--radius-btn)] border bg-surface-muted px-3 py-2 text-sm text-text outline-none focus:border-accent";
  const themes: { key: ThemePref; label: string; icon: typeof Sun }[] = [
    { key: "light", label: dict.topbar.themeLight, icon: Sun },
    { key: "dark", label: dict.topbar.themeDark, icon: Moon },
    { key: "system", label: dict.topbar.themeSystem, icon: Monitor },
  ];

  function field(name: keyof typeof form, label: string, extra?: { suffix?: string }) {
    return (
      <div>
        <label className="mb-1 block text-xs font-semibold text-text-muted">{label}</label>
        <div className="relative">
          <input
            value={form[name]}
            onChange={(e) => set(name, e.target.value)}
            className={`${input} ${errors[name] ? "border-danger" : "border-border"} ${extra?.suffix ? "pe-10" : ""}`}
          />
          {extra?.suffix ? (
            <span className="absolute top-1/2 -translate-y-1/2 text-sm text-text-muted end-3">
              {extra.suffix}
            </span>
          ) : null}
        </div>
        {errors[name] ? <p className="mt-1 text-xs text-danger">{msg(errors[name])}</p> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {/* General */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <h2 className="mb-4 font-bold text-text">{dict.settings.general}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field("restaurantName", dict.settings.restaurantName)}
          {field("currency", dict.settings.currency)}
        </div>
      </section>

      {/* Appearance */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <h2 className="mb-4 font-bold text-text">{dict.settings.appearance}</h2>
        <span className="mb-1.5 block text-xs font-semibold text-text-muted">{dict.settings.theme}</span>
        <div className="inline-flex gap-2">
          {themes.map((t) => {
            const Icon = t.icon;
            const active = theme === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setThemePref(t.key)}
                className={`press flex items-center gap-2 rounded-[var(--radius-btn)] border px-4 py-2 text-sm font-semibold ${active ? "border-accent bg-accent-weak text-accent" : "border-border text-text-muted hover:text-text"}`}
              >
                <Icon className="size-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Receipt */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <h2 className="mb-4 font-bold text-text">{dict.settings.receipt}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {field("receiptHeader", dict.settings.receiptHeader)}
          {field("receiptFooter", dict.settings.receiptFooter)}

          <div>
            <label className="mb-1 block text-xs font-semibold text-text-muted">
              {dict.settings.printer}
            </label>
            <select
              value={form.printerName}
              onChange={(e) => set("printerName", e.target.value)}
              className={`${input} border-border`}
            >
              <option value="">{printers.length === 0 ? dict.settings.noPrinters : "—"}</option>
              {printers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {/* Keep a printer that is configured but currently offline. */}
              {form.printerName && !printers.includes(form.printerName) ? (
                <option value={form.printerName}>{form.printerName}</option>
              ) : null}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-text-muted">
              {dict.settings.printerColumns}
            </label>
            <select
              value={form.printerColumns}
              onChange={(e) => set("printerColumns", e.target.value)}
              className={`${input} border-border`}
            >
              <option value="48">{dict.settings.columns48}</option>
              <option value="32">{dict.settings.columns32}</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={testPrint}
              disabled={pending || !form.printerName}
              className="press flex items-center gap-2 rounded-[var(--radius-btn)] border border-border px-4 py-2 text-sm font-semibold text-text-muted hover:bg-surface-muted hover:text-text disabled:opacity-40"
            >
              <Printer className="size-4" />
              {dict.settings.printTest}
            </button>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={pending}
          className="press rounded-[var(--radius-btn)] bg-accent px-6 py-2.5 text-sm font-bold text-accent-fg hover:bg-accent-strong disabled:opacity-50"
        >
          {dict.common.save}
        </button>
      </div>
    </div>
  );
}
