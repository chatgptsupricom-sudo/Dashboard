"use client";

import { useMemo, useState } from "react";
import { Boxes, Coins, PackageCheck, Search, Truck, Warehouse } from "lucide-react";
import { descargarExcel } from "@/lib/excel";
import { etiquetaAsignacion, nombreSedeGerente, type DatosInventario } from "@/lib/gerente-marca/tipos";
import {
  Aviso, Codigo, BotonExcel, BotonRecargar, Cargando, combinar, dinero, dineroCorto, Encabezado, MarcasEnVista,
  porcentaje, SelectorGerente, SelectorSede, Tarjeta, Th, unidades, useDatos, useFiltros, useOrden,
  type Combinado,
} from "./comunes";

/**
 * Inventario de las marcas del Gerente de Marca en Valencia y Caracas:
 * existencia, reservado, disponible, por llegar y valor al costo, por marca
 * y por producto. Datos: /api/gerente-marca/inventario.
 */

type ColProd = "codigo" | "nombre" | "fisico" | "disponible" | "transito" | "costo" | "valor";

interface FilaMarca {
  marcaId: number;
  etiqueta: string;
  productos: number;
  conStock: number;
  fisico: number;
  reservado: number;
  disponible: number;
  transito: number;
  valor: number;
}

export function Inventario() {
  const f = useFiltros();
  const { data, cargando, error, recargar } = useDatos<DatosInventario>(`/api/gerente-marca/inventario?${f.query}`);
  const [marca, setMarca] = useState<number | null>(null);
  const [categoria, setCategoria] = useState("");
  const [buscar, setBuscar] = useState("");
  const [soloStock, setSoloStock] = useState(true);
  const { orden, alternar, ordenar } = useOrden<ColProd>({ col: "valor", desc: true });

  const filas = useMemo(() => (data?.productos ?? []).map(combinar), [data]);

  const marcas = useMemo<FilaMarca[]>(() => {
    if (!data) return [];
    const m = new Map<number, FilaMarca>();
    for (const a of data.asignaciones) {
      m.set(a.marcaId, { marcaId: a.marcaId, etiqueta: etiquetaAsignacion(a), productos: 0, conStock: 0, fisico: 0, reservado: 0, disponible: 0, transito: 0, valor: 0 });
    }
    for (const c of filas) {
      const x = m.get(c.p.marcaId);
      if (!x) continue;
      x.productos++;
      if (c.fisico > 0) x.conStock++;
      x.fisico += c.fisico;
      x.reservado += c.reservado;
      x.disponible += c.disponible;
      x.transito += c.transito;
      x.valor += c.valor;
    }
    return [...m.values()].sort((a, b) => b.valor - a.valor);
  }, [data, filas]);

  const total = marcas.reduce(
    (t, m) => ({ fisico: t.fisico + m.fisico, disponible: t.disponible + m.disponible, transito: t.transito + m.transito, valor: t.valor + m.valor, conStock: t.conStock + m.conStock, reservado: t.reservado + m.reservado }),
    { fisico: 0, disponible: 0, transito: 0, valor: 0, conStock: 0, reservado: 0 },
  );

  const categorias = useMemo(
    () => [...new Set(filas.filter((c) => marca == null || c.p.marcaId === marca).map((c) => c.p.categoria))].sort(),
    [filas, marca],
  );

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const lista = filas.filter((c) =>
      (marca == null || c.p.marcaId === marca) &&
      (!categoria || c.p.categoria === categoria) &&
      (!soloStock || c.fisico > 0 || c.transito > 0) &&
      (!q || c.p.codigo.toLowerCase().includes(q) || c.p.nombre.toLowerCase().includes(q)),
    );
    return ordenar(lista, (c, col) => (col === "codigo" ? c.p.codigo : col === "nombre" ? c.p.nombre : c[col]));
  }, [filas, marca, categoria, soloStock, buscar, ordenar]);

  const sedes = data?.sedes ?? [];
  const variasSedes = sedes.length > 1;

  const exportar = () => {
    if (!data) return;
    const fila = (c: Combinado) => ({
      Marca: c.p.marca,
      Categoría: c.p.categoria,
      "Número de parte": c.p.codigo,
      Descripción: c.p.nombre,
      ...(variasSedes ? Object.fromEntries(sedes.map((s) => [`Existencia ${nombreSedeGerente(s)}`, c.porSede.get(s)?.fisico ?? 0])) : {}),
      Existencia: c.fisico,
      Reservado: c.reservado,
      Disponible: c.disponible,
      "Por llegar": c.transito,
      "Costo unitario USD": Math.round(c.costo * 100) / 100,
      "Valor al costo USD": c.valor,
      Archivado: c.p.activo ? "No" : "Sí",
    });
    descargarExcel(`inventario-marcas-${data.hoy}`, [
      {
        nombre: "Por marca",
        filas: marcas.map((m) => ({
          Marca: m.etiqueta, "Productos con existencia": m.conStock, Existencia: m.fisico, Reservado: m.reservado,
          Disponible: m.disponible, "Por llegar": m.transito, "Valor al costo USD": Math.round(m.valor * 100) / 100,
        })),
      },
      { nombre: "Productos", filas: filas.filter((c) => c.fisico > 0 || c.transito > 0).map(fila) },
    ]);
  };

  return (
    <div className="space-y-6">
      <Encabezado icono={Warehouse} titulo="Inventario de mis marcas" subtitulo="Existencia, disponible y por llegar en el almacén principal de cada sede">
        {f.esSuper && <SelectorGerente gerente={f.gerente} setGerente={f.setGerente} />}
        <SelectorSede sede={f.sede} setSede={f.setSede} />
        <BotonRecargar onClick={recargar} cargando={cargando} />
        <BotonExcel onClick={exportar} disabled={!data || cargando} />
      </Encabezado>

      {error && <Aviso error={error} onReintentar={recargar} />}

      {cargando && !data ? (
        <Cargando texto="Leyendo el inventario de Odoo…" />
      ) : data ? (
        <div className={`space-y-6 transition-opacity ${cargando ? "opacity-60 pointer-events-none" : ""}`}>
          <MarcasEnVista asignaciones={data.asignaciones} sedes={data.sedes} esSuper={f.esSuper} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Tarjeta icono={Boxes} titulo="Existencia" valor={`${unidades(total.fisico)} u`} pie={`${total.conStock} productos con existencia`} acento="bg-blue-50 text-blue-600" />
            <Tarjeta icono={PackageCheck} titulo="Disponible" valor={`${unidades(total.disponible)} u`} pie={`${unidades(total.reservado)} u reservadas para pedidos`} acento="bg-emerald-50 text-emerald-600" />
            <Tarjeta icono={Coins} titulo="Valor al costo" valor={dineroCorto(total.valor)} pie="Existencia × costo de la sede en Odoo" acento="bg-amber-50 text-amber-600" />
            <Tarjeta icono={Truck} titulo="Por llegar" valor={`${unidades(total.transito)} u`} pie="Órdenes de compra por recibir" acento="bg-violet-50 text-violet-600" />
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
                    <th className="px-3 py-2.5 text-right">Con existencia</th>
                    <th className="px-3 py-2.5 text-right">Existencia</th>
                    <th className="px-3 py-2.5 text-right">Disponible</th>
                    <th className="px-3 py-2.5 text-right">Por llegar</th>
                    <th className="px-3 py-2.5 text-right">Valor al costo</th>
                    <th className="px-3 py-2.5 text-right">% del valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {marcas.map((m) => (
                    <tr
                      key={m.marcaId}
                      onClick={() => { setMarca(marca === m.marcaId ? null : m.marcaId); setCategoria(""); }}
                      className={`cursor-pointer tabular-nums ${marca === m.marcaId ? "bg-blue-50" : "hover:bg-slate-50"}`}
                    >
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{m.etiqueta}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{m.conStock}</td>
                      <td className="px-3 py-2.5 text-right">{unidades(m.fisico)}</td>
                      <td className="px-3 py-2.5 text-right">{unidades(m.disponible)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{m.transito ? unidades(m.transito) : "—"}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{dinero(m.valor)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-500">{porcentaje(total.valor ? (m.valor / total.valor) * 100 : null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Por producto */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-800 mr-auto">Productos ({visibles.length})</h2>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Número de parte o nombre" className="h-9 w-56 rounded-lg border border-slate-200 pl-8 pr-2 text-sm outline-none focus:border-blue-400" />
              </div>
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoría" className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                <option value="">Todas las categorías</option>
                {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 select-none cursor-pointer">
                <input type="checkbox" checked={soloStock} onChange={(e) => setSoloStock(e.target.checked)} className="rounded border-slate-300" />
                Solo con existencia o por llegar
              </label>
            </div>
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <Th col="codigo" orden={orden} alternar={alternar} derecha={false}>Nº de parte</Th>
                    <Th col="nombre" orden={orden} alternar={alternar} derecha={false}>Descripción</Th>
                    {variasSedes && sedes.map((s) => <th key={s} className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-slate-500">{nombreSedeGerente(s)}</th>)}
                    <Th col="fisico" orden={orden} alternar={alternar}>Existencia</Th>
                    <Th col="disponible" orden={orden} alternar={alternar} title="Existencia menos lo reservado para pedidos">Disponible</Th>
                    <Th col="transito" orden={orden} alternar={alternar}>Por llegar</Th>
                    <Th col="costo" orden={orden} alternar={alternar}>Costo unit.</Th>
                    <Th col="valor" orden={orden} alternar={alternar}>Valor</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibles.map((c) => (
                    <tr key={c.p.id} className="hover:bg-slate-50 tabular-nums">
                      <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap"><Codigo v={c.p.codigo} /></td>
                      <td className="px-3 py-2 min-w-[260px]">
                        <p className="text-slate-800 leading-snug">{c.p.nombre}</p>
                        <p className="text-[11px] text-slate-400">{c.p.marca} · {c.p.categoria}{!c.p.activo && " · archivado"}</p>
                      </td>
                      {variasSedes && sedes.map((s) => <td key={s} className="px-3 py-2 text-right text-slate-500">{unidades(c.porSede.get(s)?.fisico ?? 0)}</td>)}
                      <td className="px-3 py-2 text-right font-semibold">{unidades(c.fisico)}</td>
                      <td className="px-3 py-2 text-right">{unidades(c.disponible)}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{c.transito ? unidades(c.transito) : "—"}</td>
                      <td className="px-3 py-2 text-right text-slate-600">{c.costo ? dinero(c.costo) : <span className="text-amber-600">sin costo</span>}</td>
                      <td className="px-3 py-2 text-right font-semibold">{dinero(c.valor)}</td>
                    </tr>
                  ))}
                  {visibles.length === 0 && (
                    <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-400">No hay productos con esos filtros</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Existencia = almacén principal de cada sede (Existencias y Entrada), igual que en Compras; no cuenta exhibición ni otras tiendas.
            Disponible = existencia menos lo reservado para pedidos. Por llegar = recepciones de órdenes de compra todavía no validadas.
            Valor = existencia × costo de la sede en Odoo. Datos de Odoo en vivo (se guardan unos minutos).
          </p>
        </div>
      ) : null}
    </div>
  );
}
