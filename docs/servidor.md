# Correr la app en un servidor 24/7

Vale para Proxmox, un VPS Linux, o cualquier máquina Linux que dejes siempre
encendida. Dos caminos: **Docker** (recomendado, aísla la app y las
dependencias) o **systemd sin Docker** (más directo si no usas contenedores).
El resultado es el mismo: un proceso que arranca solo, se reinicia si falla, y
que ejecuta él mismo sus tareas —sincronizar el banco, avisar de cargos,
mandar el resumen diario— sin nada más que montar alrededor.

## Paso 0 — En Proxmox: crea el contenedor

Proxmox no corre la app directamente: hace falta una VM o un **LXC** dentro.
Para una sola app Node, un LXC es lo más ligero (arranca en segundos, apenas
consume) y evita complicarte con Docker anidado.

1. **Datacenter → (tu nodo) → Crear CT.**
2. Plantilla: **Debian 12** (o Ubuntu 22.04/24.04). Descárgala primero desde
   *Almacenamiento local → Plantillas CT* si no la tienes.
3. Recursos de sobra para esto: 1 vCPU, 1 GB de RAM, 8 GB de disco.
4. Red: IP estática o una reserva DHCP en tu router, para que la dirección no
   cambie. Facilita todo lo de después (proxy, Tailscale).
5. **Sin marcar** "Unprivileged container" solo si vas a usar Docker dentro y
   tu versión de Proxmox lo requiere; si vas por systemd sin Docker, déjalo
   sin marcar (unprivileged) sin problema.
6. Arranca el contenedor y entra por consola (**>_ Consola** en la interfaz).

Dentro del LXC, instala Node (si vas por systemd) o Docker (si vas por
contenedores):

```bash
apt update && apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

o, para Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

> Si prefieres Docker y tu LXC no lo deja correr contenedores dentro
> (necesita *nesting*), actívalo: en Proxmox, para el CT →
> **Opciones → Características → nesting=1, keyctl=1**, y reinícialo.
> Si te da problemas, la vía systemd de más abajo funciona igual de bien sin
> tocar nada de eso.

## Paso 1 — Trae el código

```bash
git clone https://github.com/monsters2433/prueba.git /opt/finanzas
cd /opt/finanzas
npm install
npm run setup
```

`setup` crea el `.env`, la contraseña de acceso y las claves de notificaciones.
Añade también `GOCARDLESS_SECRET_ID`/`_KEY` si ya los tienes (ver el README).

## Paso 2A — Con Docker (recomendado)

```bash
docker compose up -d --build
```

Eso construye la imagen y arranca el contenedor con `restart: unless-stopped`:
si el proceso muere o el servidor se reinicia, vuelve a arrancar solo. Los
datos (`data/` y `copias/`) quedan en la carpeta del proyecto, fuera del
contenedor, así que reconstruir la imagen no los toca.

Comprobar que va bien:

```bash
docker compose logs -f          # ver los logs en directo
docker compose ps               # estado y healthcheck
```

Actualizar a una versión nueva:

```bash
git pull
docker compose up -d --build
```

## Paso 2B — Sin Docker, con systemd

```bash
npm run build
useradd -r -s /usr/sbin/nologin finanzas
chown -R finanzas:finanzas /opt/finanzas
cp deploy/finanzas.service /etc/systemd/system/
```

Antes de activarlo, comprueba dónde quedó instalado `npm`:

```bash
which npm
```

Si no aparece en un `PATH` estándar (`/usr/bin`, `/usr/local/bin`), añade su
carpeta a la línea `Environment=PATH=...` del fichero de servicio.

```bash
systemctl daemon-reload
systemctl enable --now finanzas
systemctl status finanzas       # debe decir "active (running)"
journalctl -u finanzas -f       # logs en directo
```

`Restart=always` hace que systemd reinicie el proceso si se cae, y
`enable` hace que arranque solo cuando se reinicie el LXC.

Actualizar:

```bash
cd /opt/finanzas && git pull && npm install && npm run build
systemctl restart finanzas
```

## Paso 3 — Que el LXC arranque con Proxmox

En la interfaz de Proxmox, para el contenedor: **Opciones → Iniciar al
arrancar → Sí**. Así, si el servidor físico se reinicia (un corte de luz,
una actualización), el LXC vuelve a subir solo, y dentro de él Docker o
systemd levantan la app — no hace falta entrar a mano.

## Paso 4 — Llegar hasta la app desde fuera del LXC

Por defecto la app escucha en el puerto 3000 de **dentro del contenedor**.
Para llegar desde tu red o desde el móvil, igual que se explicó para el PC
con Windows, tienes las mismas tres opciones — aquí lo que cambia es solo
*dónde* se instala cada pieza:

- **Red local**: nada que hacer, ya escucha en `0.0.0.0`; entra con la IP del
  LXC (`http://192.168.x.x:3000`). Sin HTTPS no hay notificaciones ni
  instalación en el móvil.
- **Tailscale** (recomendado): instálalo **dentro del LXC**, no en Proxmox.
  ```bash
  curl -fsSL https://tailscale.com/install.sh | sh
  tailscale up
  tailscale serve --bg 3000
  ```
  Te da una URL HTTPS propia (`https://finanzas.tu-tailnet.ts.net`). Ponla en
  `APP_URL` del `.env` y reinicia la app.
- **Reverse proxy con dominio propio** (si además quieres Google Calendar):
  monta un proxy —[Caddy](https://caddyserver.com) es el más simple, gestiona
  el certificado HTTPS solo— delante del puerto 3000, en el propio LXC o en
  otro dedicado a esto. Con Caddy, un `Caddyfile` de tres líneas basta:
  ```
  finanzas.tudominio.com {
    reverse_proxy localhost:3000
  }
  ```

## Copias de seguridad: una capa más

Ya tienes `npm run db:backup` para copiar la base de datos (ver
`docs/base-de-datos.md`). En un LXC de Proxmox añade una segunda capa gratis:
las copias del propio Proxmox (**vzdump**), que respaldan el contenedor
entero —código, `.env`, base de datos, todo— sin tocar nada dentro de él.

**Datacenter → Copias de seguridad → Añadir**, eliges el CT, una programación
(por ejemplo, diaria de madrugada) y dónde guardarlas —idealmente en otro
disco o en un NAS, no en el mismo almacenamiento que el LXC—. Con esto, si
el propio LXC se corrompe, restauras el contenedor entero en dos clics desde
Proxmox; y si solo se te estropean los datos de la app, tienes la copia más
fina de `npm run db:backup`.

## Ficheros de este repositorio para esto

```
Dockerfile              imagen de producción, sin las dependencias de desarrollo
docker-compose.yml      arranque con reinicio automático y volúmenes persistentes
deploy/finanzas.service unidad systemd para correr sin Docker
```

## Problemas frecuentes

| Síntoma | Causa |
|---|---|
| `docker compose up` falla compilando `better-sqlite3` | Raro con la imagen incluida (ya trae las herramientas de compilación); si pasa, revisa que la arquitectura del LXC (amd64/arm64) coincide con la de la imagen base. |
| El servicio systemd falla con «Command ... is not executable» | La ruta de `npm` no está en el `PATH` del servicio. Añade su carpeta a `Environment=PATH=...` (mira `which npm`). |
| Tras `git pull`, la app no arranca | Falta reconstruir: `npm install && npm run build` (systemd) o `docker compose up -d --build` (Docker). |
| El LXC no arranca solo tras reiniciar Proxmox | «Iniciar al arrancar» no estaba marcado en las opciones del CT. |
| El programador interno no sincroniza nunca | Revisa los logs (`journalctl -u finanzas -f` o `docker compose logs -f`): si el banco falla, sale ahí un aviso claro en vez de fallar en silencio. |
