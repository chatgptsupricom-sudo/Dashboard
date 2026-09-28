"use client";

/**
 * Opiniones de clientes: lo que responden en la encuesta pública de ventas y
 * RMA ("Queremos conocer su opinión"). Resumen por pregunta + cada respuesta
 * con sus comentarios, filtrable por sede (superadmin), ejecutivo y fechas.
 *
 * Datos: `/api/opiniones` (solo lectura sobre `auditoria_comercial_respuestas`).
 */

import {
  Building2,
  Download,
  Loader2,
  MapPin,
  MessageSquareHeart,
  Search,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  PREGUNTAS,
  opcionDe,
  type Pregunta,
  type RespuestaOpinion,
  type Tono,
} from "@/lib/opiniones/preguntas";

interface Sede {
  id: number;
  name: string;
}

const TONO_BARRA: Record<Tono, string> = {
  positivo: "bg-emerald-500",
  neutral: "bg-amber-400",
  negativo: "bg-rose-500",
};
const TONO_CHIP: Record<Tono, string> = {
  positivo: "bg-emerald-50 text-emerald-700 border-emerald-200",
  neutral: "bg-amber-50 text-amber-700 border-amber-200",
  negativo: "bg-rose-50 text-rose-700 border-rose-200",
};

const selectCls =
  "text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 outline-none";

function isoHaceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const fechaCorta = (iso: string) =>
  new Intl.DateTimeFormat("es-VE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/** % de respuestas con la opción positiva en un conjunto de preguntas. */
function porcentajePositivo(respuestas: RespuestaOpinion[], preguntas: Pregunta[]): number | null {
  let total = 0;
  let positivas = 0;
  for (const r of respuestas) {
    for (const p of preguntas) {
      const op = opcionDe(p, r[p.campo]);
      if (!op) continue;
      total++;
      if (op.tono === "positivo") positivas++;
    }
  }
  return total ? Math.round((positivas / total) * 100) : null;
}

export function Opiniones() {
  const [sede, setSede] = useState("all");
  const [desde, setDesde] = useState(isoHaceDias(90));
  const [hasta, setHasta] = useState(isoHaceDias(0));
  const [ejecutivo, setEjecutivo] = useState("");

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [esSuperAdmin, setEsSuperAdmin] = useState(false);
  const [sedeActual, setSedeActual] = useState<string | null>(null);
  const [sinDatosDeSede, setSinDatosDeSede] = useState(false);
  const [respuestas, setRespuestas] = useState<RespuestaOpinion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const consultar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ desde, hasta });
      if (sede !== "all") qs.set("sede", sede);
      const res = await fetch(`/api/opiniones?${qs}`);
      const j = await res.json();
      if (!res.ok) {
        setError(j.error || "No se pudieron cargar las opiniones.");
        setRespuestas([]);
        return;
      }
      setEsSuperAdmin(j.esSuperAdmin);
      setSedes(j.sedes || []);
      setSedeActual(j.sedeActual);
      setSinDatosDeSede(j.sinDatosDeSede);
      setRespuestas(j.respuestas || []);
    } catch {
      setError("No hay conexión con el servidor.");
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, sede]);

  useEffect(() => {
    consultar();
    // Solo al entrar y al cambiar de sede; las fechas se aplican con "Consultar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sede]);

  const ejecutivos = useMemo(
    () => [...new Set(respuestas.map((r) => r.ejecutivo))].sort((a, b) => a.localeCompare(b, "es")),
    [respuestas],
  );

  const visibles = useMemo(
    () => (ejecutivo ? respuestas.filter((r) => r.ejecutivo === ejecutivo) : respuestas),
    [respuestas, ejecutivo],
  );

  const conRma = visibles.filter((r) => r.tramitoRma);
  const preguntasVentas = PREGUNTAS.filter((p) => p.bloque === "ventas");
  const preguntasRma = PREGUNTAS.filter((p) => p.bloque === "rma");
  const pctVentas = porcentajePositivo(visibles, preguntasVentas);
  const pctRma = porcentajePositivo(conRma, preguntasRma);

  const exportar = () => {
    const filas = visibles.map((r) => {
      const fila: Record<string, string> = {
        Fecha: fechaCorta(r.fecha),
        "Razón social": r.razonSocial,
        Correo: r.email ?? "",
        Ejecutivo: r.ejecutivo,
        Sede: r.sede ?? "",
      };
      for (const p of PREGUNTAS) {
        if (p.campo === "p9") {
          fila["¿Tramitó garantías?"] = r.tramitoRma ? "Sí" : "No";
        }
        fila[p.titulo] = opcionDe(p, r[p.campo])?.label ?? "";
        if (p.campo === "p6") fila["Observación sobre ventas"] = r.observacionVentas ?? "";
      }
      fila["Comentario sobre RMA"] = r.comentarioRma ?? "";
      fila["Mejora sugerida"] = r.mejora ?? "";
      return fila;
    });
    const ws = XLSX.utils.json_to_sheet(filas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Opiniones");
    XLSX.writeFile(wb, `opiniones_clientes_${desde}_a_${hasta}.xlsx`);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-50">
            <MessageSquareHeart className="text-blue-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
              Opiniones de clientes
            </h1>
            <p className="text-sm text-slate-500">
              Lo que responden los clientes sobre su ejecutivo de ventas y el servicio de RMA
              {!esSuperAdmin && sedeActual ? ` · ${sedeActual}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {esSuperAdmin && sedes.length > 0 && (
            <div className="bg-white border rounded-xl p-2 flex items-center gap-2 shadow-sm">
              <MapPin size={16} className="text-slate-400 ml-2" />
              <select
                value={sede}
                onChange={(e) => {
                  setEjecutivo("");
                  setSede(e.target.value);
                }}
                className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent cursor-pointer"
              >
                <option value="all">Todas las Sedes</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button
            onClick={exportar}
            disabled={cargando || visibles.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl shadow-sm hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all duration-300 font-bold text-xs uppercase tracking-widest active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Download size={16} />
            Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {sinDatosDeSede && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          La encuesta todavía no registra la sede de cada respuesta, así que no se pueden filtrar por
          sucursal. Actualiza la landing de la encuesta para que empiecen a aparecer aquí.
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Ejecutivo de ventas
            </label>
            <select value={ejecutivo} onChange={(e) => setEjecutivo(e.target.value)} className={selectCls}>
              <option value="">Todos</option>
              {ejecutivos.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              Rango de fechas
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className={selectCls + " flex-1"}
              />
              <span className="text-slate-400 text-xs">a</span>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className={selectCls + " flex-1"}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => consultar()}
            disabled={cargando}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl shadow-sm hover:bg-blue-700 transition-all font-bold text-xs uppercase tracking-widest active:scale-95 disabled:opacity-50"
          >
            {cargando ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Consultar
          </button>
        </div>
      </div>

      {cargando ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
          <Loader2 size={18} className="animate-spin" />
          Cargando opiniones…
        </div>
      ) : visibles.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm py-16 text-center">
          <MessageSquareHeart className="mx-auto text-slate-300" size={36} />
          <p className="mt-3 font-bold text-slate-700">Todavía no hay opiniones en este período</p>
          <p className="text-sm text-slate-500">
            Cuando los clientes respondan la encuesta, sus respuestas aparecerán aquí.
          </p>
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo="Respuestas" valor={String(visibles.length)} />
            <Tarjeta
              titulo="Valoración de ventas"
              valor={pctVentas === null ? "—" : `${pctVentas}%`}
              nota="respuestas en la mejor opción"
            />
            <Tarjeta
              titulo="Tramitaron garantías"
              valor={String(conRma.length)}
              nota={`${Math.round((conRma.length / visibles.length) * 100)}% de los clientes`}
            />
            <Tarjeta
              titulo="Valoración de RMA"
              valor={pctRma === null ? "—" : `${pctRma}%`}
              nota="respuestas en la mejor opción"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <BloqueResumen
              icono={<Building2 size={18} className="text-blue-600" />}
              titulo="Ejecutivo de ventas"
              preguntas={preguntasVentas}
              respuestas={visibles}
            />
            <BloqueResumen
              icono={<Wrench size={18} className="text-blue-600" />}
              titulo="Garantías y RMA"
              preguntas={preguntasRma}
              respuestas={conRma}
            />
          </div>

          {/* Respuestas */}
          <div className="space-y-3">
            <h2 className="text-sm font-black text-slate-700 uppercase tracking-wide">
              Respuestas ({visibles.length})
            </h2>
            {visibles.map((r) => (
              <TarjetaRespuesta key={r.id} r={r} mostrarSede={esSuperAdmin} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Tarjeta({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{titulo}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{valor}</p>
      {nota && <p className="text-xs text-slate-500">{nota}</p>}
    </div>
  );
}

function BloqueResumen({
  icono,
  titulo,
  preguntas,
  respuestas,
}: {
  icono: React.ReactNode;
  titulo: string;
  preguntas: Pregunta[];
  respuestas: RespuestaOpinion[];
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2">
        {icono}
        <h2 className="font-black text-slate-800">{titulo}</h2>
        <span className="text-xs text-slate-400">({respuestas.length} respuestas)</span>
      </div>
      {respuestas.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Ningún cliente de este período tramitó garantías.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {preguntas.map((p) => {
            const conteos = p.opciones.map((o) => ({
              ...o,
              n: respuestas.filter((r) => r[p.campo] === o.value).length,
            }));
            const total = conteos.reduce((s, o) => s + o.n, 0) || 1;
            return (
              <div key={p.campo}>
                <p className="text-sm font-bold text-slate-700">{p.titulo}</p>
                <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  {conteos.map((o) =>
                    o.n > 0 ? (
                      <div
                        key={o.value}
                        className={TONO_BARRA[o.tono]}
                        style={{ width: `${(o.n / total) * 100}%` }}
                        title={`${o.label}: ${o.n}`}
                      />
                    ) : null,
                  )}
                </div>
                <ul className="mt-2 grid gap-1">
                  {conteos.map((o) => (
                    <li key={o.value} className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${TONO_BARRA[o.tono]}`} />
                        {o.label}
                      </span>
                      <span className="font-bold text-slate-700 tabular-nums">
                        {o.n} · {Math.round((o.n / total) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Respuesta({ pregunta, value }: { pregunta: Pregunta; value: string | null }) {
  const op = opcionDe(pregunta, value);
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{pregunta.titulo}</p>
      {op ? (
        <span className={`mt-1 inline-block rounded-md border px-2 py-0.5 text-xs font-semibold ${TONO_CHIP[op.tono]}`}>
          {op.label}
        </span>
      ) : (
        <span className="mt-1 inline-block text-xs text-slate-400">Sin respuesta</span>
      )}
    </div>
  );
}

function Comentario({ titulo, texto }: { titulo: string; texto: string | null }) {
  if (!texto) return null;
  return (
    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">{titulo}</p>
      <p className="mt-0.5 text-sm text-slate-700 whitespace-pre-line">{texto}</p>
    </div>
  );
}

function TarjetaRespuesta({ r, mostrarSede }: { r: RespuestaOpinion; mostrarSede: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <p className="font-black text-slate-900">{r.razonSocial}</p>
          <p className="text-sm text-slate-500">
            Ejecutivo: <span className="font-semibold text-slate-700">{r.ejecutivo}</span>
            {mostrarSede && r.sede ? ` · ${r.sede}` : ""}
            {r.email ? ` · ${r.email}` : ""}
          </p>
        </div>
        <p className="text-xs text-slate-400 whitespace-nowrap">{fechaCorta(r.fecha)}</p>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {PREGUNTAS.filter((p) => p.bloque === "ventas").map((p) => (
          <Respuesta key={p.campo} pregunta={p} value={r[p.campo]} />
        ))}
      </div>

      {r.tramitoRma ? (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-slate-100 pt-4">
          {PREGUNTAS.filter((p) => p.bloque === "rma").map((p) => (
            <Respuesta key={p.campo} pregunta={p} value={r[p.campo]} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">No tramitó garantías en los últimos 6 meses.</p>
      )}

      {(r.observacionVentas || r.comentarioRma || r.mejora) && (
        <div className="mt-4 grid gap-2">
          <Comentario titulo="Observación sobre ventas" texto={r.observacionVentas} />
          <Comentario titulo="Comentario sobre RMA" texto={r.comentarioRma} />
          <Comentario titulo="Mejora sugerida" texto={r.mejora} />
        </div>
      )}
    </div>
  );
}
