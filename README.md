# MGW Importer (Next.js + MongoDB)

Replica en Node.js/TypeScript del script **“MGW MASTER - Multi sucursal + histórico (CHUNKED / ANTI-TIMEOUT)”** con Next.js (App Router), MongoDB y exportación a Excel.

## Variables de entorno
- `MGW_USER` / `MGW_PASS`
- `MONGO_URI` (cadena de conexión)
- `MONGO_DB` (opcional, por defecto base de la URI)
- `FECHA_INICIO_MASTER` (opcional, default `2025-11-26`)
- `MAX_DIAS_POR_CORRIDA` (opcional, default `45`)

Ejemplo: `.env.example`.

## Scripts npm
- `npm run dev` – servidor Next.js.
- `npm run build` / `npm start` – producción.
- `npm run lint` – lint.
- `npm run run:import` – runner CLI (`scripts/run-import.ts`).

Uso CLI: `npm run run:import [start|resume|stop]` (sin argumento corre una tanda `runImportOnce`).

## Endpoints (App Router)
- `POST /api/mgw/start` – resetea cursor y arranca desde `FECHA_INICIO_MASTER`.
- `POST /api/mgw/resume` – marca RUNNING y continua desde el cursor guardado.
- `POST /api/mgw/stop` – detiene.
- `POST /api/mgw/run` – procesa hasta `MAX_DIAS_POR_CORRIDA` desde el cursor.
- `GET  /api/mgw/status` – estado/cursor.
- `GET  /api/mgw/export` – descarga `.xlsx` con 6 hojas (formatos y nombres idénticos al GAS).

## Detalles clave
- Autenticación MGW via cookie jar (PHPSESSID) igual al GAS.
- Cursor persistente en colección `mgw_cursor` (`running`, `curSucIdx`, `curFecha`, `startedAt`, `updatedAt`).
- 6 colecciones con índice único en `key`: `Ventas_Hist`, `Estadisticas_CC_Hist`, `Estadisticas_Productos_Hist`, `Estadisticas_Grupos_Hist`, `Estadisticas_FormasPago_Hist`, `Clientes_Hist`.
- Lógica de normalización, dedupe, orden y parseo numérico idéntica al GAS (incluye `parseFlexibleNumber`, `normalizeDateInput`, heurísticas de columnas numéricas y limpieza de encabezados intercalados).
- Export a Excel via `exceljs`, formatos AR en columnas numéricas (Ventas solo col H), fecha en Ventas como texto.

## Notas de diseño
- Orden cronológico real (día a día ascendente) y clave de dedupe equivalente a `guessVentasKeyCols_` / `buildRowKey_`.
- Headers de cada hoja se guardan en colección `mgw_meta` para replicar nombres/órdenes originales al exportar.
