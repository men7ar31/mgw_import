import axios, { AxiosInstance } from "axios";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import { MGW_MASTER, Sucursal } from "./constants";
import { normalizeDateInput } from "./date-utils";

const MGW_USER_DEFAULT = "ezequielmedina";
const MGW_PASS_DEFAULT = "123456";

export type MGWSession = {
  client: AxiosInstance;
  jar: CookieJar;
  sucursal: Sucursal;
};

function getCredenciales() {
  const usuario = process.env.MGW_USER || MGW_USER_DEFAULT;
  const contrasena = process.env.MGW_PASS || MGW_PASS_DEFAULT;
  if (!usuario || !contrasena) {
    throw new Error("Faltan credenciales MGW_USER / MGW_PASS.");
  }
  return { usuario, contrasena };
}

export async function loginSucursal(sucursal: Sucursal): Promise<MGWSession> {
  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      withCredentials: true,
      jar,
      maxRedirects: 0,
      validateStatus: () => true
    })
  );

  const { usuario, contrasena } = getCredenciales();

  const payload = new URLSearchParams({
    empresa: sucursal.empresa,
    usuario,
    contrasena,
    btnlogin: "Iniciar Sesión"
  });

  const resp = await client.post(MGW_MASTER.loginUrl, payload.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  const cookies = await jar.getCookies(MGW_MASTER.loginUrl);
  const hasPhpsess = cookies.some((c) => c.key.toLowerCase() === "phpsessid");

  if (!hasPhpsess) {
    const snippet = typeof resp.data === "string" ? resp.data.slice(0, 400) : "";
    throw new Error(`No se pudo obtener cookie (PHPSESSID) para ${sucursal.nombre}. ${snippet}`);
  }

  return { client, jar, sucursal };
}

export async function fetchVentasXls(session: MGWSession, desde: string, hasta: string): Promise<Buffer> {
  const payload = buildVentasPayload(desde, hasta);
  const resp = await session.client.post(MGW_MASTER.exportUrl, new URLSearchParams(payload).toString(), {
    responseType: "arraybuffer",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  return Buffer.from(resp.data);
}

export async function fetchStatsHtml(session: MGWSession, fecha: string): Promise<string> {
  const payload = buildStatsPayload(fecha);
  const resp = await session.client.post(MGW_MASTER.statsUrl, new URLSearchParams(payload).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  return resp.data;
}

export async function fetchClientesHtml(session: MGWSession, fecha: string): Promise<string> {
  const payload = buildClientesPayload(fecha);
  const resp = await session.client.post(MGW_MASTER.clientesUrl, new URLSearchParams(payload).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
  return resp.data;
}

export async function fetchCcXls(session: MGWSession, fecha: string): Promise<Buffer> {
  const qs = new URLSearchParams(buildCcParams(fecha)).toString();
  const url = `${MGW_MASTER.ccUrl}?${qs}`;
  const resp = await session.client.get(url, { responseType: "arraybuffer" });
  return Buffer.from(resp.data);
}

function buildVentasPayload(desde: string, hasta: string) {
  const p: Record<string, string> = {
    input_exportar_ventas: "0",
    producto_para_detalles: "",
    rango_franja: "rango",
    rango_desde: desde,
    rango_desdehora: "00:01",
    rango_hasta: hasta,
    rango_hastahora: "23:59",
    responsables: "todos",
    grupos: "todos",
    tipos: "todos",
    clientes: "todos",
    clientes_club: "todos",
    fdp: "todas",
    descuentos: "todas",
    eliminado: "0",
    vendedor_filtro: "todos",
    vendedor_asignado_filtro: "todos",
    vendedor_balanza_filtro: "todos",
    filtrar_tiendas: "todos",
    lista: "todas",
    checkbox_total: "1",
    checkbox_productos: "1",
    checkbox_grupos: "1",
    checkbox_fdp: "1",
    checkbox_combos: "1",
    tiendas_seleccionadas: "{}"
  };
  for (let i = 1; i <= 8; i++) p[`grupo[${i}]`] = "1";
  for (let j = 1; j <= 4; j++) p[`forma[${j}]`] = "1";
  p["descuento[2]"] = "1";
  return p;
}

function buildStatsPayload(fecha: string) {
  return {
    input_exportar_ventas: "0",
    producto_para_detalles: "",
    rango_franja: "rango",
    rango_desde: fecha,
    rango_desdehora: "00:01",
    rango_hasta: fecha,
    rango_hastahora: "23:59",
    responsables: "todos",
    grupos: "todos",
    tipos: "todos",
    clientes: "todos",
    clientes_club: "todos",
    fdp: "todas",
    descuentos: "todas",
    eliminado: "0",
    vendedor_filtro: "todos",
    vendedor_asignado_filtro: "todos",
    vendedor_balanza_filtro: "todos",
    filtrar_tiendas: "todos",
    lista: "todas",
    checkbox_total: "1",
    checkbox_productos: "1",
    checkbox_grupos: "1",
    checkbox_fdp: "1",
    checkbox_combos: "1",
    dato: "valor",
    tiendas_seleccionadas: "{}"
  };
}

function buildClientesPayload(fecha: string) {
  return {
    cliente_para_detalles: "",
    rango_desde: fecha,
    rango_desdehora: "00:01",
    rango_hasta: fecha,
    rango_hastahora: "23:59",
    mox: "e",
    dato: "valor"
  };
}

function buildCcParams(fecha: string) {
  const f = normalizeDateInput(fecha);
  return {
    exportar: "true",
    ventas_desde: f,
    ventas_hasta: f,
    pagos_desde: f,
    pagos_hasta: f,
    grupo_clientes: "todos",
    estadistica_usuario: "todos",
    tipos_cliente: "todos"
  };
}
