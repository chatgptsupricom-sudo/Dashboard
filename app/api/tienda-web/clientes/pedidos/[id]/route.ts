import { conSesion } from "@/lib/tienda-web/clientes/http";
import { pedidoDe } from "@/lib/tienda-web/clientes/odoo";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/** GET /api/tienda-web/clientes/pedidos/<id> — un pedido del cliente con sus líneas, facturas y despachos. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return conSesion(request, "pedido", async (s) => {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) return jsonTienda({ error: "Pedido no encontrado" }, { status: 404 });
    const pedido = await pedidoDe(s.cliente, n);
    return pedido ? jsonTienda(pedido) : jsonTienda({ error: "Pedido no encontrado" }, { status: 404 });
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
