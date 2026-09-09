import "server-only";
import { db } from "../db";
import { defaultLocale, isLocale, type Locale } from "../i18n/config";

export interface AppSettings {
  restaurantName: string;
  defaultLocale: Locale;
  currency: string;
  taxRate: number;
  deliveryFee: number;
  receiptHeader: string;
  receiptFooter: string;
  printerName: string;
  /** Characters per line: 48 on an 80 mm roll, 32 on 58 mm. */
  printerColumns: number;
}

const DEFAULTS: AppSettings = {
  restaurantName: "Easy Drive",
  defaultLocale,
  currency: "EUR",
  taxRate: 0.19,
  deliveryFee: 2.5,
  receiptHeader: "Easy Drive",
  receiptFooter: "",
  printerName: "",
  printerColumns: 48,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await db.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const loc = map.get("defaultLocale");
  return {
    restaurantName: map.get("restaurantName") ?? DEFAULTS.restaurantName,
    defaultLocale: loc && isLocale(loc) ? loc : DEFAULTS.defaultLocale,
    currency: map.get("currency") ?? DEFAULTS.currency,
    taxRate: map.has("taxRate") ? Number(map.get("taxRate")) : DEFAULTS.taxRate,
    deliveryFee: map.has("deliveryFee")
      ? Number(map.get("deliveryFee"))
      : DEFAULTS.deliveryFee,
    receiptHeader: map.get("receiptHeader") ?? DEFAULTS.receiptHeader,
    receiptFooter: map.get("receiptFooter") ?? DEFAULTS.receiptFooter,
    printerName: map.get("printerName") ?? DEFAULTS.printerName,
    printerColumns: map.has("printerColumns")
      ? Number(map.get("printerColumns"))
      : DEFAULTS.printerColumns,
  };
}
