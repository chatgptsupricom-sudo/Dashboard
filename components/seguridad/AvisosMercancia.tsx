"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Package, X } from "lucide-react";
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

type Aviso = AvisoMercancia & { clave: number };

export default function AvisosMercancia({
  /** Solo avisa de este sentido; sin esto, avisa de los dos. */
  tipo,
}: {
  tipo?: "ingreso" | "egreso";
}) {
  const tm = useTranslations("seguridad.mercancia.aviso");
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
    // Una verificacion que quedo "pendiente" (nadie conto nada todavia) no es
    // noticia: el cartel diria que algo se verifico cuando no se verifico.
    if (aviso.accion === "verificado" && aviso.estado === "pendiente") return;

    const clave = Date.now() + Math.random();
    setAvisos((previos) => [{ ...aviso, clave }, ...previos].slice(0, MAX_VISIBLES));
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
        const descuadre = aviso.estado === "descuadre";
        const verificado = aviso.accion === "verificado";
        const Icono = verificado
          ? descuadre
            ? AlertTriangle
            : CheckCircle2
          : Package;

        const texto = verificado
          ? tm(descuadre ? "verificado_descuadre" : "verificado_conforme", {
              tipo: tm(aviso.tipo === "ingreso" ? "un_ingreso" : "un_egreso"),
            })
          : tm(aviso.tipo === "ingreso" ? "nuevo_ingreso" : "nuevo_egreso");

        return (
          <div
            key={aviso.clave}
            className={`flex items-start gap-3 rounded-2xl border bg-white px-4 py-3 shadow-lg ${
              descuadre ? "border-red-200" : "border-slate-200"
            }`}
          >
            <span
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                descuadre
                  ? "bg-red-50 text-red-600"
                  : verificado
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-violet-50 text-[color:var(--portal-primary,#741DFE)]"
              }`}
            >
              <Icono className="w-4 h-4" />
            </span>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">{texto}</p>
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
