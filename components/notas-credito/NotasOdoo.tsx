"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { NotaOdooMes } from "@/lib/notas-credito/odoo";
import { formatoMonto, NOMBRE_SEDE } from "@/lib/notas-credito/tipos";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Nota = NotaOdooMes & { solicitud_id: number | null };

const ESTADO: Record<string, { t: string; c: string }> = {
  posted: { t: "Publicada", c: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  draft: { t: "Borrador", c: "bg-amber-100 text-amber-800 border-amber-200" },
  cancel: { t: "Anulada", c: "bg-slate-100 text-slate-500 border-slate-200" },
};

function mesActual(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas", year: "numeric", month: "2-digit" }).format(new Date());
}

const fecha = (v: string | null) =>
  v ? new Date(`${v}T12:00:00`).toLocaleDateString("es-VE", { day: "2-digit", month: "short" }) : "—";

/**
 * Pestaña "En Odoo": las notas de crédito de cliente del mes tal como están
 * en Odoo, cada una con su solicitud del panel o marcada "sin solicitud"
 * (hecha en Odoo sin pasar por el flujo). Solo lectura.
 */
export function NotasOdoo({ sedes, onAbrir }: { sedes: number[]; onAbrir: (id: number) => void }) {
  const [mes, setMes] = useState(mesActual);
  const [sede, setSede] = useState<number | 0>(0);
  const [soloSin, setSoloSin] = useState(false);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!/^\d{4}-\d{2}$/.test(mes)) return;
    const ctrl = new AbortController();
    setCargando(true);
    setError("");
    fetch(`/api/notas-credito/odoo?mes=${mes}${sede ? `&company_id=${sede}` : ""}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || "No se pudo leer Odoo");
        setNotas(j.notas || []);
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError(e?.message || "No se pudo leer Odoo");
      })
      .finally(() => setCargando(false));
    return () => ctrl.abort();
  }, [mes, sede]);

  const vigentes = useMemo(() => notas.filter((n) => n.estado !== "cancel"), [notas]);
  const sinSolicitud = vigentes.filter((n) => !n.solicitud_id).length;
  const totales = useMemo(() => {
    const t = new Map<string, number>();
    for (const n of vigentes) if (n.estado === "posted") t.set(n.moneda, (t.get(n.moneda) || 0) + n.total);
    return [...t.entries()];
  }, [vigentes]);
  const visibles = soloSin ? notas.filter((n) => !n.solicitud_id && n.estado !== "cancel") : notas;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-slate-500">Mes</span>
          <Input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="w-44 bg-white" />
        </label>
        {sedes.length > 1 && (
          <label className="space-y-1">
            <span className="block text-xs font-medium text-slate-500">Sede</span>
            <select
              className="h-9 rounded-md border bg-white px-3 text-sm"
              value={sede}
              onChange={(e) => setSede(Number(e.target.value))}
            >
              <option value={0}>Todas</option>
              {sedes.map((s) => (
                <option key={s} value={s}>
                  {NOMBRE_SEDE[s] || s}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex h-9 items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} />
          Solo las que no pasaron por el panel
        </label>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {cargando ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Notas de crédito del mes</p>
              <p className="text-2xl font-bold text-slate-900">{vigentes.length}</p>
              <p className="text-xs text-slate-400">sin contar anuladas</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Sin solicitud en el panel</p>
              <p className={`text-2xl font-bold ${sinSolicitud ? "text-orange-600" : "text-slate-900"}`}>{sinSolicitud}</p>
              <p className="text-xs text-slate-400">hechas en Odoo sin pasar por la aprobación</p>
            </div>
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">Total publicado</p>
              {totales.length ? (
                totales.map(([mon, t]) => (
                  <p key={mon} className="text-lg font-bold text-slate-900">
                    {formatoMonto(t, mon)}
                  </p>
                ))
              ) : (
                <p className="text-2xl font-bold text-slate-900">—</p>
              )}
            </div>
          </div>

          {visibles.length === 0 ? (
            <Card className="rounded-3xl border-none shadow-sm">
              <CardContent className="py-12 text-center text-slate-400">
                <FileText className="mx-auto mb-3 h-12 w-12 opacity-50" />
                <p>{soloSin ? "Todas las de este mes pasaron por el panel." : "No hay notas de crédito en Odoo este mes."}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-3xl bg-white shadow-sm">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 text-left">Nota</th>
                    <th className="px-3 py-2.5 text-left">Fecha</th>
                    {sedes.length > 1 && !sede && <th className="px-3 py-2.5 text-left">Sede</th>}
                    <th className="px-3 py-2.5 text-left">Cliente</th>
                    <th className="px-3 py-2.5 text-left">Factura</th>
                    <th className="px-3 py-2.5 text-right">Monto</th>
                    <th className="px-3 py-2.5 text-left">Estado</th>
                    <th className="px-3 py-2.5 text-left">Hecha por</th>
                    <th className="px-4 py-2.5 text-left">Panel</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visibles.map((n) => (
                    <tr key={n.id} className={n.estado === "cancel" ? "text-slate-400" : ""}>
                      <td className="px-4 py-2.5">
                        <a href={n.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">
                          {n.nombre} <ExternalLink className="h-3 w-3" />
                        </a>
                        {n.ref && <p className="max-w-[16rem] truncate text-xs text-slate-400" title={n.ref}>{n.ref}</p>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{fecha(n.fecha)}</td>
                      {sedes.length > 1 && !sede && <td className="px-3 py-2.5 text-slate-500">{NOMBRE_SEDE[n.company_id] || n.company_id}</td>}
                      <td className="max-w-[14rem] truncate px-3 py-2.5" title={n.cliente}>{n.cliente || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{n.factura || "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{formatoMonto(n.total, n.moneda)}</td>
                      <td className="px-3 py-2.5">
                        <Badge className={`${ESTADO[n.estado]?.c || ""} border text-[11px]`}>{ESTADO[n.estado]?.t || n.estado}</Badge>
                      </td>
                      <td className="max-w-[10rem] truncate px-3 py-2.5 text-slate-500" title={n.creado_por}>{n.creado_por || "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {n.solicitud_id ? (
                          <button type="button" onClick={() => onAbrir(n.solicitud_id!)} className="font-medium text-purple-700 hover:underline">
                            NC-{n.solicitud_id}
                          </button>
                        ) : n.estado === "cancel" ? (
                          <span className="text-xs">—</span>
                        ) : (
                          <Badge className="border border-orange-200 bg-orange-50 text-[11px] text-orange-700">Sin solicitud</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
