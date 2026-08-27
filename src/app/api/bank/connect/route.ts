import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/db";
import { body, fail, handleError, ok, str } from "@/lib/http";
import { createRequisition, isConfigured } from "@/lib/gocardless";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isConfigured()) return fail("Configura GOCARDLESS_SECRET_ID y GOCARDLESS_SECRET_KEY.", 400);

  const { institutionId, institutionName } = await body<{
    institutionId?: string;
    institutionName?: string;
  }>(request);
  const id = str(institutionId);
  if (!id) return fail("Falta el identificador del banco.");

  const origin = process.env.APP_URL ?? new URL(request.url).origin;
  const reference = randomUUID();

  try {
    const requisition = await createRequisition({
      institutionId: id,
      reference,
      redirect: `${origin}/api/bank/callback?ref=${reference}`,
    });

    getDb()
      .prepare(
        `INSERT INTO bank_connections
           (requisition_id, reference, institution_id, institution_name, status, link)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(requisition.id, reference, id, str(institutionName, id), requisition.status, requisition.link);

    return ok({ link: requisition.link, requisitionId: requisition.id });
  } catch (err) {
    return handleError(err);
  }
}
