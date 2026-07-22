# Ciclo · Backend (Cloudflare Workers + D1)

API serverless para la app Ciclo: autenticación, CRUD de pagos/ingresos/gastos/metas, estado
agregado, webhook de Stripe y recordatorios por email vía Cron.

```
backend/
├─ src/
│  ├─ index.ts          # app Hono + CORS + Cron (recordatorios)
│  ├─ types.ts          # bindings (Env) y variables de contexto
│  ├─ middleware.ts     # requireAuth (cookie o Bearer)
│  ├─ util.ts           # ids, PBKDF2, tokens HS256, validación
│  └─ routes/
│     ├─ auth.ts        # signup / login / logout / me
│     ├─ data.ts        # subscriptions, incomes, expenses, goals, /state
│     └─ billing.ts     # checkout + webhook de Stripe
├─ migrations/
│  ├─ 0001_init.sql     # esquema
│  └─ 9999_seed_dev.sql # datos de ejemplo (dev)
├─ web/ciclo-api.js     # cliente de API para el navegador
├─ wrangler.toml
└─ package.json
```

## Puesta en marcha (local)

```bash
cd backend
npm install
npx wrangler login                 # una vez

# 1) crea la base de datos y copia el database_id que devuelve a wrangler.toml
npm run db:create

# 2) secretos de desarrollo
cp .dev.vars.example .dev.vars     # edita AUTH_SECRET (obligatorio)

# 3) aplica migraciones en local y (opcional) siembra datos
npm run db:migrate
wrangler d1 execute ciclo-db --local --file=./migrations/9999_seed_dev.sql

# 4) arranca
npm run dev                        # http://localhost:8787
```

Prueba rápida:

```bash
curl -s localhost:8787/api/health
curl -s -X POST localhost:8787/api/auth/signup -H 'Content-Type: application/json' \
  -d '{"name":"Aleix","email":"a@b.com","password":"password123","currency":"EUR"}' -c cookies.txt
curl -s localhost:8787/api/state -b cookies.txt
```

## Despliegue (producción)

```bash
npm run db:migrate:remote
wrangler secret put AUTH_SECRET
wrangler secret put STRIPE_SECRET_KEY        # opcional
wrangler secret put STRIPE_WEBHOOK_SECRET    # opcional
wrangler secret put RESEND_API_KEY           # opcional
npm run deploy
```

Ajusta `APP_ORIGIN` en `wrangler.toml` al dominio donde sirves la app (para CORS y cookies).

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/signup` | Alta `{name,email,password,country,currency,locale}` |
| POST | `/api/auth/login` | Login `{email,password}` |
| POST | `/api/auth/logout` | Cierra sesión |
| GET/PATCH | `/api/auth/me` | Perfil y preferencias |
| GET | `/api/state` | Estado completo (subs, ingresos, gastos, ahorro) |
| POST/PATCH/DELETE | `/api/subscriptions[/:id]` | Pagos recurrentes |
| POST/PATCH/DELETE | `/api/incomes[/:id]` | Ingresos |
| POST/PATCH/DELETE | `/api/expenses[/:id]` | Gastos puntuales |
| POST/DELETE | `/api/goals[/:id]` | Metas de ahorro |
| POST | `/api/goals/:id/contributions` | Aportar a una meta |
| POST | `/api/billing/checkout` | Sesión de pago Stripe |
| POST | `/api/billing/webhook` | Webhook de Stripe |

Todas las rutas de datos exigen sesión y **filtran por `user_id`** (aislamiento por usuario).

## Cómo cablear la app Ciclo a esta API

El `ciclo.html` actual guarda todo en `localStorage` de forma síncrona. El enfoque
**local-first** (recomendado) mantiene esa velocidad y sincroniza en segundo plano:

1. Incluye el cliente:
   ```html
   <script src="/ciclo-api.js"></script>
   <script>const api = CicloAPI("https://ciclo-api.TU-SUBDOMINIO.workers.dev");</script>
   ```
2. **Al arrancar**, tras el login real, hidrata `localStorage` desde el servidor y re-renderiza:
   ```js
   const remote = await api.getState();
   localStorage.setItem('controlPagos.v1', JSON.stringify({
     subs: remote.subs, ingresos: remote.ingresos, gastos: remote.gastos,
     notified: {}, avisosOn: false
   }));
   localStorage.setItem('ciclo.ahorro.v1', JSON.stringify(remote.ahorro));
   renderAll();  // y en el módulo de ahorro, render();
   ```
3. **En cada mutación**, además de `save()` local, replica al servidor. Puntos exactos en `ciclo.html`:
   - `frm` submit (alta/edición de pago) → `api.createSub(data)` / `api.updateSub(id,data)`
   - acción `del`/`pause` en la tabla → `api.deleteSub(id)` / `api.updateSub(id,{pausado})`
   - `frmGasto` / `frmIngreso` submit → `api.createExpense` / `api.createIncome`
   - módulo de ahorro: `ngSave` → `api.createGoal`; `addc` → `api.addContribution`; `del` → `api.deleteGoal`
4. Sustituye la **puerta de acceso** actual (que solo guarda en `localStorage`) por llamadas reales:
   - `authForm` submit en modo login → `await api.login({email,password})`
   - en modo signup → `await api.signup({...})`
   - `btnLogout` → `await api.logout()`

Para una primera versión más simple puedes ir 100 % online (sin `localStorage`): cargar con
`getState()` y hacer que cada acción espere a la API. El local-first se nota mejor en móvil.

## Seguridad / cumplimiento

- Contraseñas con PBKDF2-SHA256 (100k iteraciones) + salt por usuario.
- Sesión en cookie `httpOnly`, `SameSite=Lax`, `Secure` en https; token HS256 firmado.
- Toda consulta de datos va acotada por `user_id`.
- GDPR: borrado en cascada (`ON DELETE CASCADE`) facilita el derecho al olvido; D1 cifra en reposo.
- Nunca se guardan datos de tarjeta (los gestiona Stripe) ni credenciales bancarias
  (las gestionaría el agregador PSD2 en la fase de conexión bancaria).
- Endurecimiento pendiente para producción: rate-limiting (KV), verificación de email y
  rotación/refresh de tokens.
