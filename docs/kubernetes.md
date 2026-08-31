# Correr en Kubernetes

Sí, pero con una condición que no es negociable: **una sola réplica**.

## Por qué no escala a varias réplicas

Dos decisiones de esta app chocan de frente con el escalado horizontal:

1. **SQLite en modo WAL.** Es una base de datos de un único escritor. Sobre
   un volumen `ReadWriteOnce` no hay problema porque solo un pod la toca; pero
   si se te ocurriera repartir la app entre varios pods sobre un volumen
   `ReadWriteMany` (típicamente NFS), estarías escribiendo el mismo fichero
   desde varios procesos a la vez sobre un sistema de ficheros en red — que es
   precisa­mente el escenario que la propia documentación de SQLite desaconseja
   por no poder fiarse de sus bloqueos ahí. No es un límite arbitrario de esta
   app: es el límite de la base de datos que usa.
2. **El programador vive dentro del proceso** (`src/lib/scheduler.ts`, arranca
   solo vía `src/instrumentation.ts`). No tiene bloqueo distribuido. Con dos
   réplicas tendrías dos programadores sincronizando el mismo banco a la vez,
   duplicando llamadas a la API del proveedor y compitiendo por escribir.

Ninguno de los dos es un defecto a corregir para este caso de uso: es una app
de finanzas **personales**, para un solo usuario. No hay ninguna razón real
para querer más de una réplica sirviendo tráfico — lo que se busca al ponerla
en Kubernetes es que se **recupere sola** si falla, no que **reparta carga**
entre varios pods. Con una réplica, Kubernetes ya te da eso: si el proceso
muere, el kubelet lo reinicia; si el nodo entero se cae, el scheduler la
vuelve a colocar en otro nodo con el mismo volumen.

Si algún día quisieras escalar de verdad (por ejemplo, para dar servicio a
varios usuarios en vez de a ti), el cambio de fondo sería sustituir SQLite por
una base de datos en red (Postgres) y quitar el programador interno a favor de
un `CronJob` — eso sí sería un rediseño, no un ajuste del manifiesto.

## Los manifiestos

En `k8s/`:

```
namespace.yaml          el espacio de nombres "finanzas"
secret.example.yaml     plantilla — genera el real desde tu .env, no lo escribas a mano
pvc.yaml                dos volúmenes ReadWriteOnce: datos y copias
deployment.yaml         1 réplica, strategy Recreate, sondas, sidecar de copias
service.yaml            ClusterIP interno
ingress.example.yaml    ejemplo para ingress-nginx + cert-manager
```

### Por qué `strategy: Recreate` y no `RollingUpdate`

El volumen de datos es `ReadWriteOnce`: un `RollingUpdate` intentaría arrancar
el pod nuevo *antes* de apagar el viejo, y el pod nuevo se quedaría en
`Pending` esperando un volumen que el viejo todavía tiene montado. `Recreate`
apaga el pod actual por completo antes de crear el siguiente — hay unos
segundos de corte en cada despliegue, que es exactamente lo que ya asumes con
una sola réplica.

### La copia de seguridad va dentro del mismo pod

En vez de un `CronJob` aparte, el `Deployment` lleva un segundo contenedor
(`backup`) que comparte los mismos volúmenes y llama a
`node scripts/db.mjs backup` cada `BACKUP_INTERVAL_HOURS` horas (24 por
defecto). Es deliberado: un `CronJob` en un pod distinto podría programarse en
otro nodo del clúster y no podría montar el mismo volumen `ReadWriteOnce` que
ya tiene el pod principal. Viviendo en el mismo pod, ese problema no existe.

## Puesta en marcha

### 1. Construye y publica la imagen

Necesitas un registro que tu clúster pueda alcanzar (Docker Hub, GHCR, uno
propio si tu Proxmox tiene Harbor, etc.):

```bash
docker build -t registro.tudominio.com/finanzas:latest .
docker push registro.tudominio.com/finanzas:latest
```

Actualiza la línea `image:` en `k8s/deployment.yaml` (aparece dos veces: en el
contenedor principal y en el sidecar de copias) con tu registro real.

### 2. Genera el secreto desde tu `.env`

```bash
kubectl create namespace finanzas
kubectl create secret generic finanzas-env \
  --from-env-file=.env \
  --namespace finanzas
```

(En vez de aplicar `secret.example.yaml` directamente — es solo la plantilla
de referencia, para que veas qué claves espera.)

### 3. Aplica el resto

```bash
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
# Si tienes ingress-nginx + cert-manager (ajusta el dominio primero):
kubectl apply -f k8s/ingress.example.yaml
```

### 4. Compruébalo

```bash
kubectl -n finanzas get pods -w
kubectl -n finanzas logs -f deploy/finanzas -c finanzas
kubectl -n finanzas port-forward svc/finanzas 3000:80   # para probar sin ingress
```

`startupProbe`, `readinessProbe` y `livenessProbe` apuntan a `/api/health`,
que comprueba que el proceso responde y que la base de datos abre —
verificado en este mismo proyecto: con la base de datos corrupta a propósito
devuelve `503` con el motivo real, y con una base sana, `200`.

## Almacenamiento: revisa tu `StorageClass`

`pvc.yaml` pide `ReadWriteOnce` sin fijar `storageClassName`, así que usará la
que tengas por defecto. Dos cosas a comprobar en tu clúster:

- Que esa clase por defecto **soporte** `ReadWriteOnce` (casi todas lo hacen;
  algunas integraciones NFS solo ofrecen `ReadWriteMany`, que aquí no sirve
  por lo explicado arriba).
- Que el volumen sobreviva a que el pod se reprograme en otro nodo. Con
  `local-path` (el por defecto en k3s) el volumen queda atado al nodo donde se
  creó la primera vez: si ese nodo cae, el pod no podrá reprogramarse en otro
  hasta que el nodo original vuelva. Para más resiliencia real, usa una
  StorageClass respaldada por Ceph/Longhorn/tu SAN si tu clúster la tiene.

## Qué NO lleva esto (y por qué)

- **Sin `HorizontalPodAutoscaler`**: escalar horizontalmente rompería la base
  de datos, como se explica arriba.
- **Sin `PodDisruptionBudget`**: con una sola réplica, un PDB con
  `minAvailable: 1` bloquearía cualquier drenado voluntario del nodo (mante­
  nimiento, actualización) porque nunca podría evacuar el único pod sin
  quedarse por debajo del mínimo. Con una réplica, asume el corte breve de
  cada despliegue o mantenimiento en vez de complicarte con esto.
- **Sin NetworkPolicy**: depende demasiado de cómo tengas segmentada tu red
  como para dar un ejemplo genérico útil; si tu clúster ya exige NetworkPolicy
  por defecto, la app solo necesita salida a internet (banco, notificaciones)
  y entrada al puerto 3000 desde tu Service/Ingress.

## Un aviso honesto sobre estos manifiestos

No he podido desplegarlos contra un clúster real para verificar el ciclo
completo: este entorno de pruebas bloquea por política tanto la descarga de
imágenes de Docker Hub como la instalación de un clúster local (k3s, kind).
Lo que sí se ha verificado aquí:

- Los seis ficheros son YAML válido y con la estructura que Kubernetes espera
  (comprobado cargándolos con un parser YAML).
- `/api/health` responde `200` en sano y `503` con el motivo real cuando la
  base de datos falla — probado de verdad, no solo leído en el código.
- El UID/GID del usuario `finanzas` dentro de la imagen (999) coincide a
  propósito con `runAsUser`/`runAsGroup`/`fsGroup` del manifiesto: sin fijarlo
  en el `Dockerfile`, `useradd` le habría asignado el siguiente UID de sistema
  libre, que no tiene por qué ser el mismo en cada build.

Antes de darlo por bueno en tu clúster real, comprueba al menos una vez el
ciclo completo (`kubectl apply`, que el pod llegue a `Running` y `/api/health`
responda `200` a través del `Service`) y dime qué sale si algo no cuadra.
