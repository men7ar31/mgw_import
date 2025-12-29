import { Db, MongoClient } from "mongodb";
import { HistCollectionName } from "./mgw/types";

const DB_NAME = process.env.MONGO_DB || undefined;

const HIST_COLLECTIONS: HistCollectionName[] = [
  "Ventas_Hist",
  "Estadisticas_CC_Hist",
  "Estadisticas_Productos_Hist",
  "Estadisticas_Grupos_Hist",
  "Estadisticas_FormasPago_Hist",
  "Clientes_Hist"
];

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Falta MONGO_URI.");
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(DB_NAME);
  await ensureIndexes(db);
  return db;
}

async function ensureIndexes(db: Db) {
  // _id already has implicit unique index; avoid specifying options to prevent InvalidIndexSpecificationOption
  await db.collection("mgw_cursor").createIndex({ _id: 1 });
  for (const name of HIST_COLLECTIONS) {
    await db.collection(name).createIndex({ key: 1 }, { unique: true });
    await db.collection(name).createIndex({ fecha: 1, sucursal: 1 });
  }
}
