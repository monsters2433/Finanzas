import { cookies } from "next/headers";
import { SESSION_COOKIE, authEnabled, safeEqual, sessionToken } from "@/lib/auth";
import { body, fail, ok, str } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authEnabled()) return ok({ ok: true, note: "APP_PASSWORD no está configurada." });

  const { password } = await body<{ password?: string }>(request);
  const given = str(password);
  const expected = process.env.APP_PASSWORD!;
  if (!given || !safeEqual(given, expected)) return fail("Contraseña incorrecta.", 401);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return ok({ ok: true });
}
