import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { conSesion, cuerpoJson } from "@/lib/tienda-web/clientes/http";
import { reportarFalla } from "@/lib/tienda-web/clientes/rma";
import { conCors, jsonTienda, opcionesTienda } from "@/lib/tienda-web/respuesta";

/**
 * POST /api/tienda-web/clientes/rma {factura: <account.move id>, telefono, productos: [{item_id, serial_manual,
 * falla, upload_token}]} — reporta una falla desde «Mi cuenta», sin número de factura ni RIF. Mismas reglas y
 * mismo caso que el portal de servicio técnico (lib/tienda-web/clientes/rma.ts).
 */
export async function POST(request: Request) {
  const bloqueo = aplicarLimites(request, "tienda-cliente-rma", [{ max: 10, ventanaSegundos: 3600 }]);
  if (bloqueo) return conCors(bloqueo);
  return conSesion(request, "rma", async (s) => {
    const c = await cuerpoJson(request);
    const factura = Number(c?.factura);
    const lista = Array.isArray(c?.productos) ? (c!.productos as any[]) : [];
    if (!Number.isInteger(factura) || factura <= 0) return jsonTienda({ error: "Elige la factura" }, { status: 400 });
    const pedidos = lista.slice(0, 11).map((p) => ({
      itemId: typeof p?.item_id === "string" ? p.item_id : "",
      serialManual: String(p?.serial_manual ?? "").trim().slice(0, 100),
      falla: String(p?.falla ?? "").trim().slice(0, 5000),
      uploadToken: typeof p?.upload_token === "string" && p.upload_token.length >= 16 && p.upload_token.length <= 64 ? p.upload_token : "",
    }));
    const telefono = String(c?.telefono ?? "").trim().slice(0, 50);
    if (telefono.replace(/\D/g, "").length < 7) return jsonTienda({ error: "Escribe un teléfono para coordinar la entrega del equipo" }, { status: 400 });
    const r = await reportarFalla(s.cliente, factura, pedidos, telefono);
    if (!r.ok) return jsonTienda({ error: r.error, codigo: r.codigo, enlace: r.enlace }, { status: r.status || 400 });
    return jsonTienda({ ok: true, numero: r.numero, seguimiento: r.seguimiento }, { status: 201 });
  });
}

export function OPTIONS() {
  return opcionesTienda();
}
