import { conSesion } from "@/lib/tienda-web/clientes/http";
import { casosDe } from "@/lib/tienda-web/clientes/rma";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/** GET /api/tienda-web/clientes/rma/casos — sus casos de servicio técnico con su estado y el enlace de seguimiento. */
export async function GET(request: Request) {
  return conSesion(request, "rma-casos", async (s) => jsonTienda({ casos: await casosDe(s.cliente) }));
}

export function OPTIONS() {
  return opcionesTienda();
}
