import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StreetEntry } from "@/types/street";

/**
 * Loads the address reference list from `streets.txt` at the project root.
 * Format, one row per line:  street | mahalla | area | city
 * Blank lines and lines starting with `#` are ignored. Replace the file's
 * contents with your own data — nothing else needs to change.
 */
export function getStreets(): StreetEntry[] {
  let raw: string;
  try {
    raw = readFileSync(join(process.cwd(), "streets.txt"), "utf8");
  } catch {
    return [];
  }
  const out: StreetEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [street, mahalla = "", area = "", city = ""] = trimmed
      .split("|")
      .map((p) => p.trim());
    if (street) out.push({ street, mahalla, area, city });
  }
  return out;
}
