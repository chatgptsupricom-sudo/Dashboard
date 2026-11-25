import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { catalogoTienda } from "@/lib/tienda-web/catalogo";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";
import { SEDES_TIENDA } from "@/lib/tienda-web/tipos";

/**
 * GET /api/tienda-web/catalogo?sede=valencia|caracas|panama
 *
 * Endpoint PÚBLICO (sin sesión) de la tienda web (odoo/landing): los productos publicados en la web
 * con categoría, marca y si hay existencia en el almacén principal de la sede (`d`: 1/0). No devuelve
 * precios, costos ni cantidades: no agregarlos, todo lo que sale de aquí queda expuesto.
 */
export async function GET(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-web-catalogo", [
    { max: 30, ventanaSegundos: 60 },
    { max: 300, ventanaSegundos: 3600 },
  ]);
  if (bloqueo) return conCors(bloqueo);

  const sede = (new URL(request.url).searchParams.get("sede") || "").toLowerCase();
  const companyId = SEDES_TIENDA[sede];
  if (!companyId) return jsonTienda({ error: "Sede desconocida" }, { status: 400 });

  try {
    const productos = await catalogoTienda(companyId);
    return jsonTienda({ sede, actualizado: new Date().toISOString(), productos }, { cacheSegundos: 300 });
  } catch (e) {
    console.error("[tienda-web] catálogo:", e);
    return jsonTienda({ error: "Odoo no respondió" }, { status: 502 });
  }
}

export function OPTIONS() {
  return opcionesTienda();
}
