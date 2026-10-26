"use client";

// Comparativa de "Clientes del mes" contra el mes anterior: indicadores con
// variación, venta acumulada día a día, clientes nuevos / que repitieron /
// que no volvieron y los clientes que más subieron o bajaron. Recibe los dos
// reportes de un mes de /api/adminleads/compras-mes ya leídos (no pide nada).

import type { ClienteMes, ReporteComprasMes } from "@/lib/adminleads/comprasMes";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const usd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const corto = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n.toFixed(0)}`);
const NOMBRES_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const nombreMes = (mes: string) => `${NOMBRES_MES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const diasDel = (mes: string) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
const llave = (c: ClienteMes) => `${c.sede}|${c.id}`;
const COLOR_ACTUAL = "#2563eb";
const COLOR_ANTERIOR = "#94a3b8";

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/** Venta sin IVA de cada día del mes (las NC restan). */
function porDia(r: ReporteComprasMes): number[] {
  const dias = Array(diasDel(r.desde)).fill(0);
  for (const c of r.clientes) for (const f of c.facturas) dias[Number(f.fecha.slice(8, 10)) - 1] += f.subtotal;
  return dias;
}

function Variacion({ actual, anterior, dinero }: { actual: number; anterior: number; dinero?: boolean }) {
  const dif = actual - anterior;
  const pct = anterior ? (dif / Math.abs(anterior)) * 100 : null;
  const Icono = dif > 0 ? ArrowUpRight : dif < 0 ? ArrowDownRight : Minus;
  const color = dif > 0 ? "text-emerald-600" : dif < 0 ? "text-red-500" : "text-zinc-400";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold ${color}`}>
      <Icono className="w-3.5 h-3.5" />
      {pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`}
      <span className="font-normal text-zinc-400 ml-1">
        ({dif > 0 ? "+" : ""}{dinero ? usd(dif) : dif.toLocaleString()})
      </span>
    </span>
  );
}

export function ComparativaComprasMes({ actual, anterior }: { actual: ReporteComprasMes; anterior: ReporteComprasMes }) {
  const [lista, setLista] = useState<"nuevos" | "repitieron" | "perdidos" | null>(null);

  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Caracas" });
  // Mes en curso: se compara contra el mes anterior hasta el mismo día.
  const enCurso = hoy.slice(0, 7) === actual.desde;
  const diaCorte = enCurso ? Number(hoy.slice(8, 10)) : diasDel(actual.desde);

  const c = useMemo(() => {
    const diaA = porDia(actual);
    const diaB = porDia(anterior);
    let accA = 0;
    let accB = 0;
    const serie = Array.from({ length: Math.max(diaA.length, diaB.length) }, (_, i) => {
      accA += diaA[i] ?? 0;
      accB += diaB[i] ?? 0;
      return {
        dia: i + 1,
        actual: i < diaA.length && i < diaCorte ? Math.round(accA) : null,
        anterior: i < diaB.length ? Math.round(accB) : null,
      };
    });
    const anteriorAlDia = diaB.slice(0, diaCorte).reduce((s, x) => s + x, 0);

    const previos = new Map(anterior.clientes.map((x) => [llave(x), x]));
    const ahora = new Map(actual.clientes.map((x) => [llave(x), x]));
    const nuevos = actual.clientes.filter((x) => !previos.has(llave(x)));
    const repitieron = actual.clientes.filter((x) => previos.has(llave(x)));
    const perdidos = anterior.clientes.filter((x) => !ahora.has(llave(x)));

    const movimientos = [...new Set([...previos.keys(), ...ahora.keys()])]
      .map((k) => {
        const a = ahora.get(k);
        const b = previos.get(k);
        return { cliente: (a ?? b)!.cliente, actual: a?.subtotal ?? 0, anterior: b?.subtotal ?? 0 };
      })
      .map((m) => ({ ...m, dif: m.actual - m.anterior }));
    const suben = movimientos.filter((m) => m.dif > 0).sort((x, y) => y.dif - x.dif).slice(0, 8);
    const bajan = movimientos.filter((m) => m.dif < 0).sort((x, y) => x.dif - y.dif).slice(0, 8);

    return { serie, anteriorAlDia, nuevos, repitieron, perdidos, suben, bajan };
  }, [actual, anterior, diaCorte]);

  const ra = actual.resumen;
  const rb = anterior.resumen;
  const ticket = (r: typeof ra) => (r.facturas ? r.subtotal / r.facturas : 0);
  const sinDatosAntes = rb.clientes === 0;

  const segmentos = [
    { k: "nuevos" as const, titulo: "Nuevos", nota: `compraron en ${nombreMes(actual.desde)} y no en ${nombreMes(anterior.desde)}`, filas: c.nuevos, color: "bg-emerald-500" },
    { k: "repitieron" as const, titulo: "Repitieron", nota: "compraron en los dos meses", filas: c.repitieron, color: "bg-blue-500" },
    { k: "perdidos" as const, titulo: "No volvieron", nota: `compraron en ${nombreMes(anterior.desde)} y no en ${nombreMes(actual.desde)}`, filas: c.perdidos, color: "bg-amber-500" },
  ];
  const abierta = segmentos.find((s) => s.k === lista);
  const totalSegmentos = c.nuevos.length + c.repitieron.length + c.perdidos.length || 1;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2 className="text-lg font-black text-slate-800">
          {nombreMes(actual.desde)} vs {nombreMes(anterior.desde)}
        </h2>
        {sinDatosAntes && (
          <p className="text-xs text-amber-600">
            {nombreMes(anterior.desde)} no tiene facturas en Odoo (antes de abril 2026 la venta está en Smartbit).
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { k: "Clientes", a: ra.clientes, b: rb.clientes, f: (n: number) => n.toLocaleString() },
          { k: "Facturas", a: ra.facturas, b: rb.facturas, f: (n: number) => n.toLocaleString() },
          { k: "Monto sin IVA", a: ra.subtotal, b: rb.subtotal, f: usd, dinero: true },
          { k: "Total con IVA", a: ra.total, b: rb.total, f: usd, dinero: true },
          { k: "Ticket promedio", a: ticket(ra), b: ticket(rb), f: usd, dinero: true },
        ].map((x) => (
          <div key={x.k} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">{x.k}</p>
            <p className="text-xl font-black text-zinc-800 mt-1 tabular-nums">{x.f(x.a)}</p>
            <p className="text-[11px] text-zinc-400 tabular-nums">
              {nombreMes(anterior.desde)}: {x.f(x.b)}
            </p>
            <div className="mt-1">
              <Variacion actual={x.a} anterior={x.b} dinero={x.dinero} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <p className="text-sm font-bold text-slate-700">Venta acumulada sin IVA, día a día</p>
            {enCurso && (
              <p className="text-xs text-zinc-500">
                Al día {diaCorte}: {usd(ra.subtotal)} vs {usd(c.anteriorAlDia)}{" "}
                <Variacion actual={ra.subtotal} anterior={c.anteriorAlDia} dinero />
              </p>
            )}
          </div>
          <div className="h-[280px] mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={c.serie} margin={{ left: 10, right: 20, top: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="dia" axisLine={false} tickLine={false} fontSize={11} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={corto} width={60} fontSize={11} />
                <Tooltip formatter={(v: number) => usd(v)} labelFormatter={(d) => `Día ${d}`} />
                <Legend />
                <Line name={nombreMes(actual.desde)} dataKey="actual" stroke={COLOR_ACTUAL} strokeWidth={3} dot={false} connectNulls={false} />
                <Line name={nombreMes(anterior.desde)} dataKey="anterior" stroke={COLOR_ANTERIOR} strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
          <p className="text-sm font-bold text-slate-700">Clientes</p>
          <div className="flex h-3 rounded-full overflow-hidden mt-3 bg-zinc-100">
            {segmentos.map((s) => (
              <div key={s.k} className={s.color} style={{ width: `${(s.filas.length / totalSegmentos) * 100}%` }} />
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {segmentos.map((s) => (
              <button
                key={s.k}
                onClick={() => setLista(lista === s.k ? null : s.k)}
                className={`w-full text-left rounded-xl p-3 border transition-colors ${lista === s.k ? "border-blue-300 bg-blue-50" : "border-zinc-100 hover:bg-zinc-50"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-bold text-zinc-700">
                    <span className={`w-2.5 h-2.5 rounded-full ${s.color}`} />
                    {s.titulo}
                  </span>
                  <span className="text-lg font-black text-zinc-800 tabular-nums">{s.filas.length}</span>
                </div>
                <p className="text-[11px] text-zinc-400">
                  {s.nota} · {usd(s.filas.reduce((t, x) => t + x.subtotal, 0))} sin IVA
                  {s.k === "perdidos" ? ` en ${nombreMes(anterior.desde)}` : ""}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {abierta && (
        <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
          <p className="text-sm font-bold text-slate-700 mb-2">
            {abierta.titulo} ({abierta.filas.length})
          </p>
          <div className="overflow-x-auto max-h-[360px]">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-zinc-400 bg-zinc-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2">Cliente</th>
                  <th className="text-left px-3 py-2">RIF</th>
                  <th className="text-right px-3 py-2">Facturas</th>
                  <th className="text-right px-3 py-2">Sin IVA{abierta.k === "perdidos" ? ` (${nombreMes(anterior.desde)})` : ""}</th>
                </tr>
              </thead>
              <tbody>
                {abierta.filas.map((x) => (
                  <tr key={llave(x)} className="border-t border-zinc-100">
                    <td className="px-3 py-1.5 font-semibold text-zinc-800">{x.cliente}</td>
                    <td className="px-3 py-1.5 text-zinc-500">{x.rif}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{x.facturas.filter((f) => !f.nc).length}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{usd(x.subtotal)}</td>
                  </tr>
                ))}
                {abierta.filas.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-zinc-400">Ninguno.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {[
          { titulo: "Los que más subieron", filas: c.suben },
          { titulo: "Los que más bajaron", filas: c.bajan },
        ].map((g) => (
          <div key={g.titulo} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
            <p className="text-sm font-bold text-slate-700">{g.titulo} (sin IVA)</p>
            {g.filas.length === 0 ? (
              <p className="text-xs text-zinc-400 py-10 text-center">Ninguno.</p>
            ) : (
              <div style={{ height: 60 + g.filas.length * 44 }} className="mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={g.filas} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={corto} fontSize={11} />
                    <YAxis
                      type="category"
                      dataKey="cliente"
                      width={170}
                      axisLine={false}
                      tickLine={false}
                      fontSize={11}
                      tickFormatter={(n: string) => (n.length > 26 ? `${n.slice(0, 25)}…` : n)}
                    />
                    <Tooltip formatter={(v: number) => usd(v)} />
                    <Legend />
                    <Bar name={nombreMes(anterior.desde)} dataKey="anterior" fill={COLOR_ANTERIOR} radius={[0, 4, 4, 0]} />
                    <Bar name={nombreMes(actual.desde)} dataKey="actual" fill={COLOR_ACTUAL} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
