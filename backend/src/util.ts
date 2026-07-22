// Utilidades: ids, base64url, hashing de contraseñas (PBKDF2/WebCrypto) y tokens de sesión (HS256).

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function nowISO(): string {
  return new Date().toISOString();
}

// ---------- base64url ----------
function bufToB64url(buf: ArrayBufferLike): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBuf(s: string): ArrayBuffer {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
const enc = new TextEncoder();

// ---------- contraseñas: PBKDF2-SHA256 ----------
const PBKDF2_ITER = 100_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2$${PBKDF2_ITER}$${bufToB64url(salt.buffer)}$${bufToB64url(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, iterStr, saltB64, hashB64] = stored.split("$");
    if (scheme !== "pbkdf2") return false;
    const iter = parseInt(iterStr, 10);
    const salt = new Uint8Array(b64urlToBuf(saltB64));
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
      key,
      256
    );
    return timingSafeEqual(bufToB64url(bits), hashB64);
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// ---------- tokens de sesión: JWT compacto HS256 ----------
export interface SessionPayload {
  sub: string; // user id
  email: string;
  exp: number; // epoch segundos
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signToken(payload: SessionPayload, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const p1 = bufToB64url(enc.encode(JSON.stringify(header)).buffer);
  const p2 = bufToB64url(enc.encode(JSON.stringify(payload)).buffer);
  const data = `${p1}.${p2}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return `${data}.${bufToB64url(sig)}`;
}

export async function verifyToken(token: string, secret: string): Promise<SessionPayload | null> {
  try {
    const [p1, p2, sig] = token.split(".");
    if (!p1 || !p2 || !sig) return null;
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify("HMAC", key, b64urlToBuf(sig), enc.encode(`${p1}.${p2}`));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBuf(p2))) as SessionPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// ---------- validación ligera ----------
export function isEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}
export function str(v: unknown, max = 200): string {
  return String(v ?? "").slice(0, max);
}
export function num(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}
export function bool(v: unknown): 0 | 1 {
  return v ? 1 : 0;
}
