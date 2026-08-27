# Instalación en Windows y en el móvil

## Parte 1 — Windows

### 1. Instala Node.js

Descarga la versión **LTS** de [nodejs.org](https://nodejs.org) y la instalas con
todo por defecto (la opción de añadirlo al PATH ya viene marcada; la casilla de
herramientas adicionales puedes dejarla sin marcar). Hace falta Node 20.9 o
superior.

Alternativa por consola: `winget install OpenJS.NodeJS.LTS`

**Después de instalarlo, cierra la ventana de comandos y abre una nueva.** Una
ventana ya abierta conserva el PATH antiguo, así que seguiría diciendo que no
reconoce `npm` aunque Node esté instalado.

Para comprobar que ha ido bien, en una ventana **nueva**:

```powershell
node --version
npm --version
```

> **Si `npm` da un error de «la ejecución de scripts está deshabilitada»**:
> no es culpa de Node. En PowerShell el comando `npm` es un script `npm.ps1`, y
> Windows bloquea los scripts por defecto (por eso `node --version` sí responde:
> es un `.exe`). Tres opciones:
>
> - Usar `instalar.cmd` con doble clic: es un `.cmd` y esta política no le afecta.
> - Escribir `npm.cmd install` en vez de `npm install`.
> - Permitirlos de una vez, solo para tu usuario y sin ser administrador:
>   ```powershell
>   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
>   ```
>   `RemoteSigned` deja correr los scripts locales —como el de npm, que creó el
>   instalador en tu disco— y sigue bloqueando los descargados sin firmar.

### 2. Descarga el proyecto

Con Git:

```powershell
git clone https://github.com/monsters2433/prueba.git finanzas
cd finanzas
```

Sin Git: en GitHub, botón **Code → Download ZIP**, y lo descomprimes donde
quieras (por ejemplo `C:\finanzas`).

### 3. Instala y configura

Haz doble clic en **`instalar.cmd`**. Instala las dependencias, crea el fichero
de configuración `.env`, genera las claves de notificaciones y compila la app.

Te pedirá una contraseña de acceso; si pulsas Enter te genera una y **la muestra
en pantalla — apúntala**.

Si prefieres la consola, es lo mismo que — **y el orden importa**, `npm install`
siempre primero, porque los otros dos necesitan lo que descarga:

```powershell
npm install
npm run setup
npm run build
```

(Si PowerShell se queja de que los scripts están deshabilitados, mira el aviso
del paso 1: o usas `npm.cmd` en lugar de `npm`, o los habilitas.)

> **Si `npm install` falla compilando `better-sqlite3`**: normalmente se descarga
> ya compilado, pero si tu combinación de Windows y Node no tiene binario listo,
> intentará compilarlo y necesitará las herramientas de C++. Se arregla con:
>
> ```powershell
> winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
> ```
>
> y repitiendo `npm install`.

### 4. Arranca

Doble clic en **`iniciar.cmd`**. Se abre el navegador en
`http://localhost:3000`. La ventana negra que queda abierta es el servidor:
si la cierras, la app se para.

La primera vez, entra en **Ajustes → Cargar datos de ejemplo** para ver cómo
funciona antes de conectar nada.

### 5. Que arranque solo al encender el PC

Pulsa `Win + R`, escribe `shell:startup` y pega ahí un acceso directo a
`iniciar.cmd`. Para que no salga la ventana negra, en las propiedades del acceso
directo pon **Ejecutar: Minimizada**.

### Conectar el banco

1. Cuenta gratuita en [bankaccountdata.gocardless.com](https://bankaccountdata.gocardless.com).
2. En *Developers → User secrets*, genera un par **Secret ID / Secret Key**.
3. Abre el fichero `.env` de la carpeta con el Bloc de notas y rellena:
   ```
   GOCARDLESS_SECRET_ID=lo-que-te-den
   GOCARDLESS_SECRET_KEY=lo-que-te-den
   ```
4. Cierra la ventana del servidor y vuelve a abrir `iniciar.cmd`.
5. **Ajustes → Conectar banco**.

---

## Parte 2 — El móvil

La app no se instala desde ninguna tienda: es una web que el móvil guarda como
si fuera una aplicación (PWA). Pero antes hay que decidir **cómo llega tu móvil
hasta el PC**, y esa decisión condiciona lo demás.

### Elige cómo lo publicas

| | Ver la app | Notificaciones | Calendario iPhone | Calendario Google |
|---|---|---|---|---|
| **A. Solo red local** `http://192.168.x.x:3000` | Sí | **No** | No | No |
| **B. Tailscale** (recomendado) | Sí | Sí | Sí | No |
| **C. Cloudflare Tunnel** (público) | Sí | Sí | Sí | Sí |

El motivo de tantos "no" en la opción A: los navegadores solo permiten
notificaciones y guardar la app en el móvil si la conexión es **HTTPS**, y una
IP local no lo es. La opción A sirve para consultar desde el sofá y poco más.

Y el motivo de que Google Calendar solo funcione en la C: cuando le das una URL
de calendario, quien la descarga son **los servidores de Google**, no tu móvil,
así que la dirección tiene que ser visible desde internet. El iPhone en cambio
se la descarga él mismo, y le vale con Tailscale.

### Opción A — Solo red local (2 minutos)

1. En PowerShell: `ipconfig` y busca tu **Dirección IPv4** (algo como `192.168.1.40`).
2. La primera vez que arranques, Windows preguntará por el cortafuegos: marca
   **Redes privadas** y acepta. Si le diste a cancelar:
   ```powershell
   New-NetFirewallRule -DisplayName "Finanzas" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private
   ```
   (PowerShell **como administrador**.)
3. En el móvil, con la misma wifi: `http://192.168.1.40:3000`.

### Opción B — Tailscale (recomendado)

Te da una dirección HTTPS propia y cifrada, sin abrir puertos en el router y sin
exponer nada a internet. Es gratis para uso personal.

1. Instala [Tailscale](https://tailscale.com/download) en el PC **y** en el móvil,
   e inicia sesión con la misma cuenta en los dos.
2. En el panel de Tailscale (admin console), activa **MagicDNS** y **HTTPS Certificates**.
3. En el PC, con la app ya arrancada, abre PowerShell:
   ```powershell
   tailscale serve --bg 3000
   ```
   Te devuelve una dirección tipo `https://mi-pc.tu-tailnet.ts.net`. Si tu versión
   de Tailscale no acepta esa forma abreviada, usa la larga:
   `tailscale serve https / http://localhost:3000`.
4. Pon esa dirección en el `.env` y reinicia la app:
   ```
   APP_URL=https://mi-pc.tu-tailnet.ts.net
   ```

Desde el móvil ya puedes abrir esa dirección estés donde estés, siempre que
Tailscale esté activo en los dos.

### Opción C — Cloudflare Tunnel (si quieres Google Calendar)

Publica la app en internet con HTTPS, sin abrir puertos.

```powershell
winget install Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

Te da una dirección `https://algo.trycloudflare.com` (cambia en cada arranque;
para una fija hay que crear un túnel con nombre y un dominio propio). Ponla en
`APP_URL` y reinicia.

**Importante**: aquí tu app queda accesible desde internet. Asegúrate de tener
`APP_PASSWORD` puesta en el `.env` — `instalar.cmd` ya lo hace.

### Guardar la app en el móvil

Con la opción B o C, abre la dirección en el móvil:

- **iPhone (Safari)**: botón Compartir → **Añadir a pantalla de inicio**. Este
  paso es **obligatorio** antes de activar las notificaciones; iOS no las permite
  desde el navegador.
- **Android (Chrome)**: menú ⋮ → **Instalar aplicación** / Añadir a pantalla de inicio.

Luego, dentro de la app: **Ajustes → Activar en este dispositivo**, aceptas el
permiso, y con **Probar** compruebas que llega.

### Suscribir el calendario

En la app, **Calendario → Copiar** el enlace, y:

- **iPhone**: Ajustes → Aplicaciones → Calendario → Cuentas (en iOS 17 y
  anteriores: Ajustes → Calendario → Cuentas) → Añadir cuenta → Otra →
  **Añadir suscripción de calendario**, y pegas el enlace.
  Si usas Tailscale, cuando pregunte por sincronizar con iCloud di que **no**:
  con iCloud quien descarga el calendario es Apple, y Apple no ve tu Tailscale.
- **Android**: se hace desde [calendar.google.com](https://calendar.google.com)
  en un navegador → Otros calendarios → **+** → Desde URL. Y como lo descarga
  Google, esto **solo funciona con la opción C**.

El enlace lleva un token secreto: quien lo tenga puede ver tus cobros. Si se te
escapa, en esa misma pantalla puedes **regenerarlo**.

### Sincronizar y avisar solo

Para que los movimientos entren sin que abras nada, programa una tarea. En
PowerShell **como administrador**, cambiando el secreto por el `CRON_SECRET` de
tu `.env`:

```powershell
$secreto = "el-valor-de-CRON_SECRET"
$accion  = New-ScheduledTaskAction -Execute "curl.exe" `
  -Argument "-fsS -H `"x-cron-secret: $secreto`" http://localhost:3000/api/cron?job=sync"
$cuando  = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Hours 3)
Register-ScheduledTask -TaskName "Finanzas - sincronizar" -Action $accion -Trigger $cuando
```

Repite con `job=digest` y un `-Daily -At 21:00` si quieres el resumen de la noche.

---

## Problemas frecuentes

| Síntoma | Causa |
|---|---|
| «No se encuentra Node.js» al abrir `instalar.cmd` | Node no instalado, o falta cerrar y reabrir la ventana tras instalarlo. |
| `"npm" no se reconoce como un comando interno o externo` | Lo mismo: falta Node, o la ventana se abrió antes de instalarlo. Ciérrala y abre otra. |
| `npm : No se puede cargar el archivo ...\npm.ps1 porque la ejecución de scripts está deshabilitada` | Política de PowerShell. Usa `instalar.cmd`, o `npm.cmd install`, o habilítalos con `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`. |
| `node --version` responde pero `npm --version` da otro error | Instalación incompleta de Node: vuelve a lanzar el instalador y elige **Reparar**. |
| `npm error code ENOENT ... open 'C:\WINDOWS\system32\package.json'` | Estás ejecutando npm fuera de la carpeta del proyecto. Haz `cd C:\Users\TuUsuario\finanzas` primero. |
| `npm run build` falla con `Cannot find module` | Falta `npm install`. |
| El móvil no abre la dirección `192.168.x.x` | Cortafuegos de Windows, o el móvil está en otra wifi (o en datos). |
| No aparece «Activar en este dispositivo» | Estás en HTTP. Las notificaciones exigen HTTPS: opción B o C. |
| En iPhone no salen las notificaciones | Falta añadir la app a la pantalla de inicio y activarlas **desde ahí**. |
| El calendario no se actualiza | Los móviles refrescan las suscripciones cada varias horas; no es inmediato. |
| Google Calendar no acepta el enlace | Estás en la opción A o B. Google necesita una dirección pública (opción C). |
| El banco deja de sincronizar a los meses | El consentimiento PSD2 caduca (90–180 días). Se renueva en Ajustes → Conectar banco; el histórico no se pierde. |
