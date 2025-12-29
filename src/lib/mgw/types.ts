export type HistCollectionName =
  | "Ventas_Hist"
  | "Estadisticas_CC_Hist"
  | "Estadisticas_Productos_Hist"
  | "Estadisticas_Grupos_Hist"
  | "Estadisticas_FormasPago_Hist"
  | "Clientes_Hist";

export type RowDoc = {
  key: string;
  fecha: string;
  sucursal: string;
  row: any[];
  createdAt: Date;
  updatedAt: Date;
};

export type CursorDoc = {
  _id: "mgw_cursor";
  running: boolean;
  curSucIdx: number;
  curFecha: string;
  startedAt: Date | null;
  updatedAt: Date;
};
