"use client";

import { useEffect, useMemo, useState } from "react";

type Cursor = {
  _id: string;
  curFecha: string;
  curSucIdx: number;
  running: boolean;
  startedAt?: string;
  updatedAt?: string;
};

type StatusResp = { ok: boolean; cursor?: Cursor; error?: string };

export default function HomePage() {
  const [status, setStatus] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [fecha, setFecha] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [sheetId, setSheetId] = useState<string>("");
  const [sheetUrl, setSheetUrl] = useState<string>("");
  const [autoSync, setAutoSync] = useState<{ running: boolean; intervalMs: number } | null>(null);

  const fetchStatus = async () => {
    const res = await fetch("/api/mgw/status");
    const data: StatusResp = await res.json();
    if (data.ok && data.cursor) setStatus(data.cursor);
  };

  useEffect(() => {
    fetchStatus().catch(() => {});
  }, []);

  const runAction = async (path: string, body?: Record<string, any>) => {
    setLoading(path);
    setMessage("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      if (data.cursor) setStatus(data.cursor);
      setMessage(`OK ${path} ${data.result ? JSON.stringify(data.result) : ""}`.trim());
      await fetchStatus();
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setLoading(null);
    }
  };

  const exportUrl = useMemo(() => "/api/mgw/export", []);

  const refreshAutoSync = async () => {
    try {
      const res = await fetch("/api/mgw/auto-sync");
      const data = await res.json();
      if (data.ok && data.status) {
        setAutoSync({ running: data.status.running, intervalMs: data.status.intervalMs });
        if (data.status.spreadsheetId) setSheetId(data.status.spreadsheetId);
        if (data.status.spreadsheetId) setSheetUrl(`https://docs.google.com/spreadsheets/d/${data.status.spreadsheetId}`);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refreshAutoSync().catch(() => {});
  }, []);

  const toggleAutoSync = async (start: boolean) => {
    setLoading("/api/mgw/auto-sync");
    setMessage("");
    try {
      const res = await fetch("/api/mgw/auto-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(start ? { action: "start", spreadsheetId: sheetId || undefined } : { action: "stop" })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      if (data.status?.spreadsheetId) setSheetId(data.status.spreadsheetId);
      if (data.status?.spreadsheetId) setSheetUrl(`https://docs.google.com/spreadsheets/d/${data.status.spreadsheetId}`);
      if (data.status) setAutoSync({ running: data.status.running, intervalMs: data.status.intervalMs });
      setMessage(start ? "Auto-sync iniciado" : "Auto-sync detenido");
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setLoading(null);
    }
  };

  const pushSheets = async (createNew = false) => {
    setLoading("/api/mgw/push-sheets");
    setMessage("");
    setSheetUrl("");
    try {
      const res = await fetch("/api/mgw/push-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId: sheetId || undefined, createNew })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      setSheetId(data.spreadsheetId || sheetId);
      setSheetUrl(data.url || "");
      setMessage("Sheet generado/actualizado correctamente");
    } catch (e: any) {
      setMessage(e?.message || String(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto", fontFamily: "Inter, system-ui, sans-serif" }}>
      <h1>MGW Importer</h1>
      <p style={{ maxWidth: 720 }}>
        Replica del GAS “MGW MASTER - Multi sucursal + histórico (CHUNKED / ANTI-TIMEOUT)”. Usa las rutas
        /api/mgw/* para iniciar, reanudar, cortar, procesar tandas y exportar el Excel con las 6 hojas.
      </p>

      <section style={{ marginTop: 24, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h2>Estado</h2>
        <pre style={{ background: "#f7f7f7", padding: 12, borderRadius: 4 }}>
{status ? JSON.stringify(status, null, 2) : "Sin datos"}
        </pre>
      </section>

      <section style={{ marginTop: 24, display: "grid", gap: 12 }}>
        <div>
          <label style={{ display: "block", fontWeight: 600 }}>Fecha inicio (opcional yyyy-MM-dd)</label>
          <input
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            placeholder="2025-11-26"
            style={{ padding: 8, width: "200px", border: "1px solid #ccc", borderRadius: 4 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button disabled={loading === "/api/mgw/start"} onClick={() => runAction("/api/mgw/start", fecha ? { fecha } : undefined)}>
            Start (reset)
          </button>
          <button disabled={loading === "/api/mgw/resume"} onClick={() => runAction("/api/mgw/resume")}>
            Resume
          </button>
          <button disabled={loading === "/api/mgw/run"} onClick={() => runAction("/api/mgw/run")}>
            Run tanda
          </button>
          <button disabled={loading === "/api/mgw/stop"} onClick={() => runAction("/api/mgw/stop")}>
            Stop
          </button>
          <a href={exportUrl} style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 4, textDecoration: "none" }}>
            Descargar Excel
          </a>
          <button disabled={loading === "/api/mgw/push-sheets"} onClick={() => pushSheets(false)}>
            Cargar en Google Sheets
          </button>
          <button
            disabled={loading === "/api/mgw/auto-sync"}
            onClick={() => toggleAutoSync(!autoSync?.running)}
            style={{ background: autoSync?.running ? "#c7ffd1" : undefined }}
          >
            {autoSync?.running ? "Detener auto-sync" : "Iniciar auto-sync"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
            placeholder="Spreadsheet ID (opcional)"
            style={{ padding: 8, minWidth: 260, border: "1px solid #ccc", borderRadius: 4 }}
          />
          <button disabled={loading === "/api/mgw/push-sheets"} onClick={() => pushSheets(true)}>
            Crear nuevo sheet
          </button>
          {sheetUrl && (
            <a href={sheetUrl} target="_blank" rel="noreferrer" style={{ color: "#0a58ca" }}>
              Abrir Sheet
            </a>
          )}
        </div>
      </section>

      {message && (
        <section style={{ marginTop: 16, padding: 12, background: "#eef8ff", border: "1px solid #b6dcff", borderRadius: 6 }}>
          <strong>Respuesta:</strong> {message}
        </section>
      )}

      <section style={{ marginTop: 32, padding: 16, border: "1px solid #ddd", borderRadius: 8 }}>
        <h3>Cómo funciona</h3>
        <ul>
          <li>Start: resetea cursor a sucursal 0 y fecha (usa la que ingreses o FECHA_INICIO_MASTER) y deja RUNNING=true.</li>
          <li>Run tanda: procesa hasta MAX_DIAS_POR_CORRIDA días, avanzando CUR_SUC_IDX/CUR_FECHA; si falta, vuelve a ejecutar.</li>
          <li>Resume: reanuda con RUNNING=true respetando el cursor guardado.</li>
          <li>Stop: marca RUNNING=false (no procesa más hasta que hagas resume/start).</li>
          <li>Export: genera .xlsx con las 6 hojas y formatos idénticos al GAS.</li>
        </ul>
      </section>
    </main>
  );
}
