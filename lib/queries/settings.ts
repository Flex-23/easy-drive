import "server-only";
import { cache } from "react";
import { db } from "../db";
import { defaultLocale, isLocale, type Locale } from "../i18n/config";

export interface AppSettings {
  restaurantName: string;
  defaultLocale: Locale;
  currency: string;
  receiptHeader: string;
  receiptFooter: string;
  printerName: string;
  /** Characters per line: 48 on an 80 mm roll, 32 on 58 mm. */
  printerColumns: number;
}

const DEFAULTS: AppSettings = {
  restaurantName: "Food Express",
  defaultLocale,
  currency: "EUR",
  receiptHeader: "Food Express",
  receiptFooter: "",
  printerName: "",
  printerColumns: 48,
};

/**
 * `cache` memoizes this for one request. The till's layout and its page both ask
 * for the settings, and the print actions ask again alongside the order — the
 * answer cannot change inside a single request, and the database is a round trip
 * away, so it is worth asking once.
 */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await db.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const loc = map.get("defaultLocale");

  /**
   * Settings are stored as text, so a hand-edited or half-written row can hold
   * something that is not a number. Falling back beats letting `NaN` through:
   * it would reach `computeOrderTotals` and then `Prisma.Decimal`, and every
   * order would fail to save with nothing on screen to explain why.
   */
  const number = (key: string, fallback: number) => {
    const value = Number(map.get(key));
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    restaurantName: map.get("restaurantName") ?? DEFAULTS.restaurantName,
    defaultLocale: loc && isLocale(loc) ? loc : DEFAULTS.defaultLocale,
    currency: map.get("currency") ?? DEFAULTS.currency,
    receiptHeader: map.get("receiptHeader") ?? DEFAULTS.receiptHeader,
    receiptFooter: map.get("receiptFooter") ?? DEFAULTS.receiptFooter,
    printerName: map.get("printerName") ?? DEFAULTS.printerName,
    printerColumns: number("printerColumns", DEFAULTS.printerColumns),
  };
});
