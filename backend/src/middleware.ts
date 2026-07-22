import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifyToken } from "./util";
import type { AppBindings } from "./types";

// Autenticación: lee el token de la cookie `ciclo_session` o de `Authorization: Bearer`.
export async function requireAuth(c: Context<AppBindings>, next: Next) {
  const bearer = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const token = getCookie(c, "ciclo_session") || bearer;
  if (!token) return c.json({ error: "no_autenticado" }, 401);

  const payload = await verifyToken(token, c.env.AUTH_SECRET);
  if (!payload) return c.json({ error: "sesion_invalida" }, 401);

  c.set("user", payload);
  await next();
}
