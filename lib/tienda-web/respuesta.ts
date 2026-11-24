import { NextResponse } from "next/server";

/**
 * La página de la tienda vive en otro dominio (EasyPanel, supricom.com.ve…) y lee estas APIs desde el
 * navegador: se permite cualquier origen porque solo devuelven lo que ya es público en la tienda de Odoo
 * (sin precios ni cantidades) y no usan cookies. El raspado lo frena el límite por IP de cada ruta.
 */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function jsonTienda(datos: unknown, { status = 200, cacheSegundos = 0 } = {}): NextResponse {
  return NextResponse.json(datos, {
    status,
    headers: {
      ...CORS,
      "Cache-Control": cacheSegundos > 0 ? `public, max-age=${cacheSegundos}, stale-while-revalidate=${cacheSegundos * 2}` : "no-store",
    },
  });
}

export function opcionesTienda(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** El 429 de los límites, con CORS para que la página lo pueda leer y siga con su copia. */
export function conCors(r: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}
