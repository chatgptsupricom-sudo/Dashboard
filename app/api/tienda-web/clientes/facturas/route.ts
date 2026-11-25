import { conSesion } from "@/lib/tienda-web/clientes/http";
import { facturasDe } from "@/lib/tienda-web/clientes/odoo";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/** GET /api/tienda-web/clientes/facturas?sede=&estado=&q=&pagina= — facturas y estado de cuenta del cliente. */
export async function GET(request: Request) {
  return conSesion(request, "facturas", async (s) => {
    const u = new URL(request.url).searchParams;
    return jsonTienda(await facturasDe(s.cliente, {
      sede: u.get("sede") || "", estado: u.get("estado") || "", q: u.get("q") || "", pagina: Number(u.get("pagina")) || 1,
    }));
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
