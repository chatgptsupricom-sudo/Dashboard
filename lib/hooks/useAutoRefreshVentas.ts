"use client";

import { useEffect, useRef } from "react";
import { connectSocket, getSocket } from "@/lib/socket-client";

/**
 * Ejecuta `onCambio` (con debounce) cuando el servidor avisa por Socket.io que
 * hubo cambios en ventas en Odoo (evento `ventas_actualizado`, lo emite
 * `/api/ventas/detectar-cambios` una vez por minuto).
 *
 * - Se pausa mientras la pestaña está oculta y refresca una vez al volver si
 *   llegaron avisos entre medio.
 * - Debounce configurable: varios avisos seguidos = un solo refresco.
 *
 * `onCambio` debería refrescar EN SILENCIO (sin spinner de carga), para que la
 * actualización no sea intrusiva.
 */
export function useAutoRefreshVentas(
  onCambio: () => void,
  opts: {
    userId?: number | null;
    debounceMs?: number;
    enabled?: boolean;
  } = {},
) {
  const { userId, debounceMs = 4000, enabled = true } = opts;

  const cbRef = useRef(onCambio);
  cbRef.current = onCambio;

  const pendiente = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const socket = userId ? connectSocket(userId) : getSocket();
    if (!socket.connected) socket.connect();

    const disparar = () => {
      if (document.hidden) {
        pendiente.current = true;
        return;
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        pendiente.current = false;
        cbRef.current();
      }, debounceMs);
    };

    const alVolver = () => {
      if (!document.hidden && pendiente.current) disparar();
    };

    socket.on("ventas_actualizado", disparar);
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      socket.off("ventas_actualizado", disparar);
      document.removeEventListener("visibilitychange", alVolver);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, userId, debounceMs]);
}
