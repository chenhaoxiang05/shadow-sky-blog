import { argon2idAsync } from "@noble/hashes/argon2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";

const ARGON = { t: 2, m: 19_456, p: 1, dkLen: 32, maxmem: 64 * 1024 * 1024 } as const;

export function requiredSecret(name: "SESSION_SECRET" | "PASSWORD_PEPPER") {
  const value = process.env[name];
  if (!value || value.length < 32) throw new Error(`${name} must contain at least 32 characters`);
  return value;
}

export async function hashPassword(password: string, pepper = requiredSecret("PASSWORD_PEPPER")) {
  if (password.length < 12 || password.length > 256) throw new Error("Password must contain 12-256 characters");
  const salt = randomBytes(16);
  const digest = await argon2idAsync(utf8ToBytes(`${password}\0${pepper}`), salt, ARGON);
  return `argon2id$v=19$m=${ARGON.m},t=${ARGON.t},p=${ARGON.p}$${bytesToHex(salt)}$${bytesToHex(digest)}`;
}

export async function verifyPassword(encoded: string, password: string, pepper = requiredSecret("PASSWORD_PEPPER")) {
  try {
    const [, version, params, saltHex, hashHex] = encoded.split("$");
    if (version !== "v=19") return false;
    const parsed = Object.fromEntries(params.split(",").map((part) => part.split("=")));
    const digest = await argon2idAsync(utf8ToBytes(`${password}\0${pepper}`), hexToBytes(saltHex), { t: Number(parsed.t), m: Number(parsed.m), p: Number(parsed.p), dkLen: hashHex.length / 2, maxmem: 64 * 1024 * 1024 });
    return timingSafeHex(bytesToHex(digest), hashHex);
  } catch { return false; }
}

export function opaqueToken(bytes = 32) { return bytesToHex(randomBytes(bytes)); }
export function hashToken(token: string, secret = requiredSecret("SESSION_SECRET")) { return bytesToHex(sha256(utf8ToBytes(`${secret}\0${token}`))); }
export function hashPrivacyValue(value: string, secret = requiredSecret("SESSION_SECRET")) { return bytesToHex(sha256(utf8ToBytes(`${secret}\0privacy\0${value}`))); }
export function timingSafeHex(left: string, right: string) { if (left.length !== right.length) return false; let diff = 0; for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i); return diff === 0; }

export const SESSION_COOKIE = "shadow_sky_session";
export const CSRF_COOKIE = "shadow_sky_csrf";
export function sessionCookie(token: string, expires: Date) { return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`; }
export function csrfCookie(token: string, expires: Date) { return `${CSRF_COOKIE}=${token}; Path=/; Secure; SameSite=Strict; Expires=${expires.toUTCString()}`; }
export function clearSessionCookies() { return [`${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`, `${CSRF_COOKIE}=; Path=/; Secure; SameSite=Strict; Max-Age=0`]; }
export function readCookie(request: Request, name: string) { const cookie = request.headers.get("cookie") ?? ""; return cookie.split(";").map((part) => part.trim().split("=")).find(([key]) => key === name)?.slice(1).join("="); }
export function assertSameOrigin(request: Request) { const origin = request.headers.get("origin"); if (!origin) return; if (new URL(origin).host !== new URL(request.url).host) throw new Error("CSRF_ORIGIN_MISMATCH"); }
export function assertCsrf(request: Request, storedHash: string) { assertSameOrigin(request); const header = request.headers.get("x-csrf-token") ?? ""; const cookie = readCookie(request, CSRF_COOKIE) ?? ""; if (!header || header !== cookie || !timingSafeHex(hashToken(header), storedHash)) throw new Error("CSRF_TOKEN_MISMATCH"); }
