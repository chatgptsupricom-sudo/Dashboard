import { conSesion } from "@/lib/tienda-web/clientes/http";
import { pedidosDe } from "@/lib/tienda-web/clientes/odoo";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/** GET /api/tienda-web/clientes/pedidos?sede=&etapa=&q=&pagina= — pedidos del cliente, de 20 en 20. */
export async function GET(request: Request) {
  return conSesion(request, "pedidos", async (s) => {
    const u = new URL(request.url).searchParams;
    return jsonTienda(await pedidosDe(s.cliente, {
      sede: u.get("sede") || "", etapa: u.get("etapa") || "", q: u.get("q") || "", pagina: Number(u.get("pagina")) || 1,
    }));
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
