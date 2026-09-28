"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { GraficoSemanas } from "./ResumenMetas";
import { BarraProgreso, ChipEstado } from "./TablaMarcas";
import { colorPct, dinero, dineroCorto, nombreMes, porcentaje, type DatosMetas, type FilaMarca } from "./formato";

function Dato({ label, valor, sub }: { label: string; valor: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-black text-slate-900 tabular-nums truncate">{valor}</p>
      {sub && <p className="text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

function Top({ titulo, filas, conUnidades }: { titulo: string; filas: FilaMarca["topClientes"]; conUnidades?: boolean }) {
  const max = Math.max(1, ...filas.map((f) => Math.abs(f.ingreso)));
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{titulo}</p>
      {filas.length === 0 ? <p className="text-xs text-slate-400">Sin datos.</p> : (
        <ul className="space-y-2">
          {filas.map((f) => (
            <li key={f.nombre} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-slate-700" title={f.nombre}>{f.nombre}</span>
                <span className="shrink-0 tabular-nums font-semibold text-slate-900">
                  {dinero(f.ingreso)}
                  {conUnidades && f.detalle != null && <span className="ml-1.5 text-[11px] font-normal text-slate-400">{f.detalle.toLocaleString("es-VE")} u</span>}
                </span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-slate-100">
                <div className="h-1 rounded-full bg-blue-500/70" style={{ width: `${(Math.abs(f.ingreso) / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DetalleMarca({ data, fila, onClose }: { data: DatosMetas; fila: FilaMarca | null; onClose: () => void }) {
  const enCurso = data.periodo.estado === "en_curso";
  const historia = fila
    ? [
        ...data.historialMeses.map((mes, i) => ({ mes: nombreMes(mes, true), valor: fila.historial[i], actual: false })),
        { mes: nombreMes(data.mes, true), valor: enCurso ? fila.proyeccion ?? fila.vendido : fila.vendido, actual: true },
      ]
    : [];

  return (
    <Sheet open={!!fila} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {fila && (
          <>
            <SheetHeader className="border-b border-slate-100 p-5">
              <div className="flex items-center gap-3 flex-wrap">
                <SheetTitle className="text-xl font-black">{fila.marca}</SheetTitle>
                <ChipEstado estado={fila.estado} />
              </div>
              <SheetDescription>
                {nombreMes(data.mes)} · {data.sedes.map((s) => s.nombre).join(", ")} · {fila.facturas} facturas, {fila.clientes} clientes, {fila.unidades.toLocaleString("es-VE")} unidades
              </SheetDescription>
            </SheetHeader>

            <div className="p-5 space-y-6">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-slate-500">Avance contra la meta</span>
                  <span className={`text-2xl font-black tabular-nums ${colorPct(fila.cumplimiento)}`}>{porcentaje(fila.cumplimiento, 1)}</span>
                </div>
                <BarraProgreso fila={fila} avance={data.periodo.avance} enCurso={enCurso} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Dato label="Meta del mes" valor={dinero(fila.meta)} sub={fila.meta == null ? "Sin meta asignada" : `Peso ${porcentaje(data.totales.metaTotal ? (fila.meta / data.totales.metaTotal) * 100 : null, 1)} del total`} />
                <Dato label="Vendido" valor={dinero(fila.vendido)} sub={`${porcentaje(fila.participacion, 1)} de la venta de la sede`} />
                <Dato label="Falta" valor={fila.meta == null ? "–" : fila.falta ? dinero(fila.falta) : "Cumplida"} sub={fila.ritmoNecesario ? `${dinero(fila.ritmoNecesario)} por día hábil` : undefined} />
                {enCurso && <Dato label="Meta al día" valor={dinero(fila.metaAlDia)} sub={<span className={colorPct(fila.cumplimientoAlDia)}>{porcentaje(fila.cumplimientoAlDia)} logrado</span>} />}
                {enCurso && <Dato label="Proyección" valor={dinero(fila.proyeccion)} sub={<span className={colorPct(fila.proyeccionPct)}>{porcentaje(fila.proyeccionPct)} de la meta</span>} />}
                {enCurso && <Dato label="Ritmo actual" valor={dinero(fila.ritmoActual)} sub="por día hábil" />}
                <Dato label="Promedio 3 meses" valor={dinero(fila.promedio3m)} sub={fila.variacionVsPromedio != null ? <span className={fila.variacionVsPromedio >= 0 ? "text-emerald-600" : "text-red-600"}>{fila.variacionVsPromedio >= 0 ? "+" : ""}{porcentaje(fila.variacionVsPromedio)} {enCurso ? "proyectado" : "este mes"}</span> : undefined} />
              </div>

              <div>
                <p className="text-sm font-bold text-slate-800 mb-2">Semana a semana</p>
                <GraficoSemanas
                  alto={190}
                  semanas={data.semanas.map((s, i) => ({ label: s.label, diasHabiles: s.diasHabiles, futura: s.futura, vendido: fila.semanas[i]?.vendido ?? 0, meta: fila.semanas[i]?.meta ?? null }))}
                />
              </div>

              <div>
                <p className="text-sm font-bold text-slate-800 mb-2">Últimos 6 meses {enCurso && <span className="font-normal text-xs text-slate-400">(el mes actual es proyección)</span>}</p>
                <ResponsiveContainer width="100%" height={170}>
                  <BarChart data={historia} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                    <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => dineroCorto(v)} />
                    <Tooltip
                      cursor={{ fill: "#f8fafc" }}
                      formatter={(v: any) => [dinero(Number(v)), "Venta"]}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                    />
                    <Bar dataKey="valor" radius={[4, 4, 0, 0]} maxBarSize={36}>
                      {historia.map((h) => <Cell key={h.mes} fill={h.actual ? "#2563eb" : "#93c5fd"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {fila.meta != null && <p className="text-[11px] text-slate-400">Meta de {nombreMes(data.mes)}: {dinero(fila.meta)}.</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <Top titulo="Principales clientes" filas={fila.topClientes} />
                <Top titulo="Vendedores" filas={fila.topVendedores} />
              </div>
              <Top titulo="Productos más vendidos" filas={fila.topProductos} conUnidades />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
