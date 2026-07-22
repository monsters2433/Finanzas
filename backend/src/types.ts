import type { SessionPayload } from "./util";

export interface Env {
  DB: D1Database;
  // RECEIPTS?: R2Bucket;           // opcional (OCR de tickets)
  AUTH_SECRET: string;
  APP_ORIGIN: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  RESEND_API_KEY?: string;
}

// Variables que la auth deja disponibles en el contexto de Hono
export interface Vars {
  user: SessionPayload;
}

export type AppBindings = { Bindings: Env; Variables: Vars };
