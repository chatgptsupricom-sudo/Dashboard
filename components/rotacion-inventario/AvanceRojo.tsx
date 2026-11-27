"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avance, Luz, fecha, num, usd } from "@/components/rotacion-inventario/comunes";
import VentasRojoDialog, { type FiltroVentas } from "@/components/rotacion-inventario/VentasRojoDialog";
import { Receipt } from "lucide-react";
import {
  HORIZONTE_DIAS,
  MESES_PLAN,
  nombreSede,
  porcentaje,
  resumirPlanRojo,
  sumarResumenes,
  type FichaProducto,
  type LineaPlanRojo,
  type PlanRojo,
  type ResumenPlanRojo,
} from "@/lib/rotacion-inventario/tipos";

/**
 * Lo vendido de la mercancía que estaba en rojo el día que arrancó el plan de
 * 90 días de la sede, contra la cuota (lo que estaba en rojo ÷ 3 al mes).
 * Los planes los guarda lib/rotacion-inventario/datos.ts (rotacion_plan_rojo).
 */

export type AgruparRojo = "sede" | "marca" | "categoria" | "producto";

const claveLinea = (tipo: AgruparRojo, companyId: number) => (l: LineaPlanRojo) =>
  tipo === "sede"
    ? nombreSede(companyId)
    : tipo === "marca"
      ? l.marca
      : tipo === "categoria"
        ? l.categoria
        : [l.codigo, l.nombre].filter(Boolean).join(" · ");

/** Resumen del plan del rojo por grupo, sumando las sedes. */
export function agruparPlanes(planes: PlanRojo[], tipo: AgruparRojo): Map<string, ResumenPlanRojo> {
  const porClave = new Map<string, ResumenPlanRojo[]>();
  for (const p of planes) {
    const clave = claveLinea(tipo, p.companyId);
    const grupos = new Map<string, LineaPlanRojo[]>();
    for (const l of p.lineas) {
      const k = clave(l);
      const lista = grupos.get(k) ?? [];
      lista.push(l);
      grupos.set(k, lista);
    }
    for (const [k, lineas] of grupos) {
      const lista = porClave.get(k) ?? [];
      lista.push(resumirPlanRojo(lineas, p.diasCompletos, p.diasCompletosMes));
      porClave.set(k, lista);
    }
  }
  return new Map([...porClave].map(([k, rs]) => [k, sumarResumenes(rs)]));
}

function Barra({ vendido, meta, total }: { vendido: number; meta: number; total: number }) {
  // Barra sobre la cuota completa: lo vendido y una marca de lo esperado a hoy.
  const ancho = (n: number) => `${total > 0 ? Math.min(100, (n / total) * 100) : 0}%`;
  const pct = porcentaje(vendido, meta);
  const color = pct === null ? "bg-slate-400" : pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="relative h-2.5 rounded-full bg-slate-100 overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: ancho(vendido) }} />
      {meta > 0 && meta < total && <div className="absolute top-0 h-full w-0.5 bg-slate-700" style={{ left: ancho(meta) }} title="Esperado a hoy" />}
    </div>
  );
}

export default function AvanceRojo({
  planes,
  fichas,
  multiSede,
  sede,
}: {
  planes: PlanRojo[];
  fichas: FichaProducto[];
  multiSede: boolean;
  /** La sede elegida en la pantalla (9, 10, 7 o "todas"), para pedir las ventas. */
  sede: string;
}) {
  const [agrupar, setAgrupar] = useState<AgruparRojo>("marca");
  const [verTodos, setVerTodos] = useState(false);
  const [ventas, setVentas] = useState<{ filtro: FiltroVentas | null } | null>(null);

  const total = useMemo(() => sumarResumenes(planes.map((p) => p.resumen)), [planes]);
  const grupos = useMemo(
    () => [...agruparPlanes(planes, agrupar)].sort((a, b) => b[1].valor - a[1].valor),
    [planes, agrupar],
  );
  // Lo que pasó a rojo después de que arrancó el plan: entra en el siguiente.
  const despues = useMemo(() => {
    const enPlan = new Set(planes.flatMap((p) => p.lineas.map((l) => `${p.companyId}:${l.productoId}`)));
    const sedes = new Set(planes.map((p) => p.companyId));
    const nuevos = fichas.filter((f) => f.color === "rojo" && sedes.has(f.companyId) && !enPlan.has(`${f.companyId}:${f.productoId}`));
    return { referencias: nuevos.length, valor: nuevos.reduce((a, f) => a + f.valorCosto, 0) };
  }, [planes, fichas]);

  if (!planes.length) return null;

  const mismasFechas = planes.every((p) => p.inicio === planes[0].inicio);
  const p0 = planes[0];
  const pctMes = porcentaje(total.vendidoMes.valor, total.cuotaMensual.valor);
  const pctEsperadoMes = porcentaje(total.vendidoMes.valor, total.esperadoMes.valor);
  const pctPlan = porcentaje(total.vendido.valor, total.esperado.valor);
  const visibles = verTodos ? grupos : grupos.slice(0, 15);

  return (
    <Card className="bg-white">
      <CardContent className="p-0">
        <div className="p-4 border-b space-y-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium text-sm flex items-center gap-2">
              <Luz color="rojo" /> Lo vendido de la mercancía en rojo contra la cuota de {HORIZONTE_DIAS} días
            </p>
            <Button variant="outline" size="sm" onClick={() => setVentas({ filtro: null })}>
              <Receipt className="h-4 w-4 mr-2" />
              Ver cada venta
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            {mismasFechas ? (
              <>
                Plan del {fecha(p0.inicio)} al {fecha(p0.fin)} · día {p0.diaPlan} de {HORIZONTE_DIAS} · mes {p0.mesPlan} de {MESES_PLAN} (
                {fecha(p0.inicioMes)} al {fecha(p0.finMes)}).
              </>
            ) : (
              planes.map((p) => `${nombreSede(p.companyId)}: del ${fecha(p.inicio)} al ${fecha(p.fin)}, día ${p.diaPlan}`).join(" · ")
            )}{" "}
            Cuenta lo que estaba en rojo el día que arrancó el plan: {num(total.referencias)} productos, {num(total.unidades)} unidades,{" "}
            {usd(total.valor)} a costo.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">{mismasFechas ? `Mes ${p0.mesPlan} del plan` : "Mes en curso del plan"}</p>
            <p className="text-2xl font-bold text-gray-800">
              {usd(total.vendidoMes.valor)}
              <span className="text-sm font-medium text-gray-500"> de {usd(total.cuotaMensual.valor)}</span>
            </p>
            <Barra vendido={total.vendidoMes.valor} meta={total.esperadoMes.valor} total={total.cuotaMensual.valor} />
            <p className="text-[11px] text-gray-500">
              {pctMes === null ? "—" : `${pctMes.toFixed(1)}%`} de la cuota del mes · {num(total.vendidoMes.unidades)} de{" "}
              {num(Math.ceil(total.cuotaMensual.unidades - 1e-9))} unidades. A hoy se esperaba {usd(total.esperadoMes.valor)}
              {pctEsperadoMes !== null && ` (${pctEsperadoMes.toFixed(0)}%)`}.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Desde que arrancó el plan</p>
            <p className="text-2xl font-bold text-gray-800">
              {usd(total.vendido.valor)}
              <span className="text-sm font-medium text-gray-500"> de {usd(total.valor)}</span>
            </p>
            <Barra vendido={total.vendido.valor} meta={total.esperado.valor} total={total.valor} />
            <p className="text-[11px] text-gray-500">
              {num(total.vendido.unidades)} unidades. A hoy se esperaba {usd(total.esperado.valor)}
              {pctPlan !== null ? ` · va al ${pctPlan.toFixed(0)}% de lo esperado` : " · el primer día todavía no se espera nada"}.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">Lo que queda en rojo</p>
            <p className="text-2xl font-bold text-gray-800">{usd(total.queda.valor)}</p>
            <p className="text-[11px] text-gray-500">
              {num(total.queda.unidades)} unidades · {num(total.agotados)} de {num(total.referencias)} productos ya se vendieron completos.
            </p>
            {despues.referencias > 0 && (
              <p className="text-[11px] text-gray-500">
                Después pasaron a rojo {num(despues.referencias)} productos más ({usd(despues.valor)}): entran en el próximo plan.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t">
          <p className="font-medium text-sm">Avance por {agrupar === "sede" ? "sede" : agrupar === "marca" ? "marca" : agrupar === "categoria" ? "categoría" : "producto"}</p>
          <div className="flex rounded-lg border p-0.5 text-sm">
            {(["sede", "marca", "categoria", "producto"] as AgruparRojo[])
              .filter((g) => g !== "sede" || multiSede)
              .map((g) => (
                <button
                  key={g}
                  onClick={() => {
                    setAgrupar(g);
                    setVerTodos(false);
                  }}
                  className={`px-3 py-1 rounded-md ${agrupar === g ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  {g === "sede" ? "Por sede" : g === "marca" ? "Por marca" : g === "categoria" ? "Por categoría" : "Por producto"}
                </button>
              ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="text-left px-3 py-2 font-medium">
                  {agrupar === "sede" ? "Sede" : agrupar === "marca" ? "Marca" : agrupar === "categoria" ? "Categoría" : "Producto"}
                </th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">En rojo al inicio</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Cuota / mes</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Vendido en el mes</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">% de la cuota</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Vendido en el plan</th>
                <th className="px-3 py-2 font-medium whitespace-nowrap">Vs. esperado a hoy</th>
                <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Queda</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(([clave, r]) => (
                <tr
                  key={clave}
                  className="border-t hover:bg-slate-50 cursor-pointer"
                  onClick={() => setVentas({ filtro: { tipo: agrupar, clave } })}
                  title="Ver a quién y cómo se vendió"
                >
                  <td className="px-3 py-2 font-medium max-w-[320px] truncate text-blue-700" title={clave}>
                    {clave}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {usd(r.valor)}
                    <span className="block text-[10px] text-slate-400">{num(r.unidades)} u.</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap text-red-700">{usd(r.cuotaMensual.valor)}</td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {usd(r.vendidoMes.valor)}
                    <span className="block text-[10px] text-slate-400">{num(r.vendidoMes.unidades)} u.</span>
                  </td>
                  <td className="px-3 py-2">
                    <Avance valor={porcentaje(r.vendidoMes.valor, r.cuotaMensual.valor)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {usd(r.vendido.valor)}
                    <span className="block text-[10px] text-slate-400">{num(r.vendido.unidades)} u.</span>
                  </td>
                  <td className="px-3 py-2">
                    <Avance valor={porcentaje(r.vendido.valor, r.esperado.valor)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{usd(r.queda.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ventas && <VentasRojoDialog sede={sede} filtro={ventas.filtro} cerrar={() => setVentas(null)} />}
        {grupos.length > 15 && (
          <div className="p-3 border-t text-center">
            <Button variant="ghost" size="sm" onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? "Ver los 15 con más valor" : `Ver los ${grupos.length}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
