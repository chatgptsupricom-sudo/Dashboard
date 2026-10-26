"use client";

import {
  CAMPO_POR_CLAVE,
  FASES,
  SEDES_SELECCION,
  opcion,
  situacion,
  slaCandidato,
  type Candidato,
  type EstadoReq,
  type Requisicion,
} from "@/lib/seleccion/tipos";
import { URGENCIAS, type OrigenSolicitud } from "@/lib/solicitudes-personal/tipos";
import { AlertTriangle, Pencil, UserPlus } from "lucide-react";
import { CampoFecha, Dias, Pastilla, TONO, fechaCorta } from "./comunes";

export type Grupo = { requisicion: Requisicion; estado: EstadoReq; candidatos: Candidato[] };

const BANDAS = [
  { titulo: "1. Vacante", columnas: 4, cls: "bg-slate-700 text-white" },
  { titulo: "2. Candidato", columnas: 4, cls: "bg-blue-700 text-white" },
  { titulo: "3. Seguimiento de fases (flujograma)", columnas: 11, cls: "bg-indigo-700 text-white" },
  { titulo: "4. Cierre y control", columnas: 4, cls: "bg-emerald-700 text-white" },
];

const COLUMNAS = [
  "ID requisición",
  "Fecha recepción",
  "Unidad solicitante",
  "Cargo vacante",
  "Nombre",
  "Teléfono",
  "Correo",
  "Fuente",
  "Sondeo telefónico",
  "Entrevista RRHH (fecha)",
  "Calificación",
  "Evaluaciones / test",
  "Puntuación",
  "Entrevista técnica",
  "Concepto",
  "Referencias",
  "Terna (top 3)",
  "Oferta salarial",
  "Exámenes médicos",
  "Estatus final",
  "Fecha de ingreso",
  "Días (SLA)",
  "Situación",
];

/** Select de una fase, pintado con el color de su valor. */
function CeldaOpcion({ c, clave, onCambiar }: { c: Candidato; clave: keyof Candidato; onCambiar: (cambios: Partial<Candidato>) => void }) {
  const campo = CAMPO_POR_CLAVE.get(clave as string)!;
  const valor = (c[clave] as string | null) ?? "";
  const o = opcion(campo, valor);
  return (
    <select
      value={valor}
      onChange={(e) => onCambiar({ [clave]: e.target.value || null } as Partial<Candidato>)}
      title={campo.etiqueta}
      className={`max-w-[150px] cursor-pointer rounded-md border px-1.5 py-1 text-xs font-medium ${
        o ? TONO[o.tono] : "border-slate-200 bg-white text-slate-400"
      }`}
    >
      {clave !== "estatus" && <option value="">—</option>}
      {campo.opciones!.map((x) => (
        <option key={x.valor} value={x.valor}>
          {x.etiqueta}
        </option>
      ))}
    </select>
  );
}

const td = "border-b border-slate-100 px-2 py-1.5 align-middle";

export function Matriz({
  grupos,
  origenes = {},
  puedeEditar,
  onCambiar,
  onEditarCandidato,
  onNuevoCandidato,
  onEditarRequisicion,
}: {
  grupos: Grupo[];
  /** Solicitud de personal de donde nació cada requisición (por id de requisición). */
  origenes?: Record<number, OrigenSolicitud>;
  puedeEditar: boolean;
  onCambiar: (c: Candidato, cambios: Partial<Candidato>) => void;
  onEditarCandidato: (c: Candidato) => void;
  onNuevoCandidato: (requisicionId: number) => void;
  onEditarRequisicion: (r: Requisicion) => void;
}) {
  if (!grupos.length) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        No hay requisiciones con estos filtros.
      </p>
    );
  }

  return (
    <div data-tour="sel-matriz" className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[2200px] border-collapse text-sm">
        <thead>
          <tr>
            {BANDAS.map((b) => (
              <th key={b.titulo} colSpan={b.columnas} className={`px-2 py-1.5 text-left text-xs font-bold uppercase tracking-wide ${b.cls}`}>
                {b.titulo}
              </th>
            ))}
          </tr>
          <tr className="bg-slate-50">
            {COLUMNAS.map((c) => (
              <th key={c} className="whitespace-nowrap border-b border-slate-200 px-2 py-2 text-left text-xs font-semibold text-slate-600">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map(({ requisicion: r, estado, candidatos }) => {
            const filas = Math.max(1, candidatos.length) + (puedeEditar ? 1 : 0);
            const celdasVacante = (
              <>
                <td rowSpan={filas} data-tour="sel-requisicion" className={`${td} border-r border-slate-200 bg-slate-50/60 align-top`}>
                  <button
                    onClick={() => onEditarRequisicion(r)}
                    disabled={!puedeEditar}
                    className="group flex items-center gap-1 whitespace-nowrap font-mono text-xs font-bold text-slate-800 hover:text-blue-700 disabled:hover:text-slate-800"
                  >
                    {r.codigo}
                    {puedeEditar && <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100" />}
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Pastilla tono={estado.tono}>{estado.etiqueta}</Pastilla>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {SEDES_SELECCION[r.sede]} · {estado.contratados}/{r.vacantes} vac.
                  </div>
                  <div className="mt-1 text-xs">
                    <Dias dias={estado.dias} tono={estado.semaforo} meta={r.meta_dias} />
                  </div>
                </td>
                <td rowSpan={filas} className={`${td} bg-slate-50/60 align-top text-xs tabular-nums text-slate-700`}>
                  {fechaCorta(r.fecha_recepcion)}
                </td>
                <td rowSpan={filas} className={`${td} bg-slate-50/60 align-top text-xs text-slate-700`}>
                  {r.unidad_solicitante || "—"}
                </td>
                <td rowSpan={filas} className={`${td} border-r border-slate-200 bg-slate-50/60 align-top text-xs font-semibold text-slate-800`}>
                  {r.cargo}
                  {origenes[r.id] && (
                    <div className="mt-1 space-y-1 text-[11px] font-normal text-slate-500">
                      <Pastilla tono={URGENCIAS[origenes[r.id].urgencia].tono}>
                        SP-{origenes[r.id].id} · urgencia {URGENCIAS[origenes[r.id].urgencia].etiqueta.toLowerCase()}
                      </Pastilla>
                      <div>Pidió {origenes[r.id].solicitante_nombre}</div>
                      {origenes[r.id].decidido_por_nombre && <div>Aprobó {origenes[r.id].decidido_por_nombre}</div>}
                      {origenes[r.id].fecha_deseada && <div>Ingreso deseado {fechaCorta(origenes[r.id].fecha_deseada)}</div>}
                    </div>
                  )}
                </td>
              </>
            );

            const filaAgregar = puedeEditar && (
              <tr key={`add-${r.id}`}>
                {!candidatos.length && celdasVacante}
                <td colSpan={COLUMNAS.length - 4} className="border-b border-slate-200 px-2 py-1">
                  <button
                    data-tour="sel-agregar"
                    onClick={() => onNuevoCandidato(r.id)}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Agregar candidato
                  </button>
                </td>
              </tr>
            );

            if (!candidatos.length) {
              return puedeEditar ? (
                filaAgregar
              ) : (
                <tr key={r.id}>
                  {celdasVacante}
                  <td colSpan={COLUMNAS.length - 4} className={`${td} text-xs text-slate-400`}>
                    Sin candidatos todavía.
                  </td>
                </tr>
              );
            }

            return [
              ...candidatos.map((c, i) => {
                const s = situacion(c);
                const sla = slaCandidato(c, r);
                const cambiar = (cambios: Partial<Candidato>) => onCambiar(c, cambios);
                const sel = (clave: keyof Candidato) =>
                  puedeEditar ? (
                    <CeldaOpcion c={c} clave={clave} onCambiar={cambiar} />
                  ) : (
                    (() => {
                      const o = opcion(CAMPO_POR_CLAVE.get(clave as string), c[clave] as string);
                      return o ? <Pastilla tono={o.tono}>{o.etiqueta}</Pastilla> : <span className="text-slate-300">—</span>;
                    })()
                  );
                const fecha = (clave: keyof Candidato) =>
                  puedeEditar ? (
                    <CampoFecha valor={c[clave] as string | null} onGuardar={(v) => cambiar({ [clave]: v } as Partial<Candidato>)} />
                  ) : (
                    <span className="text-xs tabular-nums">{fechaCorta(c[clave] as string | null)}</span>
                  );
                return (
                  <tr key={c.id} className="hover:bg-blue-50/30">
                    {i === 0 && celdasVacante}
                    <td className={td}>
                      <button
                        onClick={() => onEditarCandidato(c)}
                        className="whitespace-nowrap text-left text-xs font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {c.nombre}
                      </button>
                    </td>
                    <td className={`${td} whitespace-nowrap text-xs text-slate-600`}>{c.telefono || "—"}</td>
                    <td className={`${td} max-w-[180px] truncate text-xs text-slate-600`} title={c.correo}>
                      {c.correo || "—"}
                    </td>
                    <td className={`${td} whitespace-nowrap border-r border-slate-200 text-xs text-slate-600`}>{c.fuente || "—"}</td>
                    <td className={td}>{sel("sondeo")}</td>
                    <td className={td}>{fecha("entrevista_rrhh_fecha")}</td>
                    <td className={td}>{sel("entrevista_rrhh")}</td>
                    <td className={td}>{sel("evaluacion")}</td>
                    <td className={`${td} max-w-[120px] truncate text-xs text-slate-600`} title={c.evaluacion_puntaje}>
                      {c.evaluacion_puntaje || "—"}
                    </td>
                    <td className={td}>
                      <div className="flex flex-col gap-1">
                        {fecha("entrevista_tecnica_fecha")}
                        {sel("entrevista_tecnica")}
                      </div>
                    </td>
                    <td className={`${td} max-w-[160px] truncate text-xs text-slate-600`} title={c.entrevista_tecnica_concepto}>
                      {c.entrevista_tecnica_concepto || "—"}
                    </td>
                    <td className={td}>{sel("referencias")}</td>
                    <td className={td}>{sel("terna")}</td>
                    <td className={td}>{sel("oferta")}</td>
                    <td className={`${td} border-r border-slate-200`}>{sel("examenes")}</td>
                    <td className={td}>{sel("estatus")}</td>
                    <td className={td}>{fecha("fecha_ingreso")}</td>
                    <td className={`${td} whitespace-nowrap text-xs`}>
                      {sla == null ? <span className="text-slate-300">—</span> : (
                        <Dias dias={sla} tono={sla > r.meta_dias ? "rojo" : "verde"} meta={r.meta_dias} />
                      )}
                    </td>
                    <td className={td}>
                      <div className="flex items-center gap-1.5">
                        {s.porCerrar && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" aria-label="Falta cerrar el estatus final" />}
                        <Pastilla tono={s.tono}>{s.texto}</Pastilla>
                      </div>
                      <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-slate-100" title={`${s.avance} de ${FASES.length} fases`}>
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${(s.avance / FASES.length) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              }),
              filaAgregar,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}
