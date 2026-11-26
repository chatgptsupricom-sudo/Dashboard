import { conSesion } from "@/lib/tienda-web/clientes/http";
import { resumenDe } from "@/lib/tienda-web/clientes/odoo";
import { cabeceraDe } from "@/lib/tienda-web/clientes/perfil";
import { jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * GET /api/tienda-web/clientes/yo — quién es y el resumen de su cuenta (pedidos abiertos, últimos y lo que
 * debe). `perfil` = el nombre y el logo que puso en su perfil (null si no lo ha guardado): si la MySQL falla,
 * la cabecera sigue con lo de Odoo.
 */
export async function GET(request: Request) {
  return conSesion(request, "yo", async (s) => {
    const [resumen, perfil] = await Promise.all([resumenDe(s.cliente), cabeceraDe(s.cliente).catch(() => null)]);
    return jsonTienda({
      cliente: { correo: s.correo, nombre: s.cliente.nombre, empresa: s.cliente.empresa, documento: s.cliente.documento },
      perfil,
      ...resumen,
    });
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
