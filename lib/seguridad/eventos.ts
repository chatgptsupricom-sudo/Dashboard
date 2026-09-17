/**
 * Avisos en vivo del modulo Mercancia (Socket.io).
 *
 * Quien carga el camion y quien lo verifica en el porton son dos personas
 * distintas mirando dos pantallas distintas: sin esto, Almacen guarda un
 * egreso y Seguridad no se entera hasta recargar, y al reves con el resultado
 * de la verificacion.
 *
 * Se emite a la sala de la sucursal (`mercancia_<cids>`, ver `salaMercancia`
 * en server.js) y a `mercancia_todas`, donde escucha superadmin. El payload
 * lleva lo justo para decidir si refrescar — la pantalla vuelve a pedir sus
 * datos a la API, que es la unica que filtra por sucursal y por rol.
 *
 * `global.io` solo existe cuando la app corre bajo server.js. Si falta, esto
 * no hace nada: un aviso perdido no puede tumbar un registro ya guardado.
 */

export const EVENTO_MERCANCIA = "mercancia_actualizada";

export type AvisoMercancia = {
  accion: "creado" | "verificado";
  id: number;
  tipo: "ingreso" | "egreso";
  estado?: "pendiente" | "conforme" | "descuadre";
};

export function emitirMercancia(
  aviso: AvisoMercancia,
  cids: number | null,
): void {
  const io = (global as any).io;
  if (!io) return;

  try {
    const salas = ["mercancia_todas"];
    if (cids !== null && Number.isFinite(cids) && cids > 0) {
      salas.push(`mercancia_${cids}`);
    }
    io.to(salas).emit(EVENTO_MERCANCIA, aviso);
  } catch (e: any) {
    console.error("[mercancia] no se pudo emitir el aviso:", e?.message);
  }
}
