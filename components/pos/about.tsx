"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Mail,
  Copy,
  Check,
  ShoppingBag,
  Users,
  Bike,
  Printer,
  ClipboardList,
  ShieldCheck,
  Code2,
  type LucideIcon,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import logo from "@/public/food-express.jpg";

const CONTACT_EMAIL = "baqir7710@gmail.com";

/**
 * What Food Express is, who made it, and how to reach them. The one page in
 * the till that is about the software rather than the shop.
 */
export function About({ version }: { version: string }) {
  const { dict } = useI18n();
  const t = dict.about;

  const features: { icon: LucideIcon; text: string }[] = [
    { icon: ShoppingBag, text: t.features.orders },
    { icon: Users, text: t.features.customers },
    { icon: Bike, text: t.features.drivers },
    { icon: Printer, text: t.features.printing },
    { icon: ClipboardList, text: t.features.reports },
    { icon: ShieldCheck, text: t.features.master },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      {/* The brand, on its own ground: the logo keeps its cream background. */}
      <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface">
        <div className="grid items-center gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-[var(--radius-btn)] bg-[#f3e2bf]">
            <Image
              src={logo}
              alt="Food Express — Delivery Service"
              priority
              sizes="(min-width: 640px) 28rem, 100vw"
              className="h-auto w-full"
            />
          </div>
          <div>
            <p className="text-xs font-semibold tracking-wide text-accent">{t.tagline}</p>
            <h1 className="mt-1 text-2xl font-extrabold text-text">Food Express</h1>
            <p className="mt-3 text-sm leading-relaxed text-text-muted">{t.systemText}</p>
            <p className="tnum mt-4 text-xs text-text-faint">
              {t.version} {version}
            </p>
          </div>
        </div>
      </section>

      {/* What it does — six things, each with its icon. */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
        <h2 className="mb-3 font-bold text-text">{t.featuresTitle}</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 rounded-[var(--radius-btn)] bg-surface-muted/60 p-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-weak text-accent">
                <Icon className="size-4" />
              </span>
              <span className="text-sm leading-snug text-text">{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Who made it. */}
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <h2 className="mb-3 font-bold text-text">{t.developerTitle}</h2>
          <div className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-btn)] bg-accent text-lg font-bold text-accent-fg shadow-[var(--shadow-sm)]">
              {t.developerName.slice(0, 1)}
            </span>
            <div>
              <p className="font-bold text-text">{t.developerName}</p>
              <p className="flex items-center gap-1.5 text-xs text-text-muted">
                <Code2 className="size-3.5" />
                Food Express
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-text-muted">{t.developerText}</p>
        </section>

        {/* How to reach them. */}
        <section className="flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-5">
          <h2 className="mb-3 font-bold text-text">{t.contactTitle}</h2>
          <p className="text-sm leading-relaxed text-text-muted">{t.contactText}</p>
          <p className="tnum mt-4 rounded-[var(--radius-btn)] border border-border bg-surface-muted px-3 py-2 text-center text-sm font-semibold text-text" dir="ltr">
            {CONTACT_EMAIL}
          </p>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Food Express")}`}
              className="press flex items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-accent py-2.5 text-sm font-bold text-accent-fg shadow-[var(--shadow-sm)] hover:bg-accent-strong"
            >
              <Mail className="size-4" />
              {t.writeEmail}
            </a>
            <CopyButton value={CONTACT_EMAIL} label={t.copyEmail} done={t.copied} />
          </div>
        </section>
      </div>
    </div>
  );
}

/** Copies the address; the tick stays a moment so the tap is seen to land. */
function CopyButton({ value, label, done }: { value: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      aria-label={copied ? done : label}
      title={copied ? done : label}
      className={`press flex size-10 items-center justify-center rounded-[var(--radius-btn)] border transition-colors ${
        copied
          ? "border-success bg-success-weak text-success"
          : "border-border text-text-muted hover:border-border-strong hover:text-text"
      }`}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
}
