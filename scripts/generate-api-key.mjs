#!/usr/bin/env node
import crypto from 'crypto';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'db.sqlite');

console.log('🔑 Generador de API Keys - Finanzas\n');

try {
  const db = new Database(dbPath);

  // Verificar si la tabla existe
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name='api_keys'
  `).get();

  if (!tableExists) {
    console.log('📊 Creando tabla api_keys...');
    db.exec(`
      CREATE TABLE api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME,
        is_active BOOLEAN DEFAULT 1
      );
      CREATE INDEX idx_api_keys_hash ON api_keys(hash);
      CREATE INDEX idx_api_keys_active ON api_keys(is_active);
    `);
    console.log('✅ Tabla creada\n');
  }

  const name = process.argv[2] || 'homelab';

  // Generar token
  const prefix = 'sk_live_';
  const random = crypto.randomBytes(24).toString('hex');
  const apiKey = prefix + random;
  const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

  // Guardar en BD
  db.prepare(`
    INSERT INTO api_keys (name, hash, is_active)
    VALUES (?, ?, 1)
  `).run(name, hash);

  console.log('✅ Token generado exitosamente\n');
  console.log('═'.repeat(60));
  console.log(`\n🔐 Token para: ${name}\n`);
  console.log(apiKey);
  console.log('\n' + '═'.repeat(60));
  console.log('\n⚠️  IMPORTANTE:');
  console.log('  • Guarda este token en un lugar seguro');
  console.log('  • NO lo compartas ni lo publiques');
  console.log('  • Úsalo en tu configuración de homelab\n');
  console.log(`📍 Agregado a la BD como: "${name}"\n`);

  db.close();
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
