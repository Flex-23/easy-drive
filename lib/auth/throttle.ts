import "server-only";
import { headers } from "next/headers";

/**
 * Brute-force guard shared by the two PIN sign-ins. A four-digit PIN is only
 * 10 000 combinations, so a client that keeps guessing is locked out for a
 * while. Counters live in the process — a restart forgives, which is the right
 * trade-off for a single shop terminal.
 */

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

const attempts = new Map<string, { count: number; lockedUntil: number }>();

export interface PinGate {
  /** True while the client is locked out; refuse without touching the database. */
  locked: boolean;
  /** Record a wrong PIN. */
  fail: () => void;
  /** Clear the client's history after a correct PIN. */
  pass: () => void;
}

/** `scope` keeps the POS and the panel counting separately. */
export async function pinGate(scope: string): Promise<PinGate> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  const state = attempts.get(key);

  if (state && state.count >= MAX_ATTEMPTS) {
    if (state.lockedUntil > now) {
      return { locked: true, fail: () => {}, pass: () => {} };
    }
    attempts.delete(key);
  }

  return {
    locked: false,
    fail: () => {
      const current = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
      current.count += 1;
      current.lockedUntil = Date.now() + LOCK_MS;
      attempts.set(key, current);
    },
    pass: () => attempts.delete(key),
  };
}
