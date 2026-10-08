import "server-only";
import { headers } from "next/headers";

/**
 * Brute-force guard shared by the two sign-ins. A client that keeps guessing
 * passwords is locked out for a while. Counters live in the process — a
 * restart forgives, which is the right trade-off for a single shop terminal.
 */

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60_000;

/**
 * How long a wrong password is held against a client. Without this the five
 * strikes never expired, so five slips spread across a shift locked out a
 * cashier who had done nothing wrong.
 */
const FORGET_MS = 15 * 60_000;

const attempts = new Map<string, { count: number; lockedUntil: number; lastFailAt: number }>();

/**
 * Drop entries nobody is counting any more. The map is keyed by client, and
 * behind a proxy that is an address an attacker can vary at will, so it is
 * swept on the way past rather than left to grow for as long as the process
 * lives.
 */
function forgetExpired(now: number) {
  for (const [key, state] of attempts) {
    if (state.lockedUntil <= now && now - state.lastFailAt > FORGET_MS) {
      attempts.delete(key);
    }
  }
}

export interface LoginGate {
  /** True while the client is locked out; refuse without touching the database. */
  locked: boolean;
  /** Record a failed sign-in. */
  fail: () => void;
  /** Clear the client's history after a successful sign-in. */
  pass: () => void;
}

/** `scope` keeps the POS and the panel counting separately. */
export async function loginGate(scope: string): Promise<LoginGate> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const key = `${scope}:${ip}`;
  const now = Date.now();
  forgetExpired(now);

  const state = attempts.get(key);
  if (state && state.count >= MAX_ATTEMPTS) {
    if (state.lockedUntil > now) {
      return { locked: true, fail: () => {}, pass: () => {} };
    }
    // The lock has served its time; the client starts over with a clean slate.
    attempts.delete(key);
  }

  return {
    locked: false,
    fail: () => {
      const at = Date.now();
      const previous = attempts.get(key);
      // A strike that has aged out starts the count again rather than adding to
      // a tally from hours ago.
      const count =
        previous && at - previous.lastFailAt <= FORGET_MS ? previous.count + 1 : 1;
      attempts.set(key, { count, lockedUntil: at + LOCK_MS, lastFailAt: at });
    },
    pass: () => attempts.delete(key),
  };
}
