import { buildCalendar } from "@/lib/ics";
import { isValidCalendarToken } from "@/lib/calendar-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, token-authenticated ICS feed. Subscribe to it from iOS/Android
 * (Ajustes → Calendario → Añadir suscripción) and every charge shows up
 * on the phone, alarms included.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const clean = token.replace(/\.ics$/i, "");

  if (!isValidCalendarToken(clean)) {
    return new Response("No autorizado", { status: 401 });
  }

  return new Response(buildCalendar(), {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="finanzas.ics"',
      "cache-control": "no-cache, max-age=0",
    },
  });
}
