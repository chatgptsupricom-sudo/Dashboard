import { datosAcceso } from "@/lib/tienda-web/clientes/cuentas";
import { conSesion } from "@/lib/tienda-web/clientes/http";
import { perfilDe } from "@/lib/tienda-web/clientes/odoo";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * GET /api/tienda-web/clientes/perfil — datos de su empresa, su vendedor, plazo y cupo por sede, sus
 * direcciones de entrega y los datos de su acceso. Solo lectura.
 */
export async function GET(request: Request) {
  return conSesion(request, "perfil", async (s) => {
    const [perfil, acceso] = await Promise.all([perfilDe(s.cliente), datosAcceso(s.id)]);
    return jsonTienda({ ...perfil, acceso: { correo: s.correo, ...acceso } });
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
