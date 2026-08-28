import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb } from "@/lib/db";
import { handleError } from "@/lib/http";
import { todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Descarga una copia de seguridad completa.
 *
 * Usa VACUUM INTO en lugar de leer el fichero directamente: con el modo WAL
 * activo, parte de los datos vive en el fichero -wal y una lectura a pelo
 * devolvería una copia incompleta. VACUUM INTO escribe un único fichero
 * consistente y compactado aunque la app esté escribiendo en ese momento.
 */
export async function GET() {
  const temp = path.join(os.tmpdir(), `finanzas-${randomBytes(8).toString("hex")}.db`);
  try {
    getDb().prepare("VACUUM INTO ?").run(temp);
    const data = await fs.promises.readFile(temp);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": "application/vnd.sqlite3",
        "content-disposition": `attachment; filename="finanzas_${todayISO()}.db"`,
        "content-length": String(data.length),
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err);
  } finally {
    await fs.promises.rm(temp, { force: true }).catch(() => {});
  }
}
