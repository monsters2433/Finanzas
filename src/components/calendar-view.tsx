"use client";

import { useMemo, useState } from "react";
import { Card, Dot } from "@/components/ui";
import { formatCents } from "@/lib/money";
import {
  formatDateLongES,
  formatMonthKey,
  monthEnd,
  monthStart,
  shiftMonthKey,
  parseISO,
} from "@/lib/dates";
import { occurrencesBetween, type RecurringItem } from "@/lib/recurrence";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

export function CalendarView({
  month: initialMonth,
  today,
  items,
  categories,
}: {
  month: string;
  today: string;
  items: RecurringItem[];
  categories: Array<{ id: number; name: string; color: string }>;
}) {
  const [month, setMonth] = useState(initialMonth);
  const colorById = new Map(categories.map((c) => [c.id, c.color]));

  const { byDay, total, incomeTotal } = useMemo(() => {
    const from = monthStart(month);
    const to = monthEnd(month);
    const map = new Map<string, Array<{ item: RecurringItem }>>();
    let spend = 0;
    let income = 0;
    for (const item of items) {
      for (const date of occurrencesBetween(item, from, to)) {
        const list = map.get(date) ?? [];
        list.push({ item });
        map.set(date, list);
        if (item.kind === "income") income += item.amount_cents;
        else spend += item.amount_cents;
      }
    }
    return { byDay: map, total: spend, incomeTotal: income };
  }, [items, month]);

  const cells = useMemo(() => {
    const first = parseISO(monthStart(month));
    const offset = (first.getUTCDay() + 6) % 7; // Monday-first grid
    const days = Number(monthEnd(month).slice(8));
    const out: Array<string | null> = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= days; d++) out.push(`${month}-${String(d).padStart(2, "0")}`);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [month]);

  return (
    <Card
      title={formatMonthKey(month)}
      subtitle={`${formatCents(total)} en cargos previstos${
        incomeTotal ? ` · ${formatCents(incomeTotal)} de ingresos` : ""
      }`}
      action={
        <div className="flex gap-1.5">
          <button className="chip" onClick={() => setMonth(shiftMonthKey(month, -1))}>‹ Anterior</button>
          <button className="chip" onClick={() => setMonth(shiftMonthKey(month, 1))}>Siguiente ›</button>
        </div>
      }
    >
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted">
        {WEEKDAYS.map((day) => (
          <div key={day} className="pb-1">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, index) => {
          if (!date) return <div key={`empty-${index}`} className="min-h-[84px] rounded-lg bg-white/[0.015]" />;
          const charges = byDay.get(date) ?? [];
          const isToday = date === today;
          const dayTotal = charges
            .filter((c) => c.item.kind !== "income")
            .reduce((sum, c) => sum + c.item.amount_cents, 0);
          return (
            <div
              key={date}
              className={`min-h-[84px] rounded-lg border p-1.5 text-left ${
                isToday ? "border-accent bg-accent/10" : "border-edge bg-white/[0.02]"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className={`text-xs ${isToday ? "font-semibold text-accent" : "text-muted"}`}>
                  {Number(date.slice(8))}
                </span>
                {dayTotal > 0 && (
                  <span className="text-[10px] tabular-nums text-muted">{formatCents(dayTotal)}</span>
                )}
              </div>
              <ul className="mt-1 space-y-0.5">
                {charges.slice(0, 3).map(({ item }) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-1 truncate text-[11px]"
                    title={`${item.name} — ${formatCents(item.amount_cents)} (${formatDateLongES(date)})`}
                  >
                    <Dot color={item.category_id ? colorById.get(item.category_id) ?? "#4f8cff" : "#4f8cff"} />
                    <span className="truncate">{item.name}</span>
                  </li>
                ))}
                {charges.length > 3 && (
                  <li className="text-[11px] text-muted">+{charges.length - 3} más</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
