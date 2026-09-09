import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

/**
 * Signed session tokens, shared by the two independent sign-ins: the POS
 * (cashiers) and the Master panel (admins). Each has its own `scope`, and the
 * signing key is derived per scope — so a POS token can never be replayed as a
 * panel token, whatever an attacker does with the cookie.
 *
 * A token is `userId.expiry.signature`; nothing is stored server-side.
 */

function key(scope: string): string {
  const base =
    env.MASTER_SESSION_SECRET ??
    createHash("sha256").update(`session:${env.DATABASE_URL}`).digest("hex");
  return createHmac("sha256", base).update(scope).digest("hex");
}

function sign(scope: string, payload: string): string {
  return createHmac("sha256", key(scope)).update(payload).digest("hex");
}

export function createSessionToken(
  scope: string,
  userId: number,
  maxAgeSeconds: number,
): string {
  const payload = `${userId}.${Date.now() + maxAgeSeconds * 1000}`;
  return `${payload}.${sign(scope, payload)}`;
}

/** The user id carried by a valid, unexpired token — or null. */
export function readSessionToken(scope: string, token: string): number | null {
  const [id, expires, signature] = token.split(".");
  if (!id || !expires || !signature) return null;

  const expected = Buffer.from(sign(scope, `${id}.${expires}`), "hex");
  const given = Buffer.from(signature, "hex");
  if (given.length !== expected.length) return null;
  if (!timingSafeEqual(given, expected)) return null;
  if (Number(expires) < Date.now()) return null;

  const userId = Number(id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}
