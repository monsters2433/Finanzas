import { getSetting, setSetting } from "./db";
import { syncAllAccounts } from "./sync";
import { notifyBudgetOverruns, notifyDailyDigest, notifyNewSpending, notifyUpcomingCharges } from "./notify";
import { todayISO } from "./dates";

/**
 * Tareas programadas dentro del propio proceso: sin systemd timer, sin cron
 * del sistema, sin n8n. Arranca sola al iniciar la app (ver instrumentation.ts)
 * y sigue mientras el proceso viva.
 *
 * Se puede desactivar con DISABLE_INTERNAL_SCHEDULER=1 para quien prefiera
 * seguir disparando /api/cron desde fuera (n8n, cron del sistema).
 */

const TICK_MINUTES = Number(process.env.SCHEDULER_TICK_MINUTES ?? 10);
const SYNC_EVERY_MINUTES = Number(process.env.AUTO_SYNC_MINUTES ?? 180);
const DIGEST_HOUR = Number(process.env.AUTO_DIGEST_HOUR ?? 21);
const TIMEZONE = "Europe/Madrid";

function localHour(date: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", hour12: false }).format(date),
  );
}

async function tick() {
  const now = new Date();

  // Recordatorios y presupuestos: comprobación barata e idempotente
  // (sendPushOnce descarta lo que ya se envió), así que se revisa en cada tick.
  await notifyUpcomingCharges(todayISO()).catch((err) => log("recordatorios", err));
  await notifyBudgetOverruns(todayISO()).catch((err) => log("presupuestos", err));

  // Sincronización del banco: solo cada SYNC_EVERY_MINUTES, para no golpear
  // la API del proveedor en cada tick.
  const lastSync = Number(getSetting("scheduler_last_sync_at") ?? 0);
  if (now.getTime() - lastSync >= SYNC_EVERY_MINUTES * 60_000) {
    setSetting("scheduler_last_sync_at", String(now.getTime()));
    try {
      const result = await syncAllAccounts();
      if (result.errors.length > 0) {
        // No es un fallo del programador sino del banco (consentimiento
        // caducado, mantenimiento...); visible en los logs para quien opere
        // el servidor, sin reintentar hasta el próximo ciclo.
        console.error(`[programador] fallo sincronizando con el banco: ${result.errors.join(" · ")}`);
      }
      if (result.accounts > 0) {
        await notifyNewSpending(result).catch((err) => log("aviso de gasto", err));
      }
    } catch (err) {
      log("sincronización", err);
    }
  }

  // Resumen diario: idempotente por día (notification_log), así que basta con
  // comprobar la hora local en cada tick sin guardar estado propio.
  if (localHour(now) === DIGEST_HOUR) {
    await notifyDailyDigest(todayISO()).catch((err) => log("resumen diario", err));
  }
}

function log(job: string, err: unknown) {
  console.error(`[programador] fallo en ${job}:`, err instanceof Error ? err.message : err);
}

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  console.log(
    `[programador] activo: banco cada ${SYNC_EVERY_MINUTES} min, resumen a las ${DIGEST_HOUR}:00 (${TIMEZONE}).`,
  );

  // Primer tick con un pequeño margen para que la app termine de arrancar.
  const first = setTimeout(() => void tick(), 15_000);
  const interval = setInterval(() => void tick(), TICK_MINUTES * 60_000);

  // No debe impedir que el proceso termine si algún día hace falta.
  first.unref();
  interval.unref();
}
