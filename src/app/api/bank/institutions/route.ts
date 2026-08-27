import { handleError, ok } from "@/lib/http";
import { isConfigured, listInstitutions } from "@/lib/gocardless";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isConfigured()) return ok({ configured: false, institutions: [] });
  const country = new URL(request.url).searchParams.get("country") ?? "es";
  try {
    const institutions = await listInstitutions(country);
    return ok({
      configured: true,
      institutions: institutions
        .map((i) => ({ id: i.id, name: i.name, logo: i.logo, days: Number(i.transaction_total_days ?? 90) }))
        .sort((a, b) => a.name.localeCompare(b.name, "es")),
    });
  } catch (err) {
    return handleError(err);
  }
}
