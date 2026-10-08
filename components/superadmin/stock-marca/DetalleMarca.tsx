"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Loader2, Search } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Delta, GraficoMeses } from "./Resumen";
import { BarraVendido, ChipEstado } from "./TablaMarcas";
import {
  cobertura, dinero, fechaCorta, porcentaje, textoPeriodo, unidadesFmt,
  type DatosStock, type FilaMarca, type FilaProducto,
} from "./formato";

function Dato({ label, valor, sub }: { label: string; valor: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-black text-slate-900 tabular-nums truncate">{valor}</p>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

type Vista = "todos" | "sin_venta" | "agotados" | "vendidos";
type OrdenP = "nombre" | "stock" | "vendido" | "pct" | "valor" | "cobertura";

const VISTAS: { id: Vista; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "vendidos", label: "Con venta" },
  { id: "sin_venta", label: "Con stock sin venta" },
  { id: "agotados", label: "Agotados" },
];

function TablaProductos({ productos, multiSede, sedes, hayDisponible }: {
  productos: FilaProducto[]; multiSede: boolean; sedes: DatosStock["sedes"]; hayDisponible: boolean;
}) {
  const [vista, setVista] = useState<Vista>("todos");
  const [q, setQ] = useState("");
  const [orden, setOrden] = useState<OrdenP>("stock");
  const [asc, setAsc] = useState(false);
  const nombreSede = (id: number) => sedes.find((s) => s.id === id)?.nombre ?? "";

  const conteo = useMemo(() => ({
    todos: productos.length,
    vendidos: productos.filter((p) => p.vendido > 0).length,
    sin_venta: productos.filter((p) => p.stock > 0 && p.vendido <= 0).length,
    agotados: productos.filter((p) => p.stock <= 0 && p.vendido > 0).length,
  }), [productos]);

  const filas = useMemo(() => {
    const t = q.trim().toLowerCase();
    let xs = productos;
    if (vista === "vendidos") xs = xs.filter((p) => p.vendido > 0);
    if (vista === "sin_venta") xs = xs.filter((p) => p.stock > 0 && p.vendido <= 0);
    if (vista === "agotados") xs = xs.filter((p) => p.stock <= 0 && p.vendido > 0);
    if (t) xs = xs.filter((p) => `${p.codigo} ${p.nombre}`.toLowerCase().includes(t));
    const val = (p: FilaProducto) => (orden === "nombre" ? p.nombre : orden === "cobertura" ? p.cobertura ?? Infinity : (p[orden] as number | null) ?? -Infinity);
    return [...xs].sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return asc ? c : -c;
    });
  }, [productos, vista, q, orden, asc]);

  const th = (key: OrdenP, label: string, align = "text-right") => (
    <th className={`px-2 py-2 ${align} whitespace-nowrap`}>
      <button onClick={() => { if (orden === key) setAsc(!asc); else { setOrden(key); setAsc(key === "nombre" || key === "cobertura"); } }}
        className={`inline-flex items-center gap-1 uppercase hover:text-slate-800 ${orden === key ? "text-slate-800" : ""}`}>
        {label}{orden === key && (asc ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
      </button>
    </th>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {VISTAS.map((v) => (
            <button key={v.id} onClick={() => setVista(v.id)}
              className={`h-7 px-2.5 rounded-lg text-xs font-semibold ${vista === v.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {v.label} <span className="opacity-70 tabular-nums">{conteo[v.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código o producto…" aria-label="Buscar producto"
            className="h-7 w-44 pl-7 pr-2 text-xs rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/30" />
        </div>
      </div>
      <div className="border border-slate-200 rounded-xl overflow-auto max-h-[420px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-[10px] font-semibold tracking-wide text-slate-500">
              {th("nombre", "Producto", "text-left")}
              {th("stock", "Stock")}
              {th("vendido", "Vendido")}
              {th("pct", "%")}
              {th("cobertura", "Le alcanza")}
              {th("valor", "Valor")}
              <th className="px-2 py-2 text-right uppercase whitespace-nowrap">Última venta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.slice(0, 300).map((p) => (
              <tr key={`${p.companyId}-${p.id}`} className="align-top">
                <td className="px-2 py-1.5 max-w-[240px]">
                  <p className="truncate text-slate-800" title={p.nombre}>{p.nombre}</p>
                  <p className="text-[10px] text-slate-400">
                    {p.codigo || `#${p.id}`}{multiSede ? ` · ${nombreSede(p.companyId)}` : ""}
                    {!p.activo && <span className="ml-1 rounded bg-amber-50 px-1 text-amber-700">archivado</span>}
                    {p.stock > 0 && p.costo <= 0 && <span className="ml-1 rounded bg-amber-50 px-1 text-amber-700">sin costo</span>}
                  </p>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <p className="font-semibold text-slate-900">{unidadesFmt(p.stock)}</p>
                  {hayDisponible && p.disponible != null && p.disponible !== p.stock && <p className="text-[10px] text-slate-400">{unidadesFmt(p.disponible)} disp.</p>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  <p className={p.vendido < 0 ? "text-red-600" : "text-slate-800"}>{unidadesFmt(p.vendido)}</p>
                  {p.ventaUsd !== 0 && <p className="text-[10px] text-slate-400">{dinero(p.ventaUsd)}</p>}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-blue-700">{porcentaje(p.pct, p.pct != null && p.pct < 10 ? 1 : 0)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{p.stock <= 0 ? "–" : p.cobertura == null ? <span className="text-slate-400">No vendió</span> : cobertura(p.cobertura)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{p.stock > 0 ? dinero(p.valor) : "–"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500 whitespace-nowrap">{p.ultimaVenta ? fechaCorta(p.ultimaVenta, true) : <span className="text-slate-400">Desde abr-26 no</span>}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400">No hay productos para este filtro.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">
        {filas.length > 300 ? `Mostrando 300 de ${filas.length}. ` : ""}
        Última venta = factura de cliente más reciente en Odoo (desde abril 2026), sin empresas del grupo. Valor = stock × costo.
      </p>
    </div>
  );
}

export function DetalleMarca({ data, fila, query, onClose }: { data: DatosStock; fila: FilaMarca | null; query: string; onClose: () => void }) {
  const [productos, setProductos] = useState<FilaProducto[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clave = fila?.clave ?? null;

  useEffect(() => {
    if (!clave) return;
    let cancelado = false;
    setProductos(null);
    setError(null);
    setCargando(true);
    fetch(`/api/superadmin/stock-marca?${query}&marca=${encodeURIComponent(clave)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && j?.success) setProductos(j.data.productos || []);
        else setError(j?.error || "No se pudieron leer los productos");
      })
      .catch(() => { if (!cancelado) setError("No se pudieron leer los productos"); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [clave, query]);

  const p = data.periodo;
  const total = fila ? Math.max(0, fila.vendido) + fila.stock : 0;
  const multiSede = data.sedes.length > 1;

  return (
    <Sheet open={!!fila} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0">
        {fila && (
          <>
            <SheetHeader className="border-b border-slate-100 p-5">
              <div className="flex items-center gap-3 flex-wrap">
                <SheetTitle className="text-xl font-black">{fila.marca}</SheetTitle>
                <ChipEstado estado={fila.estado} />
              </div>
              <SheetDescription>
                {textoPeriodo(p.desde, p.corte)} · {data.sedes.map((s) => s.nombre).join(", ")} · {fila.productos} productos ({fila.conStock} con stock)
              </SheetDescription>
            </SheetHeader>

            <div className="p-5 space-y-6">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-slate-500">Se vendió <b className="text-slate-800">{unidadesFmt(Math.max(0, fila.vendido))}</b> de <b className="text-slate-800">{unidadesFmt(total)}</b> unidades que hubo</span>
                  <span className="flex items-center gap-2">
                    <Delta actual={fila.pct} anterior={fila.pctAnterior} />
                    <span className="text-3xl font-black tabular-nums text-blue-700">{porcentaje(fila.pct, 1)}</span>
                  </span>
                </div>
                <div className="h-3"><BarraVendido vendido={fila.vendido} stock={fila.stock} /></div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Dato label={p.enCurso ? "Stock hoy" : "Stock al cierre"} valor={`${unidadesFmt(fila.stock)} u`}
                  sub={<>{porcentaje(fila.participacionStock, 1)} del stock de {multiSede ? "las sedes" : "la sede"}{fila.disponible != null && fila.disponible !== fila.stock ? ` · ${unidadesFmt(fila.disponible)} disponibles` : ""}</>} />
                <Dato label="Vendido" valor={`${unidadesFmt(fila.vendido)} u`} sub={`${dinero(fila.ventaUsd)} sin IVA`} />
                <Dato label="Valor del stock" valor={dinero(fila.valor)} sub={fila.sinCosto ? `${fila.sinCosto} productos sin costo no suman` : "al costo"} />
                <Dato label="Le alcanza" valor={fila.stock <= 0 ? "Agotada" : fila.cobertura == null ? "No vendió" : cobertura(fila.cobertura)} sub={`al ritmo de venta del período (${p.dias} días)`} />
                <Dato label="Stock sin venta" valor={dinero(fila.valorSinVenta)} sub={`${fila.sinVenta} productos con stock sin vender`} />
                <Dato label="Período anterior" valor={porcentaje(fila.pctAnterior, 1)} sub={p.anterior ? `${fechaCorta(p.anterior.desde)}–${fechaCorta(p.anterior.corte)}` : "Sin datos antes de abril 2026"} />
              </div>

              {multiSede && fila.porSede.length > 0 && (
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-2">Por sede</p>
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                    {fila.porSede.map((s) => (
                      <div key={s.companyId} className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[110px_1fr_auto_auto_auto] items-center gap-3 px-3 py-2 text-sm">
                        <span className="font-semibold text-slate-700">{s.sede}</span>
                        <span className="hidden sm:block"><BarraVendido vendido={s.vendido} stock={s.stock} /></span>
                        <span className="tabular-nums text-slate-600 text-right">{unidadesFmt(s.stock)} u stock</span>
                        <span className="tabular-nums text-slate-600 text-right">{unidadesFmt(s.vendido)} u vend.</span>
                        <span className="tabular-nums font-bold text-blue-700 text-right w-14">{porcentaje(s.pct, 1)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-bold text-slate-800 mb-2">Mes a mes</p>
                <GraficoMeses serie={fila.serie} corte={p.corte} alto={200} />
              </div>

              <div>
                <p className="text-sm font-bold text-slate-800 mb-2">Productos</p>
                {cargando && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Cargando productos…</div>}
                {error && <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"><AlertTriangle size={16} /> {error}</div>}
                {productos && <TablaProductos productos={productos} multiSede={multiSede} sedes={data.sedes} hayDisponible={data.totales.disponible != null} />}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
