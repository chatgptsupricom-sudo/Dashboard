"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLocale } from "next-intl";
import { Award, Camera, Coins, HandCoins, PackageCheck, Receipt, Settings2, Snail, Timer, TrendingUp, Warehouse } from "lucide-react";
import { etiquetaAsignacion, TRAMOS, type DatosInventario, type DatosVentas, type Tramo } from "@/lib/gerente-marca/tipos";
import {
  Aviso, Codigo, BotonRecargar, Cargando, COLOR_TRAMO, combinar, dinero, dineroCorto, Encabezado, MarcasEnVista, nombreMes,
  porcentaje, SelectorGerente, SelectorSede, Tarjeta, textoAntiguedad, unidades, useDatos, useFiltros,
} from "./comunes";

/**
 * Dashboard del Gerente de Marca: lo principal de sus marcas de un vistazo
 * (inventario al costo, antigüedad, venta y cobro del mes) y los accesos a
 * cada reporte. Usa las mismas APIs que Inventario y Ventas.
 */

export function Resumen() {
  const locale = useLocale();
  const f = useFiltros();
  const inv = useDatos<DatosInventario>(`/api/gerente-marca/inventario?${f.query}`);
  const ven = useDatos<DatosVentas>(`/api/gerente-marca/ventas?${f.query}`);
  const recargar = () => { inv.recargar(); ven.recargar(); };
  const cargando = inv.cargando || ven.cargando;
  const base = `/${locale}/gerente_marca`;

  const productos = useMemo(() => (inv.data?.productos ?? []).map(combinar), [inv.data]);

  const marcas = useMemo(() => {
    const asignaciones = inv.data?.asignaciones ?? ven.data?.asignaciones ?? [];
    return asignaciones.map((a) => {
      const prods = productos.filter((c) => c.p.marcaId === a.marcaId);
      const valor = prods.reduce((s, c) => s + c.valor, 0);
      const disponible = prods.reduce((s, c) => s + c.disponible, 0);
      const porTramo = Object.fromEntries(TRAMOS.map((t) => [t.id, prods.reduce((s, c) => s + (c.tramos[t.id] ?? 0) * c.costo, 0)])) as Record<Tramo, number>;
      const ventas = (ven.data?.filas ?? []).filter((v) => v.marcaId === a.marcaId);
      const facturado = ventas.reduce((s, v) => s + v.facturado, 0);
      const cobrado = ventas.reduce((s, v) => s + v.cobrado, 0);
      const vendidasMes = prods.reduce((s, c) => s + c.vendidasMes, 0);
      return { a, valor, disponible, porTramo, facturado, cobrado, vendidasMes };
    }).sort((x, y) => y.valor + y.facturado - (x.valor + x.facturado));
  }, [inv.data, ven.data, productos]);

  const tot = marcas.reduce(
    (t, m) => ({ valor: t.valor + m.valor, disponible: t.disponible + m.disponible, facturado: t.facturado + m.facturado, cobrado: t.cobrado + m.cobrado }),
    { valor: 0, disponible: 0, facturado: 0, cobrado: 0 },
  );

  /** Lo que más plata tiene parada: existencia sin una venta en 6 meses. */
  const quietos = useMemo(
    () => productos.filter((c) => c.fisico > 0 && c.vendidas6m <= 0).sort((a, b) => b.valor - a.valor).slice(0, 8),
    [productos],
  );

  const mes = inv.data ? nombreMes(inv.data.mes.desde.slice(0, 7)) : "";
  const accesos = [
    { href: `${base}/inventario`, icono: Warehouse, titulo: "Inventario", texto: "Existencia, disponible y por llegar" },
    { href: `${base}/antiguedad`, icono: Timer, titulo: "Antigüedad", texto: "Días en almacén, costo y rotación" },
    { href: `${base}/ventas`, icono: TrendingUp, titulo: "Ventas por marca", texto: "Facturado y cobrado por número de parte" },
    { href: `${base}/banco-imagenes`, icono: Camera, titulo: "Banco de Flyers", texto: "Imágenes y flyers de mis marcas" },
    ...(f.esSuper ? [{ href: `${base}/configuracion`, icono: Settings2, titulo: "Configuración", texto: "Qué marcas lleva cada gerente" }] : []),
  ];

  const error = inv.error || ven.error;
  const listo = inv.data && ven.data;

  return (
    <div className="space-y-6">
      <Encabezado icono={Award} titulo="Gerencia de Marca" subtitulo={`Mis marcas en Valencia y Caracas${mes ? ` · ${mes}` : ""}`}>
        {f.esSuper && <SelectorGerente gerente={f.gerente} setGerente={f.setGerente} />}
        <SelectorSede sede={f.sede} setSede={f.setSede} />
        <BotonRecargar onClick={recargar} cargando={cargando} />
      </Encabezado>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {accesos.map((x) => (
          <Link key={x.href} href={x.href} className="group bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-blue-300 hover:shadow transition">
            <x.icono size={18} className="text-blue-600 mb-2" />
            <p className="text-sm font-bold text-slate-800 group-hover:text-blue-700">{x.titulo}</p>
            <p className="text-xs text-slate-500 leading-snug">{x.texto}</p>
          </Link>
        ))}
      </div>

      {error && <Aviso error={error} onReintentar={recargar} />}

      {!listo && cargando ? (
        <Cargando texto="Leyendo inventario y ventas de Odoo…" />
      ) : listo ? (
        <div className={`space-y-6 transition-opacity ${cargando ? "opacity-60 pointer-events-none" : ""}`}>
          <MarcasEnVista asignaciones={inv.data!.asignaciones} sedes={inv.data!.sedes} esSuper={f.esSuper} />

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Tarjeta icono={Coins} titulo="Inventario al costo" valor={dineroCorto(tot.valor)} pie="Existencia hoy × costo de la sede" acento="bg-blue-50 text-blue-600" />
            <Tarjeta icono={PackageCheck} titulo="Disponible" valor={`${unidades(tot.disponible)} u`} pie="Existencia menos lo reservado" acento="bg-violet-50 text-violet-600" />
            <Tarjeta icono={Receipt} titulo={`Facturado ${mes.split(" ")[0]?.toLowerCase() ?? ""}`} valor={dineroCorto(tot.facturado)} pie="Sin IVA, del 1 a hoy" acento="bg-amber-50 text-amber-600" />
            <Tarjeta icono={HandCoins} titulo="Cobrado del mes" valor={dineroCorto(tot.cobrado)} pie={`${porcentaje(tot.facturado > 0 ? (tot.cobrado / tot.facturado) * 100 : null)} de lo facturado`} acento="bg-emerald-50 text-emerald-600" />
          </div>

          {/* Una tarjeta por marca */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {marcas.map((m) => (
              <div key={m.a.marcaId} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-black text-slate-900 tracking-tight">{etiquetaAsignacion(m.a)}</p>
                  <span className="text-xs text-slate-500">{unidades(m.vendidasMes)} u vendidas este mes</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-slate-500">Inventario</p><p className="text-sm font-bold text-slate-900 tabular-nums">{dineroCorto(m.valor)}</p></div>
                  <div><p className="text-slate-500">Facturado</p><p className="text-sm font-bold text-slate-900 tabular-nums">{dineroCorto(m.facturado)}</p></div>
                  <div><p className="text-slate-500">Cobrado</p><p className="text-sm font-bold text-slate-900 tabular-nums">{porcentaje(m.facturado > 0 ? (m.cobrado / m.facturado) * 100 : null)}</p></div>
                </div>
                <div>
                  <p className="text-[11px] text-slate-500 mb-1">Inventario por antigüedad</p>
                  <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    {TRAMOS.map((t) => m.porTramo[t.id] > 0 && (
                      <div key={t.id} style={{ width: `${(m.porTramo[t.id] / (m.valor || 1)) * 100}%`, background: COLOR_TRAMO[t.id] }} title={`${t.label}: ${dinero(m.porTramo[t.id])}`} />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {marcas.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
              {TRAMOS.map((t) => (
                <span key={t.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_TRAMO[t.id] }} />{t.label}</span>
              ))}
            </div>
          )}

          {/* Inventario quieto */}
          {quietos.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Snail size={16} className="text-red-500" />
                <h2 className="text-sm font-bold text-slate-800 mr-auto">Inventario sin venta en 6 meses</h2>
                <Link href={`${base}/antiguedad`} className="text-xs font-semibold text-blue-600 hover:underline">Ver antigüedad</Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 text-left">Nº de parte</th>
                      <th className="px-3 py-2 text-left">Descripción</th>
                      <th className="px-3 py-2 text-right">Días</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">Costo total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quietos.map((c) => (
                      <tr key={c.p.id} className="tabular-nums">
                        <td className="px-3 py-2 font-mono text-xs whitespace-nowrap"><Codigo v={c.p.codigo} /></td>
                        <td className="px-3 py-2 min-w-[220px]"><p className="text-slate-800 leading-snug">{c.p.nombre}</p><p className="text-[11px] text-slate-400">{c.p.marca}</p></td>
                        <td className="px-3 py-2 text-right">{textoAntiguedad(c, inv.data!.hoy)}</td>
                        <td className="px-3 py-2 text-right">{unidades(c.fisico)}</td>
                        <td className="px-3 py-2 text-right font-semibold">{dinero(c.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
