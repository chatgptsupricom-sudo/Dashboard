import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { paginaCompartir, productoParaCompartir } from "@/lib/tienda-web/seo";
import { SEDES_TIENDA } from "@/lib/tienda-web/tipos";

/**
 * GET /api/tienda-web/compartir?id=<product.template>&sede= — PÚBLICO. La vista previa de un producto al
 * compartirlo (Open Graph para WhatsApp, Facebook, Google); a una persona la manda a la ficha. La tienda la sirve
 * en `<tienda>/p/<id>` (nginx). Ver lib/tienda-web/seo.ts.
 */
export async function GET(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-web-compartir", [{ max: 120, ventanaSegundos: 60 }]);
  if (bloqueo) return bloqueo;
  const u = new URL(request.url);
  const id = Number(u.searchParams.get("id"));
  const sede = (u.searchParams.get("sede") || "valencia").toLowerCase();
  const html = (t: string, status = 200) => new Response(t, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": status === 200 ? "public, max-age=1800" : "no-store" } });
  if (!Number.isInteger(id) || id <= 0) return html("<p>Producto no encontrado</p>", 404);
  try {
    const p = await productoParaCompartir(id, SEDES_TIENDA[sede] ? sede : "valencia");
    if (!p) return html('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/landing/tienda.html"><p>Este producto ya no está en la tienda.</p>', 404);
    return html(paginaCompartir(p));
  } catch (e) {
    console.error("[tienda-web] compartir:", e);
    return html(`<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=/landing/producto.html?id=${id}"><p>Abriendo el producto…</p>`, 502);
  }
}
