import { conSesion } from "@/lib/tienda-web/clientes/http";
import { preciosDe } from "@/lib/tienda-web/clientes/precios";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * GET /api/tienda-web/clientes/precios?sede=valencia|caracas|panama — los precios de la lista del cliente con
 * sesión en esa sede, por product.template (los mismos ids del catálogo). Solo con sesión: la tienda es pública
 * y sin sesión no muestra precios. Sin caché en el navegador (son de esa persona).
 */
export async function GET(request: Request) {
  return conSesion(request, "precios", async (s) => {
    const sede = new URL(request.url).searchParams.get("sede") || "valencia";
    return jsonTienda(await preciosDe(s.cliente, sede));
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
