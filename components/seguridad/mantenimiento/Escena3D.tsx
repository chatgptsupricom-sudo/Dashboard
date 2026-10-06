"use client";

import { useEffect, useRef, useState } from "react";
import type { Escena, OpcionesEscena, VehiculoEscena } from "@/lib/mantenimiento/escena3d";

/**
 * El patio y el taller en 3D (lib/mantenimiento/escena3d). three.js se carga
 * aparte, solo en esta pantalla y solo en el navegador. Si el equipo no tiene
 * WebGL, no se dibuja nada y la pantalla sigue funcionando con la lista.
 */
export default function Escena3D({
  vehiculos,
  seleccion,
  onSeleccion,
  textos,
  className = "",
}: {
  vehiculos: VehiculoEscena[];
  seleccion: number | null;
  onSeleccion: (id: number) => void;
  textos: OpcionesEscena["textos"];
  className?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const escena = useRef<Escena | null>(null);
  const [lista, setLista] = useState(false);
  const [sinWebgl, setSinWebgl] = useState(false);

  // Lo último que se pidió dibujar: la escena puede terminar de cargar después.
  const pendiente = useRef({ vehiculos, seleccion });
  pendiente.current = { vehiculos, seleccion };
  const alElegir = useRef(onSeleccion);
  alElegir.current = onSeleccion;
  const rotulos = useRef(textos);

  useEffect(() => {
    let viva = true;
    void import("@/lib/mantenimiento/escena3d")
      .then(({ crearEscena }) => {
        if (!viva || !caja.current) return;
        escena.current = crearEscena(caja.current, {
          onSeleccion: (id) => alElegir.current(id),
          textos: rotulos.current,
          movimientoReducido: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
        escena.current.actualizar(pendiente.current.vehiculos, pendiente.current.seleccion);
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
    escena.current?.actualizar(vehiculos, seleccion);
  }, [vehiculos, seleccion]);

  if (sinWebgl) return null;
  return (
    <div
      ref={caja}
      className={`relative overflow-hidden bg-slate-100 transition-opacity duration-500 ${lista ? "opacity-100" : "opacity-0"} ${className}`}
    />
  );
}
