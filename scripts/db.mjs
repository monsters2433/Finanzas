/**
 * Gestión de la base de datos: copias de seguridad, restauración, exportación
 * a CSV y estado. Ver `node scripts/db.mjs ayuda`.
 */
import Database from "better-sqlite3";
import { createInterface } from "node:readline/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbPath = process.env.DATABASE_PATH ?? path.join(root, "data", "finanzas.db");
const backupDir = process.env.BACKUP_DIR ?? path.join(root, "copias");

const args = process.argv.slice(2);
const command = args[0] ?? "ayuda";
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.slice(1).filter((a) => !a.startsWith("--"));

function flagValue(name, fallback) {
  const found = args.find((a) => a.startsWith(`${name}=`));
  return found ? found.slice(name.length + 1) : fallback;
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_${p(
    date.getHours(),
  )}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function requireDb() {
  if (!fs.existsSync(dbPath)) {
    console.error(`No hay base de datos en ${dbPath}.`);
    console.error("Se crea sola la primera vez que arrancas la app.");
    process.exit(1);
  }
  return new Database(dbPath, { readonly: false });
}

function count(db, table) {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  } catch {
    return 0;
  }
}

// ── info ──────────────────────────────────────────────────────────────────────
function info() {
  const db = requireDb();
  const size = fs.statSync(dbPath).size;
  const wal = fs.existsSync(`${dbPath}-wal`) ? fs.statSync(`${dbPath}-wal`).size : 0;

  const range = db
    .prepare("SELECT MIN(booked_date) AS desde, MAX(booked_date) AS hasta FROM transactions")
    .get();
  const lastSync = db
    .prepare("SELECT MAX(last_synced_at) AS t FROM accounts")
    .get().t;
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;

  console.log(`
Base de datos
  Fichero        ${dbPath}
  Tamaño         ${human(size)}${wal ? ` (+ ${human(wal)} pendientes de volcar)` : ""}
  Integridad     ${integrity === "ok" ? "correcta" : `PROBLEMA: ${integrity}`}

Contenido
  Movimientos    ${count(db, "transactions")}${
    range.desde ? `  (de ${range.desde} a ${range.hasta})` : ""
  }
  Nóminas        ${db.prepare("SELECT COUNT(*) AS n FROM transactions WHERE is_payroll = 1").get().n}
  Cuentas        ${count(db, "accounts")}
  Recurrentes    ${count(db, "recurring")}
  Categorías     ${count(db, "categories")}
  Reglas         ${count(db, "rules")}
  Dispositivos   ${count(db, "push_subscriptions")}
  Última sinc.   ${lastSync ?? "nunca"}
`);

  if (fs.existsSync(backupDir)) {
    const copies = listBackups();
    console.log(`Copias de seguridad (${backupDir})`);
    if (copies.length === 0) console.log("  ninguna todavía — ejecuta: npm run db:backup\n");
    for (const c of copies.slice(0, 5)) {
      console.log(`  ${c.name}  ${human(c.size)}`);
    }
    if (copies.length > 5) console.log(`  … y ${copies.length - 5} más`);
    console.log();
  } else {
    console.log("Todavía no hay ninguna copia de seguridad. Ejecuta: npm run db:backup\n");
  }
  db.close();
}

const ROUTINE_BACKUP = /^finanzas_.*\.db$/;

function listBackups({ routineOnly = false } = {}) {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".db") && (!routineOnly || ROUTINE_BACKUP.test(f)))
    .map((name) => ({ name, size: fs.statSync(path.join(backupDir, name)).size }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

// ── backup ────────────────────────────────────────────────────────────────────
function backup() {
  const db = requireDb();
  fs.mkdirSync(backupDir, { recursive: true });

  const target = path.join(backupDir, `finanzas_${stamp()}.db`);
  if (fs.existsSync(target)) fs.rmSync(target);

  // VACUUM INTO escribe una copia consistente y compactada aunque la app
  // esté funcionando; copiar el fichero a mano puede dar una copia rota.
  db.prepare("VACUUM INTO ?").run(target);
  db.close();

  console.log(`Copia creada: ${target}  (${human(fs.statSync(target).size)})`);

  const keep = Number(flagValue("--conservar", 14));
  const copies = listBackups({ routineOnly: true });
  if (Number.isFinite(keep) && keep > 0 && copies.length > keep) {
    for (const old of copies.slice(keep)) {
      fs.rmSync(path.join(backupDir, old.name));
      console.log(`  eliminada la copia antigua ${old.name}`);
    }
  }
}

// ── restore ───────────────────────────────────────────────────────────────────
async function restore() {
  const source = positional[0];
  if (!source) {
    console.error("Indica el fichero: npm run db:restore -- copias\\finanzas_2026-08-27_2130.db");
    const copies = listBackups();
    if (copies.length) {
      console.error("\nCopias disponibles:");
      for (const c of copies.slice(0, 10)) console.error(`  ${path.join(backupDir, c.name)}`);
    }
    process.exit(1);
  }
  const sourcePath = path.resolve(source);
  if (!fs.existsSync(sourcePath)) {
    console.error(`No existe ${sourcePath}`);
    process.exit(1);
  }

  // Comprobar que el fichero es realmente una base de datos de esta app.
  let check;
  try {
    check = new Database(sourcePath, { readonly: true });
    const tables = check
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name);
    for (const required of ["transactions", "accounts", "recurring", "categories"]) {
      if (!tables.includes(required)) {
        throw new Error(`le falta la tabla ${required}`);
      }
    }
    const n = check.prepare("SELECT COUNT(*) AS n FROM transactions").get().n;
    console.log(`Copia válida: ${n} movimientos.`);
    check.close();
  } catch (err) {
    console.error(`Ese fichero no sirve como copia de esta app: ${err.message}`);
    process.exit(1);
  }

  if (!flags.has("--si")) {
    if (!process.stdin.isTTY) {
      console.error("Añade --si para confirmar (se ejecuta sin poder preguntarte).");
      process.exit(1);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      "\nEsto reemplaza la base de datos actual. Para en la app antes de seguir.\n" +
        "Se guardará una copia de lo actual. ¿Continuar? (s/N) ",
    );
    rl.close();
    if (!/^s(i|í)?$/i.test(answer.trim())) {
      console.log("Cancelado.");
      return;
    }
  }

  // Salvaguarda de lo que hay ahora, por si la restauración era un error.
  if (fs.existsSync(dbPath)) {
    fs.mkdirSync(backupDir, { recursive: true });
    const safety = path.join(backupDir, `antes-de-restaurar_${stamp()}.db`);
    fs.copyFileSync(dbPath, safety);
    console.log(`Guardada la base actual en ${safety}`);
  }

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  try {
    fs.copyFileSync(sourcePath, dbPath);
  } catch (err) {
    // En Windows el fichero queda bloqueado mientras la app lo tiene abierto.
    if (["EBUSY", "EPERM", "EACCES"].includes(err.code)) {
      console.error(
        `\nNo se puede escribir sobre ${dbPath}: el fichero está en uso.\n` +
          "Cierra la ventana donde corre la app (iniciar.cmd) y vuelve a intentarlo.\n" +
          "Tus datos actuales siguen a salvo en la copia que se acaba de guardar.",
      );
      process.exit(1);
    }
    throw err;
  }
  // Los ficheros -wal y -shm pertenecen a la base antigua: sobran y estorban.
  for (const suffix of ["-wal", "-shm"]) {
    if (fs.existsSync(`${dbPath}${suffix}`)) fs.rmSync(`${dbPath}${suffix}`);
  }

  console.log(`Restaurada en ${dbPath}. Ya puedes arrancar la app.`);
}

// ── export ────────────────────────────────────────────────────────────────────
function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(file, rows) {
  if (rows.length === 0) {
    // Sin datos, un fichero vacío confunde más que ayuda.
    fs.writeFileSync(file, "﻿(sin datos)\n", "utf8");
    return 0;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(";")];
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(";"));
  // BOM + punto y coma: es lo que Excel en español abre sin preguntar nada.
  fs.writeFileSync(file, `﻿${lines.join("\r\n")}\r\n`, "utf8");
  return rows.length;
}

function exportCsv() {
  const db = requireDb();
  const dir = path.resolve(flagValue("--dir", path.join(root, "exportado")));
  fs.mkdirSync(dir, { recursive: true });

  const movimientos = db
    .prepare(
      `SELECT t.booked_date AS fecha,
              t.merchant    AS comercio,
              t.description AS concepto,
              COALESCE(c.name, 'Sin categoría') AS categoria,
              COALESCE(c.kind, '')              AS tipo_categoria,
              REPLACE(printf('%.2f', t.amount_cents / 100.0), '.', ',') AS importe,
              t.currency AS moneda,
              CASE WHEN t.is_payroll = 1 THEN 'sí' ELSE '' END AS es_nomina,
              CASE WHEN t.excluded  = 1 THEN 'sí' ELSE '' END AS excluido,
              t.source AS origen,
              COALESCE(a.name, '') AS cuenta
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
         LEFT JOIN accounts   a ON a.id = t.account_id
        ORDER BY t.booked_date DESC, t.id DESC`,
    )
    .all();

  const recurrentes = db
    .prepare(
      `SELECT r.name AS nombre,
              r.kind AS tipo,
              REPLACE(printf('%.2f', r.amount_cents / 100.0), '.', ',') AS importe,
              r.frequency AS periodicidad,
              r.interval_n AS cada,
              r.first_date AS primer_cobro,
              COALESCE(r.end_date, '') AS fin,
              r.reminder_days AS aviso_dias,
              CASE WHEN r.active = 1 THEN 'sí' ELSE 'no' END AS activo,
              COALESCE(c.name, '') AS categoria
         FROM recurring r LEFT JOIN categories c ON c.id = r.category_id
        ORDER BY r.kind, r.name`,
    )
    .all();

  const resumen = db
    .prepare(
      `SELECT substr(t.booked_date, 1, 7) AS mes,
              COALESCE(c.name, 'Sin categoría') AS categoria,
              REPLACE(printf('%.2f', -SUM(t.amount_cents) / 100.0), '.', ',') AS gastado,
              COUNT(*) AS movimientos
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.excluded = 0 AND t.amount_cents < 0
        GROUP BY mes, t.category_id
        ORDER BY mes DESC, SUM(t.amount_cents)`,
    )
    .all();

  const files = [
    ["movimientos.csv", movimientos],
    ["recurrentes.csv", recurrentes],
    ["resumen-mensual.csv", resumen],
  ];
  console.log(`\nExportado a ${dir}`);
  for (const [name, rows] of files) {
    const n = writeCsv(path.join(dir, name), rows);
    console.log(`  ${name.padEnd(22)} ${n} filas`);
  }
  console.log("\nSe abren en Excel con doble clic.\n");
  db.close();
}

// ── reset ─────────────────────────────────────────────────────────────────────
async function reset() {
  if (!fs.existsSync(dbPath)) {
    console.log("No hay nada que borrar.");
    return;
  }
  if (!flags.has("--si")) {
    console.error(
      "Esto borra TODOS tus datos. Se hará una copia antes, pero aun así:\n" +
        "  npm run db:reset -- --si",
    );
    process.exit(1);
  }
  backup();
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(`${dbPath}${suffix}`)) fs.rmSync(`${dbPath}${suffix}`);
  }
  console.log("Base de datos borrada. Se creará vacía al arrancar la app.");
}

// ── ayuda ─────────────────────────────────────────────────────────────────────
function help() {
  console.log(`
Gestión de la base de datos

  npm run db:info                  Estado, contenido y copias existentes
  npm run db:backup                Copia de seguridad (funciona con la app abierta)
  npm run db:export                Movimientos y recurrentes a CSV para Excel
  npm run db:restore -- <fichero>  Restaura una copia (para la app antes)
  npm run db:reset -- --si         Borra todo (hace copia antes)

Opciones
  --conservar=N   en backup, cuántas copias mantener (por defecto 14)
  --dir=carpeta   en export, dónde dejar los CSV
  --si            confirma sin preguntar

La base de datos está en:
  ${dbPath}
`);
}

const commands = { info: info, backup, restore, export: exportCsv, reset, ayuda: help, help };
const run = commands[command];
if (!run) {
  console.error(`Comando desconocido: ${command}`);
  help();
  process.exit(1);
}
await run();
