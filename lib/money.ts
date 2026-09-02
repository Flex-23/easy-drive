import { localeIntlTag, type Locale } from "./i18n/config";

/**
 * The single money/number/date formatting helper for the whole app.
 * Never build currency strings by hand — always go through here.
 *
 * `ar` uses the `ar-u-nu-latn` tag so digits render as Latin numerals
 * (a cashier terminal shows `12,99 €`, never `١٢٬٩٩`). Both locales use EUR.
 */

const CURRENCY = "EUR";

/** A price stored as Prisma.Decimal arrives here as a string; accept both. */
export type MoneyInput = number | string;

function toNumber(value: MoneyInput): number {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value: MoneyInput, locale: Locale): string {
  return new Intl.NumberFormat(localeIntlTag[locale], {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

/** Format an integer-cents amount (the cart/pricing unit) as EUR. */
export function formatCents(cents: number, locale: Locale): string {
  return formatMoney(cents / 100, locale);
}

/** Signed surcharge label, e.g. `+ 1,50 €` / `− 0,50 €`. */
export function formatSurcharge(value: MoneyInput, locale: Locale): string {
  const n = toNumber(value);
  const sign = n < 0 ? "− " : "+ ";
  return sign + formatMoney(Math.abs(n), locale);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeIntlTag[locale]).format(value);
}

export function formatDateTime(
  value: Date | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(
    localeIntlTag[locale],
    options ?? {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

export function formatTime(value: Date | string, locale: Locale): string {
  return formatDateTime(value, locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDate(value: Date | string, locale: Locale): string {
  return formatDateTime(value, locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
