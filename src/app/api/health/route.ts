import { getDb } from "@/lib/db";
import { ok } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sonda de estado para orquestadores (Kubernetes, Docker, systemd-notify...).
 * Sin autenticar a propósito: solo confirma que el proceso responde y que
 * puede leer la base de datos, sin revelar nada de su contenido.
 */
export async function GET() {
  try {
    getDb().prepare("SELECT 1").get();
    return ok({ status: "ok" });
  } catch (err) {
    return ok({ status: "error", message: err instanceof Error ? err.message : String(err) }, { status: 503 });
  }
}
