# La base de datos

Todo lo que la app sabe de ti —movimientos, nóminas, categorías, suscripciones,
reglas— vive en **un solo fichero**:

```
C:\Users\TuUsuario\finanzas\data\finanzas.db
```

Es SQLite: un fichero normal, sin servidor ni servicio que instalar. Se crea
solo la primera vez que arrancas la app. Nadie lo lee salvo la propia app, y no
sale de tu equipo.

Junto a él verás a veces `finanzas.db-wal` y `finanzas.db-shm`. No son basura:
el `-wal` guarda los cambios recientes que aún no se han volcado al fichero
principal. **Esto tiene una consecuencia importante**: copiar `finanzas.db` a
mano con la app abierta te da una copia incompleta o rota. Usa siempre los
comandos de abajo, que hacen la copia bien.

## El día a día

| Quiero… | Windows (doble clic) | Consola |
|---|---|---|
| Ver qué hay guardado | — | `npm run db:info` |
| Hacer una copia | `copia-seguridad.cmd` | `npm run db:backup` |
| Abrir mis datos en Excel | `exportar-excel.cmd` | `npm run db:export` |
| Recuperar una copia | — | `npm run db:restore -- copias\finanzas_....db` |
| Empezar de cero | — | `npm run db:reset -- --si` |

También puedes bajarte una copia sin tocar la consola: **Ajustes → Copia de
seguridad → Descargar copia**. Funciona igual desde el móvil.

## Copias de seguridad

```powershell
npm run db:backup
```

Deja un fichero en la carpeta `copias`, con fecha y hora en el nombre. Se puede
ejecutar **con la app funcionando**: no hace falta parar nada.

Por defecto conserva las **14 últimas** y va borrando las más viejas. Para
cambiarlo: `npm run db:backup -- --conservar=30`.

Las copias que se hacen automáticamente antes de restaurar se llaman
`antes-de-restaurar_...` y **nunca se borran** con esa rotación.

### Que se hagan solas

En PowerShell **como administrador**, ajustando la ruta a tu carpeta:

```powershell
$accion = New-ScheduledTaskAction -Execute "cmd.exe" `
  -Argument "/c cd /d C:\Users\TuUsuario\finanzas && npm run db:backup" 
$cuando = New-ScheduledTaskTrigger -Daily -At 23:30
Register-ScheduledTask -TaskName "Finanzas - copia de seguridad" -Action $accion -Trigger $cuando
```

### Y llévatelas fuera del PC

Una copia en el mismo disco no te salva de que ese disco muera. La carpeta
`copias` es solo un fichero por día: cabe en cualquier sitio. Lo más cómodo es
que esa carpeta esté ya sincronizada —OneDrive, Google Drive, un disco externo—
o cambiar dónde se guardan:

```powershell
$env:BACKUP_DIR = "C:\Users\TuUsuario\OneDrive\Copias finanzas"
npm run db:backup
```

> **No pongas la base de datos en sí dentro de OneDrive o Drive.** Esos
> programas sincronizan el fichero mientras la app lo tiene abierto y pueden
> corromperlo. Sincroniza las **copias**, no la base de datos.

## Recuperar una copia

Para la app primero (cierra la ventana negra), y luego:

```powershell
npm run db:restore -- copias\finanzas_2026-08-28_2330.db
```

Antes de sobrescribir nada comprueba que el fichero es realmente una copia de
esta app, y guarda la base actual como `antes-de-restaurar_...` por si te
equivocas de copia. Después, arranca la app normal.

## Exportar a Excel

```powershell
npm run db:export
```

Deja tres ficheros en la carpeta `exportado`:

- `movimientos.csv` — todo: fecha, comercio, concepto, categoría, importe, si es nómina.
- `recurrentes.csv` — suscripciones y gastos fijos.
- `resumen-mensual.csv` — gasto por mes y categoría, listo para tabla dinámica.

Se abren con doble clic en Excel en español: llevan punto y coma como separador
y coma decimal, así que no hay que tocar nada al importarlos.

## Llevártelo a otro ordenador

1. En el viejo: `npm run db:backup`.
2. Copia al nuevo la carpeta del proyecto **y** el fichero `.env`
   (no está en el repositorio, y sin él pierdes la contraseña y las claves).
3. En el nuevo: `npm install` y `npm run build`.
4. `npm run db:restore -- copias\finanzas_....db`.

Si copias el `.env` tal cual, el enlace del calendario del móvil sigue siendo
válido y no hace falta volver a suscribirse.

## Empezar de cero

```powershell
npm run db:reset -- --si
```

Hace una copia antes de borrar. La base se vuelve a crear vacía al arrancar la
app. Es lo que quieres si cargaste los datos de ejemplo y ahora vas a conectar
el banco de verdad.

## Si algo va mal

| Síntoma | Qué hacer |
|---|---|
| `npm run db:info` dice que la integridad tiene un problema | Restaura la última copia buena. Si no tienes, exporta lo que se pueda con `npm run db:export`. |
| El fichero `.db` ocupa 4 KB y el `-wal` mucho más | Normal con la app abierta. Los datos están; al cerrarla se vuelca todo. |
| Borré `data/finanzas.db` sin querer | Restaura desde `copias`. Si no hay ninguna, se ha perdido: el histórico del banco se puede volver a importar (los meses que ceda tu banco), pero las categorías y suscripciones que hayas puesto a mano, no. |
| Quiero ver los datos por mi cuenta | Cualquier visor de SQLite, como [DB Browser for SQLite](https://sqlitebrowser.org). Ábrelo **sobre una copia**, no sobre el fichero en uso. |
