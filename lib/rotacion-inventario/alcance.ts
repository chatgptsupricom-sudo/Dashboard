import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { sedeDelToken } from "@/lib/auth/sedeRol";
import { ROLES_ROTACION, ROL_COMPRAS, editaRotacion, puedeVerRotacion, veSoloSuSede } from "@/lib/rotacion-inventario/acceso";
import { SEDES_ROTACION } from "@/lib/rotacion-inventario/tipos";

/**
 * Guard de las APIs de la Rotación de inventario (reglas en acceso.ts): quién
 * entra, qué sedes ve y si escribe. Las escrituras piden `soloEdita`
 * (SuperAdmin y Oscar de Compras).
 */
export interface Alcance {
  payload: any;
  rol: string;
  usuario: string;
  sedesPermitidas: number[];
  eligeSede: boolean;
  /** null = todas las marcas (hoy siempre; se deja por si vuelve un rol limitado a sus marcas). */
  marcas: string[] | null;
  /** null = todos los productos. */
  productos: Set<number> | null;
  puedeEditar: boolean;
  puedeGestionarSolicitudes: boolean;
}

const TODAS = SEDES_ROTACION.map((s) => s.id as number);
const sinPermiso = () => NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });

export async function alcanceRotacion(
  request: NextRequest,
  opciones: { soloEdita?: boolean } = {},
): Promise<{ error: NextResponse } | ({ error?: undefined } & Alcance)> {
  const auth = await requireRoles(request, opciones.soloEdita ? [ROL_COMPRAS] : ROLES_ROTACION);
  if (auth.error) return { error: auth.error };
  const payload = auth.payload;
  const rol = String(payload?.role || "").toLowerCase().trim();
  const email = payload?.email;
  // requireRoles deja pasar a todo Compras y a Marketing y Electrodomésticos (como BI): aquí no.
  if (!puedeVerRotacion(rol, email)) return { error: sinPermiso() };
  const edita = editaRotacion(rol, email);
  if (opciones.soloEdita && !edita) return { error: sinPermiso() };

  let sedesPermitidas = TODAS;
  if (veSoloSuSede(rol)) {
    const sede = sedeDelToken(payload);
    if (!sede) return { error: NextResponse.json({ error: "Tu usuario no tiene sede asignada." }, { status: 403 }) };
    sedesPermitidas = [sede];
  }

  return {
    payload,
    rol,
    usuario: String(payload?.name || payload?.email || "usuario").slice(0, 255),
    sedesPermitidas,
    eligeSede: sedesPermitidas.length > 1,
    marcas: null,
    productos: null,
    puedeEditar: edita,
    puedeGestionarSolicitudes: edita,
  };
}

/** `?sede=9|10|7|todas` recortado a lo permitido; [] = sede inválida. */
export function sedesPedidas(a: Alcance, pedida: string | null): number[] {
  if (!pedida || pedida === "todas") return a.sedesPermitidas;
  const n = Number(pedida);
  return a.sedesPermitidas.includes(n) ? [n] : [];
}

/** Solicitudes de las sedes que ve la sesión (y de sus marcas, si estuviera limitada). */
export function puedeVerSolicitud(a: Alcance, s: { companyId: number; marca: string }): boolean {
  if (!a.sedesPermitidas.includes(s.companyId)) return false;
  return !a.marcas || a.marcas.includes(s.marca);
}
