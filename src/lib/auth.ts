const encoder = new TextEncoder();

export const SESSION_COOKIE = "finanzas_session";

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

/**
 * Deterministic session value derived from the app password, so the cookie
 * stays valid across restarts and can be verified in middleware without a
 * session store. Works in both the node and edge runtimes.
 */
export async function sessionToken(): Promise<string> {
  const secret = `${process.env.APP_PASSWORD ?? ""}:${process.env.AUTH_SALT ?? "finanzas-v1"}`;
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
