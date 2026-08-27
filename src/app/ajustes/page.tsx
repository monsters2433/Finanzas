import { Card } from "@/components/ui";
import { getDb } from "@/lib/db";
import { isConfigured } from "@/lib/gocardless";
import { pushConfigured } from "@/lib/push";
import { authEnabled } from "@/lib/auth";
import { BankPanel } from "@/components/bank-panel";
import { PushPanel } from "@/components/push-panel";
import { BudgetPanel } from "@/components/budget-panel";
import { RulesPanel } from "@/components/rules-panel";
import { DemoPanel } from "@/components/demo-panel";
import { LogoutButton } from "@/components/logout-button";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ banco?: string }>;

const CALLBACK_MESSAGES: Record<string, { text: string; tone: string }> = {
  ok: { text: "Banco conectado. Se han importado tus movimientos.", tone: "text-good" },
  error: { text: "El banco rechazó la conexión o expiró el consentimiento.", tone: "text-bad" },
  desconocida: { text: "No reconocemos esa solicitud de conexión.", tone: "text-warn" },
  "sin-referencia": { text: "Volviste sin referencia de conexión.", tone: "text-warn" },
};

export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const db = getDb();

  const connections = db
    .prepare(
      `SELECT c.*, (SELECT COUNT(*) FROM accounts a WHERE a.connection_id = c.id) AS account_count
         FROM bank_connections c ORDER BY c.created_at DESC`,
    )
    .all() as Array<{
    id: number;
    institution_name: string;
    status: string;
    created_at: string;
    account_count: number;
  }>;

  const accounts = db
    .prepare(
      `SELECT id, name, iban, institution_name, balance_cents, last_synced_at, archived
         FROM accounts ORDER BY archived, name`,
    )
    .all() as Array<{
    id: number;
    name: string;
    iban: string | null;
    institution_name: string | null;
    balance_cents: number | null;
    last_synced_at: string | null;
    archived: number;
  }>;

  const categories = db
    .prepare("SELECT id, name, kind, color, monthly_budget_cents FROM categories ORDER BY kind, name")
    .all() as Array<{
    id: number;
    name: string;
    kind: string;
    color: string;
    monthly_budget_cents: number | null;
  }>;

  const rules = db
    .prepare(
      `SELECT r.id, r.pattern, r.priority, c.name AS category_name, c.color AS category_color
         FROM rules r LEFT JOIN categories c ON c.id = r.category_id
        ORDER BY r.priority DESC, r.id`,
    )
    .all() as Array<{
    id: number;
    pattern: string;
    priority: number;
    category_name: string | null;
    category_color: string | null;
  }>;

  const transactionCount = (db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n;
  const notice = params.banco ? CALLBACK_MESSAGES[params.banco] : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted">
          Conexión bancaria, notificaciones, presupuestos y reglas de categorización.
        </p>
      </div>

      {notice && <Card><p className={`text-sm ${notice.tone}`}>{notice.text}</p></Card>}

      <BankPanel
        configured={isConfigured()}
        connections={connections}
        accounts={accounts.map((a) => ({
          ...a,
          balance: a.balance_cents !== null ? formatCents(a.balance_cents) : null,
        }))}
      />

      <PushPanel configured={pushConfigured()} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BudgetPanel categories={categories} />
        <RulesPanel rules={rules} categories={categories} />
      </div>

      <DemoPanel transactionCount={transactionCount} />

      <Card title="Seguridad">
        <p className="text-sm text-muted">
          {authEnabled()
            ? "La app está protegida con contraseña (APP_PASSWORD)."
            : "Sin contraseña: define APP_PASSWORD en tu .env si vas a exponer la app fuera de tu red."}
        </p>
        {authEnabled() && <div className="mt-3"><LogoutButton /></div>}
      </Card>
    </div>
  );
}
