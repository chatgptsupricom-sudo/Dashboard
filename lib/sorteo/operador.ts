import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { consultarLimite, registrarUso } from "@/lib/servicio-tecnico/limites";

/**
 * Quién puede girar (y anular) en el sorteo público:
 * - un SuperAdmin con sesión del panel, o
 * - quien tenga la clave de operador `SORTEO_CLAVE` (header `x-sorteo-clave`),
 *   para la persona que presenta el sorteo sin usuario del panel.
 *
 * Sin `SORTEO_CLAVE` (o con una de menos de 12 caracteres) el acceso por clave
 * queda cerrado y solo gira el SuperAdmin. Los intentos fallidos se limitan
 * por IP para que la clave no se pueda adivinar a fuerza bruta.
 */

const MIN_CLAVE = 12;
const LIMITE_FALLOS = { max: 8, ventanaSegundos: 15 * 60 };

const huella = (s: string) => createHash("sha256").update(s).digest();

function claveValida(clave: string) {
  const esperada = process.env.SORTEO_CLAVE || "";
  if (esperada.length < MIN_CLAVE) return false;
  return timingSafeEqual(huella(clave), huella(esperada));
}

export async function operador(
  request: NextRequest,
): Promise<{ quien: string; error?: undefined } | { quien?: undefined; error: NextResponse }> {
  const clave = request.headers.get("x-sorteo-clave");
  if (clave) {
    const bloqueado = consultarLimite(request, "sorteo-clave", LIMITE_FALLOS);
    if (bloqueado) return { error: bloqueado };
    if (claveValida(clave)) return { quien: "Operador (clave)" };
    registrarUso(request, "sorteo-clave", LIMITE_FALLOS);
    return { error: NextResponse.json({ error: "Clave de operador incorrecta" }, { status: 401 }) };
  }

  const sesion = await requireRoles(request, []);
  if (sesion.error) return { error: NextResponse.json({ error: "Solo el operador del sorteo puede hacer esto" }, { status: 401 }) };
  const p = sesion.payload || {};
  return { quien: String(p.email || p.name || "SuperAdmin") };
}
