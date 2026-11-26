import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { conSesion } from "@/lib/tienda-web/clientes/http";
import { aceptarCotizacion } from "@/lib/tienda-web/clientes/seguimiento";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * POST /api/tienda-web/clientes/pedidos/<id>/aceptar — el cliente acepta una cotización que su vendedor ya le
 * envió: se confirma como pedido en Odoo (lib/tienda-web/clientes/seguimiento.ts).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const bloqueo = aplicarLimites(request, "tienda-cliente-aceptar", [{ max: 10, ventanaSegundos: 600 }]);
  if (bloqueo) return conCors(bloqueo);
  const { id } = await params;
  return conSesion(request, "aceptar", async (s) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) return jsonTienda({ error: "Cotización no encontrada" }, { status: 404 });
    const r = await aceptarCotizacion(s.cliente, s.correo, n);
    return r.ok ? jsonTienda(r) : jsonTienda({ error: r.error }, { status: r.status });
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
