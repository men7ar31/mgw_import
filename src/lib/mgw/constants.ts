export type Sucursal = { nombre: string; empresa: string };

export const MGW_MASTER = {
  loginUrl: "https://www.migestionweb.app/index.php",
  exportUrl: "https://www.migestionweb.app/ajax_estadisticas_ventas_2_exportar.php",
  statsUrl: "https://www.migestionweb.app/ajax_estadisticas_ventas.php",
  clientesUrl: "https://www.migestionweb.app/ajax_estadisticas_clientes.php",
  ccUrl: "https://www.migestionweb.app/ajax_estadisticas_cc.php",
  tz: "GMT-3"
};

export const DATE_FMT = "yyyy-MM-dd";
export const AR_NUM_FMT = "#,##0.00";

export const FECHA_INICIO_MASTER =
  process.env.FECHA_INICIO_MASTER || process.env.MGW_FECHA_INICIO || "2025-11-26";

export const MAX_DIAS_POR_CORRIDA = Number(process.env.MAX_DIAS_POR_CORRIDA || 45);
export const DEDUPE_LOOKBACK_ROWS = Number(process.env.DEDUPE_LOOKBACK_ROWS || 20000);

export const SUCURSALES: Sucursal[] = [
  { nombre: "Yungas", empresa: "lm.yungas" },
  { nombre: "Shopping", empresa: "lm.shopping" },
  { nombre: "Jujuy", empresa: "lm.jujuy" },
  { nombre: "Outlet", empresa: "lm.outlet" },
  { nombre: "Aconquija", empresa: "lc.aconquija" },
  { nombre: "SanJuan", empresa: "lc.sanjuan" },
  { nombre: "Laprida", empresa: "lc.laprida" },
  { nombre: "Siria", empresa: "lc.siria" },
  { nombre: "Mastil", empresa: "lc.mastil" },
  { nombre: "Colon", empresa: "lc.colon" },
  { nombre: "9deJulio", empresa: "lc.9dejulio" }
];

export const RUNNER_STATUS = {
  RUNNING: "RUNNING"
} as const;
