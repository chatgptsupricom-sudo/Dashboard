"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Coins, HandCoins, Package, Receipt, Search, TrendingUp } from "lucide-react";
import { descargarExcel } from "@/lib/excel";
import { etiquetaAsignacion, nombreSedeGerente, type DatosVentas, type VentaProducto } from "@/lib/gerente-marca/tipos";
import {
  Aviso, Codigo, BotonExcel, BotonRecargar, Cargando, dinero, dineroCorto, Encabezado, fecha, MarcasEnVista, nombreMes,
  porcentaje, SelectorGerente, SelectorSede, Tarjeta, Th, unidades, useDatos, useFiltros, useOrden,
} from "./comunes";

/**
 * Ventas por marca del Gerente de Marca: por marca y por número de parte, lo
 * facturado (sin IVA) y lo cobrado de esas facturas, en Valencia y Caracas.
 * Datos: /api/gerente-marca/ventas.
 */

type Modo = "mes" | "6m" | "anio";
type Col = "codigo" | "nombre" | "unidades" | "facturado" | "cobrado" | "pct";

const MIN_MES = "2026-04";
const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
const hoyCaracas = () => new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
const moverMes = (mes: string, delta: number) => {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const finMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

function rango(modo: Modo, mes: string): { desde: string; hasta: string } {
  const hoy = hoyCaracas();
  if (modo === "anio") return { desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy };
  if (modo === "6m") return { desde: `${moverMes(hoy.slice(0, 7), -5)}-01`, hasta: hoy };
  const hasta = finMes(mes);
  return { desde: `${mes}-01`, hasta: hasta > hoy ? hoy : hasta };
}

interface Agregado {
  unidades: number;
  facturado: number;
  cobrado: number;
  facturas: number;
}

const vacio = (): Agregado => ({ unidades: 0, facturado: 0, cobrado: 0, facturas: 0 });
const sumar = (a: Agregado, v: VentaProducto) => {
  a.unidades += v.unidades;
  a.facturado += v.facturado;
  a.cobrado += v.cobrado;
  a.facturas += v.facturas;
};
const pctCobrado = (a: Agregado) => (a.facturado > 0 ? (a.cobrado / a.facturado) * 100 : null);

export function Ventas() {
  const f = useFiltros();
  const [modo, setModo] = useState<Modo>("mes");
  const [mes, setMes] = useState(() => hoyCaracas().slice(0, 7));
  const r = rango(modo, mes);
  const { data, cargando, error, recargar } = useDatos<DatosVentas>(`/api/gerente-marca/ventas?${f.query}&desde=${r.desde}&hasta=${r.hasta}`);
  const [marca, setMarca] = useState<number | null>(null);
  const [buscar, setBuscar] = useState("");
  const { orden, alternar, ordenar } = useOrden<Col>({ col: "facturado", desc: true });

  const sedes = data?.sedes ?? [];
  const variasSedes = sedes.length > 1;

  const porMarca = useMemo(() => {
    if (!data) return [];
    return data.asignaciones.map((a) => {
      const total = vacio();
      const porSede = new Map<number, Agregado>();
      for (const v of data.filas.filter((x) => x.marcaId === a.marcaId)) {
        sumar(total, v);
        const s = porSede.get(v.companyId) ?? vacio();
        sumar(s, v);
        porSede.set(v.companyId, s);
      }
      return { marcaId: a.marcaId, etiqueta: etiquetaAsignacion(a), total, porSede };
    }).sort((x, y) => y.total.facturado - x.total.facturado);
  }, [data]);

  const total = porMarca.reduce((t, m) => {
    t.unidades += m.total.unidades;
    t.facturado += m.total.facturado;
    t.cobrado += m.total.cobrado;
    return t;
  }, vacio());

  /** Una fila por número de parte (las sedes sumadas). */
  const productos = useMemo(() => {
    const m = new Map<number, { v: VentaProducto; total: Agregado; porSede: Map<number, Agregado> }>();
    for (const v of data?.filas ?? []) {
      const x = m.get(v.productoId) ?? { v, total: vacio(), porSede: new Map<number, Agregado>() };
      sumar(x.total, v);
      const s = x.porSede.get(v.companyId) ?? vacio();
      sumar(s, v);
      x.porSede.set(v.companyId, s);
      m.set(v.productoId, x);
    }
    return [...m.values()];
  }, [data]);

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const lista = productos.filter((x) =>
      (marca == null || x.v.marcaId === marca) &&
      (!q || x.v.codigo.toLowerCase().includes(q) || x.v.nombre.toLowerCase().includes(q)),
    );
    return ordenar(lista, (x, col) =>
      col === "codigo" ? x.v.codigo : col === "nombre" ? x.v.nombre : col === "pct" ? pctCobrado(x.total) ?? -1 : x.total[col]);
  }, [productos, marca, buscar, ordenar]);

  const textoRango = data ? `del ${fecha(data.desde)} al ${fecha(data.hasta)}` : "";

  const exportar = () => {
    if (!data) return;
    descargarExcel(`ventas-por-marca-${data.desde}-a-${data.hasta}`, [
      {
        nombre: "Por marca",
        filas: porMarca.map((m) => ({
          Marca: m.etiqueta,
          Unidades: m.total.unidades,
          ...(variasSedes ? Object.fromEntries(sedes.map((s) => [`Facturado ${nombreSedeGerente(s)} USD`, Math.round((m.porSede.get(s)?.facturado ?? 0) * 100) / 100])) : {}),
          "Monto facturado USD": Math.round(m.total.facturado * 100) / 100,
          "Monto cobrado USD": Math.round(m.total.cobrado * 100) / 100,
          "% cobrado": pctCobrado(m.total) == null ? "" : Math.round(pctCobrado(m.total)! * 10) / 10,
          "Por cobrar USD": Math.round((m.total.facturado - m.total.cobrado) * 100) / 100,
        })),
      },
      {
        nombre: "Por número de parte",
        filas: [...data.filas].sort((a, b) => a.marca.localeCompare(b.marca) || b.facturado - a.facturado).map((v) => ({
          Sede: nombreSedeGerente(v.companyId),
          Marca: v.marca,
          Categoría: v.categoria,
          "Número de parte": v.codigo,
          Descripción: v.nombre,
          Unidades: v.unidades,
          Facturas: v.facturas,
          "Monto facturado USD": v.facturado,
          "Monto cobrado USD": v.cobrado,
          "Por cobrar USD": Math.round((v.facturado - v.cobrado) * 100) / 100,
        })),
      },
    ]);
  };

  const mesHoy = hoyCaracas().slice(0, 7);

  return (
    <div className="space-y-6">
      <Encabezado icono={TrendingUp} titulo="Ventas por marca" subtitulo="Lo facturado de mis marcas y cuánto de eso ya se cobró">
        {f.esSuper && <SelectorGerente gerente={f.gerente} setGerente={f.setGerente} />}
        <SelectorSede sede={f.sede} setSede={f.setSede} />
        <div className="bg-white border rounded-xl p-1 flex items-center gap-0.5 shadow-sm" role="group" aria-label="Período">
          {([["mes", "Mes"], ["6m", "Últimos 6 meses"], ["anio", "Año"]] as [Modo, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setModo(id)} className={`h-8 px-3 rounded-lg text-xs font-bold transition ${modo === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              {label}
            </button>
          ))}
        </div>
        {modo === "mes" && (
          <div className="bg-white border rounded-xl p-1 flex items-center shadow-sm">
            <button onClick={() => setMes(moverMes(mes, -1))} disabled={mes <= MIN_MES} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
            <label className="flex items-center gap-2 px-2 text-sm font-bold text-slate-700 cursor-pointer">
              <CalendarDays size={15} className="text-slate-400" />
              <input
                type="month"
                value={mes}
                min={MIN_MES}
                max={mesHoy}
                aria-label="Mes"
                onChange={(e) => { const v = e.target.value; if (MES_VALIDO.test(v) && v >= MIN_MES && v <= mesHoy) setMes(v); }}
                className="bg-transparent outline-none cursor-pointer"
              />
            </label>
            <button onClick={() => setMes(moverMes(mes, 1))} disabled={mes >= mesHoy} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
          </div>
        )}
        <BotonRecargar onClick={recargar} cargando={cargando} />
        <BotonExcel onClick={exportar} disabled={!data || cargando} />
      </Encabezado>

      {error && <Aviso error={error} onReintentar={recargar} />}

      {cargando && !data ? (
        <Cargando texto="Leyendo las facturas de Odoo…" />
      ) : data ? (
        <div className={`space-y-6 transition-opacity ${cargando ? "opacity-60 pointer-events-none" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MarcasEnVista asignaciones={data.asignaciones} sedes={data.sedes} esSuper={f.esSuper} />
            <p className="text-xs font-semibold text-slate-600">{modo === "mes" ? nombreMes(mes) : textoRango}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Tarjeta icono={Receipt} titulo="Facturado" valor={dineroCorto(total.facturado)} pie={`Sin IVA, ${textoRango}`} acento="bg-blue-50 text-blue-600" />
            <Tarjeta icono={HandCoins} titulo="Cobrado" valor={dineroCorto(total.cobrado)} pie={`${porcentaje(pctCobrado(total))} de lo facturado`} acento="bg-emerald-50 text-emerald-600" />
            <Tarjeta icono={Coins} titulo="Por cobrar" valor={dineroCorto(total.facturado - total.cobrado)} pie="De esas mismas facturas" acento="bg-amber-50 text-amber-600" />
            <Tarjeta icono={Package} titulo="Unidades" valor={unidades(total.unidades)} pie={`${productos.length} números de parte vendidos`} acento="bg-violet-50 text-violet-600" />
          </div>

          {/* Por marca */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Por marca</h2>
              {marca != null && <button onClick={() => setMarca(null)} className="text-xs font-semibold text-blue-600 hover:underline">Ver todas</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 text-left">Marca</th>
                    <th className="px-3 py-2.5 text-right">Unidades</th>
                    {variasSedes && sedes.map((s) => <th key={s} className="px-3 py-2.5 text-right">Fact. {nombreSedeGerente(s)}</th>)}
                    <th className="px-3 py-2.5 text-right">Facturado</th>
                    <th className="px-3 py-2.5 text-right">Cobrado</th>
                    <th className="px-3 py-2.5 text-left min-w-[160px]">% cobrado</th>
                    <th className="px-3 py-2.5 text-right">Por cobrar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {porMarca.map((m) => {
                    const pct = pctCobrado(m.total);
                    return (
                      <tr key={m.marcaId} onClick={() => setMarca(marca === m.marcaId ? null : m.marcaId)} className={`cursor-pointer tabular-nums ${marca === m.marcaId ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                        <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{m.etiqueta}</td>
                        <td className="px-3 py-2.5 text-right">{unidades(m.total.unidades)}</td>
                        {variasSedes && sedes.map((s) => <td key={s} className="px-3 py-2.5 text-right text-slate-500">{dinero(m.porSede.get(s)?.facturado ?? 0)}</td>)}
                        <td className="px-3 py-2.5 text-right font-semibold">{dinero(m.total.facturado)}</td>
                        <td className="px-3 py-2.5 text-right">{dinero(m.total.cobrado)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, pct ?? 0))}%` }} />
                            </div>
                            <span className="text-xs text-slate-600 w-12 text-right">{porcentaje(pct)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-600">{dinero(m.total.facturado - m.total.cobrado)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-bold tabular-nums">
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right">{unidades(total.unidades)}</td>
                    {variasSedes && sedes.map((s) => (
                      <td key={s} className="px-3 py-2.5 text-right">{dinero(porMarca.reduce((t, m) => t + (m.porSede.get(s)?.facturado ?? 0), 0))}</td>
                    ))}
                    <td className="px-3 py-2.5 text-right">{dinero(total.facturado)}</td>
                    <td className="px-3 py-2.5 text-right">{dinero(total.cobrado)}</td>
                    <td className="px-3 py-2.5 text-xs">{porcentaje(pctCobrado(total))}</td>
                    <td className="px-3 py-2.5 text-right">{dinero(total.facturado - total.cobrado)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Por número de parte */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-800 mr-auto">Por número de parte ({visibles.length})</h2>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Número de parte o nombre" className="h-9 w-56 rounded-lg border border-slate-200 pl-8 pr-2 text-sm outline-none focus:border-blue-400" />
              </div>
              <select value={marca ?? ""} onChange={(e) => setMarca(e.target.value ? Number(e.target.value) : null)} aria-label="Marca" className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                <option value="">Todas las marcas</option>
                {data.asignaciones.map((a) => <option key={a.marcaId} value={a.marcaId}>{etiquetaAsignacion(a)}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <Th col="codigo" orden={orden} alternar={alternar} derecha={false}>Nº de parte</Th>
                    <Th col="nombre" orden={orden} alternar={alternar} derecha={false}>Descripción</Th>
                    <Th col="unidades" orden={orden} alternar={alternar}>Unidades</Th>
                    <Th col="facturado" orden={orden} alternar={alternar}>Facturado</Th>
                    <Th col="cobrado" orden={orden} alternar={alternar}>Cobrado</Th>
                    <Th col="pct" orden={orden} alternar={alternar}>% cobrado</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibles.map((x) => (
                    <tr key={x.v.productoId} className="hover:bg-slate-50 tabular-nums">
                      <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap"><Codigo v={x.v.codigo} /></td>
                      <td className="px-3 py-2 min-w-[260px]">
                        <p className="text-slate-800 leading-snug">{x.v.nombre}</p>
                        <p className="text-[11px] text-slate-400">
                          {x.v.marca} · {x.v.categoria}
                          {variasSedes && ` · ${sedes.filter((s) => x.porSede.has(s)).map((s) => `${nombreSedeGerente(s)} ${dineroCorto(x.porSede.get(s)!.facturado)}`).join(" · ")}`}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right">{unidades(x.total.unidades)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{dinero(x.total.facturado)}</td>
                      <td className="px-3 py-2 text-right">{dinero(x.total.cobrado)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{porcentaje(pctCobrado(x.total))}</td>
                    </tr>
                  ))}
                  {visibles.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-400">No hay ventas con esos filtros</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Facturado = facturas de cliente publicadas menos notas de crédito, sin IVA, en dólares, por fecha de factura y sin ventas entre empresas del grupo.
            Cobrado = la parte de cada factura que ya está pagada, repartida entre sus productos (una factura cobrada a medias cuenta la mitad de cada línea), al día de hoy.
            Odoo factura desde abril de 2026: lo anterior está en Smartbit y no sale aquí.
          </p>
        </div>
      ) : null}
    </div>
  );
}
