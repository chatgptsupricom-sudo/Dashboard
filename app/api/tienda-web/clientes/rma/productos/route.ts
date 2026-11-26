import { conSesion } from "@/lib/tienda-web/clientes/http";
import { productosDeFactura } from "@/lib/tienda-web/clientes/rma";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/** GET /api/tienda-web/clientes/rma/productos?factura=<id> — los productos de una factura suya, con serial y garantía. */
export async function GET(request: Request) {
  return conSesion(request, "rma-productos", async (s) => {
    const id = Number(new URL(request.url).searchParams.get("factura"));
    if (!Number.isInteger(id) || id <= 0) return jsonTienda({ error: "Elige la factura" }, { status: 400 });
    const r = await productosDeFactura(s.cliente, id);
    return r ? jsonTienda(r) : jsonTienda({ error: "No encontramos esa factura en tu cuenta" }, { status: 404 });
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
