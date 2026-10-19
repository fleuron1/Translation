/**
 * A shared-password gate.
 *
 * The point is not to protect the book texts — they are public domain. It is
 * that a deployed instance holds a Gemini API key server-side, so an open URL
 * is an open proxy to whoever's quota is paying for it.
 *
 * Everything here uses Web Crypto so it can run in middleware (Edge runtime)
 * as well as in a route handler.
 */

export const AUTH_COOKIE = "gist_auth";

/** Fixed message: the token is derived from the password, so it is stable across restarts. */
const TOKEN_MESSAGE = "gist-gate-v1";

export const SESSION_DAYS = 30;

export function configuredPassword(): string | undefined {
  const password = process.env.APP_PASSWORD;
  return password && password.length > 0 ? password : undefined;
}

/**
 * Deployed instances must have a password. Locally, an unset password leaves
 * the gate open so `npm run dev` stays frictionless — set APP_PASSWORD in
 * .env.local to exercise the gate on your own machine.
 */
export function gateRequired(): boolean {
  return Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
}

async function hmacHex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The cookie value: proves the password was known without storing it. */
export function tokenFor(password: string): Promise<string> {
  return hmacHex(password, TOKEN_MESSAGE);
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
