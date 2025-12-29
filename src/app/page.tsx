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
