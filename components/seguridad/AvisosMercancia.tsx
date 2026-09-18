"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Package, ShieldCheck, X } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";
import type { AvisoMercancia } from "@/lib/seguridad/eventos";
import { useMercanciaEnVivo } from "@/lib/seguridad/useMercanciaEnVivo";

/**
 * Cartel flotante de "llego un egreso nuevo" / "lo verificaron en el porton".
 *
 * El listado y los dashboards ya se refrescan solos con el mismo evento, pero
 * un numero que cambia sin que nadie lo vea no avisa nada: si Seguridad esta
 * mirando la pantalla, la fila nueva aparece abajo y pasa desapercibida. Esto
 * lo dice, con el documento y un enlace directo al registro.
 *
 * Se va solo a los 10 segundos (o al cerrarlo). No se guarda nada: es un
 * aviso de lo que pasa mientras la pantalla esta abierta, no una bandeja de
 * notificaciones — para eso esta el propio listado.
 */

const DURACION_MS = 10_000;
const MAX_VISIBLES = 3;

type Tono = "nuevo" | "bien" | "mal" | "turno";
type Cartel = { texto: string; tono: Tono };
type Aviso = AvisoMercancia & Cartel & { clave: number };

const ICONO: Record<Tono, typeof Package> = {
  nuevo: Package,
  bien: CheckCircle2,
  mal: AlertTriangle,
  turno: ShieldCheck,
};
const TONO: Record<Tono, string> = {
  nuevo: "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]",
  bien: "bg-emerald-50 text-emerald-600",
  mal: "bg-red-50 text-red-600",
  turno: "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]",
};

/**
 * Que cartel (si alguno) merece este aviso para este rol.
 *
 * En el egreso por etapas no se avisa de cada paso a todos: eso seria ruido
 * cada pocos minutos. Solo lo que le cambia el trabajo a quien lo ve:
 *  - Almacen: llego un egreso nuevo por armar, y el resultado del porton.
 *  - Seguridad: un egreso quedo listo para verificar en el porton.
 * Los demas pasos igual refrescan listado y detalle, sin cartel.
 */
function cartelPara(
  aviso: AvisoMercancia,
  rolSesion: string,
  tm: ReturnType<typeof useTranslations>,
): Cartel | null {
  const esAlmacen = rolSesion === "almacen" || rolSesion === "superadmin";
  const esSeguridad = rolSesion === "seguridad" || rolSesion === "superadmin";

  if (aviso.etapa) {
    if (aviso.accion === "creado" && aviso.etapa === "por_armar") {
      return esAlmacen ? { texto: tm("nuevo_por_armar"), tono: "nuevo" } : null;
    }
    if (aviso.etapa === "por_verificar") {
      return esSeguridad ? { texto: tm("listo_verificar"), tono: "turno" } : null;
    }
    if (aviso.etapa === "por_calificar") {
      if (!esAlmacen) return null;
      return aviso.aprobado
        ? { texto: tm("aprobado"), tono: "bien" }
        : { texto: tm("no_aprobado"), tono: "mal" };
    }
    return null;
  }

  // Flujo simple (ingreso y egresos viejos). Una verificacion que quedo
  // "pendiente" (nadie conto nada todavia) no es noticia.
  if (aviso.accion === "verificado") {
    if (aviso.estado === "pendiente") return null;
    const descuadre = aviso.estado === "descuadre";
    return {
      texto: tm(descuadre ? "verificado_descuadre" : "verificado_conforme", {
        tipo: tm(aviso.tipo === "ingreso" ? "un_ingreso" : "un_egreso"),
      }),
      tono: descuadre ? "mal" : "bien",
    };
  }
  return {
    texto: tm(aviso.tipo === "ingreso" ? "nuevo_ingreso" : "nuevo_egreso"),
    tono: "nuevo",
  };
}

export default function AvisosMercancia({
  /** Solo avisa de este sentido; sin esto, avisa de los dos. */
  tipo,
}: {
  tipo?: "ingreso" | "egreso";
}) {
  const tm = useTranslations("seguridad.mercancia.aviso");
  const { user } = useAuthStore();
  const rol = (user?.role || "").toLowerCase().trim();
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  // Cada cartel tiene su propio temporizador; se limpian al desmontar para no
  // dejar timers vivos si alguien cambia de pantalla enseguida.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  const quitar = useCallback((clave: number) => {
    setAvisos((previos) => previos.filter((a) => a.clave !== clave));
  }, []);

  useMercanciaEnVivo((aviso) => {
    if (tipo && aviso.tipo !== tipo) return;
    const cartel = cartelPara(aviso, rol, tm);
    if (!cartel) return;

    const clave = Date.now() + Math.random();
    setAvisos((previos) => [{ ...aviso, ...cartel, clave }, ...previos].slice(0, MAX_VISIBLES));
    timers.current.push(setTimeout(() => quitar(clave), DURACION_MS));
  });

  if (avisos.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-30 flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]"
      // Los carteles se anuncian solos a un lector de pantalla, sin robar el
      // foco a quien esta contando renglones.
      role="status"
      aria-live="polite"
    >
      {avisos.map((aviso) => {
        const Icono = ICONO[aviso.tono];
        const malo = aviso.tono === "mal";

        return (
          <div
            key={aviso.clave}
            className={`flex items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-lg ${
              malo ? "border-red-200" : "border-slate-200"
            }`}
          >
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${TONO[aviso.tono]}`}
            >
              <Icono className="w-4 h-4" />
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{aviso.texto}</p>
              {aviso.documento && (
                <p className="text-xs text-slate-500 truncate">{aviso.documento}</p>
              )}
              <Link
                href={`/${locale}/seguridad/mercancia/${aviso.tipo}/${aviso.id}`}
                onClick={() => quitar(aviso.clave)}
                className="inline-block mt-1 text-xs font-semibold text-[color:var(--portal-primary,#741DFE)] hover:underline"
              >
                {tm("ver")}
              </Link>
            </div>

            <button
              type="button"
              onClick={() => quitar(aviso.clave)}
              aria-label={tm("cerrar")}
              className="p-1 -m-1 text-slate-300 hover:text-slate-500 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
