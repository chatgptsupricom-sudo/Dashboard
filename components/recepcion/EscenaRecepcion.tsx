"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { MousePointerClick } from "lucide-react";
import type { ContenedorEscena, Escena, ItemEscena } from "@/lib/recepcion/escena3d";

/**
 * La descarga del packing list en 3D (lib/recepcion/escena3d): los
 * contenedores a un lado y un pallet por renglón, que se llena con lo contado.
 *
 * Es otra forma de ver el mismo conteo de abajo, no un conteo aparte: tocar un
 * pallet lleva a su renglón. three.js se carga solo aquí y solo en el
 * navegador; sin WebGL no se dibuja y la pantalla sigue igual.
 */

export type RenglonEscena = ItemEscena & { producto: string; codigo: string | null };

const LEYENDA = [
  { clave: "completo", color: "bg-emerald-400" },
  { clave: "falta", color: "bg-amber-400" },
  { clave: "sobra", color: "bg-sky-400" },
  { clave: "danado", color: "bg-red-500" },
  { clave: "sin_contar", color: "bg-slate-300" },
] as const;

export default function EscenaRecepcion({
  renglones,
  contenedores,
  seleccion,
  onSeleccion,
  resumen,
}: {
  renglones: RenglonEscena[];
  contenedores: ContenedorEscena[];
  seleccion: number | null;
  onSeleccion: (itemId: number) => void;
  /** Las cifras del conteo, ya calculadas por la pantalla (evaluarConteo). */
  resumen: { sinContar: number; faltantes: number; sobrantes: number; golpeados: number };
}) {
  const t = useTranslations("recepcion.escena");
  const caja = useRef<HTMLDivElement>(null);
  const escena = useRef<Escena | null>(null);
  const [lista, setLista] = useState(false);
  const [sinWebgl, setSinWebgl] = useState(false);
  const [encima, setEncima] = useState<number | null>(null);

  // A la escena solo le va lo que dibuja; el nombre del producto se queda aquí.
  const datos = useMemo(
    () => ({
      items: renglones.map(({ id, esperada, recibida, danado }) => ({ id, esperada, recibida, danado })),
      contenedores,
      seleccion,
    }),
    [renglones, contenedores, seleccion],
  );
  const pendiente = useRef(datos);
  const alElegir = useRef(onSeleccion);
  useEffect(() => {
    pendiente.current = datos;
    alElegir.current = onSeleccion;
  });

  useEffect(() => {
    let viva = true;
    void import("@/lib/recepcion/escena3d")
      .then(({ crearEscenaRecepcion }) => {
        if (!viva || !caja.current) return;
        escena.current = crearEscenaRecepcion(caja.current, {
          onSeleccion: (id) => alElegir.current(id),
          onEncima: setEncima,
          movimientoReducido: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        escena.current.actualizar(pendiente.current);
        setLista(true);
      })
      .catch((e) => {
        console.error("No se pudo iniciar la vista 3D de la recepción:", e);
        if (viva) setSinWebgl(true);
      });
    return () => {
      viva = false;
      escena.current?.destruir();
      escena.current = null;
    };
  }, []);

  useEffect(() => {
    escena.current?.actualizar(datos);
  }, [datos]);

  const total = renglones.reduce((s, r) => s + Math.max(0, r.esperada), 0);
  const recibido = renglones.reduce((s, r) => s + Math.min(Math.max(0, r.esperada), Math.max(0, r.recibida ?? 0)), 0);
  const avance = total > 0 ? Math.round((recibido / total) * 100) : 0;
  const contados = renglones.length - resumen.sinContar;
  const sobre = encima !== null ? renglones.find((r) => r.id === encima) : undefined;

  if (sinWebgl || renglones.length === 0) return null;

  const cifras = [
    { valor: `${avance}%`, etiqueta: t("avance"), punto: "bg-[color:var(--portal-primary,#741DFE)]" },
    { valor: `${contados}/${renglones.length}`, etiqueta: t("contados"), punto: "bg-emerald-500" },
    ...(resumen.faltantes > 0 ? [{ valor: String(resumen.faltantes), etiqueta: t("faltantes"), punto: "bg-amber-500" }] : []),
    ...(resumen.sobrantes > 0 ? [{ valor: String(resumen.sobrantes), etiqueta: t("sobrantes"), punto: "bg-sky-500" }] : []),
    ...(resumen.golpeados > 0 ? [{ valor: String(resumen.golpeados), etiqueta: t("danados"), punto: "bg-red-500" }] : []),
  ];

  return (
    <section className="relative rounded-3xl border border-slate-200/80 bg-slate-100 overflow-hidden shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div
        ref={caja}
        className={`h-[260px] sm:h-[340px] lg:h-[400px] transition-opacity duration-500 ${lista ? "opacity-100" : "opacity-0"}`}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 sm:p-4 flex flex-wrap gap-2">
        {cifras.map((c) => (
          <span
            key={c.etiqueta}
            className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/85 backdrop-blur px-3 py-1.5 shadow-sm"
          >
            <span className={`w-2 h-2 rounded-full ${c.punto}`} />
            <span className="text-base font-semibold tabular-nums leading-none text-slate-900">{c.valor}</span>
            <span className="text-[11px] font-medium text-slate-500">{c.etiqueta}</span>
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 sm:p-4 flex flex-wrap items-end justify-between gap-2">
        {/* El pallet bajo el cursor dice de qué producto es; si no, la ayuda. */}
        {sobre ? (
          <p className="max-w-full sm:max-w-[60%] rounded-xl bg-slate-900/90 px-3 py-2 text-white shadow-sm">
            <span className="block text-xs font-semibold truncate">{sobre.producto}</span>
            <span className="block text-[11px] text-slate-300 tabular-nums">
              {sobre.codigo ? `${sobre.codigo} · ` : ""}
              {sobre.recibida === null ? t("sin_contar") : t("recibido", { n: sobre.recibida, de: sobre.esperada })}
            </span>
          </p>
        ) : (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-white/85 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-slate-500 shadow-sm">
            <MousePointerClick className="w-3.5 h-3.5" />
            {t("ayuda")}
          </p>
        )}
        <ul className="hidden sm:flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/85 backdrop-blur px-2.5 py-1 shadow-sm">
          {LEYENDA.map((l) => (
            <li key={l.clave} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <span className={`w-2 h-2 rounded-sm ${l.color}`} />
              {t(`leyenda.${l.clave}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
