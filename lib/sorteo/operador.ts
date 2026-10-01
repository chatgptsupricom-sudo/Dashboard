import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { aplicarLimites, limitar, obtenerIp, respuesta429, type Limite } from "@/lib/servicio-tecnico/limites";

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
const MIN_SECRETO_PROXY = 24;
const LIMITE_FALLOS: Limite = { max: 8, ventanaSegundos: 15 * 60 };

const huella = (s: string) => createHash("sha256").update(s).digest();
const iguales = (a: string, b: string) => timingSafeEqual(huella(a), huella(b));

function claveValida(clave: string) {
  const esperada = process.env.SORTEO_CLAVE || "";
  if (esperada.length < MIN_CLAVE) return false;
  return iguales(clave, esperada);
}

/**
 * IP del visitante para los límites. La landing del sorteo (repo
 * sorteo-landing, sorteo.supricom.com.ve) llama a estas APIs desde su
 * servidor, así que para el panel todos los visitantes llegan con la IP de
 * la landing: 8 claves fallidas de cualquiera bloquearían al operador. La
 * landing manda la IP real en `x-sorteo-ip` junto con `x-sorteo-proxy` =
 * SORTEO_PROXY_SECRET; sin el secreto correcto ese header se ignora (lo
 * podría inventar cualquiera).
 */
export function ipVisitante(request: NextRequest): string {
  const secreto = process.env.SORTEO_PROXY_SECRET || "";
  const firma = request.headers.get("x-sorteo-proxy");
  const ip = request.headers.get("x-sorteo-ip")?.trim();
  if (ip && firma && secreto.length >= MIN_SECRETO_PROXY && iguales(firma, secreto)) return ip.slice(0, 64);
  return obtenerIp(request);
}

/** Como aplicarLimites(), pero contando por ipVisitante(). */
export function limitarVisitante(request: NextRequest, nombre: string, limites: Limite[]): NextResponse | null {
  const ip = ipVisitante(request);
  if (ip === obtenerIp(request)) return aplicarLimites(request, nombre, limites);
  for (const limite of limites) {
    const r = limitar(`${nombre}:${limite.ventanaSegundos}:${ip}`, limite);
    if (!r.ok) return respuesta429(r.esperaSegundos);
  }
  return null;
}

export async function operador(
  request: NextRequest,
): Promise<{ quien: string; error?: undefined } | { quien?: undefined; error: NextResponse }> {
  const clave = request.headers.get("x-sorteo-clave");
  if (clave) {
    const llave = `sorteo-clave:${LIMITE_FALLOS.ventanaSegundos}:${ipVisitante(request)}`;
    const estado = limitar(llave, LIMITE_FALLOS, false);
    if (!estado.ok) return { error: respuesta429(estado.esperaSegundos) };
    if (claveValida(clave)) return { quien: "Operador (clave)" };
    limitar(llave, LIMITE_FALLOS, true);
    return { error: NextResponse.json({ error: "Clave de operador incorrecta" }, { status: 401 }) };
  }

  const sesion = await requireRoles(request, []);
  if (sesion.error) return { error: NextResponse.json({ error: "Solo el operador del sorteo puede hacer esto" }, { status: 401 }) };
  const p = sesion.payload || {};
  return { quien: String(p.email || p.name || "SuperAdmin") };
}
