import { getDb } from "@/lib/db";
import { monthKey, todayISO } from "@/lib/dates";
import { TransactionsView } from "@/components/transactions-view";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ month?: string; q?: string; category?: string }>;

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const db = getDb();

  const months = (
    db
      .prepare(
        "SELECT DISTINCT substr(booked_date, 1, 7) AS month FROM transactions ORDER BY month DESC LIMIT 36",
      )
      .all() as Array<{ month: string }>
  ).map((r) => r.month);

  const categories = db
    .prepare("SELECT id, name, kind, color FROM categories ORDER BY kind, name")
    .all() as Array<{ id: number; name: string; kind: string; color: string }>;

  const month = params.month ?? months[0] ?? monthKey(todayISO());

  return (
    <TransactionsView
      months={months.length ? months : [month]}
      categories={categories}
      initialMonth={month}
      today={todayISO()}
    />
  );
}
