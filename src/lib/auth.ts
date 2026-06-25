import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "admin_session";

function secret(): string {
  return process.env.SESSION_SECRET || "dev-insecure-secret-change-me";
}

function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "change-me";
}

// The session token is an HMAC of a fixed marker — it proves the holder knew the
// admin password at login time without storing the password in the cookie.
function expectedToken(): string {
  return createHmac("sha256", secret()).update("admin-ok").digest("hex");
}

export function verifyPassword(input: string): boolean {
  const a = Buffer.from(input);
  const b = Buffer.from(adminPassword());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function makeSessionToken(): string {
  return expectedToken();
}

export function sessionCookieName(): string {
  return COOKIE_NAME;
}

/** Server-side check for admin API routes / pages. */
export function isAdminAuthed(): boolean {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return false;
  const expected = expectedToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
