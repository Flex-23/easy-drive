import "server-only";
import type { Locale } from "./config";
import type { Dictionary, DeepStringify } from "./types";
import ar from "./dictionaries/ar.json";
import de from "./dictionaries/de.json";

export type { Dictionary };

/**
 * The two mutual assignments below make the key sets of `ar` and `de` provably
 * identical: a missing OR extra key in either file is a TypeScript compile error.
 */
// de must contain every ar key (catches keys missing from de).
const _deHasAllArKeys: DeepStringify<typeof ar> = de;
// ar must contain every de key (catches keys extra in de / missing from ar).
const _arHasAllDeKeys: DeepStringify<typeof de> = ar;
void _deHasAllArKeys;
void _arHasAllDeKeys;

const dictionaries: Record<Locale, Dictionary> = { ar, de };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
