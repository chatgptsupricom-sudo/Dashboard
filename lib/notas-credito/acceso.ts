import { requireSession } from "@/lib/auth/roles";
import { esSuperadmin, normCorreo, pasosDe } from "@/lib/notas-credito/datos";
import { autorDeSesion, type Autor } from "@/lib/notas-credito/solicitudes";
import { veOdooDeLaSede, veTodoLaSede, type PasoNC, type SolicitudNC } from "@/lib/notas-credito/tipos";
import { NextRequest, NextResponse } from "next/server";

/**
 * Quién entra a /notas-credito: los responsables de algún paso en alguna sede
 * (por correo, nc_aprobadores) y el SuperAdmin, que ve todo y configura los
 * responsables pero no decide (solo aprueba quien está en "aprueba").
 */
export type AccesoNC = { autor: Autor; pasos: Record<number, PasoNC[]>; superadmin: boolean; sedes: number[] | null };

export async function accesoNC(payload: any): Promise<AccesoNC | null> {
  const autor = autorDeSesion(payload);
  const superadmin = esSuperadmin(autor.rol);
  let pasos: Record<number, PasoNC[]> = {};
  try {
    pasos = await pasosDe(autor.email);
  } catch (e: any) {
    console.error("[notas-credito] no se pudo leer los responsables:", e?.message);
  }
  const sedes = Object.keys(pasos).map(Number);
  if (!superadmin && !sedes.length) return null;
  return { autor, pasos, superadmin, sedes: superadmin ? null : sedes };
}

export async function requireNC(request: NextRequest): Promise<{ acceso?: AccesoNC; error?: NextResponse }> {
  const s = await requireSession(request);
  if (s.error) return { error: s.error };
  const acceso = await accesoNC(s.payload);
  if (!acceso) return { error: NextResponse.json({ error: "No tienes acceso a las notas de crédito." }, { status: 403 }) };
  return { acceso };
}

export function puedeVerSede(acceso: AccesoNC, companyId: number): boolean {
  return acceso.sedes === null || acceso.sedes.includes(companyId);
}

/** El SuperAdmin (todas las sedes) y quien aprueba (su sede) ven todo el flujo. */
export function veTodo(acceso: AccesoNC, companyId: number): boolean {
  return puedeVerSede(acceso, companyId) && veTodoLaSede(acceso.pasos[companyId], acceso.superadmin);
}

/** Las NC de Odoo de la sede: quien ve todo y quien procesa. */
export function veOdoo(acceso: AccesoNC, companyId: number): boolean {
  return puedeVerSede(acceso, companyId) && veOdooDeLaSede(acceso.pasos[companyId], acceso.superadmin);
}

/** Las solicitudes de RMA fuera del flujo: quien ve todo y quien procesa (las pasa al flujo). */
export function veAnteriores(acceso: AccesoNC, companyId: number): boolean {
  return veTodo(acceso, companyId) || (acceso.pasos[companyId] ?? []).includes("procesa");
}

/**
 * Si la sesión ve esta solicitud. Cada paso ve lo suyo:
 *   preaprueba  las que esperan preaprobación y las que creó, preaprobó o rechazó
 *   procesa     las aprobadas y las procesadas
 *   rma         las de RMA de su sede
 * El SuperAdmin y quien aprueba ven todo.
 */
export function puedeVerSolicitud(
  acceso: AccesoNC,
  sol: Pick<SolicitudNC, "company_id" | "origen" | "estado" | "creado_email" | "preaprobado_por" | "rechazado_por" | "rechazado_paso">,
): boolean {
  if (!puedeVerSede(acceso, sol.company_id)) return false;
  if (veTodo(acceso, sol.company_id)) return true;
  const pasos = acceso.pasos[sol.company_id] ?? [];
  const yo = acceso.autor;
  if (
    pasos.includes("preaprueba") &&
    (sol.estado === "por_preaprobar" ||
      (!!yo.email && normCorreo(sol.creado_email) === yo.email) ||
      (!!sol.preaprobado_por && sol.preaprobado_por === yo.nombre) ||
      (sol.rechazado_paso === "preaprueba" && sol.rechazado_por === yo.nombre))
  ) {
    return true;
  }
  if (pasos.includes("procesa") && (sol.estado === "aprobada" || sol.estado === "procesada")) return true;
  if (pasos.includes("rma") && sol.origen === "rma") return true;
  return false;
}
