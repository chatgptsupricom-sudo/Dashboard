"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { EstadoTrabajo, Nivel } from "@/lib/inteligencia-negocio/clasificacion/tipos";
import { Loader2, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Piezas comunes de la Clasificación de Inteligencia de Negocio
 * (lib/inteligencia-negocio/clasificacion): seguir el avance de la IA, que
 * corre en el servidor, y el nivel de confianza.
 */

/**
 * Avance de la clasificación con IA. Mientras corre consulta `?estado=1`
 * cada 4 s y, al terminar, llama a `alTerminar` (recargar la lista).
 */
export function useAvanceIA(ruta: string, inicial: EstadoTrabajo | undefined, alTerminar: () => void) {
  const [estado, setEstado] = useState<EstadoTrabajo | undefined>(inicial);
  const alTerminarRef = useRef(alTerminar);
  alTerminarRef.current = alTerminar;

  useEffect(() => setEstado(inicial), [inicial]);

  useEffect(() => {
    if (!estado?.corriendo) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${ruta}?estado=1`).then((x) => x.json());
        const nuevo: EstadoTrabajo | undefined = r?.data?.estado;
        if (!nuevo) return;
        setEstado(nuevo);
        if (!nuevo.corriendo) alTerminarRef.current();
      } catch {
        setEstado((e) => (e ? { ...e } : e)); // reintenta en el próximo ciclo
      }
    }, 4000);
    return () => clearTimeout(t);
  }, [estado, ruta]);

  const empezar = useCallback(
    async (cuerpo: object): Promise<string | null> => {
      const r = await fetch(ruta, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      }).then((x) => x.json()).catch(() => null);
      if (!r?.success) return r?.error || "No se pudo empezar la clasificación";
      setEstado(r.data.estado);
      return null;
    },
    [ruta],
  );

  return { estado, empezar };
}

export function PanelIA({
  estado,
  hayIA,
  children,
  texto,
}: {
  estado: EstadoTrabajo | undefined;
  hayIA: boolean;
  /** Botones para empezar. */
  children: ReactNode;
  texto: ReactNode;
}) {
  const pct = estado && estado.total > 0 ? Math.round((estado.hechos / estado.total) * 100) : 0;
  return (
    <Card className="bg-white">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-sm text-slate-600 min-w-0">
            <Sparkles className="h-4 w-4 mt-0.5 text-violet-600 shrink-0" />
            <div className="min-w-0">{texto}</div>
          </div>
          {hayIA ? (
            <div className="flex flex-wrap gap-2 shrink-0">{children}</div>
          ) : (
            <p className="text-xs text-amber-700">El servidor no tiene IA configurada (OPENAI_API_KEY o ANTHROPIC_API_KEY).</p>
          )}
        </div>
        {estado?.corriendo && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Clasificando con IA: {estado.hechos.toLocaleString("en-US")} de {estado.total.toLocaleString("en-US")} ({pct}%).
              Puedes salir de la pantalla: sigue en el servidor.
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        )}
        {estado && !estado.corriendo && estado.fin && (
          <p className="text-xs text-slate-500">
            Última clasificación: {estado.total.toLocaleString("en-US")} revisados
            {estado.errores > 0 ? `, ${estado.errores.toLocaleString("en-US")} con error (${estado.mensaje})` : ""}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

const COLORES_NIVEL: Record<Nivel, string> = {
  Alto: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Medio: "bg-amber-50 text-amber-700 border-amber-200",
  Bajo: "bg-red-50 text-red-700 border-red-200",
};

export function EtiquetaNivel({ nivel, manual }: { nivel: Nivel | null; manual?: boolean }) {
  if (!nivel) return <span className="text-slate-400 text-xs">Sin clasificar</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${COLORES_NIVEL[nivel]}`}>
      {nivel}
      {manual && <span className="font-normal opacity-70">· manual</span>}
    </span>
  );
}
