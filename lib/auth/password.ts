import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Passwords are hashed with scrypt (Node built-in, no native deps) and stored
 * as `salt:hash` in hex. Never store or log a plaintext password.
 */
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const testBuf = scryptSync(password, salt, KEYLEN);
  if (hashBuf.length !== testBuf.length) return false;
  return timingSafeEqual(hashBuf, testBuf);
}

/**
 * A hash to verify against when the e-mail matched nobody, so a wrong address
 * costs the same time as a wrong password and the two cannot be told apart.
 */
export const NOBODY = hashPassword(randomBytes(16).toString("hex"));
