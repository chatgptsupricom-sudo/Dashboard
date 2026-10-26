"use client";

import type { Indicadores as Datos } from "@/lib/seleccion/tipos";
import { AlertTriangle } from "lucide-react";

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}

const th = "px-3 py-2 text-left text-xs font-semibold text-slate-600";
const td = "border-t border-slate-100 px-3 py-2 text-sm tabular-nums text-slate-700";

export function Indicadores({ datos }: { datos: Datos }) {
  const tope = Math.max(1, datos.embudo[0]?.cantidad ?? 1);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tarjeta titulo="Requisiciones abiertas" valor={String(datos.abiertas)} detalle={`de ${datos.requisiciones} en el período`} />
        <Tarjeta titulo="Cubiertas" valor={String(datos.cubiertas)} />
        <Tarjeta
          titulo="Tiempo promedio de cobertura"
          valor={datos.promedioCobertura == null ? "—" : `${datos.promedioCobertura} d`}
          detalle="Fecha de ingreso − fecha de requisición"
        />
        <Tarjeta titulo="Cubiertas dentro de la meta" valor={datos.dentroDeMeta == null ? "—" : `${datos.dentroDeMeta} %`} />
        <Tarjeta titulo="Abiertas fuera de meta" valor={String(datos.vencidas)} detalle="Pasaron los días de su meta" />
        <Tarjeta titulo="Candidatos en proceso" valor={String(datos.enProceso)} detalle={`${datos.contratados} contratados · ${datos.candidatos} en total`} />
      </div>

      {datos.porCerrar > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {datos.porCerrar === 1
            ? "1 candidato no pasó una fase y sigue «En proceso»: márcale"
            : `${datos.porCerrar} candidatos no pasaron una fase y siguen «En proceso»: márcales`}{" "}
          el estatus final (descalificado o banco de elegibles).
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800">Embudo del proceso</h3>
          <p className="text-xs text-slate-500">Candidatos que pasaron cada fase, en el orden del flujograma</p>
          <div className="mt-4 space-y-2">
            {datos.embudo.map((e) => (
              <div key={e.etiqueta} className="grid grid-cols-[130px_1fr_70px] items-center gap-2 text-xs" title={`${e.etiqueta}: ${e.cantidad}`}>
                <span className="truncate text-slate-600">{e.etiqueta}</span>
                <div className="h-4 rounded-r bg-slate-50">
                  <div className="h-full rounded-r bg-blue-600" style={{ width: `${(e.cantidad / tope) * 100}%` }} />
                </div>
                <span className="text-right font-semibold tabular-nums text-slate-800">
                  {e.cantidad}
                  <span className="ml-1 font-normal text-slate-400">{Math.round((e.cantidad / tope) * 100)}%</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-4 pb-2">
            <h3 className="text-sm font-bold text-slate-800">Efectividad por fuente de reclutamiento</h3>
            <p className="text-xs text-slate-500">Qué portal trae a los que llegan a la terna y se contratan</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className={th}>Fuente</th>
                  <th className={`${th} text-right`}>Candidatos</th>
                  <th className={`${th} text-right`}>En terna</th>
                  <th className={`${th} text-right`}>Contratados</th>
                  <th className={`${th} text-right`}>Efectividad</th>
                </tr>
              </thead>
              <tbody>
                {datos.porFuente.length === 0 && (
                  <tr>
                    <td colSpan={5} className={`${td} text-center text-slate-400`}>
                      Sin candidatos.
                    </td>
                  </tr>
                )}
                {datos.porFuente.map((f) => (
                  <tr key={f.fuente}>
                    <td className={`${td} font-medium text-slate-800`}>{f.fuente}</td>
                    <td className={`${td} text-right`}>{f.candidatos}</td>
                    <td className={`${td} text-right`}>{f.terna}</td>
                    <td className={`${td} text-right`}>{f.contratados}</td>
                    <td className={`${td} text-right font-semibold`}>{f.efectividad} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="p-4 pb-2">
          <h3 className="text-sm font-bold text-slate-800">Tiempo de cobertura por unidad solicitante</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className={th}>Unidad</th>
                <th className={`${th} text-right`}>Requisiciones</th>
                <th className={`${th} text-right`}>Cubiertas</th>
                <th className={`${th} text-right`}>Promedio (días)</th>
              </tr>
            </thead>
            <tbody>
              {datos.porUnidad.map((u) => (
                <tr key={u.unidad}>
                  <td className={`${td} font-medium text-slate-800`}>{u.unidad}</td>
                  <td className={`${td} text-right`}>{u.requisiciones}</td>
                  <td className={`${td} text-right`}>{u.cubiertas}</td>
                  <td className={`${td} text-right font-semibold`}>{u.promedio ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
