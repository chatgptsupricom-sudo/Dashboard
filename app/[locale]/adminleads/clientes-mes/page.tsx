"use client";

// Clientes que compraron en un mes o en varios (desde/hasta): cuántos, cuáles, sus facturas y
// el detalle de cada una, con export a Excel.
// Vive bajo /adminleads para heredar el guard de rol; el SuperAdmin entra por
// el desplegable Leads. Datos de /api/adminleads/compras-mes (AdminLeads ve
// solo su sede: la API la fija).

import type { ClienteMes, FacturaMes, ReporteComprasMes } from "@/lib/adminleads/comprasMes";
import { ChevronDown, ChevronRight, Download, Loader2, Search } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

const SEDES: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };
const usd = (n: number) => `$${n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("es-VE", { maximumFractionDigits: 2 });
const campo = "py-2 px-3 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500 text-zinc-600";
const MES_ACTUAL = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Caracas" }).slice(0, 7);
const MAX_MESES = 12; // el mismo tope de lib/adminleads/comprasMes.ts
const nombreMes = (mes: string) =>
  new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1).toLocaleDateString("es-VE", { month: "long", year: "numeric" });
const fecha = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");

function DetalleFactura({ f }: { f: FacturaMes }) {
  return (
    <div className="bg-white rounded-xl border border-zinc-100 p-3 my-1">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500 mb-2">
        <span>Vendedor: <b className="text-zinc-700">{f.vendedor || "—"}</b></span>
        {f.referencia && <span>Origen / referencia: <b className="text-zinc-700">{f.referencia}</b></span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="text-left py-1">Producto</th>
              <th className="text-right py-1">Cantidad</th>
              <th className="text-right py-1">Precio unit.</th>
              <th className="text-right py-1">Desc.</th>
              <th className="text-right py-1">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {f.lineas.map((l, i) => (
              <tr key={i} className="border-t border-zinc-100">
                <td className="py-1.5 pr-3">
                  <p className="text-zinc-700">{l.producto || l.descripcion}</p>
                  {l.producto && l.descripcion && l.descripcion !== l.producto && (
                    <p className="text-[11px] text-zinc-400">{l.descripcion}</p>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">{num(l.cantidad)}</td>
                <td className="py-1.5 text-right tabular-nums">{usd(l.precio)}</td>
                <td className="py-1.5 text-right tabular-nums">{l.descuento ? `${num(l.descuento)}%` : ""}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{usd(l.subtotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-zinc-600">
            <tr className="border-t border-zinc-200">
              <td colSpan={4} className="py-1 text-right">Sin IVA</td>
              <td className="py-1 text-right tabular-nums">{usd(f.subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={4} className="py-1 text-right">IVA</td>
              <td className="py-1 text-right tabular-nums">{usd(f.iva)}</td>
            </tr>
            <tr className="font-bold text-zinc-800">
              <td colSpan={4} className="py-1 text-right">Total</td>
              <td className="py-1 text-right tabular-nums">{usd(f.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function FacturasCliente({ c }: { c: ClienteMes }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  return (
    <table className="w-full text-xs">
      <thead className="text-[10px] uppercase tracking-wide text-zinc-400">
        <tr>
          <th className="w-6" />
          <th className="text-left py-1">Documento</th>
          <th className="text-left py-1">Fecha</th>
          <th className="text-left py-1">Vendedor</th>
          <th className="text-right py-1">Productos</th>
          <th className="text-right py-1">Sin IVA</th>
          <th className="text-right py-1">Total</th>
        </tr>
      </thead>
      <tbody>
        {c.facturas.map((f) => {
          const ver = abierta === f.id;
          return (
            <Fragment key={f.id}>
              <tr className="border-t border-zinc-100 hover:bg-white cursor-pointer" onClick={() => setAbierta(ver ? null : f.id)}>
                <td className="text-zinc-400">{ver ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                <td className="py-1.5 font-semibold text-zinc-700">
                  {f.numero}
                  {f.nc && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">Nota de crédito</span>}
                </td>
                <td className="py-1.5 text-zinc-500">{fecha(f.fecha)}</td>
                <td className="py-1.5 text-zinc-500">{f.vendedor}</td>
                <td className="py-1.5 text-right tabular-nums">{f.lineas.length}</td>
                <td className="py-1.5 text-right tabular-nums">{usd(f.subtotal)}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold">{usd(f.total)}</td>
              </tr>
              {ver && (
                <tr>
                  <td />
                  <td colSpan={6}>
                    <DetalleFactura f={f} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

export default function ComprasMesPage() {
  const [desde, setDesde] = useState(MES_ACTUAL);
  const [hasta, setHasta] = useState(MES_ACTUAL);
  const [sede, setSede] = useState("");
  const [buscar, setBuscar] = useState("");
  const [data, setData] = useState<ReporteComprasMes | null>(null);
  // Sin elegir sede la API devuelve las que el usuario puede ver: una sola = AdminLeads, sin selector.
  const [sedeFija, setSedeFija] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abierto, setAbierto] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ desde, hasta });
    if (sede) p.set("sede", sede);
    return p.toString();
  }, [desde, hasta, sede]);

  useEffect(() => {
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    fetch(`/api/adminleads/compras-mes?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((r) => {
        if (r.error) throw new Error(r.error);
        setData(r);
        if (!sede && r.sedes.length === 1) setSedeFija(r.sedes[0]);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(() => !ctrl.signal.aborted && setCargando(false));
    return () => ctrl.abort();
  }, [qs]);

  const clientes = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    if (!data) return [];
    return q
      ? data.clientes.filter((c) =>
          `${c.cliente} ${c.rif} ${c.facturas.map((f) => `${f.numero} ${f.lineas.map((l) => l.producto).join(" ")}`).join(" ")}`
            .toLowerCase()
            .includes(q),
        )
      : data.clientes;
  }, [data, buscar]);

  const r = data?.resumen;
  const variasSedes = (data?.sedes.length ?? 0) > 1;
  const columnas = variasSedes ? 7 : 6;
  // Varios meses: un renglón por mes con las sedes sumadas (el mismo cliente en dos sedes cuenta en cada una).
  const porMes = useMemo(() => {
    if (!data || data.meses.length < 2) return [];
    return data.meses.map((mes) => {
      const filas = data.porMes.filter((m) => m.mes === mes);
      const suma = (k: "clientes" | "facturas" | "nc" | "subtotal" | "total") => filas.reduce((s, m) => s + m[k], 0);
      return { mes, clientes: suma("clientes"), facturas: suma("facturas"), nc: suma("nc"), subtotal: suma("subtotal"), total: suma("total") };
    });
  }, [data]);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-3xl font-black text-slate-900">Clientes del mes</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Quién compró en el período, sus facturas y qué compró en cada una
          {sedeFija != null ? ` · ${SEDES[sedeFija]}` : ""}.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-3 bg-white p-4 rounded-2xl border border-zinc-100 shadow-sm md:items-center">
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Desde
          <input
            type="month"
            className={campo}
            value={desde}
            max={MES_ACTUAL}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              setDesde(v);
              if (v > hasta) setHasta(v);
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          hasta
          <input
            type="month"
            className={campo}
            value={hasta}
            min={desde}
            max={MES_ACTUAL}
            onChange={(e) => e.target.value && setHasta(e.target.value < desde ? desde : e.target.value)}
          />
        </label>
        {desde !== hasta && <span className="text-xs text-zinc-400">Hasta {MAX_MESES} meses.</span>}
        {sedeFija == null && (
          <select className={campo} value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede">
            <option value="">Todas las sedes</option>
            {Object.entries(SEDES).map(([id, n]) => (
              <option key={id} value={id}>{n}</option>
            ))}
          </select>
        )}
        <a
          href={`/api/adminleads/compras-mes/export?${qs}`}
          className="md:ml-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
        >
          <Download className="w-3.5 h-3.5" /> Exportar Excel
        </a>
      </div>

      {error && <p className="text-sm font-semibold text-red-500">{error}</p>}
      {cargando && !data && (
        <div className="flex items-center justify-center py-20 text-zinc-400 text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-3" /> Leyendo la facturación de Odoo…
        </div>
      )}

      {r && data && (
        <div className={cargando ? "opacity-50 pointer-events-none transition-opacity" : ""}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["Clientes que compraron", r.clientes.toLocaleString()],
              ["Facturas", r.facturas.toLocaleString()],
              ["Monto sin IVA", usd(r.subtotal)],
              ["Total con IVA", usd(r.total)],
            ].map(([k, v]) => (
              <div key={k} className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">{k}</p>
                <p className="text-xl font-black text-zinc-800 mt-1 tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-400 mt-2">
            Facturas de cliente de Odoo por fecha de factura, sin empresas del grupo. Las notas de crédito del período
            salen en la lista del cliente y restan. Montos en USD.
            {porMes.length > 0 && " En el total del período cada cliente cuenta una vez aunque haya comprado varios meses."}
          </p>

          {porMes.length > 0 && (
            <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-zinc-400 bg-zinc-50">
                  <tr>
                    <th className="text-left px-3 py-2">Mes</th>
                    <th className="text-right px-3 py-2">Clientes</th>
                    <th className="text-right px-3 py-2">Facturas</th>
                    <th className="text-right px-3 py-2">Notas de crédito</th>
                    <th className="text-right px-3 py-2">Sin IVA</th>
                    <th className="text-right px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {porMes.map((m) => (
                    <tr key={m.mes} className="border-t border-zinc-100">
                      <td className="px-3 py-2 font-semibold text-zinc-700 capitalize">{nombreMes(m.mes)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.clientes.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.facturas.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.nc.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{usd(m.subtotal)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{usd(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm mt-4">
            <div className="p-4 flex items-center gap-3 border-b border-zinc-100">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                <input
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 rounded-xl text-sm border-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Buscar cliente, RIF, factura o producto…"
                  value={buscar}
                  onChange={(e) => setBuscar(e.target.value)}
                />
              </div>
              <span className="text-xs text-zinc-400">{clientes.length} clientes</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-zinc-400 bg-zinc-50">
                  <tr>
                    <th className="w-8" />
                    <th className="text-left px-3 py-2">Cliente</th>
                    <th className="text-left px-3 py-2">RIF</th>
                    {variasSedes && <th className="text-left px-3 py-2">Sede</th>}
                    <th className="text-right px-3 py-2">Facturas</th>
                    <th className="text-right px-3 py-2">Sin IVA</th>
                    <th className="text-right px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c) => {
                    const llave = `${c.sede}|${c.id}`;
                    const ver = abierto === llave;
                    return (
                      <Fragment key={llave}>
                        <tr
                          className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer"
                          onClick={() => setAbierto(ver ? null : llave)}
                        >
                          <td className="pl-3 text-zinc-400">
                            {ver ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-3 py-2 font-semibold text-zinc-800">{c.cliente}</td>
                          <td className="px-3 py-2 text-zinc-500">{c.rif}</td>
                          {variasSedes && <td className="px-3 py-2 text-zinc-500">{SEDES[c.sede]}</td>}
                          <td className="px-3 py-2 text-right tabular-nums">{c.facturas.length}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{usd(c.subtotal)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{usd(c.total)}</td>
                        </tr>
                        {ver && (
                          <tr className="bg-zinc-50/60">
                            <td />
                            <td colSpan={columnas - 1} className="px-3 py-2">
                              <FacturasCliente c={c} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {clientes.length === 0 && (
                    <tr>
                      <td colSpan={columnas} className="px-3 py-10 text-center text-zinc-400">
                        Ningún cliente compró en este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
