import { requireSession } from "@/lib/auth/roles";
import { esSuperadmin, pasosDe } from "@/lib/notas-credito/datos";
import { autorDeSesion, type Autor } from "@/lib/notas-credito/solicitudes";
import type { PasoNC, SolicitudNC } from "@/lib/notas-credito/tipos";
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

/**
 * Responsable que en esta sede solo preaprueba (IT, Rangel). IT solo
 * preaprueba o rechaza: no crea, no toca la factura y no ve el resto de las
 * notas de la sede ni las de Odoo. El SuperAdmin ve todo.
 */
export function soloPreaprueba(acceso: AccesoNC, companyId: number): boolean {
  if (acceso.superadmin) return false;
  const pasos = acceso.pasos[companyId] ?? [];
  return pasos.includes("preaprueba") && pasos.every((p) => p === "preaprueba");
}

/**
 * Si la sesion ve esta solicitud. Quien solo preaprueba ve las que esperan su
 * preaprobacion y las que el mismo preaprobo o rechazo (para seguirlas).
 */
export function puedeVerSolicitud(
  acceso: AccesoNC,
  sol: Pick<SolicitudNC, "company_id" | "estado" | "preaprobado_por" | "rechazado_por" | "rechazado_paso">,
): boolean {
  if (!puedeVerSede(acceso, sol.company_id)) return false;
  if (!soloPreaprueba(acceso, sol.company_id)) return true;
  const yo = acceso.autor.nombre;
  return (
    sol.estado === "por_preaprobar" ||
    (!!sol.preaprobado_por && sol.preaprobado_por === yo) ||
    (sol.rechazado_paso === "preaprueba" && sol.rechazado_por === yo)
  );
}
