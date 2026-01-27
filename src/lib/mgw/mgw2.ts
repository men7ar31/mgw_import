import { Db, MongoClient } from "mongodb";
import { HistCollectionName, RowDoc } from "./types";

type StructuredDoc = {
  key: string;
  fecha: string;
  sucursal: string;
  fecha_dt?: Date;
  createdAt: Date;
  updatedAt: Date;
  source: { branch: string; pipeline: string };
} & Record<string, any>;

const MGW2_FLAG = String(process.env.MGW2_ENABLED || "").toLowerCase();
const MGW2_ENABLED =
  Boolean(process.env.MONGO_URI_MGW2) ||
  Boolean(process.env.MONGO_DB_MGW2) ||
  ["true", "1", "yes", "on"].includes(MGW2_FLAG);

const MGW2_DB_NAME = process.env.MONGO_DB_MGW2 || "mgw2";
const MGW2_URI = process.env.MONGO_URI_MGW2 || process.env.MONGO_URI;

const HIST_COLLECTIONS: HistCollectionName[] = [
  "Ventas_Hist",
  "Estadisticas_CC_Hist",
  "Estadisticas_Productos_Hist",
  "Estadisticas_Grupos_Hist",
  "Estadisticas_FormasPago_Hist",
  "Clientes_Hist"
];

const META_COLLECTION = "mgw2_meta";
const META_PREFIX = "header:";
type HeaderDoc = { _id: string; header: string[]; fields: string[]; updatedAt?: Date; createdAt?: Date };

let client: MongoClient | null = null;
let db: Db | null = null;

export function isMgw2Enabled() {
  return MGW2_ENABLED;
}

export async function mirrorDocsToMgw2(col: HistCollectionName, header: string[], docs: RowDoc[]) {
  if (!MGW2_ENABLED) return;
  if (col !== "Ventas_Hist") return; // solo espejo de ventas
  if (!header?.length || !docs?.length) return;

  const _db = await getMgw2Db();
  const fields = await ensureHeader(_db, col, header);
  const structured = docs.map((doc) => buildStructuredDoc(doc, fields));
  await bulkUpsertStructured(_db, col, structured);
}

async function getMgw2Db(): Promise<Db> {
  if (!MGW2_ENABLED) throw new Error("Base mgw2 no habilitada (falta MGW2_ENABLED/MONGO_URI_MGW2/MONGO_DB_MGW2).");
  if (db) return db;
  if (!MGW2_URI) throw new Error("Falta MONGO_URI_MGW2 o MONGO_URI para conectar a mgw2.");
  client = new MongoClient(MGW2_URI);
  await client.connect();
  db = client.db(MGW2_DB_NAME);
  await ensureIndexes(db);
  return db;
}

async function ensureIndexes(_db: Db) {
  for (const name of HIST_COLLECTIONS) {
    await _db.collection(name).createIndex({ key: 1 }, { unique: true });
    await _db.collection(name).createIndex({ fecha: 1, sucursal: 1 });
  }
  await _db.collection(META_COLLECTION).createIndex({ _id: 1 });
}

async function ensureHeader(_db: Db, col: HistCollectionName, header: string[]) {
  const fields = buildFieldNames(header);
  const metaCol = _db.collection<HeaderDoc>(META_COLLECTION);
  const _id = `${META_PREFIX}${col}`;
  const existing = await metaCol.findOne({ _id });
  if (!existing || !arraysEqual(existing.header, header) || !arraysEqual(existing.fields, fields)) {
    await metaCol.updateOne(
      { _id },
      { $set: { header, fields, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  }
  return fields;
}

function buildStructuredDoc(doc: RowDoc, fields: string[]): StructuredDoc {
  const flat: Record<string, any> = {};
  const reserved = new Set(["_id", "key", "fecha", "fecha_dt", "sucursal", "createdAt", "updatedAt", "source"]);

  fields.forEach((name, idx) => {
    const val = doc.row[idx];
    if (!reserved.has(name)) {
      flat[name] = val;
    } else if (name === "fecha") {
      flat[name] = val;
    } else if (name === "sucursal") {
      flat[name] = val;
    }
  });

  const fechaDt = toDateUtc(doc.fecha || flat.fecha);

  return {
    key: doc.key,
    fecha: doc.fecha,
    sucursal: doc.sucursal,
    ...(fechaDt ? { fecha_dt: fechaDt } : {}),
    ...flat,
    createdAt: doc.createdAt || new Date(),
    updatedAt: new Date(),
    source: { branch: "mgw2", pipeline: "mgw_import_v1" }
  };
}

async function bulkUpsertStructured(_db: Db, colName: HistCollectionName, docs: StructuredDoc[]) {
  if (!docs.length) return;
  const col = _db.collection<StructuredDoc>(colName);
  const ops = docs.map((doc) => {
    const { createdAt, ...rest } = doc;
    return {
      updateOne: {
        filter: { key: doc.key },
        update: { $set: rest, $setOnInsert: { createdAt: createdAt || new Date() } },
        upsert: true
      }
    };
  });
  await col.bulkWrite(ops, { ordered: false });
}

function buildFieldNames(header: string[]) {
  const used = new Map<string, number>();
  return header.map((h, idx) => {
    const base = sanitizeFieldName(h, idx);
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function sanitizeFieldName(raw: string, idx: number) {
  const base = String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/__+/g, "_");

  const withFallback = base || `col_${idx + 1}`;
  return /^[a-z]/.test(withFallback) ? withFallback : `c_${withFallback}`;
}

function toDateUtc(fecha: any): Date | undefined {
  if (!fecha) return undefined;
  if (fecha instanceof Date && !isNaN(fecha.getTime())) return fecha;
  const str = String(fecha).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return undefined;
  const dt = new Date(`${str}T00:00:00Z`);
  return isNaN(dt.getTime()) ? undefined : dt;
}

function arraysEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
