# MGW Importer (Next.js + MongoDB)

Replica en Node.js/TypeScript del script **“MGW MASTER - Multi sucursal + histórico (CHUNKED / ANTI-TIMEOUT)”** con Next.js (App Router), MongoDB y exportación a Excel.

## Variables de entorno
- `MGW_USER` / `MGW_PASS`
- `MONGO_URI` (cadena de conexión)
- `MONGO_DB` (opcional, por defecto base de la URI)
- `MGW2_ENABLED` (opcional, habilita espejo estructurado en la base `mgw2`)
- `MONGO_URI_MGW2` / `MONGO_DB_MGW2` (opcional; si no se indica URI usa `MONGO_URI` y la DB `mgw2`)
- `FECHA_INICIO_MASTER` (opcional, default `2025-11-26`)
- `MAX_DIAS_POR_CORRIDA` (opcional, default `45`)

Ejemplo: `.env.example`.

## Scripts npm
- `npm run dev` – servidor Next.js.
- `npm run build` / `npm start` – producción.
- `npm run lint` – lint.
- `npm run run:import` – runner CLI (`scripts/run-import.ts`).
- `npm run backfill:mgw2` – replica todo lo ya importado hacia mgw2 con campos por atributo (requiere MGW2_ENABLED/URI/DB).
- `npm run run:auto-sync` – loop que reanuda y corre solo ventas (Ventas_Hist) de forma periódica respetando el cursor guardado y arrancando desde el día siguiente al último importado.

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

## mgw2 (docs con atributos)
- Con `MGW2_ENABLED=true` (y opcionalmente `MONGO_URI_MGW2` / `MONGO_DB_MGW2`, default DB `mgw2`) cada import escribe en paralelo un espejo estructurado solo de `Ventas_Hist`.
- En mgw2 las filas se guardan como campos aplanados según el header (`fecha`, `sucursal`, `total`, `n`, etc.), sin `row` ni `attrs`; se añade `fecha_dt` (Date UTC) cuando es parseable y `source` con `{ branch: "mgw2", pipeline: "mgw_import_v1" }`.
- Metadatos de headers viven en `mgw2_meta` y se mantiene el mismo dedupe por `key` más índices en `fecha`/`sucursal`.
- Para poblar mgw2 con datos ya existentes ejecuta `npm run backfill:mgw2` después de configurar los env; procesa en batches reutilizando los headers guardados.
