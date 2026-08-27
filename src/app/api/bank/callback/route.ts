import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAccountDetails, getRequisition } from "@/lib/gocardless";
import { syncAllAccounts } from "@/lib/sync";

export const runtime = "nodejs";

/** The bank redirects the user back here after they approve the consent. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("ref");
  const origin = process.env.APP_URL ?? url.origin;
  const back = (status: string) => NextResponse.redirect(`${origin}/ajustes?banco=${status}`);

  if (!reference) return back("sin-referencia");

  const db = getDb();
  const connection = db
    .prepare("SELECT id, requisition_id, institution_name FROM bank_connections WHERE reference = ?")
    .get(reference) as { id: number; requisition_id: string; institution_name: string } | undefined;
  if (!connection) return back("desconocida");

  try {
    const requisition = await getRequisition(connection.requisition_id);
    db.prepare("UPDATE bank_connections SET status = ? WHERE id = ?").run(requisition.status, connection.id);

    const upsert = db.prepare(
      `INSERT INTO accounts (connection_id, external_id, name, iban, currency, institution_name)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(external_id) DO UPDATE SET
         connection_id = excluded.connection_id,
         name          = excluded.name,
         iban          = excluded.iban,
         archived      = 0`,
    );

    for (const accountId of requisition.accounts ?? []) {
      let name = "Cuenta";
      let iban: string | null = null;
      let currency = "EUR";
      try {
        const details = await getAccountDetails(accountId);
        const a = details.account ?? {};
        name = a.displayName || a.name || a.product || a.ownerName || "Cuenta";
        iban = a.iban ?? null;
        currency = a.currency ?? "EUR";
      } catch {
        // Details are optional; the account is still usable for transactions.
      }
      upsert.run(connection.id, accountId, name, iban, currency, connection.institution_name);
    }

    await syncAllAccounts();
    return back("ok");
  } catch {
    return back("error");
  }
}
