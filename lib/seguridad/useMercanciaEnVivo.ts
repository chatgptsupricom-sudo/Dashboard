"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket-client";
import { EVENTO_MERCANCIA, type AvisoMercancia } from "@/lib/seguridad/eventos";

/**
 * Escucha los avisos de Mercancia y llama a `alAvisar` cuando llega uno.
 *
 * La sala la asigna el servidor al conectar, a partir del JWT de la cookie
 * (ver `salaMercancia` en server.js): el cliente no pide nada ni puede
 * escuchar la sucursal de al lado.
 *
 * El aviso solo dice "algo cambio": quien lo recibe vuelve a pedir sus datos
 * a la API, que es la que filtra por sucursal y por rol. Nunca se pinta lo que
 * venga en el socket.
 *
 * Si el socket no conecta —despliegue sin server.js, red caida— esto no hace
 * nada y la pantalla sigue funcionando como antes: se recarga a mano.
 */
export function useMercanciaEnVivo(alAvisar: (aviso: AvisoMercancia) => void) {
  // El callback cambia en cada render; el listener se registra una sola vez y
  // lee siempre el ultimo por la ref. Sin esto, cada render desuscribe y
  // vuelve a suscribir.
  const ref = useRef(alAvisar);
  ref.current = alAvisar;

  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    const handler = (aviso: AvisoMercancia) => ref.current(aviso);

    try {
      socket = getSocket();
      if (!socket.connected) socket.connect();
      socket.on(EVENTO_MERCANCIA, handler);
    } catch {
      // Sin socket la pantalla no se rompe, solo no se actualiza sola.
    }

    return () => {
      socket?.off(EVENTO_MERCANCIA, handler);
    };
  }, []);
}
