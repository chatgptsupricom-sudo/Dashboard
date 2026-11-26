/**
 * Vista previa al compartir y SEO de la tienda web (odoo/landing). La tienda es HTML estático que arma la ficha en
 * el navegador, y WhatsApp, Facebook o Google no corren JavaScript: por eso el enlace para compartir un producto
 * es `<tienda>/p/<id>?sede=` y el nginx de la tienda (odoo/vista-previa.nginx.conf) lo pide aquí
 * (`GET /api/tienda-web/compartir`). Esta página trae las etiquetas Open Graph del producto (foto de Odoo, nombre,
 * marca, resumen) y a una persona la manda enseguida a la ficha. `GET /api/tienda-web/sitemap` = el mapa del sitio
 * con todos los productos publicados de las tres sedes (`<tienda>/sitemap.xml`).
 *
 * Solo lo público, como el catálogo: sin precios, costos ni cantidades.
 * `TIENDA_WEB_URL` (https, la carpeta de las páginas, p. ej. `https://tienda.supricom.com.ve/landing`): la
 * dirección canónica de las fichas y del sitemap. Sin ella el sitemap no sale y la vista previa redirige relativo.
 */
import { catalogoTienda, descripcionTienda } from "./catalogo";
import { SEDES_TIENDA } from "./tipos";

const ODOO = (process.env.NEXT_PUBLIC_ODOO_URL || "https://supricom2.odoo.com").replace(/\/+$/, "");
const NOMBRE_SEDE: Record<string, string> = { valencia: "Valencia", caracas: "Caracas", panama: "Panamá" };

export const baseTienda = () => {
  const b = String(process.env.TIENDA_WEB_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[^\s"'<>]+$/.test(b) ? b : "";
};

const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface ProductoCompartir { id: number; codigo: string; nombre: string; marca: string; disponible: boolean; resumen: string; sede: string }

/** El producto publicado en esa sede (o en cualquiera, si en esa no está). null = no está publicado. */
export async function productoParaCompartir(id: number, sede: string): Promise<ProductoCompartir | null> {
  const orden = [sede, ...Object.keys(SEDES_TIENDA).filter((s) => s !== sede)].filter((s) => SEDES_TIENDA[s]);
  for (const s of orden) {
    const p = (await catalogoTienda(SEDES_TIENDA[s])).find((x) => x.id === id);
    if (!p) continue;
    const ficha = await descripcionTienda(id).catch(() => null);
    return { id, codigo: p.c, nombre: p.n, marca: p.m, disponible: p.d === 1, resumen: ficha?.resumen || "", sede: s };
  }
  return null;
}

/** La página que leen WhatsApp, Facebook y Google al compartir un producto; a una persona la lleva a la ficha. */
export function paginaCompartir(p: ProductoCompartir): string {
  const titulo = `${p.marca ? `${p.marca} ` : ""}${p.nombre}`.trim();
  const sedeNombre = NOMBRE_SEDE[p.sede] || "";
  const descripcion = (p.resumen
    ? p.resumen
    : `Código ${p.codigo}. ${p.disponible ? "Disponible" : "Cotízalo"} en SUPRICOM ${sedeNombre}, mayorista de tecnología. Con tu cuenta de distribuidor ves tu precio.`
  ).slice(0, 300);
  const imagen = `${ODOO}/web/image/product.template/${p.id}/image_1024`;
  const destino = `/landing/producto.html?id=${p.id}&sede=${encodeURIComponent(p.sede)}`;
  const base = baseTienda();
  const canonica = base ? `${base}/producto.html?id=${p.id}&sede=${encodeURIComponent(p.sede)}` : "";
  return `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)} · SUPRICOM</title>
<meta name="description" content="${esc(descripcion)}">
${canonica ? `<link rel="canonical" href="${esc(canonica)}">\n<meta property="og:url" content="${esc(canonica)}">` : ""}
<meta property="og:type" content="product">
<meta property="og:site_name" content="SUPRICOM">
<meta property="og:locale" content="es_VE">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:image" content="${esc(imagen)}">
<meta property="og:image:width" content="1024">
<meta property="og:image:height" content="1024">
<meta property="og:image:alt" content="${esc(titulo)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<meta name="twitter:image" content="${esc(imagen)}">
<meta http-equiv="refresh" content="0; url=${esc(destino)}">
<script>location.replace(${JSON.stringify(destino)});</script>
</head><body style="font-family:Arial,sans-serif;padding:24px">
<p><a href="${esc(destino)}">Ver ${esc(titulo)} en la tienda de SUPRICOM</a></p>
</body></html>`;
}

/** El mapa del sitio: inicio y tienda de cada sede y la ficha de cada producto publicado. null = sin TIENDA_WEB_URL. */
export async function sitemapTienda(): Promise<string | null> {
  const base = baseTienda();
  if (!base) return null;
  const urls: string[] = [];
  for (const [sede, cid] of Object.entries(SEDES_TIENDA)) {
    urls.push(`${base}/index.html?sede=${sede}`, `${base}/tienda.html?sede=${sede}`);
    for (const p of await catalogoTienda(cid)) urls.push(`${base}/producto.html?id=${p.id}&sede=${sede}`);
  }
  urls.push(`${base}/cuenta.html`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...new Set(urls)].map((u) => `  <url><loc>${esc(u)}</loc></url>`).join("\n")}\n</urlset>\n`;
}
