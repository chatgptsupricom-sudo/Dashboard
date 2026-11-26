import { sitemapTienda } from "@/lib/tienda-web/seo";

/**
 * GET /api/tienda-web/sitemap — PÚBLICO. El mapa del sitio de la tienda web con todos los productos publicados
 * (la tienda lo sirve en `<tienda>/sitemap.xml`). Necesita `TIENDA_WEB_URL`. Ver lib/tienda-web/seo.ts.
 */
export async function GET() {
  try {
    const xml = await sitemapTienda();
    if (!xml) return new Response("Falta TIENDA_WEB_URL", { status: 404 });
    return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    console.error("[tienda-web] sitemap:", e);
    return new Response("Odoo no respondió", { status: 502 });
  }
}
