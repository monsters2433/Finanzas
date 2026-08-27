import { Card } from "@/components/ui";
import { getCalendarToken } from "@/lib/calendar-token";
import { monthKey, todayISO } from "@/lib/dates";
import { listRecurring } from "@/lib/stats";
import { getDb } from "@/lib/db";
import { CalendarView } from "@/components/calendar-view";
import { CalendarSubscribe } from "@/components/calendar-subscribe";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ mes?: string }>;

export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const today = todayISO();
  const month = params.mes ?? monthKey(today);

  const items = listRecurring().filter((i) => i.active);
  const categories = getDb().prepare("SELECT id, name, color FROM categories").all() as Array<{
    id: number;
    name: string;
    color: string;
  }>;

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = process.env.APP_URL ?? `${proto}://${host}`;
  const feedUrl = `${origin}/api/calendar/${getCalendarToken()}.ics`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Calendario</h1>
        <p className="text-sm text-muted">
          Cada cobro recurrente, mes a mes. Suscríbete al feed y lo verás en el calendario del móvil.
        </p>
      </div>

      <CalendarView month={month} today={today} items={items} categories={categories} />

      <Card title="Vincular con el calendario del móvil" subtitle="Funciona en iPhone, Android y Google Calendar">
        <CalendarSubscribe url={feedUrl} />
      </Card>
    </div>
  );
}
