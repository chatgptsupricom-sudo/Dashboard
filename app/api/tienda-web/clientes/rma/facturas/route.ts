import { conSesion } from "@/lib/tienda-web/clientes/http";
import { facturasParaReportar } from "@/lib/tienda-web/clientes/rma";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/** GET /api/tienda-web/clientes/rma/facturas?q=&pagina= — sus facturas de los últimos 3 años, para reportar una falla. */
export async function GET(request: Request) {
  return conSesion(request, "rma-facturas", async (s) => {
    const u = new URL(request.url).searchParams;
    return jsonTienda(await facturasParaReportar(s.cliente, { q: u.get("q") || "", pagina: Number(u.get("pagina")) || 1 }));
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
