import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * PINs are hashed with scrypt (Node built-in, no native deps) and stored as
 * `salt:hash` in hex. Never store or log a plaintext PIN.
 */
const KEYLEN = 64;

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, KEYLEN).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const hashBuf = Buffer.from(hash, "hex");
  const testBuf = scryptSync(pin, salt, KEYLEN);
  if (hashBuf.length !== testBuf.length) return false;
  return timingSafeEqual(hashBuf, testBuf);
}
