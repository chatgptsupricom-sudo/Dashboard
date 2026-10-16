import { crearDesdeCliente } from "@/lib/notas-credito/cliente";
import { ErrorNC } from "@/lib/notas-credito/solicitudes";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { verificarCaptcha } from "@/lib/servicio-tecnico/captcha";
import { aplicarLimites, consultarLimite, obtenerIp, registrarUso } from "@/lib/servicio-tecnico/limites";
import { esSucursalValida } from "@/lib/servicio-tecnico/sucursales";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/credito-clientes
 *   { numero, rif, sucursal, lineas: [{ linea_id, cantidad, seriales }],
 *     motivo_tipo, detalle, telefono, email?, captcha_token }
 *
 * PÚBLICO (servicio de notas de crédito, sin sesión): el cliente pide una nota de crédito. Todo se
 * vuelve a validar contra Odoo (lib/notas-credito/cliente.ts). Entra como
 * "Por preaprobar" en /notas-credito y devuelve el token de seguimiento.
 * Mismos dos límites que el ticket: intentos (holgado) y creadas (estricto,
 * se anota solo si la solicitud llegó a existir).
 */
export async function POST(request: NextRequest) {
  const bloqueoIntentos = aplicarLimites(request, "nc-intentos", [{ max: 20, ventanaSegundos: 3600 }]);
  if (bloqueoIntentos) return bloqueoIntentos;
  const LIMITE_CREADAS = { max: 5, ventanaSegundos: 3600 };
  const bloqueoCreadas = consultarLimite(request, "nc-creada", LIMITE_CREADAS);
  if (bloqueoCreadas) return bloqueoCreadas;

  try {
    const body = await request.json().catch(() => ({}));
    const cid = parseInt(String(body.sucursal ?? ""), 10);
    if (!esSucursalValida(cid)) return NextResponse.json({ error: "Falta elegir la sucursal" }, { status: 400 });

    // Antes de tocar Odoo: si no pasa, no gastamos llamadas contra producción.
    const captcha = await verificarCaptcha(typeof body.captcha_token === "string" ? body.captcha_token : undefined, obtenerIp(request));
    if (!captcha.ok) {
      return NextResponse.json({ error: "No pudimos verificar que eres una persona. Intenta de nuevo." }, { status: 400 });
    }

    const { id, token } = await crearDesdeCliente({
      companyId: cid,
      numero: String(body.numero ?? ""),
      rif: String(body.rif ?? ""),
      lineas: Array.isArray(body.lineas) ? body.lineas.slice(0, 31) : [],
      motivoTipo: String(body.motivo_tipo ?? ""),
      detalle: String(body.detalle ?? "").slice(0, 3000),
      telefono: String(body.telefono ?? ""),
      email: String(body.email ?? ""),
      origenPeticion: getPublicOrigin(request),
    });
    registrarUso(request, "nc-creada", LIMITE_CREADAS);
    return NextResponse.json({ success: true, numero: `NC-${id}`, tracking_token: token });
  } catch (e: any) {
    if (e instanceof ErrorNC) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/credito-clientes:", e?.message);
    return NextResponse.json({ error: "No pudimos enviar la solicitud. Intenta de nuevo en unos minutos." }, { status: 500 });
  }
}
