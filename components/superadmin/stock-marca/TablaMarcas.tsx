"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import { Delta } from "./Resumen";
import {
  ESTADO_UI, ORDEN_ESTADOS, cobertura, dinero, porcentaje, unidadesFmt, COLOR_STOCK, COLOR_VENDIDO,
  type DatosStock, type EstadoStock, type FilaMarca,
} from "./formato";

type Orden = "marca" | "stock" | "vendido" | "pct" | "valor" | "cobertura" | "valorSinVenta" | "participacionStock";

/** La barra entera es el 100% (vendido + stock); el azul es lo vendido. */
export function BarraVendido({ vendido, stock }: { vendido: number; stock: number }) {
  const v = Math.max(0, vendido);
  const total = v + stock;
  const p = total > 0 ? (v / total) * 100 : 0;
  return (
    <div className="h-2 rounded-full overflow-hidden flex gap-px" style={{ background: total > 0 ? COLOR_STOCK : "#f1f5f9" }}
      title={total > 0 ? `${unidadesFmt(v)} vendidas de ${unidadesFmt(total)}` : "Sin stock ni venta"}>
      {p > 0 && <div className="h-full rounded-full" style={{ width: `${p}%`, minWidth: 3, background: COLOR_VENDIDO }} />}
    </div>
  );
}

export function ChipEstado({ estado }: { estado: EstadoStock }) {
  const ui = ESTADO_UI[estado];
  const Icono = ui.icono;
  return (
    <span title={ui.ayuda} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${ui.chip}`}>
      <Icono size={12} /> {ui.label}
    </span>
  );
}

export function TablaMarcas({ data, filtro, setFiltro, onAbrir }: {
  data: DatosStock;
  filtro: EstadoStock | "todas";
  setFiltro: (e: EstadoStock | "todas") => void;
  onAbrir: (f: FilaMarca) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("stock");
  const [asc, setAsc] = useState(false);
  const hayDisponible = data.totales.disponible != null;
  const hayAnterior = data.totales.pctAnterior != null;

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let xs = data.marcas;
    if (filtro !== "todas") xs = xs.filter((m) => m.estado === filtro);
    if (q) xs = xs.filter((m) => m.marca.toLowerCase().includes(q));
    // Sin cobertura (no vendió) va al final al ordenar de menor a mayor.
    const val = (m: FilaMarca) =>
      orden === "marca" ? m.marca : orden === "cobertura" ? m.cobertura ?? Infinity : (m[orden] as number | null) ?? -Infinity;
    return [...xs].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return asc ? c : -c;
    });
  }, [data.marcas, busqueda, orden, asc, filtro]);

  const tot = useMemo(() => {
    const s = { stock: 0, vendido: 0, valor: 0, ventaUsd: 0, valorSinVenta: 0 };
    for (const m of filas) { s.stock += m.stock; s.vendido += m.vendido; s.valor += m.valor; s.ventaUsd += m.ventaUsd; s.valorSinVenta += m.valorSinVenta; }
    return s;
  }, [filas]);

  const th = (key: Orden, label: string, align = "text-right") => (
    <th className={`px-3 py-2.5 ${align} whitespace-nowrap`}>
      <button
        onClick={() => { if (orden === key) setAsc(!asc); else { setOrden(key); setAsc(key === "marca" || key === "cobertura"); } }}
        className={`inline-flex items-center gap-1 uppercase hover:text-slate-800 ${orden === key ? "text-slate-800" : ""}`}
      >
        {label}
        {orden === key && (asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </button>
    </th>
  );

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div className="flex flex-wrap items-center gap-1.5">
          {(["todas", ...ORDEN_ESTADOS] as const).map((e) => (
            <button
              key={e}
              onClick={() => setFiltro(e)}
              className={`h-8 px-3 rounded-lg text-xs font-semibold transition ${filtro === e ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              {e === "todas" ? `Todas ${data.marcas.length}` : <>{ESTADO_UI[e].label}<span className="ml-1.5 opacity-70 tabular-nums">{data.totales.conteo[e]}</span></>}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar marca…"
            aria-label="Buscar marca"
            className="h-8 w-48 pl-8 pr-3 text-sm rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1080px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold tracking-wide text-slate-500">
              {th("marca", "Marca", "text-left")}
              {th("stock", data.periodo.enCurso ? "Stock hoy" : "Stock al cierre")}
              {th("vendido", "Vendido")}
              {th("pct", "% vendido")}
              <th className="px-3 py-2.5 text-left w-[160px] uppercase">Vendido vs stock</th>
              {th("valor", "Valor stock")}
              {th("cobertura", "Le alcanza")}
              {th("valorSinVenta", "Sin venta")}
              {th("participacionStock", "% del stock")}
              <th className="px-3 py-2.5 text-left uppercase">Estado</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((m) => (
              <tr key={m.clave} onClick={() => onAbrir(m)} className="cursor-pointer hover:bg-slate-50/80 transition-colors">
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onAbrir(m); }}
                    className="font-semibold text-slate-800 text-left hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                  >
                    {m.marca}
                  </button>
                  <p className="text-[11px] text-slate-400">{m.conStock} con stock · {m.productos} productos{m.generica && m.clave !== "SIN MARCA" ? " · genérica" : ""}</p>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <p className="font-semibold text-slate-900">{unidadesFmt(m.stock)}</p>
                  {hayDisponible && m.disponible != null && m.disponible !== m.stock && <p className="text-[11px] text-slate-400">{unidadesFmt(m.disponible)} disp.</p>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <p className="font-semibold text-slate-900">{unidadesFmt(m.vendido)}</p>
                  <p className="text-[11px] text-slate-400">{dinero(m.ventaUsd)}</p>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <p className="font-black text-blue-700">{porcentaje(m.pct, 1)}</p>
                  {hayAnterior && <Delta actual={m.pct} anterior={m.pctAnterior} />}
                </td>
                <td className="px-3 py-2.5"><BarraVendido vendido={m.vendido} stock={m.stock} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{dinero(m.valor)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{m.stock <= 0 ? "–" : m.cobertura == null ? <span className="text-slate-400">No vendió</span> : cobertura(m.cobertura)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {m.sinVenta > 0 ? (
                    <>
                      <p className="text-slate-700">{dinero(m.valorSinVenta)}</p>
                      <p className="text-[11px] text-slate-400">{m.sinVenta} {m.sinVenta === 1 ? "producto" : "productos"}</p>
                    </>
                  ) : <span className="text-slate-300">–</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{porcentaje(m.participacionStock, 1)}</td>
                <td className="px-3 py-2.5"><ChipEstado estado={m.estado} /></td>
                <td className="pr-3 text-slate-300"><ChevronRight size={16} /></td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr><td colSpan={11} className="py-12 text-center text-sm text-slate-400">No hay marcas para este filtro.</td></tr>
            )}
          </tbody>
          {filas.length > 1 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/60 text-sm font-bold text-slate-800">
                <td className="px-3 py-2.5">Total ({filas.length} marcas)</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{unidadesFmt(tot.stock)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{unidadesFmt(tot.vendido)}<p className="text-[11px] font-normal text-slate-400">{dinero(tot.ventaUsd)}</p></td>
                <td className="px-3 py-2.5 text-right tabular-nums text-blue-700">{porcentaje(Math.max(0, tot.vendido) + tot.stock > 0 ? (Math.max(0, tot.vendido) / (Math.max(0, tot.vendido) + tot.stock)) * 100 : null, 1)}</td>
                <td className="px-3 py-2.5"><BarraVendido vendido={tot.vendido} stock={tot.stock} /></td>
                <td className="px-3 py-2.5 text-right tabular-nums">{dinero(tot.valor)}</td>
                <td />
                <td className="px-3 py-2.5 text-right tabular-nums">{dinero(tot.valorSinVenta)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="px-4 py-3 border-t border-slate-100 text-[11px] leading-relaxed text-slate-400">
        % vendido = vendido ÷ (vendido + stock {data.periodo.enCurso ? "de hoy" : "al cierre"}): de todo lo que hubo de la marca en el período, cuánto se vendió.
        Vendido = unidades facturadas menos las devueltas en notas de crédito, sin ventas a empresas del grupo{data.incluyeIntercompania ? " (ahora incluidas por el filtro)" : ""}.
        Le alcanza = días que dura el stock al ritmo de venta del período. Sin venta = stock de productos que no vendieron ni una unidad, al costo.
        {hayAnterior && " La flecha compara con el mismo tramo del período anterior."}
      </p>
    </div>
  );
}
