import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { crearCotizacion } from "@/lib/tienda-web/clientes/cotizacion";
import { conSesion, cuerpoJson } from "@/lib/tienda-web/clientes/http";
import { validarCotizacion } from "@/lib/tienda-web/clientes/tipos";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * POST /api/tienda-web/clientes/cotizacion — el carrito del cliente con sesión se crea como cotización en Odoo
 * (borrador) a nombre de su ficha en esa sede, con su vendedor y su lista de precios. `{ sede, lineas: [{codigo,
 * cantidad}], nota?, clave }`. Devuelve el número de la cotización. Ver lib/tienda-web/clientes/cotizacion.ts.
 */
export async function POST(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-cliente-cotizacion", [
    { max: 10, ventanaSegundos: 600 },
    { max: 60, ventanaSegundos: 86400 },
  ]);
  if (bloqueo) return conCors(bloqueo);
  return conSesion(request, "cotizacion", async (s) => {
    const v = validarCotizacion(await cuerpoJson(request));
    if (!v.ok) return jsonTienda({ error: v.error }, { status: 400 });
    const r = await crearCotizacion(s.cliente, s.correo, v.datos);
    if (!r.ok) return jsonTienda({ error: r.error, motivo: r.motivo }, { status: r.status });
    return jsonTienda(r);
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
