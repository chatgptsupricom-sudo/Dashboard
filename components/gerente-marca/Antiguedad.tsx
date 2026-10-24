"use client";

import { useMemo, useState } from "react";
import { Boxes, Coins, Hourglass, History, Search, Timer } from "lucide-react";
import { descargarExcel } from "@/lib/excel";
import { etiquetaAsignacion, nombreSedeGerente, TRAMOS, type DatosInventario, type Tramo } from "@/lib/gerente-marca/tipos";
import {
  Aviso, Codigo, BotonExcel, BotonRecargar, Cargando, COLOR_TRAMO, combinar, dinero, dineroCorto, Encabezado, etiquetaTramo,
  fecha, MarcasEnVista, nombreMes, porcentaje, SelectorGerente, SelectorSede, Tarjeta, textoAntiguedad, Th, unidades,
  useDatos, useFiltros, useOrden, type Combinado,
} from "./comunes";

/**
 * Antigüedad del inventario por marca (formato del Excel que mandó el
 * gerente): por producto, días en inventario, costo, cantidad, costo total y
 * unidades vendidas en el mes en curso y en los últimos 6 meses; arriba, el
 * resumen por marca con el valor en cada tramo de antigüedad.
 * Datos: /api/gerente-marca/inventario.
 */

type Col = "marca" | "categoria" | "codigo" | "dias" | "costo" | "fisico" | "valor" | "vendidasMes" | "vendidas6m";

/** Costo de las unidades de un tramo (al costo promedio del producto). */
const valorTramo = (c: Combinado, t: Tramo) => (c.tramos[t] ?? 0) * c.costo;

export function Antiguedad() {
  const f = useFiltros();
  const { data, cargando, error, recargar } = useDatos<DatosInventario>(`/api/gerente-marca/inventario?${f.query}`);
  const [marca, setMarca] = useState<number | null>(null);
  const [tramo, setTramo] = useState<Tramo | "">("");
  const [buscar, setBuscar] = useState("");
  const { orden, alternar, ordenar } = useOrden<Col>({ col: "dias", desc: true });

  const conStock = useMemo(() => (data?.productos ?? []).map(combinar).filter((c) => c.fisico > 0), [data]);
  const hoy = data?.hoy ?? "";
  const dias = (c: Combinado) => (c.entradaMasVieja ? Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${c.entradaMasVieja}T00:00:00Z`)) / 86_400_000) : -1);

  const resumen = useMemo(() => {
    if (!data) return [];
    return data.asignaciones.map((a) => {
      const prods = conStock.filter((c) => c.p.marcaId === a.marcaId);
      const valor = prods.reduce((s, c) => s + c.valor, 0);
      const fisico = prods.reduce((s, c) => s + c.fisico, 0);
      const porTramo = Object.fromEntries(TRAMOS.map((t) => [t.id, prods.reduce((s, c) => s + valorTramo(c, t.id), 0)])) as Record<Tramo, number>;
      const conDias = prods.filter((c) => c.diasPromedio != null);
      const uDias = conDias.reduce((s, c) => s + c.fisico, 0);
      const diasPromedio = uDias > 0 ? Math.round(conDias.reduce((s, c) => s + c.diasPromedio! * c.fisico, 0) / uDias) : null;
      return {
        marcaId: a.marcaId, etiqueta: etiquetaAsignacion(a), productos: prods.length, fisico, valor, porTramo, diasPromedio,
        vendidasMes: prods.reduce((s, c) => s + c.vendidasMes, 0), vendidas6m: prods.reduce((s, c) => s + c.vendidas6m, 0),
      };
    }).sort((x, y) => y.valor - x.valor);
  }, [data, conStock]);

  const total = {
    valor: resumen.reduce((s, m) => s + m.valor, 0),
    fisico: resumen.reduce((s, m) => s + m.fisico, 0),
    porTramo: Object.fromEntries(TRAMOS.map((t) => [t.id, resumen.reduce((s, m) => s + m.porTramo[t.id], 0)])) as Record<Tramo, number>,
  };
  const diasTotal = (() => {
    const conDias = conStock.filter((c) => c.diasPromedio != null);
    const u = conDias.reduce((s, c) => s + c.fisico, 0);
    return u > 0 ? Math.round(conDias.reduce((s, c) => s + c.diasPromedio! * c.fisico, 0) / u) : null;
  })();
  const sinMovimiento = conStock.filter((c) => c.vendidas6m <= 0);
  const valorSinMovimiento = sinMovimiento.reduce((s, c) => s + c.valor, 0);
  const masDe90 = total.porTramo["91-180"] + total.porTramo["180+"];

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const lista = conStock.filter((c) =>
      (marca == null || c.p.marcaId === marca) &&
      (!tramo || (c.tramos[tramo] ?? 0) > 0) &&
      (!q || c.p.codigo.toLowerCase().includes(q) || c.p.nombre.toLowerCase().includes(q)),
    );
    return ordenar(lista, (c, col) =>
      col === "marca" ? c.p.marca : col === "categoria" ? c.p.categoria : col === "codigo" ? c.p.codigo : col === "dias" ? dias(c) : c[col]);
  }, [conStock, marca, tramo, buscar, ordenar]); // eslint-disable-line react-hooks/exhaustive-deps

  const sedes = data?.sedes ?? [];
  const variasSedes = sedes.length > 1;
  const mesActual = data ? nombreMes(data.mes.desde.slice(0, 7)) : "";

  const exportar = () => {
    if (!data) return;
    descargarExcel(`antiguedad-inventario-${data.hoy}`, [
      {
        nombre: "Total por marca",
        filas: resumen.map((m) => ({
          Marca: m.etiqueta,
          "Inv. existente": m.fisico,
          "Total costo USD": Math.round(m.valor * 100) / 100,
          "Días promedio": m.diasPromedio ?? "",
          ...Object.fromEntries(TRAMOS.map((t) => [`${t.label} USD`, Math.round(m.porTramo[t.id] * 100) / 100])),
          [`Vendidas ${mesActual}`]: m.vendidasMes,
          "Vendidas últimos 6 meses": m.vendidas6m,
        })),
      },
      {
        nombre: "Detalle por producto",
        filas: [...conStock].sort((a, b) => a.p.marca.localeCompare(b.p.marca) || a.p.categoria.localeCompare(b.p.categoria) || b.valor - a.valor).map((c) => ({
          Marca: c.p.marca,
          "Tipo de producto": c.p.categoria,
          "Número de parte": c.p.codigo,
          Descripción: c.p.nombre,
          "Antigüedad (días)": textoAntiguedad(c, data.hoy),
          "Fecha de entrada más vieja": c.entradaMasVieja ?? "",
          "Días promedio": c.diasPromedio ?? "",
          ...Object.fromEntries(TRAMOS.map((t) => [t.label, c.tramos[t.id] ?? 0])),
          "Costo unit. USD": Math.round(c.costo * 100) / 100,
          ...(variasSedes ? Object.fromEntries(sedes.map((s) => [`Existencia ${nombreSedeGerente(s)}`, c.porSede.get(s)?.fisico ?? 0])) : {}),
          "Inv. existente": c.fisico,
          "Inv. disponible": c.disponible,
          "Total costo USD": c.valor,
          [`Vendidas ${mesActual}`]: c.vendidasMes,
          "Vendidas últimos 6 meses": c.vendidas6m,
          "Última venta": c.ultimaVenta ?? "",
        })),
      },
    ]);
  };

  return (
    <div className="space-y-6">
      <Encabezado icono={Timer} titulo="Antigüedad de inventario" subtitulo="Cuánto tiempo lleva cada producto en el almacén y cuánto se está vendiendo">
        {f.esSuper && <SelectorGerente gerente={f.gerente} setGerente={f.setGerente} />}
        <SelectorSede sede={f.sede} setSede={f.setSede} />
        <BotonRecargar onClick={recargar} cargando={cargando} />
        <BotonExcel onClick={exportar} disabled={!data || cargando} />
      </Encabezado>

      {error && <Aviso error={error} onReintentar={recargar} />}

      {cargando && !data ? (
        <Cargando texto="Leyendo el inventario y las ventas de Odoo…" />
      ) : data ? (
        <div className={`space-y-6 transition-opacity ${cargando ? "opacity-60 pointer-events-none" : ""}`}>
          <MarcasEnVista asignaciones={data.asignaciones} sedes={data.sedes} esSuper={f.esSuper} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Tarjeta icono={Coins} titulo="Inventario al costo" valor={dineroCorto(total.valor)} pie={`${unidades(total.fisico)} u en ${conStock.length} productos`} acento="bg-blue-50 text-blue-600" />
            <Tarjeta icono={Hourglass} titulo="Días promedio" valor={diasTotal == null ? "—" : `${diasTotal} días`} pie="Desde que entró cada unidad, ponderado por unidades" acento="bg-amber-50 text-amber-600" />
            <Tarjeta icono={History} titulo="Más de 90 días" valor={dineroCorto(masDe90)} pie={`${porcentaje(total.valor ? (masDe90 / total.valor) * 100 : null)} del valor · ${dineroCorto(total.porTramo.inicial)} desde antes de Odoo`} acento="bg-red-50 text-red-600" />
            <Tarjeta icono={Boxes} titulo="Sin venta en 6 meses" valor={dineroCorto(valorSinMovimiento)} pie={`${sinMovimiento.length} productos con existencia que no se vendieron`} acento="bg-slate-100 text-slate-600" />
          </div>

          {/* Resumen por marca: valor por tramo */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3">
              <h2 className="text-sm font-bold text-slate-800 mr-auto">Total inventario por marca</h2>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                {TRAMOS.map((t) => (
                  <span key={t.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_TRAMO[t.id] }} />{t.label}</span>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2.5 text-left">Marca</th>
                    <th className="px-3 py-2.5 text-right">Existencia</th>
                    <th className="px-3 py-2.5 text-right">Total costo</th>
                    <th className="px-3 py-2.5 text-right">Días prom.</th>
                    <th className="px-3 py-2.5 text-left min-w-[260px]">Valor por antigüedad</th>
                    <th className="px-3 py-2.5 text-right">Vendidas {mesActual.split(" ")[0].toLowerCase()}</th>
                    <th className="px-3 py-2.5 text-right">Vendidas 6 meses</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resumen.map((m) => (
                    <tr key={m.marcaId} onClick={() => setMarca(marca === m.marcaId ? null : m.marcaId)} className={`cursor-pointer tabular-nums ${marca === m.marcaId ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                      <td className="px-3 py-2.5 font-semibold text-slate-800 whitespace-nowrap">{m.etiqueta}</td>
                      <td className="px-3 py-2.5 text-right">{unidades(m.fisico)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{dinero(m.valor)}</td>
                      <td className="px-3 py-2.5 text-right">{m.diasPromedio ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
                          {TRAMOS.map((t) => m.porTramo[t.id] > 0 && (
                            <div
                              key={t.id}
                              style={{ width: `${(m.porTramo[t.id] / (m.valor || 1)) * 100}%`, background: COLOR_TRAMO[t.id] }}
                              title={`${t.label}: ${dinero(m.porTramo[t.id])} (${porcentaje((m.porTramo[t.id] / (m.valor || 1)) * 100)})`}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">{unidades(m.vendidasMes)}</td>
                      <td className="px-3 py-2.5 text-right">{unidades(m.vendidas6m)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-bold tabular-nums">
                    <td className="px-3 py-2.5">Total</td>
                    <td className="px-3 py-2.5 text-right">{unidades(total.fisico)}</td>
                    <td className="px-3 py-2.5 text-right">{dinero(total.valor)}</td>
                    <td className="px-3 py-2.5 text-right">{diasTotal ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[11px] font-normal text-slate-500">
                      {TRAMOS.filter((t) => total.porTramo[t.id] > 0).map((t) => `${t.label}: ${dineroCorto(total.porTramo[t.id])}`).join(" · ")}
                    </td>
                    <td className="px-3 py-2.5 text-right">{unidades(resumen.reduce((s, m) => s + m.vendidasMes, 0))}</td>
                    <td className="px-3 py-2.5 text-right">{unidades(resumen.reduce((s, m) => s + m.vendidas6m, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle por producto */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-bold text-slate-800 mr-auto">Detalle por producto ({visibles.length})</h2>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Número de parte o nombre" className="h-9 w-56 rounded-lg border border-slate-200 pl-8 pr-2 text-sm outline-none focus:border-blue-400" />
              </div>
              <select value={marca ?? ""} onChange={(e) => setMarca(e.target.value ? Number(e.target.value) : null)} aria-label="Marca" className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                <option value="">Todas las marcas</option>
                {data.asignaciones.map((a) => <option key={a.marcaId} value={a.marcaId}>{etiquetaAsignacion(a)}</option>)}
              </select>
              <select value={tramo} onChange={(e) => setTramo(e.target.value as Tramo | "")} aria-label="Antigüedad" className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
                <option value="">Cualquier antigüedad</option>
                {TRAMOS.map((t) => <option key={t.id} value={t.id}>Con unidades de {t.label.toLowerCase()}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto max-h-[70vh]">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 sticky top-0 z-10">
                  <tr>
                    <Th col="marca" orden={orden} alternar={alternar} derecha={false}>Marca</Th>
                    <Th col="categoria" orden={orden} alternar={alternar} derecha={false}>Tipo</Th>
                    <Th col="codigo" orden={orden} alternar={alternar} derecha={false}>Nº de parte</Th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Descripción</th>
                    <Th col="dias" orden={orden} alternar={alternar} title="Días desde que entró la unidad más vieja. Con +: entró con la carga inicial de Odoo (abr-2026), puede ser más vieja.">Antigüedad</Th>
                    <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500 min-w-[120px]">Unidades por edad</th>
                    <Th col="costo" orden={orden} alternar={alternar}>Costo unit.</Th>
                    <Th col="fisico" orden={orden} alternar={alternar}>Cantidad</Th>
                    <Th col="valor" orden={orden} alternar={alternar}>Costo total</Th>
                    <Th col="vendidasMes" orden={orden} alternar={alternar} title={`Vendidas del 1 al ${fecha(data.mes.hasta, false)}`}>Vend. mes</Th>
                    <Th col="vendidas6m" orden={orden} alternar={alternar} title={`Vendidas del ${fecha(data.seisMeses.desde)} al ${fecha(data.seisMeses.hasta)}`}>Vend. 6 meses</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibles.map((c) => (
                    <tr key={c.p.id} className="hover:bg-slate-50 tabular-nums">
                      <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{c.p.marca}</td>
                      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{c.p.categoria}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700 whitespace-nowrap"><Codigo v={c.p.codigo} /></td>
                      <td className="px-3 py-2 min-w-[240px] text-slate-800 leading-snug">{c.p.nombre}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" title={c.entradaMasVieja ? `Entró el ${fecha(c.entradaMasVieja)}${c.diasPromedio != null ? ` · promedio ${c.diasPromedio} días` : ""}` : undefined}>
                        <span className="font-semibold">{textoAntiguedad(c, data.hoy)}</span> <span className="text-xs text-slate-400">días</span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex h-2.5 w-full min-w-[100px] overflow-hidden rounded-full bg-slate-100">
                          {TRAMOS.map((t) => (c.tramos[t.id] ?? 0) > 0 && (
                            <div key={t.id} style={{ width: `${((c.tramos[t.id] ?? 0) / c.fisico) * 100}%`, background: COLOR_TRAMO[t.id] }} title={`${etiquetaTramo(t.id)}: ${unidades(c.tramos[t.id] ?? 0)} u`} />
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">{c.costo ? dinero(c.costo) : <span className="text-amber-600">sin costo</span>}</td>
                      <td className="px-3 py-2 text-right font-semibold" title={variasSedes ? sedes.map((s) => `${nombreSedeGerente(s)}: ${unidades(c.porSede.get(s)?.fisico ?? 0)}`).join(" · ") : undefined}>{unidades(c.fisico)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{dinero(c.valor)}</td>
                      <td className="px-3 py-2 text-right">{c.vendidasMes ? unidades(c.vendidasMes) : <span className="text-slate-300">0</span>}</td>
                      <td className={`px-3 py-2 text-right ${c.vendidas6m > 0 ? "" : "text-red-500 font-semibold"}`}>{unidades(c.vendidas6m)}</td>
                    </tr>
                  ))}
                  {visibles.length === 0 && (
                    <tr><td colSpan={11} className="px-3 py-10 text-center text-sm text-slate-400">No hay productos con esos filtros</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-400">
            Antigüedad = días desde que entró al almacén la unidad más vieja que queda (fecha de entrada de Odoo; las computadoras van por serial, así que cada unidad tiene la suya).
            Lo que vino de Smartbit entró a Odoo con la carga inicial de abril de 2026 y no trae su fecha real: va en «Antes de Odoo» y sus días llevan «+» (es al menos eso).
            Vendidas = facturado menos devuelto, sin ventas entre empresas del grupo; 6 meses = del {fecha(data.seisMeses.desde)} a hoy (antes de abril-2026 sale de Smartbit).
            Costo = costo de la sede en Odoo. Solo el almacén principal de cada sede.
          </p>
        </div>
      ) : null}
    </div>
  );
}
