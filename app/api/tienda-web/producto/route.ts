import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { descripcionTienda } from "@/lib/tienda-web/catalogo";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * GET /api/tienda-web/producto?id=<product.template>
 *
 * Endpoint PÚBLICO de la ficha de la tienda web: resumen y viñetas de la descripción de Odoo de un
 * producto publicado. Solo texto de la ficha: sin precios, costos ni existencia.
 */
export async function GET(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-web-producto", [
    { max: 60, ventanaSegundos: 60 },
    { max: 600, ventanaSegundos: 3600 },
  ]);
  if (bloqueo) return conCors(bloqueo);

  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return jsonTienda({ error: "Falta el producto" }, { status: 400 });

  try {
    const ficha = await descripcionTienda(id);
    if (!ficha) return jsonTienda({ error: "Producto no publicado" }, { status: 404 });
    return jsonTienda({ id, ...ficha }, { cacheSegundos: 1800 });
  } catch (e) {
    console.error("[tienda-web] ficha:", e);
    return jsonTienda({ error: "Odoo no respondió" }, { status: 502 });
  }
}

export function OPTIONS() {
  return opcionesTienda();
}
