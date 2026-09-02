import type ar from "./dictionaries/ar.json";

/** Recursively widen JSON string-literal types to `string`. */
export type DeepStringify<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]>;
};

/** The dictionary shape, derived from the canonical `ar.json`. */
export type Dictionary = DeepStringify<typeof ar>;
