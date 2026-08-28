# Finanzas

Gestor de finanzas personales autoalojado: lee los movimientos de tu banco por
PSD2, detecta tus nóminas y calcula tu salario real, clasifica los gastos en
fijos y variables, lleva el calendario de suscripciones —sincronizable con el
calendario del móvil— y te avisa por notificación cada vez que gastas.

Todo se guarda en un SQLite local. Los únicos datos que salen de tu equipo son
las llamadas al proveedor bancario y al servicio de push de tu navegador.

## Qué hace

| | |
|---|---|
| **Banco** | Conexión de solo lectura vía PSD2 (GoCardless Bank Account Data, gratis, cubre los bancos españoles). Importa movimientos y saldos. |
| **Salario** | Detecta las nóminas entre tus ingresos, calcula la nómina habitual, el neto anual real de los últimos 12 meses, las pagas extra y el presupuesto mensual. Opcionalmente estima el bruto a partir de tu retención. |
| **Gastos** | Categorización automática por reglas (editables), separación fijos / variables / ahorro, presupuesto por categoría con aviso al superarlo, y alta manual para el efectivo. |
| **Suscripciones y fijos** | Alta de recurrentes con periodicidad semanal, mensual, trimestral o anual, coste mensual normalizado y coste anual total. |
| **Calendario** | Vista mensual en la app + feed `.ics` con token para suscribirse desde el iPhone, Google Calendar o Android. Incluye alarma configurable por suscripción. |
| **Notificaciones** | Web push: aviso del gasto al importarlo, resumen diario, recordatorio antes de cada cobro y alerta de presupuesto superado. |

## Puesta en marcha

```bash
npm install
npm run setup             # crea .env, contraseña y claves de notificaciones
npm run build
npm start                 # http://localhost:3000
```

Para desarrollo: `npm run dev`.

**En Windows**: doble clic en `instalar.cmd` y luego en `iniciar.cmd`.
La guía paso a paso, incluido cómo usarlo desde el móvil, está en
[`docs/instalacion.md`](docs/instalacion.md).

Tus datos viven en un único fichero SQLite (`data/finanzas.db`). Copias de
seguridad, exportación a Excel y restauración, en
[`docs/base-de-datos.md`](docs/base-de-datos.md):

```bash
npm run db:info      # qué hay guardado
npm run db:backup    # copia (funciona con la app abierta)
npm run db:export    # movimientos a CSV para Excel
```

Sin configurar nada puedes entrar y pulsar **Ajustes → Cargar datos de ejemplo**:
genera 14 meses de nóminas, gastos fijos y suscripciones ficticios para ver la
app funcionando.

### Conectar el banco

1. Crea una cuenta gratuita en [bankaccountdata.gocardless.com](https://bankaccountdata.gocardless.com).
2. En *Developers → User secrets* genera un par **Secret ID / Secret Key**.
3. Ponlos en `.env` como `GOCARDLESS_SECRET_ID` y `GOCARDLESS_SECRET_KEY`, y reinicia.
4. **Ajustes → Conectar banco**, busca el tuyo y autoriza en su web.

El consentimiento PSD2 caduca a los 90–180 días según el banco; cuando pase,
vuelve a conectar desde la misma pantalla. El histórico ya importado se conserva.

### Vincular el calendario del móvil

**Calendario → Suscribirse**, o copia la URL `.ics` y añádela como *suscripción
de calendario*:

- **iPhone**: Ajustes → Calendario → Cuentas → Añadir cuenta → Otra → Añadir suscripción.
- **Google Calendar**: Otros calendarios → + → Desde URL (llega sola a Android).

La URL lleva un token secreto; puedes regenerarlo desde la misma pantalla. Para
que el móvil la alcance, la app tiene que ser accesible desde fuera de tu red
(Tailscale, Cloudflare Tunnel o un VPS).

### Notificaciones

**Ajustes → Activar en este dispositivo**. En iPhone hay que añadir antes la app
a la pantalla de inicio (*Compartir → Añadir a inicio*) y servirla por HTTPS;
es un requisito de iOS, no de la app.

## Automatización

`/api/cron` es el único punto de entrada para cualquier programador de tareas.
Protégelo con `CRON_SECRET` y pásalo por cabecera `x-cron-secret` o `?secret=`.

| Job | Qué hace |
|---|---|
| `?job=sync` | Importa movimientos nuevos y notifica el gasto |
| `?job=reminders` | Avisos previos a cada cobro + presupuestos superados |
| `?job=digest` | Resumen del día |
| *(sin `job`)* | Todo lo anterior |

Todas las notificaciones son idempotentes: repetir una llamada no duplica avisos.

Con cron del sistema:

```cron
0 */3 * * *  curl -fsS -H "x-cron-secret: $SECRETO" https://finanzas.tudominio/api/cron?job=sync
0 21 * * *   curl -fsS -H "x-cron-secret: $SECRETO" https://finanzas.tudominio/api/cron?job=digest
```

Con **n8n**: importa `n8n/finanzas-automatizacion.json` y define las variables de
entorno `FINANZAS_URL` y `FINANZAS_CRON_SECRET`. El flujo sincroniza cada 3 horas,
lanza los avisos y deja un nodo *Set* preparado para reenviar el gasto a Telegram,
correo o el canal que prefieras.

## Configuración

Todo en `.env` (ver `.env.example`):

| Variable | Para qué |
|---|---|
| `APP_PASSWORD` | Contraseña de acceso. Obligatoria si expones la app fuera de tu red. |
| `AUTH_SALT` | Cambiarla invalida todas las sesiones abiertas. |
| `APP_URL` | URL pública. La usan el callback del banco y el feed de calendario. |
| `GOCARDLESS_SECRET_ID` / `_KEY` | Credenciales del proveedor PSD2. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web push (`npm run vapid`). |
| `CRON_SECRET` | Protege `/api/cron`. |
| `DATABASE_PATH` | Ruta del SQLite (por defecto `data/finanzas.db`). |

## Cómo se calcula el salario

Se marca como nómina todo ingreso cuya descripción lo indique (`nómina`,
`salario`, `payroll`…) **y** los ingresos recurrentes del mismo pagador con
importe estable: al menos 3 pagos en 3 meses distintos, por encima del umbral
configurable, con la mayoría dentro del ±35 % de la mediana.

A partir de ahí:

- **Nómina habitual** = mediana de los importes (robusta frente a pagas extra).
- **Neto anual** = suma real de los últimos 12 meses cuando hay historial
  suficiente; si no, mediana × pagas al año estimadas.
- **Presupuesto mensual** = neto anual ÷ 12, para que las pagas extra no
  distorsionen el mes a mes.
- **Bruto anual** = neto ÷ (1 − retención), solo si declaras tu retención.

Si algo se clasifica mal, en **Movimientos** puedes marcar o desmarcar cualquier
ingreso como nómina y el cálculo se rehace.

## Estructura

```
src/lib/          dominio: db, banco (PSD2), sync, nóminas, recurrencias, ICS, push
src/app/          páginas (resumen, salario, movimientos, recurrentes, calendario, ajustes)
src/app/api/      endpoints REST + feed de calendario + /api/cron
src/components/   UI
n8n/              workflow listo para importar
```

## Aviso

Herramienta personal, no un asesor financiero. La conexión bancaria es de solo
lectura: no puede mover dinero. Aun así, protege la app con `APP_PASSWORD` y
HTTPS si la expones a internet.
