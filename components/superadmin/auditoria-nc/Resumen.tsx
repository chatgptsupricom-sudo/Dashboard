"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Ban, ChevronRight, FileMinus2, RotateCcw, ShieldAlert } from "lucide-react";
import { ChipSeveridad } from "./Comunes";
import { SEV_UI, dinero, dineroCorto, nombreMes, pct, type DatosAuditoriaNC } from "./formato";

type Tab = "notas" | "anuladas" | "reabiertas";

function Tarjeta({ icono: Icono, titulo, valor, pie, acento, onClick }: {
  icono: typeof Ban; titulo: string; valor: React.ReactNode; pie?: React.ReactNode; acento: string; onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2 min-w-0 text-left ${onClick ? "hover:border-slate-300 hover:shadow transition" : ""}`}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${acento}`}><Icono size={15} /></span>
        {titulo}
      </div>
      <div className="text-2xl font-black tracking-tight text-slate-900 tabular-nums truncate">{valor}</div>
      {pie && <div className="text-xs text-slate-500 leading-relaxed">{pie}</div>}
    </Tag>
  );
}

function TooltipMes({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-800 mb-1">{nombreMes(p.mes)}</p>
      <p className="text-slate-600">Notas de crédito: <b className="text-slate-900">{dinero(p.notas, 0)}</b> ({p.cantidadNotas})</p>
      <p className="text-slate-600">Ventas: <b className="text-slate-900">{dinero(p.ventas, 0)}</b></p>
      <p className="mt-1 font-semibold text-slate-800">{pct(p.pct, 2)} de las ventas</p>
    </div>
  );
}

function Barras({ filas, total }: { filas: { nombre: string; monto: number; cantidad: number; altas?: number }[]; total: number }) {
  const max = Math.max(1, ...filas.map((f) => f.monto));
  return (
    <ul className="space-y-2.5">
      {filas.map((f) => (
        <li key={f.nombre} className="text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-slate-700" title={f.nombre}>{f.nombre}</span>
            <span className="shrink-0 tabular-nums font-semibold text-slate-900">{dinero(f.monto, 0)}
              <span className="ml-1.5 text-[11px] font-normal text-slate-400">{f.cantidad} · {total > 0 ? pct((f.monto / total) * 100, 0) : "–"}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
            <div className="h-1.5 rounded-full bg-blue-500/80" style={{ width: `${(f.monto / max) * 100}%` }} />
          </div>
        </li>
      ))}
      {filas.length === 0 && <p className="text-xs text-slate-400">Sin datos.</p>}
    </ul>
  );
}

export function Resumen({ data, irA }: { data: DatosAuditoriaNC; irA: (tab: Tab, codigo?: string) => void }) {
  const r = data.resumen;
  const tabDe = (codigo: string): Tab => (codigo.startsWith("NC_") ? "notas" : codigo.startsWith("AN_") ? "anuladas" : "reabiertas");
  const totalNc = r.porCategoria.reduce((s, c) => s + c.monto, 0);
  const promedio = data.serie.filter((m) => m.pct != null && m.ventas > 0);
  const pctProm = promedio.length ? promedio.reduce((s, m) => s + (m.pct || 0), 0) / promedio.length : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Tarjeta icono={FileMinus2} titulo="Notas de crédito" acento="bg-blue-50 text-blue-600" onClick={() => irA("notas")}
          valor={dinero(r.nc.monto, 0)}
          pie={<><b>{pct(r.nc.pctVentas, 2)}</b> de las ventas ({dineroCorto(r.ventas)}) en {r.nc.cantidad} NC{pctProm != null && <> · promedio 12 meses {pct(pctProm, 2)}</>}. Sin intercompañía ni importación masiva.</>} />
        <Tarjeta icono={ShieldAlert} titulo="Alertas altas" acento="bg-red-50 text-red-600"
          valor={<span className={r.alertas.alta ? "text-red-600" : ""}>{r.alertas.alta}</span>}
          pie={<>{r.alertas.media} medias · {r.alertas.baja} bajas, entre NC, anuladas y reabiertas.</>} />
        <Tarjeta icono={Ban} titulo="Anuladas después de emitidas" acento="bg-amber-50 text-amber-600" onClick={() => irA("anuladas", "AN_PUBLICADA")}
          valor={r.anuladas.publicadas}
          pie={<>{dinero(r.anuladas.monto, 0)} · {r.anuladas.sinReemplazo} sin factura de reemplazo · {r.anuladas.cantidad - r.anuladas.publicadas} borradores anulados.</>} />
        <Tarjeta icono={RotateCcw} titulo="Reabiertas con cambios" acento="bg-violet-50 text-violet-600" onClick={() => irA("reabiertas")}
          valor={r.reabiertas.conCambios}
          pie={<>de {r.reabiertas.cantidad} reabiertas · {r.reabiertas.bajaronMonto} bajaron el monto (−{dinero(r.reabiertas.reduccion, 0)}).</>} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="font-bold text-slate-800">Notas de crédito por mes</h3>
            <span className="text-xs text-slate-400">Últimos 12 meses hasta el fin del período · el tooltip muestra el % sobre ventas</span>
          </div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={data.serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="mes" tickFormatter={nombreMes} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => dineroCorto(v)} />
              <Tooltip content={<TooltipMes />} cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey="notas" radius={[4, 4, 0, 0]} maxBarSize={32}>
                {data.serie.map((m) => <Cell key={m.mes} fill={m.mes >= data.desde.slice(0, 7) && m.mes <= data.hasta.slice(0, 7) ? "#2563eb" : "#93c5fd"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-slate-400">En azul oscuro, los meses del período elegido.</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3">Alertas encontradas</h3>
          {r.alertas.porCodigo.length === 0 ? <p className="text-sm text-slate-400">Ninguna alerta en el período.</p> : (
            <ul className="divide-y divide-slate-100 -mx-1 max-h-[300px] overflow-y-auto">
              {r.alertas.porCodigo.map((a) => (
                <li key={a.codigo}>
                  <button onClick={() => irA(tabDe(a.codigo), a.codigo)} title={a.explicacion}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-2 text-left hover:bg-slate-50">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${SEV_UI[a.severidad].punto}`} />
                      <span className="truncate text-sm text-slate-700">{a.titulo}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{tabDe(a.codigo) === "notas" ? "NC" : tabDe(a.codigo) === "anuladas" ? "Anuladas" : "Reabiertas"}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums text-slate-900">{a.cantidad}<ChevronRight size={14} className="text-slate-300" /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3">Motivos de las notas de crédito</h3>
          <Barras filas={r.porCategoria} total={totalNc} />
          <p className="mt-3 text-[11px] text-slate-400">Clasificados por palabras clave del motivo escrito al revertir la factura. Incluye intercompañía.</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-3">Clientes con más notas de crédito</h3>
          <Barras filas={r.porCliente.slice(0, 10)} total={totalNc} />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h3 className="font-bold text-slate-800 p-4 pb-2">Actividad por usuario</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead><tr className="border-y border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left">Usuario</th><th className="px-3 py-2 text-right">NC creadas</th><th className="px-3 py-2 text-right">Anuló</th><th className="px-3 py-2 text-right">Reabrió</th><th className="px-3 py-2 text-right">Alertas altas</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {r.porUsuario.slice(0, 15).map((u) => (
                  <tr key={u.usuario}>
                    <td className="px-3 py-2 text-slate-800">{u.usuario}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.ncCreadas}<span className="block text-[11px] text-slate-400">{dinero(u.ncMonto, 0)}</span></td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.anuladas}{u.anuladas > 0 && <span className="block text-[11px] text-slate-400">{dinero(u.anuladoMonto, 0)}</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.reabiertas}</td>
                    <td className="px-3 py-2 text-right">{u.alertasAltas ? <ChipSeveridad severidad="alta" texto={String(u.alertasAltas)} /> : <span className="text-slate-300">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h3 className="font-bold text-slate-800 p-4 pb-2">Notas de crédito por vendedor</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead><tr className="border-y border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left">Vendedor</th><th className="px-3 py-2 text-right">NC</th><th className="px-3 py-2 text-right">Ventas</th><th className="px-3 py-2 text-right">% de sus ventas</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {r.porVendedor.slice(0, 15).map((v) => (
                  <tr key={v.clave}>
                    <td className="px-3 py-2 text-slate-800">{v.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dinero(v.monto, 0)}<span className="block text-[11px] text-slate-400">{v.cantidad} NC</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">{dinero(v.ventas, 0)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${v.tasa != null && v.tasa >= 5 ? "text-red-600" : v.tasa != null && v.tasa >= 2 ? "text-amber-600" : "text-slate-700"}`}>{pct(v.tasa, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11px] text-slate-400">Vendedor de la factura que se revierte. % = NC ÷ su venta del período (sin intercompañía).</p>
        </div>
      </div>

      {(r.nc.importadas > 0 || r.nc.intercompania > 0) && (
        <p className="text-[11px] leading-relaxed text-slate-400">
          {r.nc.importadas > 0 && <>En el período hay {r.nc.importadas} NC de la importación masiva inicial ({dinero(r.nc.importadasMonto, 0)}): no generan alertas y se ven activando &quot;Incluir importación masiva&quot;. </>}
          {r.nc.intercompania > 0 && <>NC a empresas del grupo: {dinero(r.nc.intercompania, 0)} (no cuentan en el % sobre ventas).</>}
        </p>
      )}
    </div>
  );
}
