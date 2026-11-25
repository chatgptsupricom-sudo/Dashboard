import { cerrarTodas } from "@/lib/tienda-web/clientes/cuentas";
import { conSesion } from "@/lib/tienda-web/clientes/http";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/** POST /api/tienda-web/clientes/salir — cierra la sesión en todos los equipos. */
export async function POST(request: Request) {
  return conSesion(request, "salir", async (s) => {
    await cerrarTodas(s.id);
    return jsonTienda({ ok: true });
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
