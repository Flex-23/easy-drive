"use server";

import { getStreets } from "@/lib/data/streets";
import { requireCashier } from "@/lib/session";
import type { StreetEntry } from "@/types/street";

/**
 * The address reference list, fetched the first time a cashier opens the
 * customer form instead of riding along with every POS page load. The server
 * parses `streets.txt` once per process and the browser keeps one copy per tab.
 */
export async function listStreets(): Promise<StreetEntry[]> {
  await requireCashier();
  return getStreets();
}
