# 📖 API de Solo Lectura - Finanzas

Esta documentación describe cómo usar los endpoints de **lectura segura** de Finanzas para vincularlos con homelab.

## 🔐 Autenticación

Todos los endpoints requieren un Bearer Token válido:

```bash
curl -H "Authorization: Bearer sk_live_xxxxx" \
  http://localhost:3000/api/readonly/summary
```

## 🔑 Generar un Token API

### Opción 1: Script automático

```bash
npm run generate-key -- homelab
```

### Opción 2: Manual (desde Node.js)

```javascript
import crypto from 'crypto';
import Database from 'better-sqlite3';

const db = new Database('db.sqlite');
const prefix = 'sk_live_';
const random = crypto.randomBytes(24).toString('hex');
const apiKey = prefix + random;
const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

db.prepare(`INSERT INTO api_keys (name, hash) VALUES (?, ?)`).run('homelab', hash);
console.log(apiKey); // Guarda este valor
```

## 📡 Endpoints

### GET /api/readonly/transactions

Obtiene el listado de transacciones.

**Query Parameters:**
- `startDate` - Fecha inicio (ISO 8601)
- `endDate` - Fecha fin (ISO 8601)
- `limit` - Máximo de resultados (default: 100, max: 200)

**Ejemplo:**

```bash
curl -H "Authorization: Bearer sk_live_xxx" \
  "http://localhost:3000/api/readonly/transactions?startDate=2026-01-01&limit=50"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "date": "2026-08-31",
      "category": "Alimentación",
      "description": "Supermercado",
      "amount": 45.50,
      "type": "expense"
    }
  ],
  "timestamp": "2026-08-31T19:00:00Z"
}
```

### GET /api/readonly/budgets

Obtiene los presupuestos del mes actual.

**Query Parameters:**
- `month` - Mes en formato YYYY-MM (default: mes actual)

**Ejemplo:**

```bash
curl -H "Authorization: Bearer sk_live_xxx" \
  "http://localhost:3000/api/readonly/budgets?month=2026-08"
```

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "category": "Alimentación",
      "limit": 300,
      "spent": 250,
      "month": "2026-08",
      "remaining": 50
    }
  ],
  "timestamp": "2026-08-31T19:00:00Z"
}
```

### GET /api/readonly/summary

Obtiene un resumen financiero general.

**Ejemplo:**

```bash
curl -H "Authorization: Bearer sk_live_xxx" \
  "http://localhost:3000/api/readonly/summary"
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalIncome": 2500,
    "totalExpenses": 1250,
    "balance": 1250,
    "budgetUsage": 0.83,
    "lastUpdated": "2026-08-31T19:00:00Z"
  },
  "timestamp": "2026-08-31T19:00:00Z"
}
```

## 🧪 Pruebas

### Sin token (debe fallar 401):

```bash
curl http://localhost:3000/api/readonly/summary
# {"success": false, "error": "Missing or invalid authorization header"}
```

### Con token válido (debe funcionar):

```bash
curl -H "Authorization: Bearer sk_live_xxxx" \
  http://localhost:3000/api/readonly/summary
# {"success": true, "data": {...}}
```

### Con token inválido (debe fallar 401):

```bash
curl -H "Authorization: Bearer sk_live_invalid" \
  http://localhost:3000/api/readonly/summary
# {"success": false, "error": "Invalid or inactive token"}
```

## 📊 Vincular con Homelab

Ver documentación en: `/Vincular/VINCULACION.md`

### Uso en homelab:

```typescript
import { FinanzasClient } from 'vincular';

const client = new FinanzasClient({
  apiUrl: 'http://localhost:3000',
  apiToken: 'sk_live_xxxxx'
});

const summary = await client.getSummary();
console.log('Balance:', summary.balance);
```

## 🔒 Seguridad

- ✅ Solo lectura (GET requests)
- ✅ Bearer Token requerido
- ✅ CORS habilitado
- ✅ Timeouts configurados
- ⏳ Rate limiting: Implementar según necesidad

## ⚡ Performance

- Caché de 1 minuto recomendado en homelab
- Máximo 200 transacciones por request
- Índices en hash de API keys

## 📝 Notas

- Los tokens se almacenan hasheados (SHA256) en la BD
- No se pueden recuperar tokens perdidos, solo generar nuevos
- Desactiva tokens: `UPDATE api_keys SET is_active = 0 WHERE name = 'old_token'`
