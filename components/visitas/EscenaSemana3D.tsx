"use client";

import { useEffect, useRef, useState } from "react";
import type { BloqueEscena, DiaEscena, EscenaSemana, VisitaEscena } from "@/lib/visitas/escena3d";

/**
 * La semana del asesor en 3D (lib/visitas/escena3d). three.js se carga aparte,
 * solo en esta pantalla y solo en el navegador. Si el equipo no tiene WebGL,
 * no se dibuja nada y la pantalla sigue funcionando con el tablero.
 */
export default function EscenaSemana3D({
  dias,
  visitas,
  seleccion,
  resaltado,
  onSeleccion,
  onEncima,
  className = "",
}: {
  dias: DiaEscena[];
  visitas: VisitaEscena[];
  seleccion: string | null;
  resaltado: string | null;
  onSeleccion: (fecha: string, bloque: BloqueEscena) => void;
  onEncima?: (clave: string | null) => void;
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const escena = useRef<EscenaSemana | null>(null);
  const [lista, setLista] = useState(false);
  const [sinWebgl, setSinWebgl] = useState(false);

  // Lo último que se pidió dibujar: la escena puede terminar de cargar después.
  const pendiente = useRef({ dias, visitas, seleccion });
  pendiente.current = { dias, visitas, seleccion };
  const alElegir = useRef(onSeleccion);
  alElegir.current = onSeleccion;
  const alEncima = useRef(onEncima);
  alEncima.current = onEncima;

  useEffect(() => {
    let viva = true;
    void import("@/lib/visitas/escena3d")
      .then(({ crearEscenaSemana }) => {
        if (!viva || !caja.current) return;
        escena.current = crearEscenaSemana(caja.current, {
          onSeleccion: (f, b) => alElegir.current(f, b),
          onEncima: (c) => alEncima.current?.(c),
          movimientoReducido: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        const p = pendiente.current;
        escena.current.actualizar(p.dias, p.visitas, p.seleccion);
        setLista(true);
      })
      .catch((e) => {
        console.error("No se pudo iniciar la vista 3D:", e);
        if (viva) setSinWebgl(true);
      });
    return () => {
      viva = false;
      escena.current?.destruir();
      escena.current = null;
    };
  }, []);

  useEffect(() => {
    escena.current?.actualizar(dias, visitas, seleccion);
  }, [dias, visitas, seleccion]);

  useEffect(() => {
    escena.current?.resaltar(resaltado);
  }, [resaltado]);

  if (sinWebgl) return null;
  return (
    <div
      ref={caja}
      className={`relative overflow-hidden transition-opacity duration-700 ${lista ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}
