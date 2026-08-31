import crypto from 'crypto';
import { getDb } from './db';

export function generateApiKey(): string {
  const prefix = 'sk_live_';
  const random = crypto.randomBytes(24).toString('hex');
  return prefix + random;
}

export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

export async function verifyApiKey(key: string): Promise<boolean> {
  const db = getDb();
  const hash = hashApiKey(key);
  
  const row = db.prepare(`
    SELECT id FROM api_keys 
    WHERE hash = ? AND is_active = 1
    LIMIT 1
  `).get(hash) as any;

  if (row) {
    // Actualizar last_used
    db.prepare('UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?')
      .run(row.id);
    return true;
  }

  return false;
}
