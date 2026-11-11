"use client";

import { useEffect, useRef } from "react";
import { Users, X } from "lucide-react";
import { AGENTES, type EstadoEquipo } from "@/lib/agenteia/respuesta";

/**
 * Panel lateral del Agente IA con el equipo de Supri trabajando: la oficina
 * pixel-art (lib/agenteia/oficina.ts), una fila por agente con lo que hace y
 * la pizarra con lo que se pasan entre ellos. Muestra el equipo de la última
 * respuesta del chat.
 */
export default function PanelEquipo({
  equipo,
  generando,
  onCerrar,
}: {
  equipo: EstadoEquipo | null;
  generando: boolean;
  onCerrar: () => void;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const capa = useRef<HTMLDivElement>(null);
  const oficina = useRef<{ actualizar: (e: EstadoEquipo | null) => void; destruir: () => void } | null>(null);
  const finEntregas = useRef<HTMLLIElement>(null);

  // La oficina se carga aparte: solo hace falta con el panel abierto.
  useEffect(() => {
    let vivo = true;
    import("@/lib/agenteia/oficina").then(({ crearOficina }) => {
      if (!vivo || !lienzo.current || !capa.current) return;
      oficina.current = crearOficina(lienzo.current, capa.current);
      oficina.current.actualizar(equipo);
    });
    return () => {
      vivo = false;
      oficina.current?.destruir();
      oficina.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    oficina.current?.actualizar(equipo);
  }, [equipo]);

  const entregas = equipo?.entregas ?? [];
  useEffect(() => {
    finEntregas.current?.scrollIntoView({ block: "nearest" });
  }, [entregas.length]);

  const trabajando = AGENTES.filter((a) => equipo?.agentes[a.id]?.estado === "trabajando").length;
  const nombre = (id: string) => AGENTES.find((a) => a.id === id);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 h-12 border-b border-slate-200 shrink-0">
        <Users size={16} className="text-blue-600" />
        <span className="font-semibold text-sm text-slate-800">Equipo de Supri</span>
        <span className="text-xs text-slate-500 tabular-nums">
          {trabajando ? `Trabajando · ${trabajando}` : generando ? "Pensando…" : "En espera"}
        </span>
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar el panel del equipo"
          aria-label="Cerrar el panel del equipo"
          className="ml-auto size-8 grid place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto agente-scroll p-4 space-y-4">
        <div className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-[#e9e4d8]" style={{ aspectRatio: "240 / 150" }}>
          <canvas ref={lienzo} className="absolute inset-0 w-full h-full" style={{ imageRendering: "pixelated" }} aria-hidden="true" />
          <div ref={capa} className="absolute inset-0" aria-hidden="true" />
        </div>

        {!equipo?.usado && (
          <p className="text-sm text-slate-500">
            Cuando Supri le encargue algo a su equipo, aquí los ves trabajar. Pruébalo con «Revisen qué debemos comprar esta semana».
          </p>
        )}

        <ul className="divide-y divide-slate-100 border-y border-slate-100">
          {AGENTES.map((a) => {
            const e = equipo?.agentes[a.id];
            const estado = e?.estado ?? "esperando";
            return (
              <li key={a.id} className="py-2.5 grid grid-cols-[12px_minmax(0,1fr)_auto] gap-x-2.5 gap-y-1 items-center">
                <span className="size-3 rounded-[3px]" style={{ background: a.camisa[0] }} />
                <span className="text-sm min-w-0 truncate">
                  <b className="font-semibold text-slate-800">{a.nombre}</b>
                  <span className="text-slate-500"> · {a.rol}</span>
                </span>
                <span
                  className={`text-[11px] font-semibold px-2 rounded-full border ${
                    estado === "trabajando"
                      ? "text-blue-600 border-blue-300"
                      : estado === "listo"
                        ? "text-emerald-600 border-emerald-300"
                        : "text-slate-400 border-slate-200"
                  }`}
                >
                  {estado === "trabajando" ? "Trabajando" : estado === "listo" ? "Listo" : "Esperando"}
                </span>
                <span className="col-start-2 text-xs text-slate-500 truncate">{e?.txt || "—"}</span>
                <span className="text-[11px] text-slate-400 tabular-nums justify-self-end">
                  {e?.consultas ?? 0} {e?.consultas === 1 ? "consulta" : "consultas"}
                </span>
                <span className="col-start-2 col-span-2 h-1 rounded bg-slate-100 overflow-hidden">
                  <span
                    className={`block h-full rounded ${estado === "trabajando" ? "w-full animate-pulse" : estado === "listo" ? "w-full" : "w-0"}`}
                    style={{ background: estado === "listo" ? "#10b981" : a.camisa[0] }}
                  />
                </span>
              </li>
            );
          })}
        </ul>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Pizarra de entregas</h3>
          {entregas.length === 0 ? (
            <p className="text-sm text-slate-400">Aquí aparece lo que Supri encarga y lo que le devuelve cada especialista.</p>
          ) : (
            <ul className="space-y-2.5">
              {entregas.map((en, i) => {
                const de = nombre(en.de);
                const a = nombre(en.a);
                return (
                  <li key={i} ref={i === entregas.length - 1 ? finEntregas : undefined} className="text-sm">
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                      <span className="size-2 rounded-sm" style={{ background: de?.camisa[0] }} />
                      {de?.nombre} →
                      <span className="size-2 rounded-sm" style={{ background: a?.camisa[0] }} />
                      {a?.nombre}
                    </span>
                    <span className="text-slate-700">{en.txt}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
