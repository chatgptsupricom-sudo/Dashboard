import { conSesion } from "@/lib/tienda-web/clientes/http";
import { resumenDe } from "@/lib/tienda-web/clientes/odoo";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/** GET /api/tienda-web/clientes/yo — quién es y el resumen de su cuenta (pedidos abiertos, últimos y lo que debe). */
export async function GET(request: Request) {
  return conSesion(request, "yo", async (s) => {
    const resumen = await resumenDe(s.cliente);
    return jsonTienda({
      cliente: { correo: s.correo, nombre: s.cliente.nombre, empresa: s.cliente.empresa, documento: s.cliente.documento },
      ...resumen,
    });
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
