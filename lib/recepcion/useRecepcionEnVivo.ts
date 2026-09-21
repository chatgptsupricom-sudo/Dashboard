"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket-client";
import type { AvisoRecepcion } from "@/lib/recepcion/servidor";

/**
 * Escucha los avisos de la recepcion por packing list (mismo mecanismo que
 * Mercancia: la sala la asigna el servidor segun el JWT — sucursal para
 * Almacen, "compras" para Compras). El aviso solo dice "algo cambio"; quien
 * lo recibe vuelve a pedir sus datos a la API.
 */
export function useRecepcionEnVivo(alAvisar: (aviso: AvisoRecepcion) => void) {
  const ref = useRef(alAvisar);
  ref.current = alAvisar;

  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    const handler = (aviso: AvisoRecepcion) => ref.current(aviso);
    try {
      socket = getSocket();
      if (!socket.connected) socket.connect();
      socket.on("recepcion_actualizada", handler);
    } catch {
      // Sin socket la pantalla sigue funcionando; solo no se actualiza sola.
    }
    return () => {
      socket?.off("recepcion_actualizada", handler);
    };
  }, []);
}
