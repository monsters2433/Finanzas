/**
 * Primera puesta en marcha: crea el .env, genera las claves de notificaciones
 * y fija la contraseña de acceso. Es idempotente: no pisa lo que ya has puesto.
 *
 *   npm run setup
 */
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import webpush from "web-push";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

function readEnv() {
  if (existsSync(envPath)) return readFileSync(envPath, "utf8");
  if (existsSync(examplePath)) return readFileSync(examplePath, "utf8");
  return "";
}

/** Sets KEY=value, respecting the file's existing layout and comments. */
function setValue(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  return `${content.replace(/\n*$/, "")}\n${line}\n`;
}

function getValue(content, key) {
  const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : "";
}

const argv = new Set(process.argv.slice(2));
const interactive = process.stdin.isTTY && !argv.has("--yes");

let env = readEnv();
const changes = [];

// 1. Contraseña de acceso.
if (!getValue(env, "APP_PASSWORD")) {
  let password = "";
  if (interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = (
      await rl.question("Contraseña para entrar en la app (Enter = generar una): ")
    ).trim();
    rl.close();
  }
  if (!password) {
    password = randomBytes(9).toString("base64url");
    changes.push(`Contraseña generada: ${password}`);
  } else {
    changes.push("Contraseña guardada.");
  }
  env = setValue(env, "APP_PASSWORD", password);
}

// 2. Claves de notificaciones push.
if (!getValue(env, "VAPID_PUBLIC_KEY") || !getValue(env, "VAPID_PRIVATE_KEY")) {
  const keys = webpush.generateVAPIDKeys();
  env = setValue(env, "VAPID_PUBLIC_KEY", keys.publicKey);
  env = setValue(env, "VAPID_PRIVATE_KEY", keys.privateKey);
  if (!getValue(env, "VAPID_SUBJECT")) {
    env = setValue(env, "VAPID_SUBJECT", "mailto:finanzas@localhost");
  }
  changes.push("Claves de notificaciones generadas.");
}

// 3. Secreto del cron y salt de sesión.
if (!getValue(env, "CRON_SECRET")) {
  env = setValue(env, "CRON_SECRET", randomBytes(16).toString("base64url"));
  changes.push("Secreto para las tareas programadas generado.");
}
if (!getValue(env, "AUTH_SALT")) {
  env = setValue(env, "AUTH_SALT", randomBytes(8).toString("base64url"));
}
if (!getValue(env, "APP_URL")) {
  env = setValue(env, "APP_URL", "http://localhost:3000");
}

writeFileSync(envPath, env, { mode: 0o600 });

console.log(`\n.env listo en ${envPath}`);
for (const change of changes) console.log(`  · ${change}`);
if (changes.length === 0) console.log("  · Ya estaba todo configurado, no se ha tocado nada.");

console.log(`
Siguiente paso:
  npm run build
  npm start        ->  http://localhost:3000

Para conectar el banco necesitas una cuenta gratuita en
bankaccountdata.gocardless.com y añadir a .env:
  GOCARDLESS_SECRET_ID=...
  GOCARDLESS_SECRET_KEY=...
Mientras tanto, en Ajustes puedes cargar datos de ejemplo.
`);
