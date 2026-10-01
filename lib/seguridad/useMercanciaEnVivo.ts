"use client";

import { useEffect, useRef } from "react";
import { getSocket } from "@/lib/socket-client";
import { EVENTO_MERCANCIA, type AvisoMercancia } from "@/lib/seguridad/eventos";

/**
 * Escucha los avisos de Mercancia y llama a `alAvisar` cuando llega uno.
 *
 * La sala la asigna el servidor al conectar, a partir del JWT de la cookie
 * (ver `salasMercancia` en server.js): el cliente no pide nada ni puede
 * escuchar la sucursal de al lado.
 *
 * El aviso solo dice "algo cambio": quien lo recibe vuelve a pedir sus datos
 * a la API, que es la que filtra por sucursal y por rol. Nunca se pinta lo que
 * venga en el socket.
 *
 * Si el socket no conecta —despliegue sin server.js, red caida— esto no hace
 * nada y la pantalla sigue funcionando como antes: se recarga a mano.
 *
 * `alReconectar`: los avisos que llegaron con el socket caido se pierden (en
 * el telefono del porton la pantalla se bloquea y el socket se cae), y la
 * pantalla quedaba en una etapa vieja hasta que alguien tocaba un boton y
 * recibia 409. Se llama al reconectar el socket y al volver a mostrarse la
 * pestaña, para ponerse al dia.
 */
export function useMercanciaEnVivo(
  alAvisar: (aviso: AvisoMercancia) => void,
  alReconectar?: () => void,
) {
  // Los callbacks cambian en cada render; los listeners se registran una
  // sola vez y leen siempre el ultimo por la ref. Sin esto, cada render
  // desuscribe y vuelve a suscribir.
  const ref = useRef(alAvisar);
  ref.current = alAvisar;
  const refReconectar = useRef(alReconectar);
  refReconectar.current = alReconectar;

  useEffect(() => {
    let socket: ReturnType<typeof getSocket> | null = null;
    const handler = (aviso: AvisoMercancia) => ref.current(aviso);
    // La primera conexion no: la pantalla recien cargo sus datos.
    let conectoAntes = false;
    const alConectar = () => {
      if (conectoAntes) refReconectar.current?.();
      conectoAntes = true;
    };
    const alMostrar = () => {
      if (document.visibilityState === "visible") refReconectar.current?.();
    };

    try {
      socket = getSocket();
      conectoAntes = socket.connected;
      socket.on("connect", alConectar);
      if (!socket.connected) socket.connect();
      socket.on(EVENTO_MERCANCIA, handler);
    } catch {
      // Sin socket la pantalla no se rompe, solo no se actualiza sola.
    }
    document.addEventListener("visibilitychange", alMostrar);

    return () => {
      socket?.off(EVENTO_MERCANCIA, handler);
      socket?.off("connect", alConectar);
      document.removeEventListener("visibilitychange", alMostrar);
    };
  }, []);
}
