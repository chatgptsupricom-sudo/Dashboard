"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { AlertTriangle, Lightbulb, Loader2, Plus, SendHorizontal, Sparkles, XCircle } from "lucide-react";
import type { PlanIa, Recomendacion } from "@/lib/mantenimiento/ia";
import type { Equipo, Prioridad } from "@/lib/mantenimiento/tipos";
import { Card, BotonPrimario, BotonSecundario, inputClases } from "../mercancia-ui";

/**
 * El jefe de taller IA (lib/mantenimiento/ia): revisa la flota y propone qué
 * mantenimiento abrir, y responde preguntas sobre los equipos.
 *
 * Solo propone. "Crear orden" abre el mismo formulario de reportar, ya lleno,
 * para que una persona lo revise y lo confirme.
 */

const TONO_PRIORIDAD: Record<Prioridad, string> = {
  baja: "border-slate-300 bg-slate-50 text-slate-700",
  media: "border-amber-300 bg-amber-50 text-amber-800",
  alta: "border-red-300 bg-red-50 text-red-700",
};

export default function AsistenteIA({
  equipos,
  puedeEditar,
  onCrear,
}: {
  equipos: Equipo[];
  puedeEditar: boolean;
  onCrear: (r: Recomendacion) => void;
}) {
  const t = useTranslations("seguridad.mercancia.mantenimiento");
  const [ocupado, setOcupado] = useState<null | "plan" | "pregunta">(null);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanIa | null>(null);
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState<{ pregunta: string; texto: string } | null>(null);

  const consultar = async (cuerpo: Record<string, unknown>): Promise<any | null> => {
    setError(null);
    try {
      const res = await fetch("/api/seguridad/mercancia/mantenimiento/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t("error"));
      return json;
    } catch (e: any) {
      setError(e?.message || t("error"));
      return null;
    } finally {
      setOcupado(null);
    }
  };

  const analizar = async () => {
    setOcupado("plan");
    const json = await consultar({ modo: "plan" });
    if (json?.plan) setPlan(json.plan);
  };

  const preguntar = async () => {
    const q = pregunta.trim();
    if (q.length < 3 || ocupado) return;
    setOcupado("pregunta");
    const json = await consultar({ modo: "pregunta", pregunta: q });
    if (json?.respuesta) {
      setRespuesta({ pregunta: q, texto: json.respuesta });
      setPregunta("");
    }
  };

  const codigo = (id: number) => equipos.find((e) => e.id === id)?.codigo || `#${id}`;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-br from-violet-50/80 via-white to-sky-50/60">
        <span className="w-11 h-11 rounded-2xl bg-[color:var(--portal-primary,#741DFE)] text-white flex items-center justify-center shrink-0 shadow-sm">
          <Sparkles className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{t("ia.titulo")}</h2>
          <p className="text-xs text-slate-500">{t("ia.subtitulo")}</p>
        </div>
        <BotonPrimario onClick={() => void analizar()} disabled={!!ocupado || equipos.length === 0} icon={ocupado === "plan" ? undefined : Sparkles}>
          {ocupado === "plan" && <Loader2 className="w-4 h-4 animate-spin" />}
          {ocupado === "plan" ? t("ia.analizando") : t(plan ? "ia.analizar_otra_vez" : "ia.analizar")}
        </BotonPrimario>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              void preguntar();
            }}
            placeholder={t("ia.pregunta_ph")}
            aria-label={t("ia.pregunta_ph")}
            className={inputClases}
          />
          <BotonSecundario
            onClick={() => void preguntar()}
            disabled={!!ocupado || pregunta.trim().length < 3}
            icon={ocupado === "pregunta" ? undefined : SendHorizontal}
            className="shrink-0"
          >
            {ocupado === "pregunta" && <Loader2 className="w-4 h-4 animate-spin" />}
            <span className="hidden sm:inline">{t("ia.preguntar")}</span>
          </BotonSecundario>
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="min-w-0 break-words">{error}</span>
          </p>
        )}

        {respuesta && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 animate-in fade-in">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{respuesta.pregunta}</p>
            <p className="mt-1.5 text-sm text-slate-800 whitespace-pre-line break-words">{respuesta.texto}</p>
          </div>
        )}

        {plan && (
          <div className="space-y-3 animate-in fade-in">
            <p className="text-sm text-slate-800 whitespace-pre-line break-words">{plan.resumen}</p>

            {plan.alertas.length > 0 && (
              <ul className="space-y-1.5">
                {plan.alertas.map((a) => (
                  <li key={a} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                    <span className="min-w-0 break-words">{a}</span>
                  </li>
                ))}
              </ul>
            )}

            {plan.recomendaciones.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900">
                <Lightbulb className="w-4 h-4 shrink-0 text-emerald-600" />
                {t("ia.sin_recomendaciones")}
              </p>
            ) : (
              <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {plan.recomendaciones.map((r, i) => (
                  <li
                    key={`${r.equipo_id}-${i}`}
                    className="flex flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 transition-all hover:border-violet-200 hover:shadow-[0_4px_14px_rgba(116,29,254,0.08)]"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-sm font-bold tracking-wide text-slate-900">{codigo(r.equipo_id)}</span>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                        {t(`tipo_orden.${r.tipo}`)}
                      </span>
                      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TONO_PRIORIDAD[r.prioridad]}`}>
                        {t(`prioridad.${r.prioridad}`)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 break-words">{r.titulo}</p>
                    <p className="text-xs text-slate-600 break-words flex-1">{r.motivo}</p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] font-medium text-slate-400 tabular-nums">
                        {t("ia.tareas", { n: r.tareas.length })}
                      </span>
                      {puedeEditar && (
                        <BotonSecundario onClick={() => onCrear(r)} icon={Plus} className="h-9">
                          {t("ia.crear_orden")}
                        </BotonSecundario>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-slate-400">{t("ia.aviso")}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
